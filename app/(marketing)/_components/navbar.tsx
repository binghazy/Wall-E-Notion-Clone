"use client";

import Link from "next/link";

import { useScrollTop } from "@/hooks/use-scroll-top";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Logo from "./logo";

const Navbar = () => {
  const scrolled = useScrollTop();

  return (
      <div
        className={cn(
        "fixed top-0 z-20 flex w-full items-center bg-background px-4 py-3 dark:bg-[#1F1F1F] sm:px-6",
        scrolled && "border-b shadow-sm",
      )}
      >
      <Logo />
      <div className="ml-auto flex items-center gap-x-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/documents">Continue as guest</Link>
        </Button>
        <ModeToggle />
      </div>
    </div>
  );
};

export default Navbar;
