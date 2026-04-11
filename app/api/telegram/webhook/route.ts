import { type CoreMessage, generateText, stepCountIs, tool } from "ai";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";

import {
  getWallEChatModel,
  getWallEProviderOptions,
  hasWallEAiProviderConfig,
} from "@/lib/ai-chat";
import {
  insertNotionBlocksInputSchema,
  normalizeNotionBlocks,
} from "@/lib/notion-blocks";

export const runtime = "nodejs";

const TELEGRAM_API_BASE_URL = "https://api.telegram.org";
const MAX_MEMORY_MESSAGES = 12;
const MAX_TELEGRAM_MESSAGE_LENGTH = 3900;
const MAX_TELEGRAM_NOTE_LIST_RESULTS = 20;
const MAX_TELEGRAM_NOTE_PREVIEW_LENGTH = 260;
const MAX_TELEGRAM_NOTE_READ_LENGTH = 12_000;
const MAX_TELEGRAM_TOOL_BLOCKS = 80;
const MAX_TELEGRAM_TOOL_ATTACHMENTS = 12;

type TelegramChat = {
  id: number;
};

type TelegramUser = {
  first_name?: string;
  username?: string;
};

type TelegramPhotoSize = {
  file_id: string;
  width?: number;
  height?: number;
  file_size?: number;
};

type TelegramDocument = {
  file_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
};

type TelegramTextMessage = {
  chat?: TelegramChat;
  from?: TelegramUser;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
};

type TelegramUpdate = {
  message?: TelegramTextMessage;
  edited_message?: TelegramTextMessage;
};

type MemoryMessage = {
  role: "user" | "assistant";
  content: string;
};

type TelegramSessionDocument = {
  _id: string;
  _creationTime: number;
  title?: string;
  content?: string;
  isArchived?: boolean;
};

type TelegramAttachment = {
  kind: "image" | "file" | "link";
  url: string;
  label?: string;
};

type TelegramIncomingAttachment = {
  kind: "image" | "file";
  fileId: string;
  label?: string;
  mimeType?: string;
  size?: number;
};

const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{16,80}$/;

declare global {
  // eslint-disable-next-line no-var
  var __walleTelegramMemory: Map<string, MemoryMessage[]> | undefined;
}

const getMemoryStore = () => {
  if (!globalThis.__walleTelegramMemory) {
    globalThis.__walleTelegramMemory = new Map<string, MemoryMessage[]>();
  }

  return globalThis.__walleTelegramMemory;
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

const normalizeWhitespace = (value: string) => {
  return value.replace(/\s+/g, " ").trim();
};

const truncate = (value: string, maxLength: number) => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
};

const getDocumentUrl = (documentId: string, appBaseUrl?: string) => {
  if (appBaseUrl) {
    return `${appBaseUrl}/documents/${documentId}`;
  }

  return `/documents/${documentId}`;
};

const getSafeDocumentTitle = (title: string | undefined) => {
  const normalizedTitle = title?.trim();

  return normalizedTitle || "Untitled";
};

const telegramToolBlocksSchema = insertNotionBlocksInputSchema.shape.blocks
  .max(MAX_TELEGRAM_TOOL_BLOCKS)
  .describe("BlockNote blocks in the same format used by Wall-E composer.");

const telegramToolAttachmentSchema = z.object({
  kind: z.enum(["image", "file", "link"]).optional(),
  url: z.string().url().max(2000),
  label: z.string().max(160).optional(),
});

const telegramToolAttachmentsSchema = z
  .array(telegramToolAttachmentSchema)
  .max(MAX_TELEGRAM_TOOL_ATTACHMENTS)
  .optional();

const splitPlainTextIntoParagraphs = (text: string) => {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter(Boolean);
};

