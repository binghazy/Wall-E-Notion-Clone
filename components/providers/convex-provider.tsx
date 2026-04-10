"use client";

import { ReactNode, useMemo } from "react";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";

const useGuestAuth = () => {
  return useMemo(
    () => ({
      isLoading: false,
      isAuthenticated: false,
      fetchAccessToken: async (_args: { forceRefreshToken: boolean }) => null,
    }),
    [],
  );
};

export const ConvexClientProvider = ({ children }: { children: ReactNode }) => {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  const convex = useMemo(() => {
    if (!convexUrl) {
      return null;
    }

    return new ConvexReactClient(convexUrl);
  }, [convexUrl]);

  if (!convex) {
    return <>{children}</>;
  }

  return (
    <ConvexProviderWithAuth useAuth={useGuestAuth} client={convex}>
      {children}
    </ConvexProviderWithAuth>
  );
};
