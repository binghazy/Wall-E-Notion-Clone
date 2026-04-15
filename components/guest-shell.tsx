"use client";

import Link from "next/link";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  HelpCircle,
  Home,
  Inbox,
  MenuIcon,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  type MouseEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useMediaQuery } from "usehooks-ts";

import { AiSettingsDialog } from "@/components/ai-settings-dialog";
import { ModeToggle } from "@/components/mode-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useGuestDocuments, type GuestDocumentDeletion } from "@/hooks/use-guest-documents";
import { useAiSettings } from "@/hooks/use-ai-settings";
import { useTelegramSession } from "@/hooks/use-telegram-session";
import {
  TELEGRAM_NOTES_SYNC_EVENT,
  type TelegramNotesSyncEventDetail,
  type TelegramSyncedNote,
} from "@/lib/telegram-sync-events";
import { useSiteTour } from "@/hooks/use-site-tour";
import { cn } from "@/lib/utils";
import { getDocumentDisplayTitle } from "@/lib/document-title";

type GuestShellProps = {
  children: ReactNode;
};

const OPEN_WALLE_ASSISTANT_EVENT = "walle:open-ai-sidebar";
const TELEGRAM_SYNC_FAILURE_PAUSE_MS = 60_000;
const TELEGRAM_SYNC_MAX_FAILURES_BEFORE_PAUSE = 3;

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

