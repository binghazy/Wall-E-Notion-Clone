"use client";

import { BlockNoteEditor, PartialBlock } from "@blocknote/core";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import "@blocknote/core/fonts/inter.css";
import { en as coreEn } from "@blocknote/core/locales";
import { BlockNoteView } from "@blocknote/ariakit";
import "@blocknote/ariakit/style.css";
import {
  FormattingToolbar,
  FormattingToolbarController,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  getFormattingToolbarItems,
  useCreateBlockNote,
} from "@blocknote/react";
import {
  AIExtension,
  AIMenuController,
  AIToolbarButton,
  getAISlashMenuItems,
} from "@blocknote/xl-ai";
import { en as aiEn } from "@blocknote/xl-ai/locales";
import "@blocknote/xl-ai/style.css";
import { DefaultChatTransport } from "ai";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { getResolvedAiSettings, useAiSettings } from "@/hooks/use-ai-settings";
import { useEditorStore } from "@/hooks/use-editor-store";

interface EditorProps {
  onChange: (value: string) => void;
  initialContent?: string;
  editable?: boolean;
}

const CLOUD_AI_WRITING_STALL_TIMEOUT_MS = 18_000;
const LOCAL_AI_WRITING_STALL_TIMEOUT_MS = 45_000;

const parseInitialContent = (initialContent?: string) => {
  if (!initialContent) {
    return undefined;
  }

  try {
    return JSON.parse(initialContent) as PartialBlock[];
  } catch (error) {
    console.error("[EDITOR_PARSE_ERROR]", error);
    return undefined;
  }
};

const FormattingToolbarWithAI = () => {
  return (
    <FormattingToolbarController
      formattingToolbar={() => (
        <FormattingToolbar>
          {getFormattingToolbarItems()}
          <AIToolbarButton />
        </FormattingToolbar>
      )}
    />
  );
};

const SuggestionMenuWithAI = ({
  editor,
}: {
  editor: BlockNoteEditor<any, any, any>;
}) => {
  return (
    <SuggestionMenuController
      triggerCharacter="/"
      getItems={async (query) =>
        filterSuggestionItems(
          [
            ...getDefaultReactSlashMenuItems(editor),
            ...getAISlashMenuItems(editor),
          ],
          query,
        )
      }
    />
  );
};

const Editor = ({ onChange, initialContent, editable }: EditorProps) => {
  const { resolvedTheme } = useTheme();
  // Default to light theme during SSR to prevent hydration mismatch
  const theme = (resolvedTheme === "dark" ? "dark" : "light") || "light";
  const setEditor = useEditorStore((state) => state.setEditor);
  const clearEditor = useEditorStore((state) => state.clearEditor);
  const aiProvider = useAiSettings((state) => state.provider);
  const aiApiKey = useAiSettings((state) => state.apiKey);
  const aiModel = useAiSettings((state) => state.model);
  const aiOllamaBaseUrl = useAiSettings((state) => state.ollamaBaseUrl);
  const hasInitializedContentRef = useRef(false);
  const initialBlocksRef = useRef<PartialBlock[] | undefined>(undefined);

  const resolvedAiSettings = useMemo(
    () =>
      getResolvedAiSettings({
        provider: aiProvider,
        apiKey: aiApiKey,
        model: aiModel,
        ollamaBaseUrl: aiOllamaBaseUrl,
      }),
    [aiApiKey, aiModel, aiOllamaBaseUrl, aiProvider],
  );

  if (!hasInitializedContentRef.current) {
    initialBlocksRef.current = parseInitialContent(initialContent);
    hasInitializedContentRef.current = true;
  }

  const handleUpload = useCallback(async (file: File) => {
    return URL.createObjectURL(file);
  }, []);

  const editor = useCreateBlockNote(
    {
      editable: editable ?? true,
      initialContent: initialBlocksRef.current,
      uploadFile: handleUpload,
      dictionary: {
        ...coreEn,
        ai: aiEn,
      },
      extensions: [
        AIExtension({
          transport: new DefaultChatTransport({
            api: "/api/chat",
          }) as any,
          chatRequestOptions: {
            body: {
              aiSettings: resolvedAiSettings,
            },
          },
        }),
      ],
    },
    [editable, handleUpload],
  );

  useEffect(() => {
    setEditor(editor);

    return () => {
      if (useEditorStore.getState().editor === editor) {
        clearEditor();
      }
    };
  }, [clearEditor, editor, setEditor]);

  useEffect(() => {
    const aiExtension = editor.getExtension(AIExtension);

    if (!aiExtension) {
      return;
    }

    aiExtension.options.setState((current) => {
      const currentBody = (current.chatRequestOptions?.body ?? {}) as Record<
        string,
        unknown
      >;

      return {
        ...current,
        chatRequestOptions: {
          ...current.chatRequestOptions,
          body: {
            ...currentBody,
            aiSettings: resolvedAiSettings,
          },
        },
      };
    });
  }, [editor, resolvedAiSettings]);

  useEffect(() => {
    const aiExtension = editor.getExtension(AIExtension);

    if (!aiExtension) {
      return;
    }

    const aiWritingStallTimeoutMs =
      resolvedAiSettings.provider === "ollama"
        ? LOCAL_AI_WRITING_STALL_TIMEOUT_MS
        : CLOUD_AI_WRITING_STALL_TIMEOUT_MS;

    let stalledWritingTimeout: ReturnType<typeof setTimeout> | null = null;

    const clearStalledWritingTimeout = () => {
      if (stalledWritingTimeout !== null) {
        clearTimeout(stalledWritingTimeout);
        stalledWritingTimeout = null;
      }
    };

    const syncAiWritingGuard = () => {
      const aiMenuState = aiExtension.store.state.aiMenuState;

      if (
        aiMenuState === "closed" ||
        (aiMenuState.status !== "thinking" &&
          aiMenuState.status !== "ai-writing")
      ) {
        clearStalledWritingTimeout();
        return;
      }

      clearStalledWritingTimeout();
      stalledWritingTimeout = setTimeout(() => {
        const latestState = aiExtension.store.state.aiMenuState;

        if (latestState === "closed" || latestState.status !== "ai-writing") {
          return;
        }

        void aiExtension
          .abort("ai-writing-stalled")
          .catch((error) => {
            console.error("[EDITOR_AI_ABORT_STALLED_WRITING_ERROR]", error);
          })
          .finally(() => {
            const currentState = aiExtension.store.state.aiMenuState;

            if (
              currentState !== "closed" &&
              currentState.status === "ai-writing"
            ) {
              aiExtension.setAIResponseStatus("user-reviewing");
            }
          });
      }, aiWritingStallTimeoutMs);
    };

    const unsubscribe = aiExtension.store.subscribe(syncAiWritingGuard);
    syncAiWritingGuard();

    return () => {
      clearStalledWritingTimeout();
      unsubscribe();
    };
  }, [editor, resolvedAiSettings.provider]);

  return (
    <div>
      <BlockNoteView
        editor={editor}
        editable={editable ?? true}
        theme={theme}
        formattingToolbar={false}
        slashMenu={false}
        onChange={() => {
          onChange(JSON.stringify(editor.document));
        }}
      >
        <AIMenuController />
        <FormattingToolbarWithAI />
        <SuggestionMenuWithAI editor={editor} />
      </BlockNoteView>
    </div>
  );
};

export default Editor;
