"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, FileText, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useGuestDocuments } from "@/hooks/use-guest-documents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getAutoDocumentTitleFromContent,
  isUntitledDocumentTitle,
} from "@/lib/document-title";

type GuestDocumentPageProps = {
  documentId: string;
};

export const GuestDocumentPage = ({ documentId }: GuestDocumentPageProps) => {
  const router = useRouter();
  const hasHydrated = useGuestDocuments((state) => state.hasHydrated);
  const document = useGuestDocuments((state) =>
    state.documents.find((entry) => entry.id === documentId)
  );
  const updateDocument = useGuestDocuments((state) => state.updateDocument);
  const removeDocument = useGuestDocuments((state) => state.removeDocument);

  const Editor = useMemo(
    () => dynamic(() => import("@/components/editor"), { ssr: false }),
    []
  );

  const [title, setTitle] = useState("");

  useEffect(() => {
    setTitle(document?.title ?? "");
  }, [document?.title]);

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
            <Button variant="ghost" size="sm" asChild>
              <Link href="/documents">
                <ArrowLeft className="mr-2 h-4 w-4" />
                My Notes
              </Link>
            </Button>
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
            This note is saved locally in your browser. Use the AI bubble or type /ai in the
            note to insert a reply directly.
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
