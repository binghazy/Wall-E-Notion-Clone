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

const GEMINI_SUPPORTED_SCHEMA_TYPES = new Set([
  "object",
  "array",
  "string",
  "number",
  "integer",
  "boolean",
]);

const normalizeGeminiSchemaType = (schemaType: unknown) => {
  if (typeof schemaType === "string") {
    return {
      type: schemaType,
      nullable: false,
    };
  }

  if (!Array.isArray(schemaType)) {
    return {
      type: undefined,
      nullable: false,
    };
  }

  const typedValues = schemaType.filter(
    (value): value is string => typeof value === "string",
  );
  const nullable = typedValues.includes("null");
  const firstSupportedType = typedValues.find((value) => value !== "null");

  return {
    type: firstSupportedType,
    nullable,
  };
};

const sanitizeGeminiToolJsonSchema = (schema: unknown): Record<string, unknown> => {
  if (!schema || typeof schema !== "object") {
    return {
      type: "string",
    };
  }

  const schemaRecord = schema as Record<string, unknown>;

  const unionValue = ["anyOf", "oneOf", "allOf"]
    .map((key) => schemaRecord[key])
    .find((value) => Array.isArray(value));
  if (Array.isArray(unionValue) && unionValue.length > 0) {
    const firstVariant = unionValue.find(
      (value) => value && typeof value === "object",
    );

    if (firstVariant) {
      return sanitizeGeminiToolJsonSchema(firstVariant);
    }
  }

  const { type: rawType, nullable } = normalizeGeminiSchemaType(
    schemaRecord.type,
  );
  const normalizedType = rawType && GEMINI_SUPPORTED_SCHEMA_TYPES.has(rawType)
    ? rawType
    : undefined;

  const description =
    typeof schemaRecord.description === "string"
      ? schemaRecord.description
      : undefined;

  if (
    normalizedType === "object" ||
    (!normalizedType &&
      schemaRecord.properties &&
      typeof schemaRecord.properties === "object" &&
      !Array.isArray(schemaRecord.properties))
  ) {
    const rawProperties =
      schemaRecord.properties &&
      typeof schemaRecord.properties === "object" &&
      !Array.isArray(schemaRecord.properties)
        ? (schemaRecord.properties as Record<string, unknown>)
        : {};

    const properties = Object.fromEntries(
      Object.entries(rawProperties).map(([key, value]) => [
        key,
        sanitizeGeminiToolJsonSchema(value),
      ]),
    );

    const schemaResult: Record<string, unknown> = {
      type: "object",
      properties,
    };

    const required = Array.isArray(schemaRecord.required)
      ? schemaRecord.required.filter(
          (value): value is string =>
            typeof value === "string" && value in properties,
        )
      : [];

    if (required.length > 0) {
      schemaResult.required = required;
    }

    if (description) {
      schemaResult.description = description;
    }

    if (nullable) {
      schemaResult.nullable = true;
    }

    return schemaResult;
  }

  if (normalizedType === "array" || (!normalizedType && schemaRecord.items)) {
    const schemaResult: Record<string, unknown> = {
      type: "array",
      items: sanitizeGeminiToolJsonSchema(schemaRecord.items),
    };

    if (typeof schemaRecord.minItems === "number") {
      schemaResult.minItems = schemaRecord.minItems;
    }

    if (typeof schemaRecord.maxItems === "number") {
      schemaResult.maxItems = schemaRecord.maxItems;
    }

    if (description) {
      schemaResult.description = description;
    }

    if (nullable) {
      schemaResult.nullable = true;
    }

    return schemaResult;
  }

  if (Array.isArray(schemaRecord.enum) && schemaRecord.enum.length > 0) {
    const schemaResult: Record<string, unknown> = {
      type: normalizedType ?? "string",
      enum: schemaRecord.enum.filter(
        (value) =>
          value === null ||
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean",
      ),
    };

    if (description) {
      schemaResult.description = description;
    }

    if (nullable) {
      schemaResult.nullable = true;
    }

    return schemaResult;
  }

  const schemaResult: Record<string, unknown> = {
    type: normalizedType ?? "string",
  };

  if (description) {
    schemaResult.description = description;
  }

  if (nullable) {
    schemaResult.nullable = true;
  }

  if (typeof schemaRecord.minimum === "number") {
    schemaResult.minimum = schemaRecord.minimum;
  }

  if (typeof schemaRecord.maximum === "number") {
    schemaResult.maximum = schemaRecord.maximum;
  }

  if (typeof schemaRecord.minLength === "number") {
    schemaResult.minLength = schemaRecord.minLength;
  }

  if (typeof schemaRecord.maxLength === "number") {
    schemaResult.maxLength = schemaRecord.maxLength;
  }

  return schemaResult;
};

