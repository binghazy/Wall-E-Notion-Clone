"use client";

import { useConvexAuth } from "convex/react";

import { Spinner } from "@/components/spinner";
import { SearchCommand } from "@/components/search-command";
import { AiSidebar } from "@/components/ai-sidebar";
import { GuestShell } from "@/components/guest-shell";

import { Navigation } from "./_components/navigation";

const MainLayout = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useConvexAuth();

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <GuestShell>
        <div className="flex h-full">
          <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
          <AiSidebar />
        </div>
      </GuestShell>
    );
  }

  return (
    <div className="flex h-full bg-background dark:bg-[#1F1F1F]">
      <Navigation />
      <main className="flex-1 h-full overflow-hidden bg-background">
        <SearchCommand />
        <div className="flex h-full">
          <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
          <AiSidebar />
        </div>
      </main>
    </div>
  );
};

export default MainLayout;
