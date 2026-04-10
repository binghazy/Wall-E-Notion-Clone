"use client";

import { SignInButton } from "@clerk/nextjs";
import { useConvexAuth } from "convex/react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/spinner";

const Heading = () => {
  const { isAuthenticated, isLoading } = useConvexAuth();

  return (
    <div className="max-x-3xl space-y-4">
      <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold">
        Your Ideas, Documents, & Plans. <br />
        Unified. Welcome to <span className="underline">Wall-E AI</span>
      </h1>
      <h3 className="text-base sm:text-xl md:text-2xl font-medium">
        Wall-E AI is the connected workspace where <br />
        better, faster work happens.
      </h3>
      {isLoading && (
        <div className="w-full flex items-center justify-center">
          <Spinner size="lg" />
        </div>
      )}
      {isAuthenticated && !isLoading && (
        <Button asChild>
          <Link href="/documents">
            Enter Wall-E AI
            <ArrowRight className="h-4 w-4 ml-2" />
          </Link>
        </Button>
      )}
      {!isAuthenticated && !isLoading && (
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button asChild>
            <Link href="/documents">
              Continue as guest
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
          <SignInButton mode="modal">
            <Button variant="ghost">Log in</Button>
          </SignInButton>
        </div>
      )}
    </div>
  );
};

export default Heading;
