import { v } from "convex/values";

import { MutationCtx, QueryCtx, mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

const GUEST_USER_ID = "guest";
const TELEGRAM_SESSION_PREFIX = "telegram-session:";
const TELEGRAM_LINK_PREFIX = "telegram-link:";
const TELEGRAM_LINK_DOCUMENT_TITLE = "__telegram_session_link__";
const TELEGRAM_SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{16,80}$/;
const TELEGRAM_CHAT_ID_PATTERN = /^-?\d+$/;

async function getCurrentUserId(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();

  return identity?.subject ?? GUEST_USER_ID;
}

const getTelegramSessionUserId = (sessionId: string) => {
  const normalizedSessionId = sessionId.trim();

  if (!TELEGRAM_SESSION_ID_PATTERN.test(normalizedSessionId)) {
    throw new Error("Invalid Telegram session ID.");
  }

  return `${TELEGRAM_SESSION_PREFIX}${normalizedSessionId}`;
};

const getTelegramLinkUserId = (chatId: string) => {
  const normalizedChatId = chatId.trim();

  if (!TELEGRAM_CHAT_ID_PATTERN.test(normalizedChatId)) {
    throw new Error("Invalid Telegram chat ID.");
  }

  return `${TELEGRAM_LINK_PREFIX}${normalizedChatId}`;
};

const getValidatedTelegramSessionId = (sessionId: string) => {
  const normalizedSessionId = sessionId.trim();

  if (!TELEGRAM_SESSION_ID_PATTERN.test(normalizedSessionId)) {
    throw new Error("Invalid Telegram session ID.");
  }

  return normalizedSessionId;
};

export const archive = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);

    const existingDocument = await ctx.db.get(args.id);

    if (!existingDocument) {
      throw new Error("Not found");
    }

    if (existingDocument.userId !== userId) {
      throw new Error("Unauthorized");
    }

    const recursiveArchive = async (documentId: Id<"documents">) => {
      const children = await ctx.db
        .query("documents")
        .withIndex("by_user_parent", (q) =>
          q.eq("userId", userId).eq("parentDocument", documentId)
        )
        .collect();

      for (const child of children) {
        await ctx.db.patch(child._id, {
          isArchived: true,
        });

        await recursiveArchive(child._id);
      }
    };

    const document = await ctx.db.patch(args.id, {
      isArchived: true,
    });

    recursiveArchive(args.id);

    return document;
  },
});

export const getSidebar = query({
  args: {
    parentDocument: v.optional(v.id("documents")),
  },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);

    const documents = await ctx.db
      .query("documents")
      .withIndex("by_user_parent", (q) =>
        q.eq("userId", userId).eq("parentDocument", args.parentDocument)
      )
      .filter((q) => q.eq(q.field("isArchived"), false))
      .order("desc")
      .collect();

    return documents;
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    parentDocument: v.optional(v.id("documents")),
  },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);

    const document = await ctx.db.insert("documents", {
      title: args.title,
      parentDocument: args.parentDocument,
      userId,
      isArchived: false,
      isPublished: false,
    });

    return document;
  },
});

export const createFromTelegram = mutation({
  args: {
    sessionId: v.string(),
    title: v.string(),
    content: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = getTelegramSessionUserId(args.sessionId);
    const normalizedTitle = args.title.trim() || "Untitled";

    const documentId = await ctx.db.insert("documents", {
      title: normalizedTitle,
      userId,
      parentDocument: undefined,
      content: args.content,
      isArchived: false,
      isPublished: false,
    });

    return documentId;
  },
});

export const upsertTelegramSessionLink = mutation({
  args: {
    chatId: v.string(),
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const linkUserId = getTelegramLinkUserId(args.chatId);
    const sessionId = getValidatedTelegramSessionId(args.sessionId);

    const existingLink = await ctx.db
      .query("documents")
      .withIndex("by_user", (q) => q.eq("userId", linkUserId))
      .filter((q) => q.eq(q.field("title"), TELEGRAM_LINK_DOCUMENT_TITLE))
      .first();

    if (existingLink) {
      await ctx.db.patch(existingLink._id, {
        content: sessionId,
        isArchived: true,
        isPublished: false,
      });
      return sessionId;
    }

    await ctx.db.insert("documents", {
      title: TELEGRAM_LINK_DOCUMENT_TITLE,
      content: sessionId,
      userId: linkUserId,
      parentDocument: undefined,
      isArchived: true,
      isPublished: false,
    });

    return sessionId;
  },
});

