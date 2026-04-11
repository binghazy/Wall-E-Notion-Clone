"use client";

import Image from "next/image";
import { Bot, Copy, FileText, PlusCircle, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useGuestDocuments } from "@/hooks/use-guest-documents";
import { useAiSettings } from "@/hooks/use-ai-settings";
import { useTelegramSession } from "@/hooks/use-telegram-session";
import { Button } from "@/components/ui/button";

const DocumentsPage = () => {
  const userName = useAiSettings((state) => state.userName);
  const { sessionId, telegramCommand } = useTelegramSession();
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const resolvedUserName = hasMounted ? userName.trim() || "Guest" : "Guest";
  const firstName = resolvedUserName;
  const workspaceName = `${resolvedUserName}'s workspace`;
  const handleCopyTelegramCommand = async () => {
    if (!telegramCommand) {
      return;
    }

    try {
      await navigator.clipboard.writeText(telegramCommand);
      toast.success("Telegram link command copied.");
    } catch {
      toast.error("Could not copy command. Copy it manually.");
    }
  };

  return (
    <DocumentsHomeContent
      firstName={firstName}
      workspaceName={workspaceName}
      mode="guest"
      sessionId={sessionId}
      telegramCommand={telegramCommand}
      onCopyTelegramCommand={handleCopyTelegramCommand}
      onCreate={useGuestCreateDocument()}
    />
  );
};

const useGuestCreateDocument = () => {
  const router = useRouter();
  const createDocument = useGuestDocuments((state) => state.createDocument);

  return () => {
    const documentId = createDocument();
    router.push(`/documents/${documentId}`);
  };
};

const DocumentsHomeContent = ({
  firstName,
  workspaceName,
  mode,
  sessionId,
  telegramCommand,
  onCopyTelegramCommand,
  onCreate,
}: {
  firstName: string;
  workspaceName: string;
  mode: "authenticated" | "guest";
  sessionId: string;
  telegramCommand: string;
  onCopyTelegramCommand: () => void;
  onCreate: () => void;
}) => {
  const isGuest = mode === "guest";

  return (
    <div className="min-h-full bg-gradient-to-b from-background via-background to-muted/30 px-6 py-12 md:px-10 md:py-16">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.25fr_0.85fr]">
        <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
          <div className="grid gap-4 p-4  md:grid-cols-[1.1fr_0.9fr] md:p-12">
            <div className="flex h-full flex-col justify-center">
              <div className="mb-10 inline-flex w-fit items-center gap-2 rounded-full border bg-muted/70 px-3 py-1 text-xs font-medium text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                {isGuest ? "Guest mode is active" : "Signed-in workspace"}
              </div>
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Welcome to {firstName}&apos;s Wall-E AI
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
                {isGuest
                  ? "You are inside a temporary guest workspace stored locally in this browser. Create a page, try the editor, and use the AI sidebar once you open a document."
                  : "Create a page, organize your notes, and use the AI sidebar to turn rough ideas into clean blocks inside your workspace."}
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button onClick={onCreate} size="lg">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  {isGuest ? "Create a note" : "Create your first note"}
                </Button>
                <Button variant="outline" size="lg" asChild>
                  <Link href="/">Back to home</Link>
                </Button>
              </div>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border bg-muted/40 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <FileText className="h-4 w-4 text-primary" />
                    Pages stay organized
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {isGuest
                      ? "Guest notes are stored locally and stay available in this browser."
                      : "Documents are stored in your workspace and stay connected to your account."}
                  </p>
                </div>
                <div className="rounded-2xl border bg-muted/40 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <Bot className="h-4 w-4 text-primary" />
                    AI tools are ready
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Open any document and the right-side assistant can insert
                    lists, tables, and paragraphs.
                  </p>
                </div>
              </div>
            </div>

            <div className="relative flex items-center justify-center rounded-3xl bg-muted/50 p-6">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />
              <Image
                src="/empty.png"
                height={320}
                width={320}
                alt="Workspace illustration"
                className="relative w-full max-w-[280px] dark:hidden"
                priority
              />
              <Image
                src="/empty-dark.png"
                height={320}
                width={320}
                alt="Workspace illustration"
                className="relative hidden w-full max-w-[280px] dark:block"
                priority
              />
            </div>
          </div>
        </section>

        <aside className="flex h-full flex-col gap-4">
          {isGuest && (
            <div className="rounded-3xl border border-sky-200/80 bg-sky-100 p-6 shadow-sm dark:border-sky-900/40 dark:bg-sky-950/30">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-sky-900 dark:text-sky-100">
                  Telegram Link
                </h2>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onCopyTelegramCommand}
                  disabled={!telegramCommand}
                  className="border-sky-300/80 bg-white/70 hover:bg-white dark:border-sky-800/60 dark:bg-sky-900/30 dark:hover:bg-sky-900/50"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy command
                </Button>
              </div>
              <p className="mt-2 text-sm text-sky-800/90 dark:text-sky-200/90">
                Send this command to your bot once, then Telegram-created notes
                will sync here.
              </p>
              <div className="mt-3 rounded-xl border border-sky-200/80 bg-white/70 px-3 py-2 text-xs font-mono break-all text-sky-900 dark:border-sky-800/60 dark:bg-sky-900/35 dark:text-sky-100">
                {telegramCommand || "/session <loading...>"}
              </div>
              <p className="mt-2 text-xs break-all text-sky-800/90 dark:text-sky-200/90">
                Session ID: {sessionId || "loading..."}
              </p>
            </div>
          )}

          <div className="rounded-3xl border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-semibold">Quick start</h2>
            <div className="mt-4 space-y-11">
              <div className="rounded-2xl bg-muted/20 p-4">
                <p className="text-sm font-medium">1. Create a page</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isGuest
                    ? "Start from a blank local note without touching the backend."
                    : "Start from a blank note and save it to your workspace."}
                </p>
              </div>
              <div className="rounded-2xl bg-muted/20 p-4">
                <p className="text-sm font-medium">2. Write or paste content</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  The BlockNote editor is ready for paragraphs, checklists, and
                  tables.
                </p>
              </div>
              <div className="rounded-2xl bg-muted/20 p-4">
                <p className="text-sm font-medium">
                  3. Let the assistant organize it
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  On document pages, the AI sidebar can insert structured blocks
                  directly.
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default DocumentsPage;
