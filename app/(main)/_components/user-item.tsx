"use client";

import { ChevronsLeftRight } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAiSettings } from "@/hooks/use-ai-settings";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const UserItem = () => {
  const userName = useAiSettings((state) => state.userName);
  const resolvedName = userName.trim() || "Guest";
  const workspaceLabel = `${resolvedName}'s Wall-E AI`;
  const emailLabel = "Local guest session";
  const avatarFallback = resolvedName.charAt(0).toUpperCase() || "G";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div
          role="button"
          className="flex items-center text-sm p-3 w-full hover:bg-primary/5"
        >
          <div className="gap-x-2 flex items-center max-w-[150px]">
            <Avatar className="h-5 w-5">
              <AvatarImage src={undefined} />
              <AvatarFallback>{avatarFallback}</AvatarFallback>
            </Avatar>
            <span className="text-start font-medium line-clamp-1">
              {workspaceLabel}
            </span>
          </div>
          <ChevronsLeftRight className="rotate-90 ml-2 text-muted-foreground h-4 w-4" />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-80"
        align="start"
        alignOffset={11}
        forceMount
      >
        <div className="flex flex-col space-y-4 p-2">
          <p className="text-xs font-medium leading-none text-muted-foreground">
            {emailLabel}
          </p>
          <div className="flex items-center gap-x-2">
            <div className="rounded-md bg-secondary p-1">
              <Avatar className="h-8 w-8">
                <AvatarImage src={undefined} />
                <AvatarFallback>{avatarFallback}</AvatarFallback>
              </Avatar>
            </div>
            <div className="space-y-1">
              <p className="text-sm line-clamp-1">{workspaceLabel}</p>
            </div>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
