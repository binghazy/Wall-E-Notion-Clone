"use client";

import { useMutation, useQuery } from "convex/react";
import dynamic from "next/dynamic";
import { useMemo, useRef, useEffect, useCallback } from "react";
import { useConvexAuth } from "convex/react";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { GuestDocumentPage } from "@/components/guest-document-page";
import { Toolbar } from "@/components/toolbar";
import { Cover } from "@/components/cover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getAutoDocumentTitleFromContent,
  isUntitledDocumentTitle,
} from "@/lib/document-title";

interface DocumentIdPageProps {
  params: {
    documentId: string;
  };
}

const DocumentIdPage = ({ params }: DocumentIdPageProps) => {
  const { isAuthenticated, isLoading } = useConvexAuth();

  if (isLoading) {
    return (
      <div>
        <Cover.Skeleton />
        <div className="md:max-w-3xl lg:max-w-4xl mx-auto mt-10">
          <div className="space-y-4 pl-8 pt-4">
            <Skeleton className="h-14 w-[50%]" />
            <Skeleton className="h-4 w-[80%]" />
            <Skeleton className="h-4 w-[40%]" />
            <Skeleton className="h-4 w-[60%]" />
          </div>
        </div>
      </div>
    );
  }

  return isAuthenticated ? (
    <AuthenticatedDocumentIdPage
      documentId={params.documentId as Id<"documents">}
    />
  ) : (
    <GuestDocumentPage documentId={params.documentId} />
  );
};

const AuthenticatedDocumentIdPage = ({
  documentId,
}: {
  documentId: Id<"documents">;
}) => {
  const Editor = useMemo(
    () => dynamic(() => import("@/components/editor"), { ssr: false }),
    [],
  );

  const document = useQuery(api.documents.getById, {
    documentId,
  });

  const update = useMutation(api.documents.update);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onChange = useCallback(
    (content: string) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        const nextUpdatePayload: {
          id: Id<"documents">;
          content: string;
          title?: string;
        } = {
          id: documentId,
          content,
        };

        if (isUntitledDocumentTitle(document?.title)) {
          const autoTitle = getAutoDocumentTitleFromContent(content);

          if (autoTitle) {
            nextUpdatePayload.title = autoTitle;
          }
        }

        update(nextUpdatePayload);
      }, 1000);
    },
    [document?.title, documentId, update],
  );

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  if (document === undefined) {
    return (
      <div>
        <Cover.Skeleton />
        <div className="md:max-w-3xl lg:max-w-4xl mx-auto mt-10">
          <div className="space-y-4 pl-8 pt-4">
            <Skeleton className="h-14 w-[50%]" />
            <Skeleton className="h-4 w-[80%]" />
            <Skeleton className="h-4 w-[40%]" />
            <Skeleton className="h-4 w-[60%]" />
          </div>
        </div>
      </div>
    );
  }

  if (document === null) {
    return <div>Not found</div>;
  }

  return (
    <div className="pb-40">
      <Cover url={document.coverImage} />
      <div className="md:max-w-3xl lg:max-w-4xl mx-auto">
        <Toolbar initialData={document} />
        <Editor
          key={document._id}
          editable
          onChange={onChange}
          initialContent={document.content}
        />
      </div>
    </div>
  );
};

export default DocumentIdPage;