const sanitizeGeminiOpenAIRequestPayload = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const payloadRecord = payload as Record<string, unknown>;
  const sanitizedPayload: Record<string, unknown> = { ...payloadRecord };

  // Gemini's OpenAI-compatible endpoint rejects several OpenAI-only fields.
  delete sanitizedPayload.parallel_tool_calls;
  delete sanitizedPayload.service_tier;
  delete sanitizedPayload.store;
  delete sanitizedPayload.prompt_cache_key;
  delete sanitizedPayload.prompt_cache_retention;
  delete sanitizedPayload.safety_identifier;
  delete sanitizedPayload.verbosity;
  delete sanitizedPayload.metadata;
  delete sanitizedPayload.prediction;
  delete sanitizedPayload.logit_bias;
  delete sanitizedPayload.logprobs;
  delete sanitizedPayload.top_logprobs;
  delete sanitizedPayload.max_completion_tokens;

  if (Array.isArray(payloadRecord.tools)) {
    sanitizedPayload.tools = payloadRecord.tools.map((toolDefinition) => {
      if (!toolDefinition || typeof toolDefinition !== "object") {
        return toolDefinition;
      }

      const toolRecord = toolDefinition as Record<string, unknown>;
      const toolFunction =
        toolRecord.function &&
        typeof toolRecord.function === "object" &&
        !Array.isArray(toolRecord.function)
          ? (toolRecord.function as Record<string, unknown>)
          : undefined;

      if (toolRecord.type !== "function" || !toolFunction) {
        return toolDefinition;
      }

      return {
        ...toolRecord,
        function: {
          ...toolFunction,
          parameters: sanitizeGeminiToolJsonSchema(toolFunction.parameters),
        },
      };
    });
  }

  if (
    Array.isArray(sanitizedPayload.tools) &&
    sanitizedPayload.tools.length === 0
  ) {
    delete sanitizedPayload.tool_choice;
  }

  return sanitizedPayload;
};

const sanitizeGeminiOpenAIRequestInit = (
  requestUrl: string,
  init: RequestInit | undefined,
) => {
  if (!requestUrl.includes("/chat/completions") || !init?.body) {
    return init;
  }

  if (typeof init.body !== "string") {
    return init;
  }

  try {
    return {
      ...init,
      body: JSON.stringify(
        sanitizeGeminiOpenAIRequestPayload(JSON.parse(init.body)),
      ),
    };
  } catch {
    return init;
  }
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

const geminiOpenAICompatibleFetch =
  (apiKey: string): typeof fetch =>
  async (input, init) => {
    const requestUrl = getRequestUrl(input);
    const patchedInit = sanitizeGeminiOpenAIRequestInit(requestUrl, init);
    let urlString = requestUrl;

    // Append the API key as a query parameter to the end of the URL
    const separator = requestUrl.includes("?") ? "&" : "?";
    urlString = `${requestUrl}${separator}key=${encodeURIComponent(apiKey)}`;

    const url = new URL(urlString);

    // Create fresh headers without Authorization
    const headers = new Headers(patchedInit?.headers);

    // Remove Authorization and Content-Length so fetch can recalculate safely.
    const headerKeys = Array.from(headers.keys());
    for (const key of headerKeys) {
      const lowerKey = key.toLowerCase();

      if (lowerKey === "authorization" || lowerKey === "content-length") {
        headers.delete(key);
      }
    }

    const response = await fetch(url, {
      ...patchedInit,
      headers,
    });

    const responseHeaders = new Headers(response.headers);
    const contentType = responseHeaders.get("content-type") ?? "";

    if (contentType.includes("text/event-stream") && response.body) {
      return new Response(transformGeminiSseStream(response.body), {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
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
            headers: responseHeaders,
          },
        );
      } catch {
        return new Response(bodyText, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
        });
      }
    }

    return response;
  };

const WALLE_AI_PROVIDERS = ["puter", "gemini", "ollama"] as const;
const WALLE_PUTER_MODELS = ["gpt-5-nano", "gpt-5.4-nano"] as const;

export type WallEAiProvider = (typeof WALLE_AI_PROVIDERS)[number];
type WallEPuterModel = (typeof WALLE_PUTER_MODELS)[number];

