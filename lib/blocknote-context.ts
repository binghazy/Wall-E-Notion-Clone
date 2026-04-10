type BlockLike = {
  id?: string;
  type?: string;
  content?: unknown;
  children?: unknown;
};

export type BlockNoteBlockPreview = {
  id: string | null;
  index: number;
  text: string;
  type: string;
};

export type BlockNoteDocumentContext = {
  blockCount: number;
  cursorBlock: BlockNoteBlockPreview | null;
  documentText: string;
  nearbyBlocks: BlockNoteBlockPreview[];
};

const MAX_DOCUMENT_TEXT_LENGTH = 6000;
const MAX_NEARBY_BLOCKS = 10;

const normalizeWhitespace = (value: string) => {
  return value.replace(/\s+/g, " ").trim();
};

const truncate = (value: string, maxLength: number) => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
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

const extractBlockText = (block: BlockLike): string => {
  const contentText = normalizeWhitespace(stringifyInlineContent(block.content));
  const childrenText: string = Array.isArray(block.children)
    ? block.children
        .map((child) => extractBlockText((child as BlockLike) ?? {}))
        .filter(Boolean)
        .join(" / ")
    : "";

  return normalizeWhitespace(
    [contentText, childrenText].filter(Boolean).join(" "),
  );
};

const toBlockPreview = (
  block: BlockLike,
  index: number,
): BlockNoteBlockPreview => {
  return {
    id: typeof block.id === "string" ? block.id : null,
    index,
    text: truncate(extractBlockText(block), 280),
    type: typeof block.type === "string" ? block.type : "unknown",
  };
};

const findCursorBlockIndex = (
  blocks: BlockLike[],
  cursorBlock: BlockLike | null,
) => {
  if (!cursorBlock || typeof cursorBlock.id !== "string") {
    return null;
  }

  return blocks.findIndex((block) => block.id === cursorBlock.id);
};

const isBlockPreview = (value: unknown): value is BlockNoteBlockPreview => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    (typeof record.id === "string" || record.id === null) &&
    typeof record.index === "number" &&
    typeof record.text === "string" &&
    typeof record.type === "string"
  );
};

export const buildBlockNoteDocumentContext = ({
  blocks,
  cursorBlock,
}: {
  blocks: unknown[];
  cursorBlock: unknown | null;
}): BlockNoteDocumentContext => {
  const normalizedBlocks = blocks.filter(
    (block): block is BlockLike => !!block && typeof block === "object",
  );
  const previews = normalizedBlocks.map(toBlockPreview);
  const cursorPreview =
    cursorBlock && typeof cursorBlock === "object"
      ? toBlockPreview(cursorBlock as BlockLike, -1)
      : null;
  const cursorBlockIndex = findCursorBlockIndex(
    normalizedBlocks,
    cursorBlock as BlockLike | null,
  );
  const startIndex =
    cursorBlockIndex === null
      ? 0
      : Math.max(0, cursorBlockIndex - Math.floor(MAX_NEARBY_BLOCKS / 2));
  const nearbyBlocks = previews.slice(
    startIndex,
    startIndex + MAX_NEARBY_BLOCKS,
  );
  const documentText = truncate(
    previews
      .filter((preview) => preview.text)
      .map((preview) => `[${preview.index + 1}] ${preview.type}: ${preview.text}`)
      .join("\n"),
    MAX_DOCUMENT_TEXT_LENGTH,
  );

  return {
    blockCount: previews.length,
    cursorBlock:
      cursorBlockIndex === null
        ? cursorPreview
        : previews[cursorBlockIndex] ?? cursorPreview,
    documentText,
    nearbyBlocks,
  };
};

export const normalizeBlockNoteDocumentContext = (
  value: unknown,
): BlockNoteDocumentContext | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const nearbyBlocks = Array.isArray(record.nearbyBlocks)
    ? record.nearbyBlocks.filter(isBlockPreview).slice(0, MAX_NEARBY_BLOCKS)
    : [];
  const cursorBlock = isBlockPreview(record.cursorBlock)
    ? record.cursorBlock
    : null;
  const blockCount =
    typeof record.blockCount === "number" && Number.isFinite(record.blockCount)
      ? Math.max(0, Math.trunc(record.blockCount))
      : nearbyBlocks.length;
  const documentText =
    typeof record.documentText === "string"
      ? truncate(record.documentText, MAX_DOCUMENT_TEXT_LENGTH)
      : "";

  return {
    blockCount,
    cursorBlock,
    documentText,
    nearbyBlocks,
  };
};

export const formatBlockNoteDocumentContext = (
  context: BlockNoteDocumentContext | null | undefined,
) => {
  if (!context) {
    return "";
  }

  const nearbyBlockLines = context.nearbyBlocks
    .map(
      (block) =>
        `- [${block.index + 1}] ${block.type}: ${block.text || "(empty)"}`,
    )
    .join("\n");

  const cursorBlockLine = context.cursorBlock
    ? `Current cursor block: [${
        context.cursorBlock.index >= 0 ? context.cursorBlock.index + 1 : "?"
      }] ${context.cursorBlock.type}: ${context.cursorBlock.text || "(empty)"}`
    : "Current cursor block: unavailable";

  return [
    "The user is editing a live BlockNote document. Treat the following BlockNote context as the current note content.",
    "Use this note context when answering, summarizing, and deciding what to insert with insertNotionBlocks.",
    `Document block count: ${context.blockCount}`,
    cursorBlockLine,
    "Nearby blocks around the cursor:",
    nearbyBlockLines || "- No nearby blocks were available.",
    "Document text snapshot:",
    context.documentText || "(empty document)",
  ].join("\n");
};
