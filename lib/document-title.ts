const UNTITLED_DOCUMENT_TITLE = "Untitled";
const MAX_AUTO_DOCUMENT_TITLE_LENGTH = 80;

type BlockLike = {
  content?: unknown;
  children?: unknown;
};

const normalizeWhitespace = (value: string) => {
  return value.replace(/\s+/g, " ").trim();
};

const truncateTitle = (value: string) => {
  const normalizedValue = normalizeWhitespace(value);

  if (normalizedValue.length <= MAX_AUTO_DOCUMENT_TITLE_LENGTH) {
    return normalizedValue;
  }

  return `${normalizedValue
    .slice(0, MAX_AUTO_DOCUMENT_TITLE_LENGTH - 3)
    .trimEnd()}...`;
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

        return rowRecord.cells.map(stringifyInlineContent).join(" ");
      })
      .filter(Boolean)
      .join(" ");
  }

  if ("content" in record) {
    return stringifyInlineContent(record.content);
  }

  return "";
};

const findFirstNonEmptyBlockText = (blocks: unknown[]): string | null => {
  for (const block of blocks) {
    if (!block || typeof block !== "object") {
      continue;
    }

    const blockRecord = block as BlockLike;
    const text = normalizeWhitespace(stringifyInlineContent(blockRecord.content));

    if (text) {
      return text;
    }

    if (Array.isArray(blockRecord.children)) {
      const childrenText = findFirstNonEmptyBlockText(blockRecord.children);

      if (childrenText) {
        return childrenText;
      }
    }
  }

  return null;
};

export const getDocumentDisplayTitle = (title: string | undefined | null) => {
  const normalizedTitle = title?.trim();

  return normalizedTitle ? normalizedTitle : UNTITLED_DOCUMENT_TITLE;
};

export const isUntitledDocumentTitle = (title: string | undefined | null) => {
  const normalizedTitle = title?.trim();

  if (!normalizedTitle) {
    return true;
  }

  return normalizedTitle.toLowerCase() === UNTITLED_DOCUMENT_TITLE.toLowerCase();
};

export const getAutoDocumentTitleFromContent = (
  serializedContent: string | undefined | null,
) => {
  if (!serializedContent) {
    return null;
  }

  try {
    const parsedContent = JSON.parse(serializedContent) as unknown;

    if (!Array.isArray(parsedContent)) {
      return null;
    }

    const firstBlockText = findFirstNonEmptyBlockText(parsedContent);

    if (!firstBlockText) {
      return null;
    }

    const nextTitle = truncateTitle(firstBlockText);

    return nextTitle || null;
  } catch {
    return null;
  }
};
