import { createOpenAI } from "@ai-sdk/openai";

import {
  formatBlockNoteDocumentContext,
  normalizeBlockNoteDocumentContext,
} from "@/lib/blocknote-context";
import { notionAssistantSystemPrompt } from "@/lib/notion-blocks";

const getRequestUrl = (input: RequestInfo | URL) => {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
};

const patchOpenAICompatibleToolCallIndexes = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const record = payload as {
    choices?: Array<Record<string, unknown>>;
  };

  if (!Array.isArray(record.choices)) {
    return payload;
  }

  return {
    ...record,
    choices: record.choices.map((choice) => {
      const delta = choice.delta;

      if (!delta || typeof delta !== "object") {
        return choice;
      }

      const deltaRecord = delta as {
        tool_calls?: Array<Record<string, unknown>> | null;
      };

      if (!Array.isArray(deltaRecord.tool_calls)) {
        return choice;
      }

      return {
        ...choice,
        delta: {
          ...deltaRecord,
          tool_calls: deltaRecord.tool_calls.map((toolCall, index) => {
            if ("index" in toolCall) {
              return toolCall;
            }

            return {
              ...toolCall,
              index,
            };
          }),
        },
      };
    }),
  };
};

const transformGeminiSseStream = (stream: ReadableStream<Uint8Array>) => {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  let buffer = "";

  const serializeEventBlock = (eventBlock: string) => {
    const lines = eventBlock.split(/\r?\n/);

    const patchedLines = lines.map((line) => {
      if (!line.startsWith("data:")) {
        return line;
      }

      const data = line.slice(5).trimStart();

      if (!data || data === "[DONE]") {
        return line;
      }

      try {
        return `data: ${JSON.stringify(
          patchOpenAICompatibleToolCallIndexes(JSON.parse(data)),
        )}`;
      } catch {
        return line;
      }
    });

    return `${patchedLines.join("\n")}\n\n`;
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (true) {
          const { value, done } = await reader.read();

          buffer += decoder.decode(value ?? new Uint8Array(), {
            stream: !done,
          });

          let boundaryMatch = buffer.match(/\r?\n\r?\n/);

          while (boundaryMatch && boundaryMatch.index !== undefined) {
            const eventBlock = buffer.slice(0, boundaryMatch.index);

            buffer = buffer.slice(
              boundaryMatch.index + boundaryMatch[0].length,
            );

            controller.enqueue(encoder.encode(serializeEventBlock(eventBlock)));
            boundaryMatch = buffer.match(/\r?\n\r?\n/);
          }

          if (done) {
            break;
          }
        }

        if (buffer.length > 0) {
          controller.enqueue(encoder.encode(serializeEventBlock(buffer)));
        }

        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
  });
};

const openAICompatibleToolCallFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const requestUrl = getRequestUrl(input);

  if (!requestUrl.includes("/chat/completions")) {
    return response;
  }

  const headers = new Headers(response.headers);
  const contentType = headers.get("content-type") ?? "";

  if (contentType.includes("text/event-stream") && response.body) {
    return new Response(transformGeminiSseStream(response.body), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  if (contentType.includes("application/json")) {
    const bodyText = await response.text();

    if (!bodyText) {
      return response;
    }

    try {
      return new Response(
        JSON.stringify(
          patchOpenAICompatibleToolCallIndexes(JSON.parse(bodyText)),
        ),
        {
          status: response.status,
          statusText: response.statusText,
          headers,
        },
      );
    } catch {
      return new Response(bodyText, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
  }

  return response;
};

const WALLE_AI_PROVIDERS = ["gemini", "ollama"] as const;

export type WallEAiProvider = (typeof WALLE_AI_PROVIDERS)[number];

const DEFAULT_WALLE_AI_PROVIDER: WallEAiProvider = "gemini";
const DEFAULT_GEMINI_MODEL =
  process.env.GEMINI_MODEL ?? "gemini-3-flash-preview";
const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen3:4b";
const DEFAULT_OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL ??
  process.env.OLLAMA_API ??
  "http://localhost:11434";

const normalizeWallEAiProvider = (
  provider: string | undefined,
): WallEAiProvider => {
  const normalizedProvider = provider?.trim().toLowerCase();

  if (
    normalizedProvider &&
    WALLE_AI_PROVIDERS.includes(normalizedProvider as WallEAiProvider)
  ) {
    return normalizedProvider as WallEAiProvider;
  }

  return DEFAULT_WALLE_AI_PROVIDER;
};

const ensureOpenAICompatibleBaseUrl = (baseUrl: string | undefined) => {
  const normalizedBaseUrl = normalizeSetting(baseUrl);

  if (!normalizedBaseUrl) {
    return undefined;
  }

  if (normalizedBaseUrl.endsWith("/v1")) {
    return normalizedBaseUrl;
  }

  return `${normalizedBaseUrl.replace(/\/+$/, "")}/v1`;
};

const envGeminiApiKey =
  process.env.GEMINI_API_KEY ??
  process.env.gemini_api_key ??
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
  process.env.GOOGLE_API_KEY;

const createGeminiClient = (apiKey: string) =>
  createOpenAI({
    name: "google",
    apiKey,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    fetch: openAICompatibleToolCallFetch,
  });

const createOllamaClient = (baseURL: string) =>
  createOpenAI({
    name: "ollama",
    apiKey: process.env.OLLAMA_API_KEY || "ollama",
    baseURL,
    fetch: openAICompatibleToolCallFetch,
  });

export type WallEAiRuntimeSettings = {
  provider?: WallEAiProvider;
  apiKey?: string;
  model?: string;
  ollamaBaseUrl?: string;
  userName?: string;
};

const normalizeSetting = (value: string | undefined) => {
  const trimmedValue = value?.trim();

  return trimmedValue ? trimmedValue : undefined;
};

export const resolveWallEAiRuntimeSettings = (
  payload: unknown,
): WallEAiRuntimeSettings => {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const record = payload as Record<string, unknown>;

  return {
    provider:
      typeof record.provider === "string"
        ? normalizeWallEAiProvider(record.provider)
        : undefined,
    apiKey:
      typeof record.apiKey === "string"
        ? normalizeSetting(record.apiKey)
        : undefined,
    model:
      typeof record.model === "string"
        ? normalizeSetting(record.model)
        : undefined,
    ollamaBaseUrl:
      typeof record.ollamaBaseUrl === "string"
        ? normalizeSetting(record.ollamaBaseUrl)
        : undefined,
    userName:
      typeof record.userName === "string"
        ? normalizeSetting(record.userName)
        : undefined,
  };
};

export const getWallEAiProvider = (
  settings?: WallEAiRuntimeSettings,
): WallEAiProvider => {
  return normalizeWallEAiProvider(settings?.provider);
};

const getResolvedGeminiApiKey = (settings?: WallEAiRuntimeSettings) => {
  return settings?.apiKey || envGeminiApiKey;
};

const getResolvedOllamaBaseUrl = (settings?: WallEAiRuntimeSettings) => {
  return ensureOpenAICompatibleBaseUrl(
    settings?.ollamaBaseUrl || DEFAULT_OLLAMA_BASE_URL,
  );
};

// Export raw Ollama base URL (without /v1) for native API calls
export const getResolvedOllamaBaseUrlRaw = (
  settings?: WallEAiRuntimeSettings,
) => {
  const baseUrl = settings?.ollamaBaseUrl || DEFAULT_OLLAMA_BASE_URL;
  const normalized = normalizeSetting(baseUrl);
  return normalized ? normalized.replace(/\/+$/, "") : undefined;
};

export const getResolvedOllamaModel = (
  settings?: WallEAiRuntimeSettings,
): string => {
  return settings?.model || DEFAULT_OLLAMA_MODEL;
};

export { getResolvedOllamaBaseUrl };

export const hasWallEAiProviderConfig = (settings?: WallEAiRuntimeSettings) => {
  const provider = getWallEAiProvider(settings);

  if (provider === "ollama") {
    return Boolean(getResolvedOllamaBaseUrl(settings));
  }

  return Boolean(getResolvedGeminiApiKey(settings));
};

export const getMissingWallEAiConfigResponse = (
  settings?: WallEAiRuntimeSettings,
) => {
  const provider = getWallEAiProvider(settings);

  if (provider === "ollama") {
    return new Response(
      JSON.stringify({
        error: "Missing Ollama base URL",
        details:
          "Set a local Ollama base URL in AI settings (for example http://localhost:11434) or configure OLLAMA_BASE_URL/OLLAMA_API in the server environment.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({
      error: "Missing Gemini API key",
      details:
        "Add a Gemini API key in AI settings or set GEMINI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or GOOGLE_API_KEY in the server environment.",
    }),
    { status: 500, headers: { "Content-Type": "application/json" } },
  );
};

export const getWallEProviderOptions = (settings?: WallEAiRuntimeSettings) => {
  const provider = getWallEAiProvider(settings);

  if (provider === "gemini") {
    return {
      openai: {
        reasoningEffort: "none",
      },
    };
  }

  // For Ollama, keep responses focused and reduce reasoning-heavy drift.
  if (provider === "ollama") {
    return {
      openai: {
        reasoningEffort: "none",
      },
    };
  }

  return undefined;
};

export const getWallEBlockNoteSystemPrompt = (
  basePrompt: string,
  settings?: WallEAiRuntimeSettings,
) => {
  const provider = getWallEAiProvider(settings);

  const sharedFormattingInstructions = `
Formatting requirements for document content:
- Use **bold text** for important labels and key points.
- Use Markdown checklists (\`- [ ] item\`) when tasks or action items are present.
- Use Markdown tables when showing schedules, comparisons, plans, or structured data.
`;

  const blockNoteToolInstructions = `
Tool-calling requirements:
- You MUST respond with the \`applyDocumentOperations\` tool.
- Return valid JSON tool input only; no markdown code fences and no trailing text.
- Issue exactly one final, complete tool call for the request, then stop generating.
- Do not return plain assistant prose outside the tool call.
`;

  const ollamaStabilityInstructions =
    provider === "ollama"
      ? `
Ollama stability mode:
- Optimize for concise, deterministic operations output.
- Avoid chain-of-thought and avoid \`<think>\` tags.
- Keep tool arguments minimal but complete and schema-valid.
`
      : "";

  return `${basePrompt}\n\n${sharedFormattingInstructions}\n${blockNoteToolInstructions}\n${ollamaStabilityInstructions}`.trim();
};

export const getWallEChatModel = (settings?: WallEAiRuntimeSettings) => {
  const provider = getWallEAiProvider(settings);
  const modelId =
    settings?.model ||
    (provider === "ollama" ? DEFAULT_OLLAMA_MODEL : DEFAULT_GEMINI_MODEL);

  if (provider === "ollama") {
    const ollamaBaseUrl = getResolvedOllamaBaseUrl(settings);

    if (!ollamaBaseUrl) {
      throw new Error("Missing Ollama base URL.");
    }

    return createOllamaClient(ollamaBaseUrl).chat(modelId);
  }

  const apiKey = getResolvedGeminiApiKey(settings);

  if (!apiKey) {
    throw new Error("Missing Gemini API key.");
  }

  return createGeminiClient(apiKey).chat(modelId);
};

export const createWallESystemPrompt = (
  documentContext: unknown,
  settings?: WallEAiRuntimeSettings,
) => {
  const normalizedDocumentContext =
    normalizeBlockNoteDocumentContext(documentContext);
  const formattedDocumentContext = formatBlockNoteDocumentContext(
    normalizedDocumentContext,
  );
  const userNameInstruction = settings?.userName
    ? `The user's preferred name is "${settings.userName}". When natural, address them by this name.`
    : "";

  if (!formattedDocumentContext) {
    return [notionAssistantSystemPrompt, userNameInstruction]
      .filter(Boolean)
      .join("\n\n");
  }

  return [
    notionAssistantSystemPrompt,
    userNameInstruction,
    formattedDocumentContext,
    'Base your answer on the note context when the user refers to "this document", "these notes", or asks you to transform existing content.',
  ]
    .filter(Boolean)
    .join("\n\n");
};
