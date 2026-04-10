"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type GuestDocument = {
  id: string;
  title: string;
  content?: string;
  createdAt: number;
  updatedAt: number;
};

type GuestDocumentUpdates = Partial<Pick<GuestDocument, "title" | "content">>;

type GuestDocumentsStore = {
  documents: GuestDocument[];
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  createDocument: (title?: string) => string;
  updateDocument: (id: string, updates: GuestDocumentUpdates) => void;
  removeDocument: (id: string) => void;
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
        };

        set((state) => ({
          documents: sortDocuments([...state.documents, nextDocument]),
        }));

        return id;
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
        set((state) => ({
          documents: state.documents.filter((document) => document.id !== id),
        }));
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
      }),
    },
  ),
);
