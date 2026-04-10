import { initEdgeStore } from "@edgestore/server";
import { createEdgeStoreNextHandler } from "@edgestore/server/adapters/next/app";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const es = initEdgeStore.create();
/**
 * This is the main router for the Edge Store buckets.
 */
const edgeStoreRouter = es.router({
  publicFiles: es.fileBucket().beforeDelete(() => {
    return true;
  }),
});

const createHandler = () =>
  createEdgeStoreNextHandler({
    router: edgeStoreRouter,
  });

export async function GET(request: NextRequest) {
  return createHandler()(request);
}

export async function POST(request: NextRequest) {
  return createHandler()(request);
}
/**
 * This type is used to create the type-safe client for the frontend.
 */
export type EdgeStoreRouter = typeof edgeStoreRouter;
