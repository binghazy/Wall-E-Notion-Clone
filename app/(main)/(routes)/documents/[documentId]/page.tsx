"use client";

import { GuestDocumentPage } from "@/components/guest-document-page";

interface DocumentIdPageProps {
  params: {
    documentId: string;
  };
}

const DocumentIdPage = ({ params }: DocumentIdPageProps) => {
  return <GuestDocumentPage documentId={params.documentId} />;
};

export default DocumentIdPage;
