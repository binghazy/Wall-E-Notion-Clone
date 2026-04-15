const DEFAULT_DOCUMENT_PLACEHOLDER_TITLE = "New Note";

export const getDocumentDisplayTitle = (title: string | undefined | null) => {
  const normalizedTitle = title?.trim();

  return normalizedTitle || DEFAULT_DOCUMENT_PLACEHOLDER_TITLE;
};

export const getEditableDocumentTitleValue = (
  title: string | undefined | null,
) => {
  return title?.trim() ?? "";
};

export const isUntitledDocumentTitle = (title: string | undefined | null) => {
  return !title?.trim();
};

export const getAutoDocumentTitleFromContent = (
  _serializedContent: string | undefined | null,
) => {
  return null;
};
