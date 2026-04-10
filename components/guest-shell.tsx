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
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";
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
import { useGuestDocuments } from "@/hooks/use-guest-documents";
import { useAiSettings } from "@/hooks/use-ai-settings";
import { cn } from "@/lib/utils";
import { getDocumentDisplayTitle } from "@/lib/document-title";

type GuestShellProps = {
  children: ReactNode;
};

const OPEN_WALLE_ASSISTANT_EVENT = "walle:open-ai-sidebar";

export const GuestShell = ({ children }: GuestShellProps) => {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isAgentsOpen, setIsAgentsOpen] = useState(true);
  const [isPagesOpen, setIsPagesOpen] = useState(true);
  const [hasMounted, setHasMounted] = useState(false);

  const documents = useGuestDocuments((state) => state.documents);
  const hasHydrated = useGuestDocuments((state) => state.hasHydrated);
  const createDocument = useGuestDocuments((state) => state.createDocument);
  const userName = useAiSettings((state) => state.userName);
  const workspaceOwnerName = hasMounted ? userName.trim() || "Guest" : "Guest";
  const workspaceOwnerInitial =
    workspaceOwnerName.charAt(0).toUpperCase() || "G";

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const activeDocumentId = useMemo(() => {
    const match = pathname.match(/^\/documents\/(.+)$/);

    return match?.[1];
  }, [pathname]);

  const activeDocument = documents.find(
    (document) => document.id === activeDocumentId,
  );

  const handleCreateDocument = () => {
    const documentId = createDocument();
    setIsMobileNavOpen(false);
    router.push(`/documents/${documentId}`);
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

  const primaryLinks = [
    {
      label: "Home",
      icon: Home,
      href: "/documents",
      isActive: pathname === "/documents",
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
    <div className="flex h-full flex-col bg-[#ffffff] text-[#3d392f] dark:bg-[#1d1d1d] dark:text-[#d9d3c7]">
      <div className="border-b border-black/5 px-4 py-4 dark:border-white/10">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="h-9 w-9 rounded-xl">
              <AvatarFallback className="rounded-xl bg-[#7b5a3e] text-sm font-semibold text-white dark:bg-[#6b4e36]">
                {workspaceOwnerInitial}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#252525] dark:text-white">
                {workspaceOwnerName}
              </p>
              <p className="text-xs text-muted-foreground">Local workspace</p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-xl text-muted-foreground"
            onClick={handleCreateDocument}
            aria-label="Create a new page"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <button
          type="button"
          onClick={() => handlePlaceholderClick("Search")}
          className="mt-4 flex w-full items-center gap-3 rounded-xl border border-black/5 bg-white/60 px-3 py-2.5 text-left text-sm text-muted-foreground shadow-sm transition hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.07]"
        >
          <Search className="h-4 w-4" />
          Search
        </button>
      </div>

      <div className="scrollbar-hidden flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          {primaryLinks.map((item) => {
            const Icon = item.icon;

            if (item.href) {
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setIsMobileNavOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
                    item.isActive
                      ? "bg-black/[0.05] font-medium text-[#1e1d1a] dark:bg-white/[0.08] dark:text-white"
                      : "text-[#5c564b] dark:text-[#c0b8aa]",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            }

            return (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
                  item.isActive
                    ? "bg-black/[0.05] font-medium text-[#1e1d1a] dark:bg-white/[0.08] dark:text-white"
                    : "text-[#5c564b] dark:text-[#c0b8aa]",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="mt-6">
          <Collapsible open={isAgentsOpen} onOpenChange={setIsAgentsOpen}>
            <CollapsibleTrigger asChild>
              <div className="mb-2 flex items-center justify-between px-3 cursor-pointer">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Agents
                  </p>
                  <span className="rounded-md bg-green-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-green-700 dark:text-green-400">
                    Beta
                  </span>
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform duration-200",
                    isAgentsOpen ? "rotate-0" : "-rotate-90",
                  )}
                />
              </div>
            </CollapsibleTrigger>

            <CollapsibleContent className="space-y-1">
              <button
                type="button"
                onClick={() => handlePlaceholderClick("New agent")}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[#5c564b] transition hover:bg-black/[0.04] dark:text-[#c0b8aa] dark:hover:bg-white/[0.06]"
              >
                <Plus className="h-4 w-4" />
                New agent
              </button>
              <button
                type="button"
                onClick={() => handlePlaceholderClick("More")}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[#5c564b] transition hover:bg-black/[0.04] dark:text-[#c0b8aa] dark:hover:bg-white/[0.06]"
              >
                <MoreHorizontal className="h-4 w-4" />
                More
              </button>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <div className="mt-6">
          <Collapsible open={isPagesOpen} onOpenChange={setIsPagesOpen}>
            <CollapsibleTrigger asChild>
              <div className="mb-2 flex items-center justify-between px-3 cursor-pointer">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Pages
                </p>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform duration-200",
                    isPagesOpen ? "rotate-0" : "-rotate-90",
                  )}
                />
              </div>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <button
                type="button"
                onClick={handleCreateDocument}
                className="mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[#5c564b] transition hover:bg-black/[0.04] dark:text-[#c0b8aa] dark:hover:bg-white/[0.06]"
              >
                <Plus className="h-4 w-4" />
                Add a page
              </button>

              {!hasHydrated && (
                <div className="rounded-xl border border-dashed border-black/10 px-3 py-4 text-sm text-muted-foreground dark:border-white/10">
                  Loading pages...
                </div>
              )}

              {hasHydrated && documents.length === 0 && (
                <div className="rounded-xl border border-dashed border-black/10 px-3 py-4 text-sm text-muted-foreground dark:border-white/10">
                  No pages yet.
                </div>
              )}

              <div className="space-y-1">
                {hasHydrated &&
                  documents.map((document) => (
                    <Link
                      key={document.id}
                      href={`/documents/${document.id}`}
                      onClick={() => setIsMobileNavOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
                        activeDocumentId === document.id
                          ? "bg-black/[0.05] font-medium text-[#1e1d1a] dark:bg-white/[0.08] dark:text-white"
                          : "text-[#5c564b] dark:text-[#c0b8aa]",
                      )}
                    >
                      <FileText className="h-4 w-4" />
                      <span className="truncate">
                        {getDocumentDisplayTitle(document.title)}
                      </span>
                    </Link>
                  ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      <div className="border-t border-black/5 p-3 dark:border-white/10">
        <button
          type="button"
          onClick={() => handlePlaceholderClick("Help")}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[#5c564b] transition hover:bg-black/[0.04] dark:text-[#c0b8aa] dark:hover:bg-white/[0.06]"
        >
          <HelpCircle className="h-4 w-4" />
          Help
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full bg-[#fbfaf8] text-foreground dark:bg-[#191919]">
      {isMobile ? (
        <Dialog open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
          <DialogContent className="h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] max-w-none overflow-hidden rounded-[2rem] p-0 sm:max-w-none">
            {navigationContent}
          </DialogContent>
        </Dialog>
      ) : (
        <aside className="hidden h-full w-[17rem] shrink-0 border-r border-black/5 bg-[#ffffff] lg:flex dark:border-white/10 dark:bg-[#1d1d1d]">
          {navigationContent}
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-black/5 bg-background/90 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 dark:border-white/10 dark:bg-[#191919]/90">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {isMobile && (
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

              <div className="min-w-0 rounded-xl border border-black/5 bg-muted/40 px-3 py-2 text-sm font-medium shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
                <span className="truncate">
                  {activeDocument
                    ? getDocumentDisplayTitle(activeDocument.title)
                    : "Guest workspace"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <ModeToggle />
              <AiSettingsDialog />
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={handleCreateDocument}
              >
                <Plus className="mr-2 h-4 w-4" />
                New page
              </Button>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};
