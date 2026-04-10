"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const Heading = () => {
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
      <Button asChild>
        <Link href="/documents">
          Continue as guest
          <ArrowRight className="h-4 w-4 ml-2" />
        </Link>
      </Button>
    </div>
  );
};

export default Heading;
