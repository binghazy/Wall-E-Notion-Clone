import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const bypassAuth =
  process.env.BYPASS_AUTH === "1" ||
  process.env.NEXT_PUBLIC_BYPASS_AUTH === "1";

export default bypassAuth
  ? (req: Request) => NextResponse.next()
  : clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
