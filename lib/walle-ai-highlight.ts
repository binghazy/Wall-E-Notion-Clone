"use client";

type EditorHighlightTarget = {
  domElement?: Element | null;
};

type HighlightState = {
  blockIds: string[];
  fadeTimer: number | null;
  clearTimer: number | null;
};

const highlightStateByRoot = new WeakMap<Element, HighlightState>();

const escapeAttributeValue = (value: string) => {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
};

const removeHighlightAttributes = (rootElement: Element, blockIds: string[]) => {
  for (const blockId of blockIds) {
    const escapedId = escapeAttributeValue(blockId);
    const blockElement = rootElement.querySelector(
      `.bn-block-outer[data-id="${escapedId}"]`,
    );

    if (!(blockElement instanceof HTMLElement)) {
      continue;
    }

    blockElement.removeAttribute("data-walle-ai-generated");
    blockElement.removeAttribute("data-walle-ai-generated-first");
  }
};

export const clearWallEAiHighlight = (editor: EditorHighlightTarget) => {
  const rootElement = editor.domElement;

  if (!rootElement) {
    return;
  }

  const state = highlightStateByRoot.get(rootElement);

  if (!state) {
    return;
  }

  if (state.fadeTimer) {
    clearTimeout(state.fadeTimer);
  }

  if (state.clearTimer) {
    clearTimeout(state.clearTimer);
  }

  removeHighlightAttributes(rootElement, state.blockIds);
  highlightStateByRoot.delete(rootElement);
};

export const flashWallEAiHighlight = (
  editor: EditorHighlightTarget,
  blockIds: string[],
) => {
  const rootElement = editor.domElement;
  const nextIds = blockIds.filter(Boolean);

  if (!rootElement || nextIds.length === 0) {
    return;
  }

  clearWallEAiHighlight(editor);

  const applyHighlight = () => {
    nextIds.forEach((blockId, index) => {
      const escapedId = escapeAttributeValue(blockId);
      const blockElement = rootElement.querySelector(
        `.bn-block-outer[data-id="${escapedId}"]`,
      );

      if (!(blockElement instanceof HTMLElement)) {
        return;
      }

      blockElement.setAttribute("data-walle-ai-generated", "active");

      if (index === 0) {
        blockElement.setAttribute("data-walle-ai-generated-first", "true");
      } else {
        blockElement.removeAttribute("data-walle-ai-generated-first");
      }
    });

    const state: HighlightState = {
      blockIds: nextIds,
      fadeTimer: window.setTimeout(() => {
        nextIds.forEach((blockId) => {
          const escapedId = escapeAttributeValue(blockId);
          const blockElement = rootElement.querySelector(
            `.bn-block-outer[data-id="${escapedId}"]`,
          );

          if (!(blockElement instanceof HTMLElement)) {
            return;
          }

          blockElement.setAttribute("data-walle-ai-generated", "fading");
        });
      }, 2100),
      clearTimer: window.setTimeout(() => {
        clearWallEAiHighlight(editor);
      }, 3900),
    };

    highlightStateByRoot.set(rootElement, state);
  };

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(applyHighlight);
  });
};