const toParagraphBlocks = (text: string) => {
  const normalized = text.trim();

  if (!normalized) {
    return [] as Array<Record<string, unknown>>;
  }

  const paragraphs = splitPlainTextIntoParagraphs(normalized);

  if (paragraphs.length === 0) {
    return [
      {
        type: "paragraph",
        content: normalized,
      },
    ] as Array<Record<string, unknown>>;
  }

  return paragraphs.map((paragraph) => ({
    type: "paragraph",
    content: paragraph,
  })) as Array<Record<string, unknown>>;
};

const normalizeTelegramToolBlocks = (
  blocks: z.input<typeof telegramToolBlocksSchema>,
) => {
  return normalizeNotionBlocks(blocks as any) as Array<Record<string, unknown>>;
};

const normalizeTelegramToolAttachments = (
  attachments: z.input<typeof telegramToolAttachmentsSchema>,
) => {
  return (attachments ?? [])
    .map((attachment) => ({
      kind: attachment.kind ?? "link",
      url: attachment.url.trim(),
      label: attachment.label?.trim() || undefined,
    }))
    .filter((attachment) => attachment.url.length > 0);
};

const toAttachmentBlocks = (
  attachments: Array<{
    kind?: "image" | "file" | "link";
    url: string;
    label?: string;
  }>,
) => {
  return attachments.map((attachment) => {
    const kindLabel =
      attachment.kind === "image"
        ? "Image"
        : attachment.kind === "file"
          ? "File"
          : "Link";
    const lead = attachment.label ? `${kindLabel}: ${attachment.label}` : kindLabel;

    return {
      type: "paragraph",
      content: `${lead}\n${attachment.url}`,
    } as Record<string, unknown>;
  });
};

const buildIncomingBlocks = ({
  blocks,
  content,
  attachments,
}: {
  blocks?: z.input<typeof telegramToolBlocksSchema>;
  content?: string;
  attachments?: z.input<typeof telegramToolAttachmentsSchema>;
}) => {
  const normalizedAttachments = normalizeTelegramToolAttachments(attachments);
  const attachmentBlocks = toAttachmentBlocks(normalizedAttachments);

  if (Array.isArray(blocks) && blocks.length > 0) {
    return [...normalizeTelegramToolBlocks(blocks), ...attachmentBlocks];
  }

  if (typeof content === "string") {
    return [...toParagraphBlocks(content), ...attachmentBlocks];
  }

  if (attachmentBlocks.length > 0) {
    return attachmentBlocks;
  }

  return null;
};

const parseSerializedBlocks = (serializedContent?: string) => {
  const normalized = serializedContent?.trim();

  if (!normalized) {
    return [] as Array<Record<string, unknown>>;
  }

  try {
    const parsed = JSON.parse(normalized) as unknown;

    if (!Array.isArray(parsed)) {
      return toParagraphBlocks(normalized);
    }

    return parsed.filter(
      (block): block is Record<string, unknown> =>
        !!block && typeof block === "object",
    );
  } catch {
    return toParagraphBlocks(normalized);
  }
};

const stringifyInlineContent = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map(stringifyInlineContent).filter(Boolean).join("");
  }

  if (!content || typeof content !== "object") {
    return "";
  }

  const record = content as Record<string, unknown>;

  if (typeof record.text === "string") {
    return record.text;
  }

  if (record.type === "tableContent" && Array.isArray(record.rows)) {
    return record.rows
      .map((row) => {
        if (!row || typeof row !== "object") {
          return "";
        }

        const rowRecord = row as Record<string, unknown>;

        if (!Array.isArray(rowRecord.cells)) {
          return "";
        }

        return rowRecord.cells.map(stringifyInlineContent).join(" | ");
      })
      .filter(Boolean)
      .join("\n");
  }

  if ("content" in record) {
    return stringifyInlineContent(record.content);
  }

  return "";
};

