import { ConvexHttpClient } from "convex/browser";

const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{16,80}$/;

type ConvexDocumentRecord = {
  _id: string;
  _creationTime: number;
  title?: string;
  content?: string;
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

    return Response.json({
      notes: documents.map((document) => ({
        id: String(document._id),
        title: (document.title ?? "").trim(),
        content: document.content,
        createdAt: document._creationTime,
        updatedAt: document._creationTime,
        source: "telegram" as const,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return Response.json(
      { error: "Failed to fetch Telegram notes.", details: message },
      { status: 500 },
    );
  }
}
