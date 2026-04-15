"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";

import { Doc } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getDocumentDisplayTitle,
  getEditableDocumentTitleValue,
} from "@/lib/document-title";

interface TitleProps {
  initialData: Doc<"documents">;
}

export const Title = ({ initialData }: TitleProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const update = useMutation(api.documents.update);

  const [title, setTitle] = useState(
    getEditableDocumentTitleValue(initialData.title),
  );
  const [isEditing, setIsEditing] = useState(false);

  const enableInput = () => {
    setTitle(getEditableDocumentTitleValue(initialData.title));
    setIsEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(0, inputRef.current.value.length);
    }, 0);
  };

  const disableInput = () => {
    setIsEditing(false);
  };

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(event.target.value);
    update({
      id: initialData._id,
      title: event.target.value,
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      disableInput();
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-x-1">
      {!!initialData.icon && <p className="shrink-0">{initialData.icon}</p>}
      {isEditing ? (
        <Input
          ref={inputRef}
          onBlur={disableInput}
          onChange={onChange}
          onKeyDown={onKeyDown}
          value={title}
          placeholder="New Note"
          className="h-7 max-w-[62vw] px-2 focus-visible:ring-transparent sm:max-w-xs"
        />
      ) : (
        <Button
          onClick={enableInput}
          variant="ghost"
          size="sm"
          className="h-auto max-w-[62vw] min-w-0 p-1 font-normal sm:max-w-none"
        >
          <span className="truncate">
            {getDocumentDisplayTitle(initialData?.title)}
          </span>
        </Button>
      )}
    </div>
  );
};

Title.Skeleton = function TitleSkeleton() {
  return <Skeleton className="h-9 w-20 rounded-md" />;
};
