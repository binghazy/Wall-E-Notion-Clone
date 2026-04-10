"use client";

import Image from "next/image";
import { Bot, FileText, PlusCircle, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useGuestDocuments } from "@/hooks/use-guest-documents";
import { useAiSettings } from "@/hooks/use-ai-settings";
import { Button } from "@/components/ui/button";

const DocumentsPage = () => {
  const userName = useAiSettings((state) => state.userName);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const resolvedUserName = hasMounted ? userName.trim() || "Guest" : "Guest";
  const firstName = resolvedUserName;
  const workspaceName = `${resolvedUserName}'s workspace`;

  return (
    <DocumentsHomeContent
      firstName={firstName}
      workspaceName={workspaceName}
      mode="guest"
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
  onCreate,
}: {
  firstName: string;
  workspaceName: string;
  mode: "authenticated" | "guest";
  onCreate: () => void;
}) => {
  const isGuest = mode === "guest";

  return (
    <div className="min-h-full bg-gradient-to-b from-background via-background to-muted/30 px-6 py-12 md:px-10 md:py-16">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.25fr_0.85fr]">
        <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
          <div className="grid gap-8 p-8 md:grid-cols-[1.1fr_0.9fr] md:p-10">
            <div className="flex flex-col justify-center">
              <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border bg-muted/70 px-3 py-1 text-xs font-medium text-muted-foreground">
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

        <aside className="space-y-4">
          <div className="rounded-3xl border bg-card p-6 shadow-sm">
            <p className="text-sm font-semibold">{workspaceName}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {isGuest
                ? "This guest session is fully local, so it keeps working even if Convex is not running."
                : "You are in the full authenticated workspace backed by Convex and Clerk."}
            </p>
          </div>

          <div className="rounded-3xl border bg-card p-7 shadow-sm">
            <h2 className="text-sm font-semibold">Quick start</h2>
            <div className="mt-4 space-y-11">
              <div className="rounded-2xl bg-muted/40 p-4">
                <p className="text-sm font-medium">1. Create a page</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isGuest
                    ? "Start from a blank local note without touching the backend."
                    : "Start from a blank note and save it to your workspace."}
                </p>
              </div>
              <div className="rounded-2xl bg-muted/40 p-4">
                <p className="text-sm font-medium">2. Write or paste content</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  The BlockNote editor is ready for paragraphs, checklists, and
                  tables.
                </p>
              </div>
              <div className="rounded-2xl bg-muted/40 p-4">
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