export const getTelegramSessionLink = query({
  args: {
    chatId: v.string(),
  },
  handler: async (ctx, args) => {
    const linkUserId = getTelegramLinkUserId(args.chatId);
    const links = await ctx.db
      .query("documents")
      .withIndex("by_user", (q) => q.eq("userId", linkUserId))
      .filter((q) => q.eq(q.field("title"), TELEGRAM_LINK_DOCUMENT_TITLE))
      .collect();

    const mostRecentLink = links
      .sort((a, b) => b._creationTime - a._creationTime)
      .find((link) => {
        const content = link.content?.trim();
        return Boolean(content && TELEGRAM_SESSION_ID_PATTERN.test(content));
      });

    return mostRecentLink?.content?.trim() ?? null;
  },
});

export const removeTelegramSessionLink = mutation({
  args: {
    chatId: v.string(),
  },
  handler: async (ctx, args) => {
    const linkUserId = getTelegramLinkUserId(args.chatId);
    const links = await ctx.db
      .query("documents")
      .withIndex("by_user", (q) => q.eq("userId", linkUserId))
      .filter((q) => q.eq(q.field("title"), TELEGRAM_LINK_DOCUMENT_TITLE))
      .collect();

    for (const link of links) {
      await ctx.db.delete(link._id);
    }

    return true;
  },
});

export const listForTelegramSession = query({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = getTelegramSessionUserId(args.sessionId);

    return await ctx.db
      .query("documents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isArchived"), false))
      .order("desc")
      .collect();
  },
});

export const getTrash = query({
  handler: async (ctx) => {
    const userId = await getCurrentUserId(ctx);

    const documents = await ctx.db
      .query("documents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isArchived"), true))
      .order("desc")
      .collect();

    return documents;
  },
});

export const restore = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);

    const existingDocument = await ctx.db.get(args.id);

    if (!existingDocument) {
      throw new Error("Not found");
    }

    if (existingDocument.userId !== userId) {
      throw new Error("Unauthorized");
    }

    const recursiveRestore = async (documentId: Id<"documents">) => {
      const children = await ctx.db
        .query("documents")
        .withIndex("by_user_parent", (q) =>
          q.eq("userId", userId).eq("parentDocument", documentId)
        )
        .collect();

      for (const child of children) {
        await ctx.db.patch(child._id, {
          isArchived: false,
        });

        await recursiveRestore(child._id);
      }
    };

    const options: Partial<Doc<"documents">> = {
      isArchived: false,
    };

    if (existingDocument.parentDocument) {
      const parent = await ctx.db.get(existingDocument.parentDocument);
      if (parent?.isArchived) {
        options.parentDocument = undefined;
      }
    }

    const document = await ctx.db.patch(args.id, options);

    recursiveRestore(args.id);

    return document;
  },
});

export const remove = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);

    const existingDocument = await ctx.db.get(args.id);

    if (!existingDocument) {
      throw new Error("Not found");
    }

    if (existingDocument.userId !== userId) {
      throw new Error("Unauthorized");
    }

    const document = await ctx.db.delete(args.id);

    return document;
  },
});

export const getSearch = query({
  handler: async (ctx) => {
    const userId = await getCurrentUserId(ctx);

    const documents = await ctx.db
      .query("documents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isArchived"), false))
      .order("desc")
      .collect();

    return documents;
  },
});

export const getById = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);

    if (!document) {
      throw new Error("Not found");
    }

    if (document.isPublished && !document.isArchived) {
      return document;
    }

    const userId = await getCurrentUserId(ctx);

    if (document.userId !== userId) {
      throw new Error("Unauthorized");
    }

    return document;
  },
});

export const update = mutation({
  args: {
    id: v.id("documents"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    coverImage: v.optional(v.string()),
    icon: v.optional(v.string()),
    isPublished: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);

    const { id, ...rest } = args;

    const existingDocument = await ctx.db.get(args.id);

    if (!existingDocument) {
      throw new Error("Not found");
    }

    if (existingDocument.userId !== userId) {
      throw new Error("Unauthorized");
    }

    const document = await ctx.db.patch(args.id, {
      ...rest,
    });

    return document;
  },
});

export const removeIcon = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);

    const existingDocument = await ctx.db.get(args.id);

    if (!existingDocument) {
      throw new Error("Not found");
    }

    if (existingDocument.userId !== userId) {
      throw new Error("Unauthorized");
    }

    const document = await ctx.db.patch(args.id, {
      icon: undefined,
    });

    return document;
  },
});

export const removeCoverImage = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);

    const existingDocument = await ctx.db.get(args.id);

    if (!existingDocument) {
      throw new Error("Not found");
    }

    if (existingDocument.userId !== userId) {
      throw new Error("Unauthorized");
    }

    const document = await ctx.db.patch(args.id, {
      coverImage: undefined,
    });

    return document;
  },
});