const extractBlockText = (block: unknown): string => {
  if (!block || typeof block !== "object") {
    return "";
  }

  const blockRecord = block as Record<string, unknown>;
  const contentText = normalizeWhitespace(stringifyInlineContent(blockRecord.content));
  const childrenText = Array.isArray(blockRecord.children)
    ? blockRecord.children
        .map((child) => extractBlockText(child))
        .filter(Boolean)
        .join(" / ")
    : "";

  return normalizeWhitespace([contentText, childrenText].join(" "));
};

const getPlainTextFromSerializedContent = (serializedContent?: string) => {
  const blocks = parseSerializedBlocks(serializedContent);

  if (blocks.length === 0) {
    return "";
  }

  return blocks.map(extractBlockText).filter(Boolean).join("\n\n").trim();
};

const serializeMergedContent = ({
  existingContent,
  incomingBlocks,
  mode,
}: {
  existingContent?: string;
  incomingBlocks: Array<Record<string, unknown>>;
  mode: "append" | "replace" | "prepend";
}) => {
  const nextBlocks = incomingBlocks;

  if (mode === "replace") {
    return JSON.stringify(nextBlocks);
  }

  const existingBlocks = parseSerializedBlocks(existingContent);

  if (mode === "prepend") {
    return JSON.stringify([...nextBlocks, ...existingBlocks]);
  }

  return JSON.stringify([...existingBlocks, ...nextBlocks]);
};

const listTelegramSessionDocuments = async (
  convex: ConvexHttpClient,
  sessionId: string,
) => {
  const documents = (await convex.query(
    "documents:listForTelegramSession" as any,
    {
      sessionId,
    },
  )) as TelegramSessionDocument[];

  return documents.filter((document) => !document.isArchived);
};

const extractTelegramIncomingAttachments = (
  message: TelegramTextMessage,
): TelegramIncomingAttachment[] => {
  const incomingAttachments: TelegramIncomingAttachment[] = [];

  if (Array.isArray(message.photo) && message.photo.length > 0) {
    const bestPhoto = [...message.photo]
      .filter((photo) => typeof photo.file_id === "string" && photo.file_id)
      .sort(
        (a, b) =>
          (b.file_size ?? (b.width ?? 0) * (b.height ?? 0)) -
          (a.file_size ?? (a.width ?? 0) * (a.height ?? 0)),
      )[0];

    if (bestPhoto?.file_id) {
      incomingAttachments.push({
        kind: "image",
        fileId: bestPhoto.file_id,
        label: "Telegram photo",
        size: bestPhoto.file_size,
      });
    }
  }

  if (message.document?.file_id) {
    incomingAttachments.push({
      kind: "file",
      fileId: message.document.file_id,
      label: message.document.file_name?.trim() || "Telegram file",
      mimeType: message.document.mime_type?.trim(),
      size: message.document.file_size,
    });
  }

  return incomingAttachments;
};

