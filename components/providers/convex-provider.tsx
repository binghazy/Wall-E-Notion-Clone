"use client";

import { ReactNode, useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";

export const ConvexClientProvider = ({ children }: { children: ReactNode }) => {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  const missingEnvVars = [
    !convexUrl && "NEXT_PUBLIC_CONVEX_URL",
  ].filter(Boolean) as string[];

  const convex = useMemo(() => {
    if (!convexUrl) {
      return null;
    }

    return new ConvexReactClient(convexUrl);
  }, [convexUrl]);

  if (missingEnvVars.length > 0 || !convex) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <div className="w-full max-w-xl rounded-lg border bg-card p-6 shadow-sm">
          <h1 className="text-lg font-semibold">Missing app configuration</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Add the missing environment variables to <code>.env.local</code> and
            restart the dev server.
          </p>
          <div className="mt-4 rounded-md bg-muted p-4 text-sm">
            <p className="font-medium">Missing variables:</p>
            <p className="mt-2">{missingEnvVars.join(", ")}</p>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            For Convex, run <code>npx convex dev</code> to populate
            <code> NEXT_PUBLIC_CONVEX_URL</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ConvexProviderWithClerk useAuth={useAuth} client={convex}>
      {children}
    </ConvexProviderWithClerk>
  );
};
