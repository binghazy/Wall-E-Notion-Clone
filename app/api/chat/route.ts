import { convertToModelMessages, streamText, tool } from "ai";
import {
  aiDocumentFormats,
  injectDocumentStateMessages,
  toolDefinitionsToToolSet,
} from "@blocknote/xl-ai/server";

import {
  getWallEBlockNoteSystemPrompt,
  createWallESystemPrompt,
  getWallEAiProvider,
  getMissingWallEAiConfigResponse,
  getWallEChatModel,
  getWallEProviderOptions,
  hasWallEAiProviderConfig,
  resolveWallEAiRuntimeSettings,
} from "@/lib/ai-chat";
import {
  insertNotionBlocksInputSchema,
  insertNotionBlocksOutputSchema,
  insertNotionBlocksToolDescription,
  WallEChatMessage,
} from "@/lib/notion-blocks";

export const maxDuration = 180;

const insertNotionBlocksTool = tool({
  description: insertNotionBlocksToolDescription,
  inputSchema: insertNotionBlocksInputSchema,
  outputSchema: insertNotionBlocksOutputSchema,
});

const sanitizeMessageParts = (message: Omit<WallEChatMessage, "id">) => {
  const parts = Array.isArray(message.parts)
    ? message.parts.flatMap((part) => {
        if (!part) {
          return [];
        }

        if (
          (part.type === "text" || part.type === "reasoning") &&
          typeof part.text !== "string"
        ) {
          return [];
        }

        return [part];
      })
    : [];

  return {
    ...message,
    parts,
  };
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      aiSettings?: unknown;
      documentContext?: unknown;
      messages?: WallEChatMessage[];
      toolDefinitions?: unknown;
    };
    const aiSettings = resolveWallEAiRuntimeSettings(body.aiSettings);

    if (!hasWallEAiProviderConfig(aiSettings)) {
      return getMissingWallEAiConfigResponse(aiSettings);
    }

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return new Response("Invalid chat payload.", { status: 400 });
    }

    const provider = getWallEAiProvider(aiSettings);
    const isLocalProvider = provider === "ollama";
    // Keep local responses bounded to avoid long-running "thinking" loops.
    const abortSignal = AbortSignal.timeout(isLocalProvider ? 180_000 : 90_000);
    const maxOutputTokens = isLocalProvider ? 12_000 : 8_000;
    const blockNoteMaxOutputTokens = isLocalProvider ? 8_000 : 6_000;

    const model = getWallEChatModel(aiSettings);
    const providerOptions = getWallEProviderOptions(aiSettings);
    const blockNoteToolDefinitions =
      body.toolDefinitions &&
      typeof body.toolDefinitions === "object" &&
      !Array.isArray(body.toolDefinitions)
        ? (body.toolDefinitions as Record<string, unknown>)
        : null;
    const hasBlockNoteToolDefinitions = blockNoteToolDefinitions !== null;
    const hasBlockNoteDocumentState = body.messages.some((message) => {
      if (!message || typeof message !== "object") {
        return false;
      }

      const metadata =
        "metadata" in message
          ? (message as { metadata?: unknown }).metadata
          : undefined;

      return Boolean(
        metadata &&
        typeof metadata === "object" &&
        "documentState" in (metadata as Record<string, unknown>),
      );
    });
    const shouldUseBlockNotePipeline =
      hasBlockNoteDocumentState || hasBlockNoteToolDefinitions;

    if (shouldUseBlockNotePipeline) {
      const blockNoteMessages = injectDocumentStateMessages(
        body.messages as any,
      ) as Parameters<typeof convertToModelMessages>[0];
      const blockNoteTools = toolDefinitionsToToolSet(
        (blockNoteToolDefinitions ?? {}) as any,
      ) as any;
      const hasBlockNoteTools = Object.keys(blockNoteTools).length > 0;

      if (!hasBlockNoteTools) {
        return new Response("Invalid BlockNote AI payload: missing tools.", {
          status: 400,
        });
      }

      const result = streamText({
        model,
        maxRetries: isLocalProvider ? 0 : undefined,
        abortSignal,
        maxOutputTokens: blockNoteMaxOutputTokens,
        temperature: isLocalProvider ? 0 : undefined,
        providerOptions,
        system: getWallEBlockNoteSystemPrompt(
          aiDocumentFormats.html.systemPrompt,
          aiSettings,
        ),
        messages: await convertToModelMessages(blockNoteMessages, {
          ignoreIncompleteToolCalls: true,
        }),
        tools: blockNoteTools,
        toolChoice: "required",
        onAbort() {
          console.error(
            "[CHAT_ROUTE_BLOCKNOTE_ABORTED]",
            "Generation timed out before a valid operation response was completed.",
          );
        },
        onFinish({ steps }) {
          if (!isLocalProvider) {
            return;
          }

          const hasToolCalls = (steps ?? []).some((step: any) => {
            return Array.isArray(step.toolCalls) && step.toolCalls.length > 0;
          });

          if (!hasToolCalls) {
            console.warn(
              "[CHAT_ROUTE_BLOCKNOTE_NO_TOOL_CALLS]",
              "Local model finished without valid document operations.",
            );
          }
        },
        onError({ error }) {
          console.error("[CHAT_ROUTE_BLOCKNOTE_STREAM_ERROR]", error);
        },
      });

      return result.toUIMessageStreamResponse();
    }

    const messages = body.messages
      .map(({ id: _id, ...message }) => sanitizeMessageParts(message))
      .filter((message) => message.parts.length > 0);

    if (messages.length === 0) {
      return new Response("Chat payload did not contain usable messages.", {
        status: 400,
      });
    }

    const tools = {
      insertNotionBlocks: insertNotionBlocksTool,
    };

    const systemPrompt = createWallESystemPrompt(
      body.documentContext,
      aiSettings,
    );
    console.log(
      "[CHAT_ROUTE_SYSTEM_PROMPT]",
      `Provider: ${provider}, First 100 chars:`,
      systemPrompt.substring(0, 100),
    );

    const result = streamText({
      model,
      maxRetries: isLocalProvider ? 0 : undefined,
      abortSignal,
      maxOutputTokens,
      temperature: isLocalProvider ? 0 : undefined,
      providerOptions,
      system: systemPrompt,
      messages: convertToModelMessages(messages, {
        tools,
        ignoreIncompleteToolCalls: true,
      }),
      tools,
      onAbort() {
        console.error(
          "[CHAT_ROUTE_ABORTED]",
          "Generation timed out before completion.",
        );
      },
      onError({ error }) {
        console.error("[CHAT_ROUTE_STREAM_ERROR]", error);
      },
    });

    return result.toUIMessageStreamResponse<WallEChatMessage>();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[CHAT_ROUTE_ERROR]", errorMessage);

    return new Response(
      JSON.stringify({
        error: "Failed to process chat request",
        details: errorMessage,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
