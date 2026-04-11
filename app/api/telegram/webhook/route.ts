import { type CoreMessage, generateText, stepCountIs, tool } from "ai";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";

import {
  getWallEChatModel,
  getWallEProviderOptions,
  hasWallEAiProviderConfig,
} from "@/lib/ai-chat";

export const runtime = "nodejs";

const TELEGRAM_API_BASE_URL = "https://api.telegram.org";
const MAX_MEMORY_MESSAGES = 12;
const MAX_TELEGRAM_MESSAGE_LENGTH = 3900;

type TelegramChat = {
  id: number;
};

type TelegramUser = {
  first_name?: string;
  username?: string;
};

type TelegramTextMessage = {
  chat?: TelegramChat;
  from?: TelegramUser;
  text?: string;
};

type TelegramUpdate = {
  message?: TelegramTextMessage;
  edited_message?: TelegramTextMessage;
};

type MemoryMessage = {
  role: "user" | "assistant";
  content: string;
};

const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{16,80}$/;

declare global {
  // eslint-disable-next-line no-var
  var __walleTelegramMemory: Map<string, MemoryMessage[]> | undefined;
  // eslint-disable-next-line no-var
  var __walleTelegramSessionLinks: Map<string, string> | undefined;
}

const getMemoryStore = () => {
  if (!globalThis.__walleTelegramMemory) {
    globalThis.__walleTelegramMemory = new Map<string, MemoryMessage[]>();
  }

  return globalThis.__walleTelegramMemory;
};

const getSessionLinksStore = () => {
  if (!globalThis.__walleTelegramSessionLinks) {
    globalThis.__walleTelegramSessionLinks = new Map<string, string>();
  }

  return globalThis.__walleTelegramSessionLinks;
};

const getBotToken = () => process.env.TELEGRAM_BOT_TOKEN?.trim();

const getWebhookSecret = () => process.env.TELEGRAM_WEBHOOK_SECRET?.trim();

const getConvexClient = () => {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();

  if (!convexUrl) {
    throw new Error("Missing NEXT_PUBLIC_CONVEX_URL.");
  }

  return new ConvexHttpClient(convexUrl);
};

const getAppBaseUrl = (request: Request) => {
  const explicitUrl =
    process.env.APP_URL?.trim() ?? process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (explicitUrl) {
    return explicitUrl.replace(/\/+$/, "");
  }

  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  if (!host) {
    return undefined;
  }

  const protocol = request.headers.get("x-forwarded-proto") ?? "https";

  return `${protocol}://${host}`;
};

const splitTelegramText = (text: string) => {
  const normalized = text.trim();

  if (!normalized) {
    return ["I'm here. Tell me what you want to do."];
  }

  if (normalized.length <= MAX_TELEGRAM_MESSAGE_LENGTH) {
    return [normalized];
  }

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < normalized.length) {
    const nextCursor = cursor + MAX_TELEGRAM_MESSAGE_LENGTH;
    chunks.push(normalized.slice(cursor, nextCursor));
    cursor = nextCursor;
  }

  return chunks;
};

