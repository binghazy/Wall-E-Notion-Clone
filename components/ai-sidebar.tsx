"use client";

import { useChat } from "@ai-sdk/react";
import {
  CalendarDays,
  CheckSquare2,
  Loader2,
  PenLine,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import TextareaAutosize from "react-textarea-autosize";
import { toast } from "sonner";

import { AiSettingsDialog } from "@/components/ai-settings-dialog";
import { ReasoningChatMessage } from "@/components/reasoning-chat-message";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_WALLE_MODEL,
  getResolvedAiSettings,
  getDefaultModelForProvider,
  useAiSettings,
} from "@/hooks/use-ai-settings";
import { useEditorStore } from "@/hooks/use-editor-store";
import { buildBlockNoteDocumentContext } from "@/lib/blocknote-context";
import {
  insertNotionBlocksInputSchema,
  normalizeNotionBlocks,
  WallEChatMessage,
} from "@/lib/notion-blocks";
import { cn } from "@/lib/utils";
import { flashWallEAiHighlight } from "@/lib/walle-ai-highlight";

const OPEN_WALLE_ASSISTANT_EVENT = "walle:open-ai-sidebar";
const TOGGLE_WALLE_ASSISTANT_EVENT = "walle:toggle-ai-sidebar";
const AI_SETTINGS_ONBOARDING_STORAGE_PREFIX =
  "walle-ai-settings-onboarding-complete";

const isBusyStatus = (status: string) => {
  return status === "submitted" || status === "streaming";
};

const getMessageTextContent = (message: WallEChatMessage) => {
  if (!Array.isArray(message.parts)) {
    return "";
  }

  return message.parts
    .flatMap((part) => {
      if (!part || typeof part !== "object") {
        return [];
      }

      const normalizedPart = part as {
        type?: unknown;
        text?: unknown;
      };

      if (
        (normalizedPart.type === "text" ||
          normalizedPart.type === "reasoning") &&
        typeof normalizedPart.text === "string"
      ) {
        return [normalizedPart.text];
      }

      return [];
    })
    .join("\n")
    .trim();
};

const hasToolPart = (message: WallEChatMessage) => {
  if (!Array.isArray(message.parts)) {
    return false;
  }

  return message.parts.some((part) => {
    if (!part || typeof part !== "object") {
      return false;
    }

    const normalizedPart = part as { type?: unknown };
    return (
      typeof normalizedPart.type === "string" &&
      normalizedPart.type.startsWith("tool-")
    );
  });
};

const WallELogo = ({
  size,
  className,
}: {
  size: number;
  className?: string;
}) => {
  return (
    <Image
      src="/logo-dark.svg"
      alt="Wall-E"
      width={size}
      height={size}
      className={cn("object-contain dark:invert", className)}
    />
  );
};

const getEditorDocumentContext = (
  editor: ReturnType<typeof useEditorStore.getState>["editor"],
) => {
  if (!editor) {
    return null;
  }

  const blocks = Array.isArray(editor.document) ? editor.document : [];

  try {
    return buildBlockNoteDocumentContext({
      blocks,
      cursorBlock: editor.getTextCursorPosition().block,
    });
  } catch {
    return buildBlockNoteDocumentContext({
      blocks,
      cursorBlock: null,
    });
  }
};

const quickPrompts = [
  {
    icon: CheckSquare2,
    label: "Make a checklist",
    prompt:
      "Turn the relevant note content into a clean checklist with practical next steps.",
  },
  {
    icon: CalendarDays,
    label: "Build a schedule",
    prompt:
      "Create a clear schedule from the note context. Use reasonable placeholders where details are missing.",
  },
];

