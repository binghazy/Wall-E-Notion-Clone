"use client";

import { AiSidebar } from "@/components/ai-sidebar";
import { GuestShell } from "@/components/guest-shell";

const MainLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <GuestShell>
      <div className="flex h-full">
        <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
        <AiSidebar />
      </div>
    </GuestShell>
  );
};

export default MainLayout;