export const GuestShell = ({ children }: GuestShellProps) => {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isAgentsOpen, setIsAgentsOpen] = useState(true);
  const [isPagesOpen, setIsPagesOpen] = useState(true);
  const [hasMounted, setHasMounted] = useState(false);
  const lastSyncedTelegramContentRef = useRef<Map<string, string>>(new Map());
  const lastPostedLocalContentRef = useRef<Map<string, string>>(new Map());
  const lastPushedLocalSignatureRef = useRef("");
  const syncFailureCountRef = useRef(0);
  const syncPausedUntilRef = useRef(0);
  const hasShownSyncPauseToastRef = useRef(false);
  const { startTour: startHomeTour } = useSiteTour("home");
  const { startTour: startDocumentTour } = useSiteTour("document");

  const documents = useGuestDocuments((state) => state.documents);
  const pendingDeletions = useGuestDocuments((state) => state.pendingDeletions);
  const hasHydrated = useGuestDocuments((state) => state.hasHydrated);
  const createDocument = useGuestDocuments((state) => state.createDocument);
  const removeDocument = useGuestDocuments((state) => state.removeDocument);
  const upsertDocuments = useGuestDocuments((state) => state.upsertDocuments);
  const clearPendingDeletions = useGuestDocuments(
    (state) => state.clearPendingDeletions,
  );
  const userName = useAiSettings((state) => state.userName);
  const { sessionId } = useTelegramSession();
  const workspaceOwnerName = hasMounted ? userName.trim() || "Guest" : "Guest";
  const workspaceOwnerInitial =
    workspaceOwnerName.charAt(0).toUpperCase() || "G";
  const isMobileLayout = hasMounted && isMobile;
  const isDocumentsReady = hasMounted && hasHydrated;
  const stablePathname = hasMounted ? pathname : "/documents";

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    lastSyncedTelegramContentRef.current.clear();
    lastPostedLocalContentRef.current.clear();
    lastPushedLocalSignatureRef.current = "";
    syncFailureCountRef.current = 0;
    syncPausedUntilRef.current = 0;
    hasShownSyncPauseToastRef.current = false;
  }, [sessionId]);

  useEffect(() => {
    if (!isDocumentsReady || !sessionId) {
      return;
    }

    let isCancelled = false;

    const markSyncSuccess = () => {
      syncFailureCountRef.current = 0;
      syncPausedUntilRef.current = 0;
      hasShownSyncPauseToastRef.current = false;
    };

    const markSyncFailure = (source: "post" | "get", details: string) => {
      syncFailureCountRef.current += 1;
      console.error("[GUEST_TELEGRAM_SYNC_ERROR]", {
        source,
        details,
        failureCount: syncFailureCountRef.current,
      });

      if (
        syncFailureCountRef.current >=
          TELEGRAM_SYNC_MAX_FAILURES_BEFORE_PAUSE &&
        Date.now() >= syncPausedUntilRef.current
      ) {
        syncPausedUntilRef.current = Date.now() + TELEGRAM_SYNC_FAILURE_PAUSE_MS;

        if (!hasShownSyncPauseToastRef.current) {
          toast.error(
            "Telegram sync is temporarily paused for 1 minute due to repeated server errors.",
            {
              description: details.slice(0, 220),
            },
          );
          hasShownSyncPauseToastRef.current = true;
        }
      }
    };

    const syncLocalSessionNotes = async () => {
      const latestDocuments = useGuestDocuments.getState().documents;
      const latestPendingDeletions = useGuestDocuments.getState().pendingDeletions;
      const sessionNotes = latestDocuments
        .map((document) => ({
          id: document.id,
          title: document.title,
          content: document.content,
          source: document.source === "telegram" ? ("telegram" as const) : ("local" as const),
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
      const notesSignature = JSON.stringify(
        sessionNotes.map((note) => [
          note.id,
          note.title,
          note.content ?? "",
          note.source,
        ]),
      );
      const deletionSignature = JSON.stringify(
        latestPendingDeletions
          .map((deletion) => [deletion.id, deletion.source ?? "local"])
          .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      );
      const payloadSignature = `${notesSignature}:${deletionSignature}`;

      if (payloadSignature === lastPushedLocalSignatureRef.current) {
        return;
      }

      const deletedNotesPayload: GuestDocumentDeletion[] =
        latestPendingDeletions.map((deletion) => ({
          id: deletion.id,
          source: deletion.source,
        }));
      const response = await fetch("/api/telegram/session-notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          notes: sessionNotes,
          deletedNotes: deletedNotesPayload,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `POST /api/telegram/session-notes failed (${response.status}): ${errorText}`,
        );
      }

      lastPostedLocalContentRef.current = new Map(
        sessionNotes.map((note) => [
          note.id,
          getContentComparisonSignature(note.content ?? ""),
        ]),
      );
      lastPushedLocalSignatureRef.current = payloadSignature;
      clearPendingDeletions(
        deletedNotesPayload.map((deletion) => deletion.id),
      );
    };

    const syncTelegramSessionNotes = async () => {
      if (Date.now() < syncPausedUntilRef.current) {
        return;
      }

      try {
        await syncLocalSessionNotes();

        const response = await fetch(
          `/api/telegram/session-notes?sessionId=${encodeURIComponent(sessionId)}`,
          {
            cache: "no-store",
          },
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `GET /api/telegram/session-notes failed (${response.status}): ${errorText}`,
          );
        }

        const payload = (await response.json()) as {
          notes?: TelegramSyncedNote[];
        };

        if (isCancelled || !Array.isArray(payload.notes)) {
          return;
        }

        const existingDocuments = useGuestDocuments.getState().documents;
        const existingById = new Map(
          existingDocuments.map((document) => [document.id, document]),
        );
        const changedSyncedNotes: TelegramSyncedNote[] = [];
        const incomingIds = new Set<string>();

        for (const note of payload.notes) {
          incomingIds.add(note.id);

          const normalizedIncomingContent = note.content ?? "";
          const incomingContentSignature = getContentComparisonSignature(
            normalizedIncomingContent,
          );
          const previousSyncedContentSignature =
            lastSyncedTelegramContentRef.current.get(note.id);
          const existingDocument = existingById.get(note.id);
          const existingContent = existingDocument?.content ?? "";
          const existingContentSignature = getContentComparisonSignature(
            existingContent,
          );
          const lastPostedLocalContentSignature =
            lastPostedLocalContentRef.current.get(note.id);
          const isLocalEcho =
            typeof lastPostedLocalContentSignature === "string" &&
            lastPostedLocalContentSignature === incomingContentSignature;

          const isInitialContentMismatch =
            previousSyncedContentSignature === undefined &&
            Boolean(existingDocument) &&
            existingContentSignature !== incomingContentSignature;
          const hasServerContentChanged =
            previousSyncedContentSignature !== undefined &&
            previousSyncedContentSignature !== incomingContentSignature &&
            existingContentSignature !== incomingContentSignature;

          if (!isLocalEcho && (isInitialContentMismatch || hasServerContentChanged)) {
            changedSyncedNotes.push(note);
          }

          lastSyncedTelegramContentRef.current.set(
            note.id,
            incomingContentSignature,
          );
        }

        for (const cachedId of Array.from(
          lastSyncedTelegramContentRef.current.keys(),
        )) {
          if (!incomingIds.has(cachedId)) {
            lastSyncedTelegramContentRef.current.delete(cachedId);
          }
        }

        upsertDocuments(payload.notes);

        if (changedSyncedNotes.length > 0 && typeof window !== "undefined") {
          const eventDetail: TelegramNotesSyncEventDetail = {
            notes: changedSyncedNotes,
          };
          window.dispatchEvent(
            new CustomEvent<TelegramNotesSyncEventDetail>(
              TELEGRAM_NOTES_SYNC_EVENT,
              { detail: eventDetail },
            ),
          );
        }
        markSyncSuccess();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown sync error.";
        const source = message.startsWith("GET") ? "get" : "post";
        markSyncFailure(source, message);
      }
    };

    void syncTelegramSessionNotes();
    const intervalId = window.setInterval(syncTelegramSessionNotes, 3_000);
    const handleAppVisible = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void syncTelegramSessionNotes();
    };

    window.addEventListener("focus", handleAppVisible);
    document.addEventListener("visibilitychange", handleAppVisible);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleAppVisible);
      document.removeEventListener("visibilitychange", handleAppVisible);
    };
  }, [
    clearPendingDeletions,
    isDocumentsReady,
    pendingDeletions,
    sessionId,
    upsertDocuments,
  ]);

  const activeDocumentId = useMemo(() => {
    if (!isDocumentsReady) {
      return undefined;
    }

    const match = stablePathname.match(/^\/documents\/(.+)$/);

    return match?.[1];
  }, [isDocumentsReady, stablePathname]);

  const handleCreateDocument = () => {
    const documentId = createDocument();
    setIsMobileNavOpen(false);
    router.push(`/documents/${documentId}`);
  };

  const handleDeleteDocument = (
    event: MouseEvent<HTMLButtonElement>,
    documentId: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    removeDocument(documentId);

    if (activeDocumentId === documentId) {
      router.push("/documents");
    }
  };

  const handlePlaceholderClick = (label: string) => {
    toast.info(`${label} is ready for a future pass.`);
    setIsMobileNavOpen(false);
  };

  const openAssistant = () => {
    if (!activeDocumentId) {
      toast.info("Open a note first, then Wall-E can work inside it.");
      return;
    }

    window.dispatchEvent(new Event(OPEN_WALLE_ASSISTANT_EVENT));
    setIsMobileNavOpen(false);
  };

  const handleStartTutorial = () => {
    if (activeDocumentId) {
      void startDocumentTour({ force: true });
    } else {
      void startHomeTour({ force: true });
    }

    setIsMobileNavOpen(false);
  };

  const primaryLinks = [
    {
      label: "Home",
      icon: Home,
      href: "/documents",
      isActive: stablePathname === "/documents",
    },
    {
      label: "Meetings",
      icon: CalendarDays,
      onClick: () => handlePlaceholderClick("Meetings"),
    },
    {
      label: "Wall-E AI",
      icon: Sparkles,
      onClick: openAssistant,
      isActive: Boolean(activeDocumentId),
    },
    {
      label: "Inbox",
      icon: Inbox,
      onClick: () => handlePlaceholderClick("Inbox"),
    },
  ];

  const navigationContent = (
    <div className="flex h-full flex-col bg-background text-foreground">
      <div className="border-b border-border/70 px-3 py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="h-11 w-11 rounded-xl">
              <AvatarFallback className="rounded-xl bg-[#7b5a3e] text-base font-semibold text-white dark:bg-[#6b4e36]">
                {workspaceOwnerInitial}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-foreground">
                {workspaceOwnerName}
              </p>
              <p className="whitespace-nowrap text-sm text-muted-foreground">
                Local workspace
              </p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-xl text-muted-foreground"
            onClick={handleCreateDocument}
            aria-label="Create a new note"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>

        <button
          type="button"
          onClick={() => handlePlaceholderClick("Search")}
          className="mt-4 flex w-full items-center gap-3 rounded-xl border border-border/70 bg-muted/30 py-3 pl-3 pr-1.5 text-left text-base text-muted-foreground shadow-sm transition-colors hover:bg-accent/70 hover:text-foreground"
        >
          <Search className="h-5 w-5" />
          Search
        </button>
      </div>

      <div className="scrollbar-hidden flex-1 overflow-y-auto px-3 py-5">
        <div className="space-y-1">
          {primaryLinks.map((item) => {
            const Icon = item.icon;

            if (item.href) {
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setIsMobileNavOpen(false)}
                  data-tour={item.label === "Wall-E AI" ? "shell-open-ai" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3.5 rounded-xl py-3 pl-3 pr-1 text-base transition-colors hover:bg-accent/70 hover:text-foreground",
                    item.isActive
                      ? "bg-accent font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            }

            return (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                data-tour={item.label === "Wall-E AI" ? "shell-open-ai" : undefined}
                className={cn(
                  "flex w-full items-center gap-3.5 rounded-xl py-3 pl-3 pr-1 text-left text-base transition-colors hover:bg-accent/70 hover:text-foreground",
                  item.isActive
                    ? "bg-accent font-medium text-foreground"
                    : "text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="mt-6">
          <Collapsible open={isAgentsOpen} onOpenChange={setIsAgentsOpen}>
            <CollapsibleTrigger asChild>
              <div className="mb-3 flex cursor-pointer items-center justify-between pl-3 pr-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Agents
                  </p>
                  <span className="rounded-md bg-green-500/20 px-2 py-0.5 text-xs font-semibold text-green-700 dark:text-green-400">
                    Beta
                  </span>
                </div>
                <ChevronDown
                  className={cn(
                    "h-5 w-5 text-muted-foreground transition-transform duration-200",
                    isAgentsOpen ? "rotate-0" : "-rotate-90",
                  )}
                />
              </div>
            </CollapsibleTrigger>

            <CollapsibleContent className="space-y-1">
              <button
                type="button"
                onClick={() => handlePlaceholderClick("New agent")}
                className="flex w-full items-center gap-3.5 rounded-xl py-3 pl-3 pr-1 text-left text-base text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
              >
                <Plus className="h-5 w-5" />
                New agent
              </button>
              <button
                type="button"
                onClick={() => handlePlaceholderClick("More")}
                className="flex w-full items-center gap-3.5 rounded-xl py-3 pl-3 pr-1 text-left text-base text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
              >
                <MoreHorizontal className="h-5 w-5" />
                More
              </button>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <div className="mt-6" data-tour="shell-pages-list">
          <Collapsible open={isPagesOpen} onOpenChange={setIsPagesOpen}>
            <CollapsibleTrigger asChild>
              <div className="mb-3 flex cursor-pointer items-center justify-between pl-3 pr-1">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Pages
                </p>
                <ChevronDown
                  className={cn(
                    "h-5 w-5 text-muted-foreground transition-transform duration-200",
                    isPagesOpen ? "rotate-0" : "-rotate-90",
                  )}
                />
              </div>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <button
                type="button"
                onClick={handleCreateDocument}
                className="mb-2 flex w-full items-center gap-3.5 rounded-xl py-3 pl-3 pr-1 text-left text-base text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
              >
                <Plus className="h-5 w-5" />
                Add a Note
              </button>

              {!isDocumentsReady && (
                <div className="rounded-xl border border-dashed border-border/70 px-4 py-5 text-base text-muted-foreground">
                  Loading pages...
                </div>
              )}

              {isDocumentsReady && documents.length === 0 && (
                <div className="rounded-xl border border-dashed border-border/70 px-4 py-5 text-base text-muted-foreground">
                  No pages yet.
                </div>
              )}

              <div className="space-y-1">
                {isDocumentsReady &&
                  documents.map((document) => (
                    <div key={document.id} className="group relative">
                      <Link
                        href={`/documents/${document.id}`}
                        onClick={() => setIsMobileNavOpen(false)}
                        className={cn(
                          "flex w-full items-center gap-3.5 rounded-xl py-3 pl-3 pr-9 text-base transition-colors hover:bg-accent/70 hover:text-foreground",
                          activeDocumentId === document.id
                            ? "bg-accent font-medium text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        <FileText className="h-5 w-5" />
                        <span className="truncate">
                          {getDocumentDisplayTitle(document.title)}
                        </span>
                      </Link>
                      <button
                        type="button"
                        onClick={(event) => handleDeleteDocument(event, document.id)}
                        className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-colors hover:bg-accent/70 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                        aria-label={`Delete ${getDocumentDisplayTitle(document.title)}`}
                        title="Delete note"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      <div className="border-t border-border/70 px-3 py-3">
        <button
          type="button"
          onClick={handleStartTutorial}
          className="flex w-full items-center gap-3.5 rounded-xl py-3 pl-3 pr-1 text-left text-base text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
        >
          <HelpCircle className="h-5 w-5" />
          Tutorial
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full bg-background text-foreground">
      {isMobileLayout ? (
        <Dialog open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
          <DialogContent className="h-[calc(100dvh-1.5rem)] w-[calc(100vw-1rem)] max-w-none overflow-hidden rounded-2xl p-0 sm:h-[calc(100%-1.5rem)] sm:w-[calc(100%-1.5rem)] sm:max-w-none sm:rounded-[2rem]">
            {navigationContent}
          </DialogContent>
        </Dialog>
      ) : (
        <aside className="hidden h-full w-[15rem] shrink-0 border-r border-border/70 bg-background lg:flex">
          {navigationContent}
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {isMobileLayout && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-xl"
                  onClick={() => setIsMobileNavOpen(true)}
                  aria-label="Open guest navigation"
                >
                  <MenuIcon className="h-5 w-5" />
                </Button>
              )}

              <Button
                variant="ghost"
                size="icon"
                className="hidden rounded-xl text-muted-foreground md:inline-flex"
                onClick={() => router.back()}
                aria-label="Go back"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="hidden rounded-xl text-muted-foreground md:inline-flex"
                onClick={() => router.forward()}
                aria-label="Go forward"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>

            </div>

            <div className="flex items-center gap-2">
              <ModeToggle />
              <div data-tour="document-ai-settings">
                <AiSettingsDialog />
              </div>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};
