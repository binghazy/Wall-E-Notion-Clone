import { ConvexHttpClient } from "convex/browser";

export const dynamic = "force-dynamic";

const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{16,80}$/;

type ConvexDocumentRecord = {
  _id: string;
  _creationTime: number;
  title?: string;
  content?: string;
  externalId?: string;
};

type TelegramSessionSyncNote = {
  id: string;
  title: string;
  content?: string;
  source?: "local" | "telegram";
};

type TelegramSessionDeletedNote = {
  id: string;
  source?: "local" | "telegram";
};

const getConvexClient = () => {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();

  if (!convexUrl) {
    throw new Error("Missing NEXT_PUBLIC_CONVEX_URL.");
  }

  return new ConvexHttpClient(convexUrl);
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId")?.trim();

  if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
    return Response.json(
      { error: "Invalid sessionId." },
      { status: 400 },
    );
  }

  try {
    const convex = getConvexClient();
    const documents = (await convex.query(
      "documents:listForTelegramSession" as any,
      { sessionId },
    )) as ConvexDocumentRecord[];

    return Response.json(
      {
        notes: documents.map((document) => ({
          id: document.externalId?.trim() || String(document._id),
          title: (document.title ?? "").trim(),
          content: document.content,
          createdAt: document._creationTime,
          updatedAt: document._creationTime,
          source: document.externalId ? ("local" as const) : ("telegram" as const),
        })),
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return Response.json(
      { error: "Failed to fetch Telegram notes.", details: message },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let payload: {
    sessionId?: string;
    notes?: TelegramSessionSyncNote[];
    deletedNotes?: TelegramSessionDeletedNote[];
  };

  try {
    payload = (await request.json()) as {
      sessionId?: string;
      notes?: TelegramSessionSyncNote[];
      deletedNotes?: TelegramSessionDeletedNote[];
    };
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const sessionId = payload.sessionId?.trim();

  if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
    return Response.json({ error: "Invalid sessionId." }, { status: 400 });
  }

  const notes = Array.isArray(payload.notes) ? payload.notes : [];
  const normalizedNotes = notes
    .map((note) => ({
      id: (note.id ?? "").trim(),
      title: (note.title ?? "").trim(),
      content: typeof note.content === "string" ? note.content : undefined,
      source: note?.source === "telegram" ? "telegram" : "local",
    }))
    .filter((note) => note.id.length > 0)
    .slice(0, 500);
  const deletedNotes = Array.isArray(payload.deletedNotes)
    ? payload.deletedNotes
    : [];
  const normalizedDeletedNotes = deletedNotes
    .map((note) => ({
      id: (note.id ?? "").trim(),
      source: note?.source === "telegram" ? "telegram" : "local",
    }))
    .filter((note) => note.id.length > 0)
    .slice(0, 500);

  try {
    const convex = getConvexClient();
    const result = (await convex.mutation(
      "documents:upsertGuestSessionNotes" as any,
      {
        sessionId,
        notes: normalizedNotes,
        deletedNotes: normalizedDeletedNotes,
      },
    )) as {
      syncedCount?: number;
      deletedCount?: number;
    };

    return Response.json({
      ok: true,
      syncedCount: result?.syncedCount ?? 0,
      deletedCount: result?.deletedCount ?? 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return Response.json(
      { error: "Failed to sync local notes.", details: message },
      { status: 500 },
    );
  }
}
