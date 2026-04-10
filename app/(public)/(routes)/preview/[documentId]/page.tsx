"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { FileText } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useGuestDocuments } from "@/hooks/use-guest-documents";
import { getDocumentDisplayTitle } from "@/lib/document-title";

interface DocumentPreviewPageProps {
  params: {
    documentId: string;
  };
}

const DocumentPreviewPage = ({ params }: DocumentPreviewPageProps) => {
  const hasHydrated = useGuestDocuments((state) => state.hasHydrated);
  const document = useGuestDocuments((state) =>
    state.documents.find((entry) => entry.id === params.documentId),
  );

  const Editor = useMemo(
    () => dynamic(() => import("@/components/editor"), { ssr: false }),
    [],
  );

  if (!hasHydrated) {
    return (
      <div className="px-6 py-8">
        <div className="mx-auto max-w-4xl space-y-4">
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
          <h1 className="mt-4 text-2xl font-semibold">Preview not available</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            This local guest note exists only in its original browser session.
          </p>
          <Button className="mt-6" asChild>
            <Link href="/documents">Back to guest workspace</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-background px-6 py-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-2 text-3xl font-semibold">
          {getDocumentDisplayTitle(document.title)}
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Read-only guest preview
        </p>
        <Editor
          editable={false}
          initialContent={document.content}
          onChange={() => undefined}
        />
      </div>
    </div>
  );
};

export default DocumentPreviewPage;
