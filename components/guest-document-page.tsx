"use client";

import { type PartialBlock } from "@blocknote/core";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, FileText, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useGuestDocuments } from "@/hooks/use-guest-documents";
import { useEditorStore } from "@/hooks/use-editor-store";
import { useSiteTour } from "@/hooks/use-site-tour";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getDocumentDisplayTitle,
  getEditableDocumentTitleValue,
} from "@/lib/document-title";
import {
  TELEGRAM_NOTES_SYNC_EVENT,
  type TelegramNotesSyncEventDetail,
} from "@/lib/telegram-sync-events";
import { flashWallEAiHighlight } from "@/lib/walle-ai-highlight";

type GuestDocumentPageProps = {
  documentId: string;
};

const normalizeContentForComparison = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeContentForComparison(entry));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const normalizedEntries = Object.entries(record)
    .filter(([key]) => key !== "id")
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, entryValue]) => [
      key,
      normalizeContentForComparison(entryValue),
    ]);

  return Object.fromEntries(normalizedEntries);
};

const getContentComparisonSignature = (serializedContent?: string) => {
  const normalizedContent = serializedContent?.trim();

  if (!normalizedContent) {
    return "";
  }

  try {
    return JSON.stringify(
      normalizeContentForComparison(JSON.parse(normalizedContent)),
    );
  } catch {
    return normalizedContent;
  }
};

const parseSerializedBlocks = (serializedContent?: string): PartialBlock[] => {
  const normalizedContent = serializedContent?.trim();

  if (!normalizedContent) {
    return [
      {
        type: "paragraph",
        content: "",
      },
    ];
  }

  try {
    const parsedContent = JSON.parse(normalizedContent) as unknown;

    if (Array.isArray(parsedContent)) {
      return parsedContent.filter(
        (block): block is PartialBlock =>
          Boolean(block) && typeof block === "object",
      );
    }
  } catch {
    // Fallback to plain paragraph content if persisted value is not valid JSON.
  }

  return [
    {
      type: "paragraph",
      content: normalizedContent,
    },
  ];
};

