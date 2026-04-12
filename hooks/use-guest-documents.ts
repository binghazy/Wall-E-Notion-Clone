"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type GuestDocument = {
  id: string;
  title: string;
  content?: string;
  createdAt: number;
  updatedAt: number;
  source?: "local" | "telegram";
};

export type GuestDocumentDeletion = {
  id: string;
  source?: "local" | "telegram";
};

type GuestDocumentUpdates = Partial<Pick<GuestDocument, "title" | "content">>;

type GuestDocumentsStore = {
  documents: GuestDocument[];
  pendingDeletions: GuestDocumentDeletion[];
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  createDocument: (title?: string) => string;
  upsertDocuments: (documents: GuestDocument[]) => void;
  updateDocument: (id: string, updates: GuestDocumentUpdates) => void;
  removeDocument: (id: string) => void;
  clearPendingDeletions: (ids: string[]) => void;
};

const createGuestDocumentId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `guest-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

const sortDocuments = (documents: GuestDocument[]) => {
  return [...documents].sort((a, b) => b.updatedAt - a.updatedAt);
};

export const useGuestDocuments = create<GuestDocumentsStore>()(
  persist(
    (set, get) => ({
      documents: [],
      pendingDeletions: [],
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      createDocument: (title = "") => {
        const timestamp = Date.now();
        const id = createGuestDocumentId();
        const nextDocument: GuestDocument = {
          id,
          title,
          content: undefined,
          createdAt: timestamp,
          updatedAt: timestamp,
          source: "local",
        };

        set((state) => ({
          documents: sortDocuments([...state.documents, nextDocument]),
        }));

        return id;
      },
      upsertDocuments: (incomingDocuments) => {
        set((state) => {
          if (incomingDocuments.length === 0) {
            return state;
          }

          const pendingDeletionIds = new Set(
            state.pendingDeletions.map((deletion) => deletion.id),
          );
          const byId = new Map(
            state.documents.map((document) => [document.id, document]),
          );

          for (const incomingDocument of incomingDocuments) {
            if (pendingDeletionIds.has(incomingDocument.id)) {
              continue;
            }

            const existingDocument = byId.get(incomingDocument.id);

            if (!existingDocument) {
              byId.set(incomingDocument.id, incomingDocument);
              continue;
            }

            byId.set(incomingDocument.id, {
              ...existingDocument,
              ...incomingDocument,
              updatedAt: Math.max(
                existingDocument.updatedAt,
                incomingDocument.updatedAt,
              ),
            });
          }

          return {
            documents: sortDocuments(Array.from(byId.values())),
          };
        });
      },
      updateDocument: (id, updates) => {
        set((state) => ({
          documents: sortDocuments(
            state.documents.map((document) =>
              document.id === id
                ? {
                    ...document,
                    ...updates,
                    title:
                      "title" in updates
                        ? (updates.title ?? "")
                        : document.title,
                    updatedAt: Date.now(),
                  }
                : document,
            ),
          ),
        }));
      },
      removeDocument: (id) => {
        set((state) => {
          const existingDocument = state.documents.find(
            (document) => document.id === id,
          );
          const deletionSource: GuestDocumentDeletion["source"] =
            existingDocument?.source === "telegram" ? "telegram" : "local";
          const nextPendingDeletions = state.pendingDeletions.some(
            (deletion) => deletion.id === id,
          )
            ? state.pendingDeletions
            : [
                ...state.pendingDeletions,
                {
                  id,
                  source: deletionSource,
                },
              ];

          return {
            documents: state.documents.filter((document) => document.id !== id),
            pendingDeletions: nextPendingDeletions,
          };
        });
      },
      clearPendingDeletions: (ids) => {
        if (ids.length === 0) {
          return;
        }

        set((state) => {
          const idsToClear = new Set(ids);

          return {
            pendingDeletions: state.pendingDeletions.filter(
              (deletion) => !idsToClear.has(deletion.id),
            ),
          };
        });
      },
    }),
    {
      name: "Wall-E AI-guest-documents",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);

        if (state && state.documents.length === 0) {
          state.createDocument("Welcome to Guest Mode");
        }
      },
      partialize: (state) => ({
        documents: state.documents,
        pendingDeletions: state.pendingDeletions,
      }),
    },
  ),
);