export const AiSidebar = () => {
  const pathname = usePathname();
  const isDocumentPage = pathname.startsWith("/documents/");
  const editor = useEditorStore((state) => state.editor);
  const aiProvider = useAiSettings((state) => state.provider);
  const aiApiKey = useAiSettings((state) => state.apiKey);
  const aiModel = useAiSettings((state) => state.model);
  const aiOllamaBaseUrl = useAiSettings((state) => state.ollamaBaseUrl);
  const aiUserName = useAiSettings((state) => state.userName);

  const [input, setInput] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isAiSettingsDialogOpen, setIsAiSettingsDialogOpen] = useState(false);
  const [isAiSettingsOnboardingFlow, setIsAiSettingsOnboardingFlow] =
    useState(false);
  const handledToolCallIdsRef = useRef<Set<string>>(new Set());
  const onboardingPromptedIdentityRef = useRef<string | null>(null);

  const onboardingIdentity = "guest";

  const activeModel =
    aiModel || getDefaultModelForProvider(aiProvider) || DEFAULT_WALLE_MODEL;
  const resolvedAiSettings = useMemo(
    () =>
      getResolvedAiSettings({
        provider: aiProvider,
        apiKey: aiApiKey,
        model: aiModel,
        ollamaBaseUrl: aiOllamaBaseUrl,
        userName: aiUserName,
      }),
    [aiApiKey, aiModel, aiOllamaBaseUrl, aiProvider, aiUserName],
  );

  const {
    messages,
    sendMessage,
    status,
    error,
    setMessages,
    clearError,
    addToolOutput,
  } = useChat<WallEChatMessage>();

  const processInsertNotionBlocksToolCall = useCallback(
    async ({
      toolCallId,
      input,
    }: {
      toolCallId: string;
      input: unknown;
    }) => {
      if (handledToolCallIdsRef.current.has(toolCallId)) {
        return;
      }

      handledToolCallIdsRef.current.add(toolCallId);

      const parsedToolInput = insertNotionBlocksInputSchema.safeParse(input);

      if (!parsedToolInput.success) {
        await addToolOutput({
          state: "output-error",
          tool: "insertNotionBlocks",
          toolCallId,
          errorText: "The AI returned blocks in an invalid format.",
        });
        toast.error("The AI returned blocks in an invalid format.");
        return;
      }

      if (!editor) {
        await addToolOutput({
          state: "output-error",
          tool: "insertNotionBlocks",
          toolCallId,
          errorText: "Open a document editor before inserting AI blocks.",
        });
        toast.error("Open a document editor before inserting AI blocks.");
        return;
      }

      try {
        const referenceBlock = editor.getTextCursorPosition().block;
        const insertedBlocks = editor.insertBlocks(
          normalizeNotionBlocks(parsedToolInput.data.blocks),
          referenceBlock,
          "after",
        );

        const lastInsertedBlock = insertedBlocks.at(-1);

        if (lastInsertedBlock) {
          editor.setTextCursorPosition(lastInsertedBlock, "end");
        }

        flashWallEAiHighlight(
          editor,
          insertedBlocks
            .map((block) => block.id)
            .filter(
              (blockId): blockId is string => typeof blockId === "string",
            ),
        );

        editor.focus();

        await addToolOutput({
          tool: "insertNotionBlocks",
          toolCallId,
          output: {
            insertedBlockCount: insertedBlocks.length,
          },
        });

        toast.success(
          `Inserted ${insertedBlocks.length} block${
            insertedBlocks.length === 1 ? "" : "s"
          } into the document.`,
        );
      } catch (insertionError) {
        console.error("[AI_BLOCK_INSERT_ERROR]", insertionError);
        await addToolOutput({
          state: "output-error",
          tool: "insertNotionBlocks",
          toolCallId,
          errorText: "The AI response could not be inserted into the editor.",
        });
        toast.error("The AI response could not be inserted into the editor.");
      }
    },
    [addToolOutput, editor],
  );

  useEffect(() => {
    onboardingPromptedIdentityRef.current = null;
  }, [onboardingIdentity]);

  useEffect(() => {
    handledToolCallIdsRef.current.clear();
    setIsOpen(false);
    setIsAiSettingsDialogOpen(false);
    setMessages([]);
    setInput("");
    clearError();
  }, [clearError, pathname, setMessages]);

  useEffect(() => {
    if (
      !isDocumentPage ||
      onboardingPromptedIdentityRef.current === onboardingIdentity
    ) {
      return;
    }

    onboardingPromptedIdentityRef.current = onboardingIdentity;

    const storageKey = `${AI_SETTINGS_ONBOARDING_STORAGE_PREFIX}:${onboardingIdentity}`;
    const hasCompletedOnboarding =
      typeof window !== "undefined" &&
      window.localStorage.getItem(storageKey) === "true";
    const hasSavedUserName = aiUserName.trim().length > 0;

    if (hasCompletedOnboarding && hasSavedUserName) {
      return;
    }

    setIsOpen(true);
    setIsAiSettingsOnboardingFlow(true);
    setIsAiSettingsDialogOpen(true);
    toast.info("Set your name, AI provider, and model to get started.");
  }, [aiUserName, isDocumentPage, onboardingIdentity]);

  useEffect(() => {
    const latestAssistantMessage = [...messages]
      .reverse()
      .find((message) => message.role === "assistant");

    if (!latestAssistantMessage?.parts) {
      return;
    }

    for (const part of latestAssistantMessage.parts) {
      if (
        part?.type !== "tool-insertNotionBlocks" ||
        part.state !== "input-available" ||
        typeof part.toolCallId !== "string"
      ) {
        continue;
      }

      if (handledToolCallIdsRef.current.has(part.toolCallId)) {
        continue;
      }

      void processInsertNotionBlocksToolCall({
        toolCallId: part.toolCallId,
        input: part.input,
      });
    }
  }, [messages, processInsertNotionBlocksToolCall]);

  useEffect(() => {
    const handleOpen = () => {
      if (!isDocumentPage) {
        toast.info("Open a note first to use Wall-E.");
        return;
      }

      setIsOpen(true);
    };

    const handleToggle = () => {
      if (!isDocumentPage) {
        toast.info("Open a note first to use Wall-E.");
        return;
      }

      setIsOpen((current) => !current);
    };

    window.addEventListener(
      OPEN_WALLE_ASSISTANT_EVENT,
      handleOpen as EventListener,
    );
    window.addEventListener(
      TOGGLE_WALLE_ASSISTANT_EVENT,
      handleToggle as EventListener,
    );

    return () => {
      window.removeEventListener(
        OPEN_WALLE_ASSISTANT_EVENT,
        handleOpen as EventListener,
      );
      window.removeEventListener(
        TOGGLE_WALLE_ASSISTANT_EVENT,
        handleToggle as EventListener,
      );
    };
  }, [isDocumentPage]);

  const isBusy = isBusyStatus(status);
  const isInputDisabled = isBusy || !editor;
  const latestAssistantMessageId = useMemo(() => {
    return (
      [...messages].reverse().find((message) => message.role === "assistant")
        ?.id ?? null
    );
  }, [messages]);

  useEffect(() => {
    if (!error || resolvedAiSettings.provider !== "ollama") {
      return;
    }

    const message = error.message || "Local model request failed.";
    toast.error(
      `Local Ollama request failed: ${message}. If this keeps happening, try a shorter prompt or switch to cloud.`,
    );
  }, [error, resolvedAiSettings.provider]);

  useEffect(() => {
    if (status !== "ready" || resolvedAiSettings.provider !== "ollama") {
      return;
    }

    const lastAssistantMessage = [...messages]
      .reverse()
      .find((message) => message.role === "assistant");

    if (!lastAssistantMessage || !Array.isArray(lastAssistantMessage.parts)) {
      return;
    }

    const hasRenderableParts =
      getMessageTextContent(lastAssistantMessage).length > 0 ||
      hasToolPart(lastAssistantMessage);

    if (!hasRenderableParts) {
      toast.info(
        "Local model finished without a valid editable response. Try a shorter prompt.",
      );
    }
  }, [messages, resolvedAiSettings.provider, status]);

  const sendPrompt = useCallback(
    async (prompt: string) => {
      const trimmedPrompt = prompt.trim();

      if (!trimmedPrompt || isInputDisabled) {
        return;
      }

      setInput("");
      clearError();

      await sendMessage(
        {
          text: trimmedPrompt,
        },
        {
          body: {
            aiSettings: resolvedAiSettings,
            documentContext: getEditorDocumentContext(editor),
          },
        },
      );
    },
    [clearError, editor, isInputDisabled, resolvedAiSettings, sendMessage],
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await sendPrompt(input);
    },
    [input, sendPrompt],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  if (!isDocumentPage) {
    return null;
  }

  const handleAiSettingsSaved = () => {
    if (isAiSettingsOnboardingFlow) {
      const storageKey = `${AI_SETTINGS_ONBOARDING_STORAGE_PREFIX}:${onboardingIdentity}`;

      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, "true");
      }

      setIsAiSettingsOnboardingFlow(false);
      toast.success(
        "AI settings saved. You can change them anytime from the settings button above.",
      );
    }
  };

  return (
    <>
      {isOpen && (
        <div className="fixed bottom-24 right-4 z-[99998] flex h-[77vh] w-[min(22rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-[2rem] border bg-background/96 shadow-[0_28px_90px_rgba(15,23,42,0.22)] backdrop-blur dark:border-white/10 dark:bg-[#161616]/95 sm:bottom-28 sm:right-6">
          <div className="border-b border-border/70 px-4 py-4 dark:border-white/10">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                {isBusy ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Image
                    src="/logo.svg"
                    alt="Logo"
                    width={32}
                    height={32}
                    className="dark:invert"
                  />
                )}

                <div className="min-w-0">
                  <p className="text-sm font-semibold tracking-wide">
                    Wall-E AI
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-border/80 bg-muted/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground dark:border-white/10 dark:bg-white/5">
                      {activeModel}
                    </span>
                    {resolvedAiSettings.provider === "gemini" ? (
                      resolvedAiSettings.apiKey ? (
                        <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-300">
                          Custom key
                        </span>
                      ) : (
                        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground dark:bg-white/5">
                          Server key
                        </span>
                      )
                    ) : (
                      <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-300">
                        Is Running
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <AiSettingsDialog
                  open={isAiSettingsDialogOpen}
                  onOpenChange={setIsAiSettingsDialogOpen}
                  onSave={handleAiSettingsSaved}
                  requireName={isAiSettingsOnboardingFlow}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-xl"
                      aria-label="AI settings"
                    >
                      <Settings2 className="h-4 w-4" />
                    </Button>
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-xl"
                  onClick={() => {
                    setIsAiSettingsDialogOpen(false);
                    setIsOpen(false);
                  }}
                  aria-label="Close AI assistant"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="scrollbar-hidden flex-1 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  {quickPrompts.map((prompt) => {
                    const Icon = prompt.icon;

                    return (
                      <button
                        key={prompt.label}
                        type="button"
                        onClick={() => void sendPrompt(prompt.prompt)}
                        disabled={isInputDisabled}
                        className="flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-background/80 px-4 py-3 text-left transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.03]"
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground dark:bg-white/10">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span>
                          <span className="block text-sm font-medium text-foreground">
                            {prompt.label}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            Run this on the current note context.
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((message) => {
                  const messageTextContent = getMessageTextContent(message);
                  const isAssistantMessage = message.role === "assistant";
                  const isStreamingAssistantMessage =
                    isAssistantMessage &&
                    isBusy &&
                    message.id === latestAssistantMessageId;

                  const toolStatusParts = (Array.isArray(message.parts)
                    ? message.parts
                    : []
                  )
                    .map((part, index) => {
                      if (part?.type !== "tool-insertNotionBlocks") {
                        return null;
                      }

                      const statusText =
                        part.state === "output-error"
                          ? part.errorText
                          : part.state === "output-available"
                            ? `Inserted ${part.output.insertedBlockCount} block${
                                part.output.insertedBlockCount === 1 ? "" : "s"
                              } into the note.`
                            : "Prepared blocks for insertion into the note.";

                      return (
                        <div
                          key={`${message.id}-tool-${index}`}
                          className="rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-xs text-muted-foreground dark:border-white/10 dark:bg-black/10"
                        >
                          {statusText}
                        </div>
                      );
                    })
                    .filter(Boolean);

                  if (
                    !messageTextContent &&
                    toolStatusParts.length === 0
                  ) {
                    return null;
                  }

                  return (
                    <div
                      key={message.id}
                      className={cn(
                        "max-w-[92%] rounded-[1.4rem] border px-4 py-3 text-sm shadow-sm",
                        message.role === "user"
                          ? "ml-auto border-primary/20 bg-primary text-primary-foreground"
                          : "border-border/70 bg-muted/40 dark:border-white/10 dark:bg-white/[0.04]",
                      )}
                    >
                      {messageTextContent ? (
                        isAssistantMessage ? (
                          <ReasoningChatMessage
                            message={messageTextContent}
                            isStreaming={isStreamingAssistantMessage}
                          />
                        ) : (
                          <p className="whitespace-pre-wrap leading-6">
                            {messageTextContent}
                          </p>
                        )
                      ) : null}
                      {toolStatusParts}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-border/70 px-4 py-4 dark:border-white/10">
            <form className="space-y-3" onSubmit={handleSubmit}>
              <div className="rounded-[1.5rem] border border-border/70 bg-background/90 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
                <TextareaAutosize
                  minRows={3}
                  maxRows={8}
                  value={input}
                  disabled={isInputDisabled}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    editor
                      ? "Ask Wall-E to write, summarize, schedule, or organize this note..."
                      : "Open a document to use the AI assistant..."
                  }
                  className="scrollbar-hidden w-full resize-none bg-transparent px-4 py-4 text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>

              {error && (
                <p className="text-xs text-destructive">
                  {error.message || "The assistant request failed."}
                </p>
              )}

              <div className="flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    handledToolCallIdsRef.current.clear();
                    setMessages([]);
                    clearError();
                  }}
                  disabled={messages.length === 0 && !error}
                >
                  Clear
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="rounded-xl px-5"
                  disabled={!input.trim() || isInputDisabled}
                >
                  {isBusy ? "Working..." : "Send"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Button
        size="icon"
        className="fixed bottom-4 right-4 z-[99999] h-16 w-16 rounded-[1.6rem] shadow-2xl sm:bottom-6 sm:right-6"
        onClick={() => setIsOpen((current) => !current)}
        aria-label={isOpen ? "Close AI assistant" : "Open AI assistant"}
      >
        {isBusy ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : (
          <WallELogo size={36} />
        )}
      </Button>
    </>
  );
};
