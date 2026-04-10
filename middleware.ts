import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextFetchEvent, NextRequest, NextResponse } from "next/server";

const bypassAuthFlag =
  process.env.BYPASS_AUTH === "1" ||
  process.env.NEXT_PUBLIC_BYPASS_AUTH === "1";

const hasClerkSecretKey = Boolean(process.env.CLERK_SECRET_KEY?.trim());
const shouldBypassAuth = bypassAuthFlag || !hasClerkSecretKey;

if (!hasClerkSecretKey) {
  console.warn(
    "[middleware] CLERK_SECRET_KEY is missing. Falling back to guest mode.",
  );
}

const authMiddleware = shouldBypassAuth ? null : clerkMiddleware();

export default async function middleware(
  req: NextRequest,
  event: NextFetchEvent,
) {
  if (!authMiddleware) {
    return NextResponse.next();
  }

  try {
    return await authMiddleware(req, event);
  } catch (error) {
    console.error(
      "[middleware] Clerk middleware invocation failed. Falling back to guest mode.",
      error,
    );
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
