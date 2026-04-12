export const TELEGRAM_NOTES_SYNC_EVENT = "walle:telegram-notes-sync";

export type TelegramSyncedNote = {
  id: string;
  title: string;
  content?: string;
  createdAt: number;
  updatedAt: number;
  source?: "local" | "telegram";
};

export type TelegramNotesSyncEventDetail = {
  notes: TelegramSyncedNote[];
};