const resolveTelegramFileUrl = async (botToken: string, fileId: string) => {
  const response = await fetch(
    `${TELEGRAM_API_BASE_URL}/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    ok?: boolean;
    result?: {
      file_path?: string;
    };
  };

  const filePath = payload?.result?.file_path?.trim();

  if (!payload.ok || !filePath) {
    return null;
  }

  return `${TELEGRAM_API_BASE_URL}/file/bot${botToken}/${filePath}`;
};

const resolveTelegramIncomingAttachments = async (
  botToken: string,
  incomingAttachments: TelegramIncomingAttachment[],
): Promise<TelegramAttachment[]> => {
  const resolvedAttachments: TelegramAttachment[] = [];

  for (const attachment of incomingAttachments) {
    try {
      const url = await resolveTelegramFileUrl(botToken, attachment.fileId);

      if (!url) {
        continue;
      }

      const detailParts: string[] = [];

      if (attachment.mimeType) {
        detailParts.push(attachment.mimeType);
      }

      if (typeof attachment.size === "number" && attachment.size > 0) {
        detailParts.push(`${Math.round(attachment.size / 1024)} KB`);
      }

      const detailSuffix =
        detailParts.length > 0 ? ` (${detailParts.join(", ")})` : "";

      resolvedAttachments.push({
        kind: attachment.kind,
        url,
        label: `${attachment.label ?? "Attachment"}${detailSuffix}`,
      });
    } catch {
      // Ignore attachment resolution failures and continue with other items.
    }
  }

  return resolvedAttachments;
};

const buildAttachmentContextText = (attachments: TelegramAttachment[]) => {
  if (attachments.length === 0) {
    return "";
  }

  const lines = attachments.map((attachment, index) => {
    const label = attachment.label ? ` - ${attachment.label}` : "";
    return `${index + 1}. [${attachment.kind}]${label}: ${attachment.url}`;
  });

  return `\n\nAttachments:\n${lines.join("\n")}`;
};

const NOTE_ACTION_KEYWORDS = [
  "create note",
  "new note",
  "save this",
  "add to note",
  "append to note",
  "update note",
  "edit note",
  "rewrite note",
  "replace note",
  "continue note",
  "make a table",
  "table in note",
  "checklist in note",
  "write in note",
] as const;

const LIMITATION_QUERY_KEYWORDS = [
  "what can't",
  "what cant",
  "limitations",
  "what can you do",
  "what can’t you do",
  "what cant you do",
] as const;

const shouldForceNoteToolUsage = (
  text: string,
  attachments: TelegramAttachment[],
) => {
  const normalized = text.trim().toLowerCase();

  if (attachments.length > 0) {
    return true;
  }

  return NOTE_ACTION_KEYWORDS.some((keyword) => normalized.includes(keyword));
};

const isCapabilitiesQuestion = (text: string) => {
  const normalized = text.trim().toLowerCase();

  return LIMITATION_QUERY_KEYWORDS.some((keyword) =>
    normalized.includes(keyword),
  );
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

Character and tone:
- You are Wall-E: warm, lively, playful, and kind.
- Keep personality expressive, but stay clear and practical.
- Be an assistant first: answer questions, chat naturally, and help without forcing note actions.

Tool policy:
- Use listNotes when you need to find a note by topic or title.
- Use readNote before editing when you need current context.
- Use updateNote to edit note title/content. Prefer append mode unless the user clearly asks to replace everything.
- Use createNote when the user asks for a brand-new note.
- For note writing, prefer sending BlockNote blocks via the blocks field so rendering matches composer.
- For tables, checklists, and structured content, always use blocks (not markdown text).
- You can edit existing notes, append content, and build tables/checklists directly in notes.
- You can handle image/file/link attachments by saving them into notes.
- Do not claim tool limitations unless a tool call actually fails.
- Never create or modify notes unless the user explicitly asks for a note action.
- Explicit note actions include clear intent like: "create a note", "save this", "add this to my note", "update note", "append to note", "make a table in my note".
- If user intent is unclear, ask one short clarifying question before any note tool call.
- Choose short, clear titles.
- After tool usage, reply with what changed and include note links.

Response style:
- Keep replies concise and practical.
- If the user is just chatting or asking advice/info, do not push note creation.
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
  attachments,
  displayName,
  request,
  convex,
}: {
  chatId: number;
  sessionId: string;
  userText: string;
  attachments?: TelegramAttachment[];
  displayName?: string;
  request: Request;
  convex: ConvexHttpClient;
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
  const appBaseUrl = getAppBaseUrl(request);
  const defaultAttachments = attachments ?? [];
  const requiresNoteToolCall = shouldForceNoteToolUsage(
    userText,
    defaultAttachments,
  );
  const requestedCapabilities = isCapabilitiesQuestion(userText);
  let cachedSessionDocuments: TelegramSessionDocument[] | null = null;

  if (requestedCapabilities) {
    return [
      "I can help as your live Wall-E assistant.",
      "",
      "Current capabilities:",
      "- Create new notes.",
      "- Edit existing notes (append, replace, update title/content).",
      "- Read/search notes to find the right one.",
      "- Insert structured note content like tables and checklists.",
      "- Save image/file/link attachments into notes.",
      "",
      "If you want, tell me exactly what note to edit and what to add.",
    ].join("\n");
  }

  const loadSessionDocuments = async (forceRefresh = false) => {
    if (!cachedSessionDocuments || forceRefresh) {
      cachedSessionDocuments = await listTelegramSessionDocuments(
        convex,
        sessionId,
      );
    }

    return cachedSessionDocuments;
  };

  const toNoteSummary = (document: TelegramSessionDocument) => {
    const noteId = String(document._id);
    const plainText = getPlainTextFromSerializedContent(document.content);

    return {
      noteId,
      title: getSafeDocumentTitle(document.title),
      preview: truncate(
        plainText || "(empty note)",
        MAX_TELEGRAM_NOTE_PREVIEW_LENGTH,
      ),
      url: getDocumentUrl(noteId, appBaseUrl),
      createdAt: document._creationTime,
    };
  };

  const response = await generateText({
    model,
    providerOptions,
    stopWhen: stepCountIs(6),
    toolChoice: requiresNoteToolCall ? "required" : undefined,
    system: buildSystemPrompt(displayName),
    messages: [
      ...toCoreMessages(historyMessages),
      {
        role: "user",
        content: userText,
      },
    ],
    tools: {
      listNotes: tool({
        description:
          "List notes in the linked Telegram session. Use this to find a note before reading or editing it.",
        inputSchema: z.object({
          query: z
            .string()
            .max(240)
            .optional()
            .describe("Optional keyword filter across title and note text."),
          limit: z
            .number()
            .int()
            .min(1)
            .max(MAX_TELEGRAM_NOTE_LIST_RESULTS)
            .optional()
            .describe("How many notes to return."),
        }),
        execute: async ({ query, limit }) => {
          const documents = await loadSessionDocuments();
          const normalizedQuery = query?.trim().toLowerCase();
          const filteredDocuments = normalizedQuery
            ? documents.filter((document) => {
                const title = getSafeDocumentTitle(document.title).toLowerCase();
                const content = getPlainTextFromSerializedContent(
                  document.content,
                ).toLowerCase();

                return (
                  title.includes(normalizedQuery) ||
                  content.includes(normalizedQuery)
                );
              })
            : documents;
          const boundedLimit = Math.min(
            limit ?? 8,
            MAX_TELEGRAM_NOTE_LIST_RESULTS,
          );

          return {
            total: filteredDocuments.length,
            returned: Math.min(filteredDocuments.length, boundedLimit),
            notes: filteredDocuments.slice(0, boundedLimit).map(toNoteSummary),
          };
        },
      }),
      readNote: tool({
        description:
          "Read one note by noteId and return plain text content for context before editing.",
        inputSchema: z.object({
          noteId: z
            .string()
            .min(1)
            .describe("The noteId from listNotes or a previous tool response."),
        }),
        execute: async ({ noteId }) => {
          const normalizedNoteId = noteId.trim();

          if (!normalizedNoteId) {
            return {
              found: false,
              message: "noteId is required.",
            };
          }

          const documents = await loadSessionDocuments();
          const document = documents.find(
            (entry) => String(entry._id) === normalizedNoteId,
          );

          if (!document) {
            return {
              found: false,
              noteId: normalizedNoteId,
              message: "Note not found. Use listNotes to find a valid noteId.",
            };
          }

          const plainText = getPlainTextFromSerializedContent(document.content);

          return {
            found: true,
            note: {
              ...toNoteSummary(document),
              content: truncate(
                plainText || "(empty note)",
                MAX_TELEGRAM_NOTE_READ_LENGTH,
              ),
              contentLength: plainText.length,
            },
          };
        },
      }),
      createNote: tool({
        description:
          "Create a new note in the workspace. Prefer blocks for structured content so output matches composer formatting.",
        inputSchema: z.object({
          title: z
            .string()
            .min(1)
            .max(120)
            .describe("Short, clear note title."),
          blocks: telegramToolBlocksSchema
            .optional()
            .describe(
              "Preferred for writing note content with BlockNote formatting (paragraphs, checklists, tables).",
            ),
          attachments: telegramToolAttachmentsSchema.describe(
            "Optional links/files/images to save in the note as attachment entries.",
          ),
          content: z
            .string()
            .max(12_000)
            .optional()
            .describe(
              "Fallback plain text body when blocks are not used. Stored as BlockNote paragraphs.",
            ),
        }),
        execute: async ({ title, blocks, attachments, content }) => {
          const cleanedTitle = title.trim() || "Untitled";
          const incomingBlocks = buildIncomingBlocks({
            blocks,
            content,
            attachments: attachments ?? defaultAttachments,
          });
          const serializedContent = incomingBlocks
            ? JSON.stringify(incomingBlocks)
            : undefined;
          const documentId = (await convex.mutation(
            "documents:createFromTelegram" as any,
            {
              sessionId,
              title: cleanedTitle,
              content: serializedContent,
            },
          )) as string;

          const refreshedDocuments = await loadSessionDocuments(true);
          const createdDocument =
            refreshedDocuments.find(
              (document) => String(document._id) === documentId,
            ) ??
            ({
              _id: documentId,
              _creationTime: Date.now(),
              title: cleanedTitle,
              content: serializedContent,
            } as TelegramSessionDocument);

          return {
            created: true,
            note: {
              ...toNoteSummary(createdDocument),
              url: getDocumentUrl(documentId, appBaseUrl),
            },
          };
        },
      }),
      updateNote: tool({
        description:
          "Update an existing note by noteId. Prefer blocks for structured edits (especially tables/checklists).",
        inputSchema: z
          .object({
            noteId: z
              .string()
              .min(1)
              .describe("The noteId from listNotes/readNote."),
            title: z
              .string()
              .min(1)
              .max(120)
              .optional()
              .describe("Optional new title for the note."),
            blocks: telegramToolBlocksSchema
              .optional()
              .describe(
                "Preferred note content in BlockNote format. Matches composer rendering.",
              ),
            attachments: telegramToolAttachmentsSchema.describe(
              "Optional links/files/images to append or replace as attachment entries.",
            ),
            content: z
              .string()
              .max(12_000)
              .optional()
              .describe(
                "Fallback plain text to write into the note. Combined using mode after converting to paragraph blocks.",
              ),
            mode: z
              .enum(["append", "replace", "prepend"])
              .default("append")
              .describe("How to merge content into the existing note."),
          })
          .refine(
            (value) =>
              typeof value.title === "string" ||
              Array.isArray(value.blocks) ||
              Array.isArray(value.attachments) ||
              typeof value.content === "string",
            {
              message: "Provide title, blocks, attachments, or content.",
            },
          ),
        execute: async ({ noteId, title, blocks, attachments, content, mode }) => {
          const normalizedNoteId = noteId.trim();

          if (!normalizedNoteId) {
            return {
              updated: false,
              message: "noteId is required.",
            };
          }

          const documents = await loadSessionDocuments();
          const existingDocument = documents.find(
            (document) => String(document._id) === normalizedNoteId,
          );

          if (!existingDocument) {
            return {
              updated: false,
              noteId: normalizedNoteId,
              message: "Note not found. Use listNotes before updateNote.",
            };
          }

          const cleanedTitle = title?.trim();
          const shouldUpdateTitle = Boolean(cleanedTitle);
          const normalizedIncomingBlocks = buildIncomingBlocks({
            blocks,
            content,
            attachments: attachments ?? defaultAttachments,
          });
          const shouldUpdateContent = normalizedIncomingBlocks !== null;

          if (!shouldUpdateTitle && !shouldUpdateContent) {
            return {
              updated: false,
              noteId: normalizedNoteId,
              message: "Nothing to update.",
            };
          }

          const nextSerializedContent = normalizedIncomingBlocks
            ? serializeMergedContent({
                existingContent: existingDocument.content,
                incomingBlocks: normalizedIncomingBlocks,
                mode,
              })
            : undefined;

          try {
            await convex.mutation("documents:updateFromTelegram" as any, {
              sessionId,
              id: normalizedNoteId,
              title: shouldUpdateTitle ? cleanedTitle : undefined,
              content: nextSerializedContent,
            });
          } catch (error) {
            return {
              updated: false,
              noteId: normalizedNoteId,
              message:
                error instanceof Error
                  ? error.message
                  : "Failed to update the note.",
            };
          }

          const refreshedDocuments = await loadSessionDocuments(true);
          const updatedDocument =
            refreshedDocuments.find(
              (document) => String(document._id) === normalizedNoteId,
            ) ?? existingDocument;
          const updatedText = getPlainTextFromSerializedContent(
            updatedDocument.content,
          );

          return {
            updated: true,
            mode,
            note: {
              ...toNoteSummary(updatedDocument),
              contentPreview: truncate(
                updatedText || "(empty note)",
                MAX_TELEGRAM_NOTE_PREVIEW_LENGTH,
              ),
            },
          };
        },
      }),
    },
  });

  const assistantText =
    response.text.trim() ||
    "Done. I handled that. Tell me what else you want to create or update.";

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

const getTelegramCommandName = (text: string) => {
  const [command = ""] = text.trim().split(/\s+/, 1);
  return command.toLowerCase().replace(/@\S+$/, "");
};

const handleCommand = async ({
  botToken,
  chatId,
  text,
  convex,
}: {
  botToken: string;
  chatId: number;
  text: string;
  convex: ConvexHttpClient;
}) => {
  const normalized = getTelegramCommandName(text);
  const chatKey = String(chatId);

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

    await convex.mutation("documents:upsertTelegramSessionLink" as any, {
      chatId: chatKey,
      sessionId,
    });
    getMemoryStore().delete(chatKey);

    await sendTelegramMessage(
      botToken,
      chatId,
      "Session linked. You can now ask me to create and organize notes for this workspace.",
    );
    return true;
  }

  if (normalized === "/unlink") {
    await convex.mutation("documents:removeTelegramSessionLink" as any, {
      chatId: chatKey,
    });
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

const getLinkedSessionId = async (
  chatId: number,
  convex: ConvexHttpClient,
) => {
  const chatKey = String(chatId);
  const sessionId = (await convex.query(
    "documents:getTelegramSessionLink" as any,
    { chatId: chatKey },
  )) as string | null;

  return sessionId;
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
  const convex = getConvexClient();

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
  const baseText = message?.text?.trim() ?? message?.caption?.trim() ?? "";
  const incomingAttachments = message
    ? extractTelegramIncomingAttachments(message)
    : [];
  const resolvedAttachments =
    incomingAttachments.length > 0
      ? await resolveTelegramIncomingAttachments(botToken, incomingAttachments)
      : [];
  const text = `${baseText || "Please save these attachments in my notes."}${buildAttachmentContextText(resolvedAttachments)}`.trim();

  if (!chatId || (!baseText && resolvedAttachments.length === 0)) {
    return Response.json({ ok: true });
  }

  const handledCommand = await handleCommand({
    botToken,
    chatId,
    text: baseText,
    convex,
  });

  if (handledCommand) {
    return Response.json({ ok: true });
  }

  const linkedSessionId = await getLinkedSessionId(chatId, convex);

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
      attachments: resolvedAttachments,
      displayName,
      request,
      convex,
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
