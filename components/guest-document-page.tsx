"use client";

import { type PartialBlock } from "@blocknote/core";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, FileText, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useGuestDocuments } from "@/hooks/use-guest-documents";
import { useEditorStore } from "@/hooks/use-editor-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getAutoDocumentTitleFromContent,
  isUntitledDocumentTitle,
} from "@/lib/document-title";
import {
  TELEGRAM_NOTES_SYNC_EVENT,
  type TelegramNotesSyncEventDetail,
} from "@/lib/telegram-sync-events";
import { flashWallEAiHighlight } from "@/lib/walle-ai-highlight";

type GuestDocumentPageProps = {
  documentId: string;
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
  const hasHydrated = useGuestDocuments((state) => state.hasHydrated);
  const document = useGuestDocuments((state) =>
    state.documents.find((entry) => entry.id === documentId)
  );
  const updateDocument = useGuestDocuments((state) => state.updateDocument);
  const removeDocument = useGuestDocuments((state) => state.removeDocument);
  const editor = useEditorStore((state) => state.editor);
  const highlightedSnapshotKeyRef = useRef<string | null>(null);
  const lastHandledTelegramContentRef = useRef<string | null>(null);

  const Editor = useMemo(
    () => dynamic(() => import("@/components/editor"), { ssr: false }),
    []
  );

  const [title, setTitle] = useState("");
  const [lastAiSyncAt, setLastAiSyncAt] = useState<number | null>(null);

  useEffect(() => {
    setTitle(document?.title ?? "");
  }, [document?.title]);

  useEffect(() => {
    lastHandledTelegramContentRef.current =
      typeof document?.content === "string" ? document.content : "";
  }, [document?.content, document?.id]);

  const applyTelegramSyncedContent = useCallback(
    (nextSerializedContent?: string) => {
      if (!editor || !document || document.source !== "telegram") {
        return;
      }

      const normalizedIncomingContent = nextSerializedContent ?? "";

      if (lastHandledTelegramContentRef.current === normalizedIncomingContent) {
        return;
      }

      const serializedEditorContent = JSON.stringify(editor.document);

      if (serializedEditorContent === normalizedIncomingContent) {
        lastHandledTelegramContentRef.current = normalizedIncomingContent;
        return;
      }

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

        lastHandledTelegramContentRef.current = normalizedIncomingContent;
        setLastAiSyncAt(Date.now());
      } catch (error) {
        console.error("[GUEST_TELEGRAM_SYNC_APPLY_ERROR]", error);
      }
    },
    [document, editor],
  );

  useEffect(() => {
    if (!document || document.source !== "telegram") {
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

      applyTelegramSyncedContent(matchingNote.content);
    };

    window.addEventListener(TELEGRAM_NOTES_SYNC_EVENT, handleTelegramSync);

    return () => {
      window.removeEventListener(TELEGRAM_NOTES_SYNC_EVENT, handleTelegramSync);
    };
  }, [applyTelegramSyncedContent, document]);

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

  if (!hasHydrated) {
    return (
      <div className="px-6 py-8">
        <div className="mx-auto max-w-4xl space-y-4">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-12 w-80" />
          <Skeleton className="h-[420px] w-full" />
        </div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="flex min-h-full items-center justify-center px-6 py-12">
        <div className="w-full max-w-xl rounded-3xl border bg-card p-8 text-center shadow-sm">
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
      <div className="border-b bg-background/95 px-6 py-5 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto max-w-4xl">
          <div className="mb-4 flex items-center justify-between gap-3">
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
            placeholder="Untitled"
            className="h-auto border-none px-0 text-3xl font-semibold shadow-none focus-visible:ring-0 md:text-4xl"
          />

          <p className="mt-2 text-sm text-muted-foreground">
            {document.source === "telegram"
              ? "Synced from Telegram Wall-E bot. New AI edits now appear here automatically."
              : "This note is saved locally in your browser. Use the AI bubble or type /ai in the note to insert a reply directly."}
            {document.source === "telegram" && lastAiSyncAt
              ? ` Last AI sync at ${new Date(lastAiSyncAt).toLocaleTimeString()}.`
              : ""}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-8">
        <Editor
          key={document.id}
          onChange={(content) => {
            const nextDocumentUpdates: { content: string; title?: string } = {
              content,
            };

            if (isUntitledDocumentTitle(document.title)) {
              const autoTitle = getAutoDocumentTitleFromContent(content);

              if (autoTitle) {
                nextDocumentUpdates.title = autoTitle;
              }
            }

            updateDocument(document.id, nextDocumentUpdates);
          }}
          initialContent={document.content}
        />
      </div>
    </div>
  );
};
