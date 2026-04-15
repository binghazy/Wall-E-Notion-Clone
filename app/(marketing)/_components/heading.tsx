"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const Heading = () => {
  return (
    <div className="-mt-6 max-w-5xl space-y-4 md:-mt-6">
      <h1 className="text-2xl font-bold sm:text-5xl md:text-6xl">
        Your Ideas, Documents, & Plans. <br className="hidden sm:block" />
        Unified. Welcome to <span className="underline">Wall-E AI</span>
      </h1>
      <h3 className="text-base font-medium sm:text-xl md:text-2xl">
        Wall-E AI is the connected workspace where{" "}
        <br className="hidden sm:block" />
        better, faster work happens.
      </h3>
      <Button asChild className="w-full sm:w-auto">
        <Link href="/documents">
          Continue as guest
          <ArrowRight className="h-4 w-4 ml-2" />
        </Link>
      </Button>
    </div>
  );
};

export default Heading;