export const GuestDocumentPage = ({ documentId }: GuestDocumentPageProps) => {
  const router = useRouter();
  const [hasMounted, setHasMounted] = useState(false);
  const hasHydrated = useGuestDocuments((state) => state.hasHydrated);
  const document = useGuestDocuments((state) =>
    state.documents.find((entry) => entry.id === documentId)
  );
  const updateDocument = useGuestDocuments((state) => state.updateDocument);
  const removeDocument = useGuestDocuments((state) => state.removeDocument);
  const editor = useEditorStore((state) => state.editor);
  const highlightedSnapshotKeyRef = useRef<string | null>(null);
  const lastHandledTelegramContentSignatureRef = useRef<string | null>(null);
  const previousDocumentIdRef = useRef<string | null>(null);
  const { startTour: startDocumentTour } = useSiteTour("document");

  const Editor = useMemo(
    () => dynamic(() => import("@/components/editor"), { ssr: false }),
    []
  );

  const [title, setTitle] = useState("");
  const [lastAiSyncAt, setLastAiSyncAt] = useState<number | null>(null);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    setTitle(getEditableDocumentTitleValue(document?.title));
  }, [document?.title]);

  useEffect(() => {
    const currentDocumentId = document?.id ?? null;

    if (previousDocumentIdRef.current === currentDocumentId) {
      return;
    }

    previousDocumentIdRef.current = currentDocumentId;
    lastHandledTelegramContentSignatureRef.current = getContentComparisonSignature(
      typeof document?.content === "string" ? document.content : "",
    );
  }, [document]);

  useEffect(() => {
    if (!document?.id) {
      return;
    }

    const tourTimeout = window.setTimeout(() => {
      void startDocumentTour();
    }, 460);

    return () => {
      window.clearTimeout(tourTimeout);
    };
  }, [document?.id, startDocumentTour]);

  const applySerializedContentToEditor = useCallback(
    (nextSerializedContent?: string) => {
      if (!editor || !document) {
        return false;
      }

      const normalizedIncomingContent = nextSerializedContent ?? "";
      const nextBlocks = parseSerializedBlocks(normalizedIncomingContent);
      const currentBlockIds = Array.isArray(editor.document)
        ? editor.document
            .map((block) =>
              block && typeof block === "object" && "id" in block
                ? (block.id as unknown)
                : undefined,
            )
            .filter((blockId): blockId is string => typeof blockId === "string")
        : [];

      try {
        let insertedBlocks: Array<{ id?: unknown }> = [];

        if (currentBlockIds.length > 0) {
          const replacementResult = editor.replaceBlocks(
            currentBlockIds,
            nextBlocks,
          ) as {
            insertedBlocks?: Array<{ id?: unknown }>;
          };

          insertedBlocks = Array.isArray(replacementResult?.insertedBlocks)
            ? replacementResult.insertedBlocks
            : [];
        } else {
          const referenceBlock = editor.getTextCursorPosition().block;
          insertedBlocks = editor.insertBlocks(nextBlocks, referenceBlock, "after");
        }

        const insertedBlockIds = insertedBlocks
          .map((block) => (typeof block.id === "string" ? block.id : undefined))
          .filter((blockId): blockId is string => typeof blockId === "string");

        if (insertedBlockIds.length > 0) {
          flashWallEAiHighlight(editor, insertedBlockIds);
        }

        return true;
      } catch (error) {
        console.error("[GUEST_TELEGRAM_SYNC_APPLY_ERROR]", error);
        return false;
      }
    },
    [document, editor],
  );

  useEffect(() => {
    if (!document) {
      return;
    }

    const handleTelegramSync = (event: Event) => {
      const syncEvent = event as CustomEvent<TelegramNotesSyncEventDetail>;
      const matchingNote = syncEvent.detail?.notes?.find(
        (note) => note.id === document.id,
      );

      if (!matchingNote) {
        return;
      }

      // Ignore local-source echo updates so manual/composer typing is not interrupted.
      if (matchingNote.source !== "telegram") {
        return;
      }

      if (!editor) {
        return;
      }

      const incomingContent = matchingNote.content ?? "";
      const incomingContentSignature =
        getContentComparisonSignature(incomingContent);
      const currentSerializedContent = JSON.stringify(editor.document);
      const currentContentSignature =
        getContentComparisonSignature(currentSerializedContent);

      if (
        incomingContentSignature === currentContentSignature ||
        incomingContentSignature === lastHandledTelegramContentSignatureRef.current
      ) {
        return;
      }

      const didPreview = applySerializedContentToEditor(incomingContent);

      if (!didPreview) {
        return;
      }

      updateDocument(document.id, {
        content: incomingContent,
      });
      lastHandledTelegramContentSignatureRef.current = incomingContentSignature;
      setLastAiSyncAt(Date.now());
      toast.info("Content Updated Using AI", {
        description: `Wall-E Bot Updated "${getDocumentDisplayTitle(document.title)}".`,
        style: {
          background: "rgb(239 246 255)",
          color: "rgb(30 64 175)",
          border: "1px solid rgb(191 219 254)",
        },
      });
    };

    window.addEventListener(TELEGRAM_NOTES_SYNC_EVENT, handleTelegramSync);

    return () => {
      window.removeEventListener(TELEGRAM_NOTES_SYNC_EVENT, handleTelegramSync);
    };
  }, [applySerializedContentToEditor, document, editor, updateDocument]);

  useEffect(() => {
    if (!editor || !document || document.source !== "telegram") {
      return;
    }

    const snapshotKey = document.id;

    if (highlightedSnapshotKeyRef.current === snapshotKey) {
      return;
    }

    const blockIds = Array.isArray(editor.document)
      ? editor.document
          .map((block) =>
            block && typeof block === "object" && "id" in block
              ? (block.id as unknown)
              : undefined,
          )
          .filter((blockId): blockId is string => typeof blockId === "string")
      : [];

    if (blockIds.length === 0) {
      return;
    }

    flashWallEAiHighlight(editor, blockIds);
    highlightedSnapshotKeyRef.current = snapshotKey;
  }, [document, editor]);

  const handleDelete = () => {
    removeDocument(documentId);
    router.push("/documents");
  };

  if (!hasMounted || !hasHydrated) {
    return (
      <div className="px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-4xl space-y-4">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-12 w-full max-w-[20rem]" />
          <Skeleton className="h-[420px] w-full" />
        </div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="flex min-h-full items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-xl rounded-3xl border bg-card p-6 text-center shadow-sm sm:p-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <FileText className="h-5 w-5 text-muted-foreground" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold">Local note not found</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            This guest note may have been deleted or cleared from local storage.
          </p>
          <Button className="mt-6" asChild>
            <Link href="/documents">Back to guest workspace</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-background">
      <div className="border-b bg-background/95 px-4 py-5 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/documents">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  My Notes
                </Link>
              </Button>
              {document.source === "telegram" && (
                <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-200">
                  <Sparkles className="h-3 w-3" />
                  AI sync
                </span>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
      
          </div>

          <Input
            value={title}
            onChange={(event) => {
              const nextTitle = event.target.value;
              setTitle(nextTitle);
              updateDocument(documentId, {
                title: nextTitle,
              });
            }}
            placeholder="New Note"
            data-tour="document-title-input"
            className="h-auto border-none px-0 text-2xl font-semibold shadow-none focus-visible:ring-0 sm:text-3xl md:text-4xl"
          />

          <p className="mt-2 text-sm text-muted-foreground">
            {document.source === "telegram"
              ? "Synced from Telegram Wall-E bot. Incoming AI edits are applied automatically."
              : "This note is saved locally in your browser. Use the AI bubble or type /ai in the note to insert a reply directly."}
            {document.source === "telegram" && lastAiSyncAt
              ? ` Last AI sync at ${new Date(lastAiSyncAt).toLocaleTimeString()}.`
              : ""}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div data-tour="document-editor">
          <Editor
            key={document.id}
            onChange={(content) => {
              updateDocument(document.id, { content });
            }}
            initialContent={document.content}
          />
        </div>
      </div>
    </div>
  );
};
