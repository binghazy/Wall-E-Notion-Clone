"use client";

import { useConvexAuth } from "convex/react";
import Link from "next/link";

import { useScrollTop } from "@/hooks/use-scroll-top";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/spinner";
import { cn } from "@/lib/utils";
import Logo from "./logo";

const Navbar = () => {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const scrolled = useScrollTop();
  // Suppress hydration warning since auth state differs between server and client
  const suppressHydrationWarning = true;
  return (
    <div
      suppressHydrationWarning={suppressHydrationWarning}
      className={cn(
        "z-50 bg-background dark:bg-[#1F1F1F] fixed top-0 flex items-center w-full p-6",
        scrolled && "border-b shadow-sm",
      )}
    >
      <Logo />
      <div
        className="md:ml-auto md:justify-end justify-between w-full
      flex items-center gap-x-2"
      >
        {isLoading && <Spinner />}
        {!isLoading &&
          (isAuthenticated ? (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/documents">Enter Wall-E AI</Link>
            </Button>
          ) : (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/documents">Continue as guest</Link>
            </Button>
          ))}
        <ModeToggle />
      </div>
    </div>
  );
};

export default Navbar;