const DEFAULT_WALLE_AI_PROVIDER: WallEAiProvider = "puter";
const envPuterModel = process.env.PUTER_MODEL?.trim();
const DEFAULT_PUTER_MODEL: WallEPuterModel =
  envPuterModel && WALLE_PUTER_MODELS.includes(envPuterModel as WallEPuterModel)
    ? (envPuterModel as WallEPuterModel)
    : "gpt-5-nano";
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen3:4b";
const DEFAULT_OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL ??
  process.env.OLLAMA_API ??
  "http://localhost:11434";
const DEFAULT_PUTER_BASE_URL = "https://api.puter.com/puterai/openai/v1";

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
const envPuterAuthToken =
  process.env.PUTER_AUTH_TOKEN ??
  process.env.PUTER_API_KEY ??
  process.env.puter_auth_token;

const createGeminiClient = (apiKey: string) =>
  createOpenAI({
    name: "google",
    apiKey: "", // Empty to prevent Authorization header - key is added via fetch
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    fetch: geminiOpenAICompatibleFetch(apiKey),
  });

const createPuterClient = (authToken: string) =>
  createOpenAI({
    name: "puter",
    apiKey: authToken,
    baseURL: DEFAULT_PUTER_BASE_URL,
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

const getResolvedPuterModel = (settings?: WallEAiRuntimeSettings) => {
  const requestedModel = normalizeSetting(settings?.model);

  if (
    requestedModel &&
    WALLE_PUTER_MODELS.includes(requestedModel as WallEPuterModel)
  ) {
    return requestedModel;
  }

  return DEFAULT_PUTER_MODEL;
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

const getResolvedPuterAuthToken = (_settings?: WallEAiRuntimeSettings) => {
  return envPuterAuthToken;
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

  if (provider === "gemini") {
    return Boolean(getResolvedGeminiApiKey(settings));
  }

  return Boolean(getResolvedPuterAuthToken(settings));
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

  if (provider === "gemini") {
    return new Response(
      JSON.stringify({
        error: "Missing Gemini API key",
        details:
          "Add a Gemini API key in AI settings or set GEMINI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or GOOGLE_API_KEY in the server environment.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({
      error: "Missing Puter auth token",
      details:
        "Set PUTER_AUTH_TOKEN (or PUTER_API_KEY / puter_auth_token) in the server environment.",
    }),
    { status: 500, headers: { "Content-Type": "application/json" } },
  );
};

export const getWallEProviderOptions = (settings?: WallEAiRuntimeSettings) => {
  const provider = getWallEAiProvider(settings);

  if (provider === "puter") {
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
- For actionable items in BlockNote, use checklist-style content so users can track completion.
- Use Markdown tables when showing schedules, comparisons, plans, or structured data.
- For plans, schedules, or lists: Always generate comprehensive, detailed content with multiple specific items, times, and descriptions. Avoid single-word or minimal responses.
- When creating plans: Include specific activities, times, locations, and detailed descriptions for each item.
- Structure plans with clear headings, subheadings, and organized sections.
- Example for a weekend plan: Include Friday evening, Saturday morning/afternoon/evening, Sunday activities, with specific times and descriptions.
`;

  const blockNoteToolInstructions = `
Tool-calling requirements:
- You MUST respond with the \`applyDocumentOperations\` tool.
- Return valid JSON tool input only; no markdown code fences and no trailing text.
- Issue exactly one final, complete tool call for the request, then stop generating.
- Do not return plain assistant prose outside the tool call.
- If you cannot generate content, provide a minimal valid tool call with a helpful message.
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
    provider === "ollama"
      ? settings?.model || DEFAULT_OLLAMA_MODEL
      : provider === "gemini"
        ? settings?.model || DEFAULT_GEMINI_MODEL
        : getResolvedPuterModel(settings);

  if (provider === "ollama") {
    const ollamaBaseUrl = getResolvedOllamaBaseUrl(settings);

    if (!ollamaBaseUrl) {
      throw new Error("Missing Ollama base URL.");
    }

    return createOllamaClient(ollamaBaseUrl).chat(modelId);
  }

  if (provider === "gemini") {
    const apiKey = getResolvedGeminiApiKey(settings);

    if (!apiKey) {
      throw new Error("Missing Gemini API key.");
    }

    return createGeminiClient(apiKey).chat(modelId);
  }

  const authToken = getResolvedPuterAuthToken(settings);

  if (!authToken) {
    throw new Error("Missing Puter auth token.");
  }

  return createPuterClient(authToken).chat(modelId);
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