const sendTelegramMessage = async (
  botToken: string,
  chatId: number,
  text: string,
) => {
  const messageChunks = splitTelegramText(text);

  for (const chunk of messageChunks) {
    const response = await fetch(
      `${TELEGRAM_API_BASE_URL}/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunk,
        }),
      },
    );

    if (!response.ok) {
      const details = await response.text();
      throw new Error(
        `Telegram sendMessage failed (${response.status}): ${details}`,
      );
    }
  }
};

const buildSystemPrompt = (name?: string) => {
  const safeName = name?.trim();
  const userNameLine = safeName
    ? `The Telegram user is "${safeName}".`
    : "The Telegram user name is unavailable.";

  return `
You are Wall-E AI inside a Telegram bot for a Notion-like notes app.

${userNameLine}

Your responsibilities:
- Be proactive and helpful.
- Turn user requests into action.
- Create notes when the user asks to capture, plan, remember, draft, or organize something.

Tool policy:
- When a note should be created, call createNote.
- Choose short, clear titles.
- After tool usage, reply with what you created and include the link.

Response style:
- Keep replies concise and practical.
- If the user request is unclear, ask one direct clarifying question.
`.trim();
};

const toCoreMessages = (messages: MemoryMessage[]): CoreMessage[] => {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
};

const trimMemory = (messages: MemoryMessage[]) => {
  if (messages.length <= MAX_MEMORY_MESSAGES) {
    return messages;
  }

  return messages.slice(messages.length - MAX_MEMORY_MESSAGES);
};

const runAssistantTurn = async ({
  chatId,
  sessionId,
  userText,
  displayName,
  request,
}: {
  chatId: number;
  sessionId: string;
  userText: string;
  displayName?: string;
  request: Request;
}) => {
  const aiSettings = {};

  if (!hasWallEAiProviderConfig(aiSettings)) {
    return "AI is not configured on the server yet. Add GEMINI_API_KEY (or Ollama settings), then try again.";
  }

  const memoryStore = getMemoryStore();
  const chatKey = String(chatId);
  const existingHistory = memoryStore.get(chatKey) ?? [];
  const historyMessages = trimMemory(existingHistory);
  const model = getWallEChatModel(aiSettings);
  const providerOptions = getWallEProviderOptions(aiSettings);
  const convex = getConvexClient();
  const appBaseUrl = getAppBaseUrl(request);

  const response = await generateText({
    model,
    providerOptions,
    stopWhen: stepCountIs(4),
    system: buildSystemPrompt(displayName),
    messages: [
      ...toCoreMessages(historyMessages),
      {
        role: "user",
        content: userText,
      },
    ],
    tools: {
      createNote: tool({
        description:
          "Create a new note in the workspace when the user asks to save, organize, or plan something.",
        inputSchema: z.object({
          title: z
            .string()
            .min(1)
            .max(120)
            .describe("Short, clear note title."),
        }),
        execute: async ({ title }) => {
          const cleanedTitle = title.trim() || "Untitled";
          const documentId = (await convex.mutation(
            "documents:createFromTelegram" as any,
            {
              sessionId,
              title: cleanedTitle,
              content: undefined,
            },
          )) as string;
          const url = appBaseUrl
            ? `${appBaseUrl}/documents/${documentId}`
            : `/documents/${documentId}`;

          return {
            documentId,
            title: cleanedTitle,
            url,
          };
        },
      }),
    },
  });

  const assistantText =
    response.text.trim() ||
    "Done. I handled that. Tell me what else you want to create.";

  memoryStore.set(
    chatKey,
    trimMemory([
      ...historyMessages,
      { role: "user", content: userText },
      { role: "assistant", content: assistantText },
    ]),
  );

  return assistantText;
};

const resolveSessionCommandArgument = (text: string) => {
  const remainder = text
    .replace(/^\/session(?:@\S+)?/i, "")
    .trim();

  return remainder;
};

const handleCommand = async ({
  botToken,
  chatId,
  text,
}: {
  botToken: string;
  chatId: number;
  text: string;
}) => {
  const [command] = text.split(/\s+/, 1);
  const normalized = command.toLowerCase();
  const chatKey = String(chatId);
  const sessionLinks = getSessionLinksStore();

  if (normalized === "/start") {
    await sendTelegramMessage(
      botToken,
      chatId,
      [
        "Wall-E AI Telegram assistant is live.",
        "First, link this chat to your app session ID:",
        "/session YOUR_SESSION_ID",
        "",
        "You can find your session ID on the app home screen in guest mode.",
        "Commands:",
        "/session <id> - link this chat",
        "/unlink - remove current link",
        "/reset - clear chat memory",
      ].join("\n"),
    );
    return true;
  }

  if (normalized === "/session") {
    const sessionId = resolveSessionCommandArgument(text);

    if (!sessionId) {
      await sendTelegramMessage(
        botToken,
        chatId,
        "Send your code like this:\n/session YOUR_SESSION_ID",
      );
      return true;
    }

    if (!SESSION_ID_PATTERN.test(sessionId)) {
      await sendTelegramMessage(
        botToken,
        chatId,
        "That session ID format is invalid. Copy it directly from the app and try again.",
      );
      return true;
    }

    sessionLinks.set(chatKey, sessionId);
    getMemoryStore().delete(chatKey);

    await sendTelegramMessage(
      botToken,
      chatId,
      "Session linked. You can now ask me to create and organize notes for this workspace.",
    );
    return true;
  }

  if (normalized === "/unlink") {
    sessionLinks.delete(chatKey);
    getMemoryStore().delete(chatKey);
    await sendTelegramMessage(
      botToken,
      chatId,
      "Session unlinked. Use /session YOUR_SESSION_ID to connect again.",
    );
    return true;
  }

  if (normalized === "/reset") {
    getMemoryStore().delete(chatKey);
    await sendTelegramMessage(
      botToken,
      chatId,
      "Memory cleared. Start fresh with your next request.",
    );
    return true;
  }

  return false;
};

const getLinkedSessionId = (chatId: number) => {
  const chatKey = String(chatId);
  return getSessionLinksStore().get(chatKey);
};

const promptForSessionLink = async (botToken: string, chatId: number) => {
  await sendTelegramMessage(
    botToken,
    chatId,
    [
      "Before I can create notes, link this chat to your app:",
      "/session YOUR_SESSION_ID",
      "",
      "Open the app home screen to copy your session ID.",
    ].join("\n"),
  );
};

export async function POST(request: Request) {
  const botToken = getBotToken();

  if (!botToken) {
    return new Response("Missing TELEGRAM_BOT_TOKEN.", { status: 500 });
  }

  const expectedSecret = getWebhookSecret();

  if (expectedSecret) {
    const incomingSecret = request.headers.get(
      "x-telegram-bot-api-secret-token",
    );

    if (incomingSecret !== expectedSecret) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let payload: TelegramUpdate;

  try {
    payload = (await request.json()) as TelegramUpdate;
  } catch {
    return Response.json({ ok: true });
  }

  const message = payload.message ?? payload.edited_message;
  const chatId = message?.chat?.id;
  const text = message?.text?.trim();

  if (!chatId || !text) {
    return Response.json({ ok: true });
  }

  const handledCommand = await handleCommand({
    botToken,
    chatId,
    text,
  });

  if (handledCommand) {
    return Response.json({ ok: true });
  }

  const linkedSessionId = getLinkedSessionId(chatId);

  if (!linkedSessionId) {
    await promptForSessionLink(botToken, chatId);
    return Response.json({ ok: true });
  }

  const displayName = message?.from?.first_name ?? message?.from?.username;

  try {
    const assistantReply = await runAssistantTurn({
      chatId,
      sessionId: linkedSessionId,
      userText: text,
      displayName,
      request,
    });

    await sendTelegramMessage(botToken, chatId, assistantReply);
  } catch (error) {
    console.error("[TELEGRAM_WEBHOOK_ERROR]", error);

    await sendTelegramMessage(
      botToken,
      chatId,
      "I hit an error while processing that request. Please try again.",
    );
  }

  return Response.json({ ok: true });
}
