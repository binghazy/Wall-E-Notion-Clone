import type { BlockNoteEditor } from "@blocknote/core";
import { create } from "zustand";

type AnyBlockNoteEditor = BlockNoteEditor<any, any, any>;

type EditorStore = {
  editor: AnyBlockNoteEditor | null;
  setEditor: (editor: AnyBlockNoteEditor | null) => void;
  clearEditor: () => void;
};

export const useEditorStore = create<EditorStore>((set) => ({
  editor: null,
  setEditor: (editor) => set({ editor }),
  clearEditor: () => set({ editor: null }),
}));
