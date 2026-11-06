// The input of a chat: pure helpers.
import { formatSize } from "../mail-list/mail.ts";
import type { ChatFile } from "../chat-list/chat.ts";

/** Files the attach menu offers in a chat. */
export const CHAT_FILES: ChatFile[] = [
  { id: "cf-photo", name: "summit-photo.jpg", size: 3_145_728 },
  { id: "cf-route", name: "route-map.pdf", size: 912_384 },
  { id: "cf-notes", name: "meeting-notes.txt", size: 6_144 },
  { id: "cf-clip", name: "voice-note.m4a", size: 1_258_291 },
];

/** Pure: a message can be sent when it has text or a file. */
export function canSend(draft: string, files: ChatFile[]): boolean {
  return draft.trim() !== "" || files.length > 0;
}

/** Pure: is this key the one that sends? (Enter.) */
export const isSendKey = (key: string | undefined): boolean => key === "Enter";

/** Pure: the text of a message to send: trimmed, inner spacing kept. */
export const cleanDraft = (draft: string): string => draft.trim();

export interface FileChip {
  id: string;
  name: string;
  sizeLabel: string;
}

export const chipsOf = (files: ChatFile[]): FileChip[] =>
  files.map((f) => ({ id: f.id, name: f.name, sizeLabel: formatSize(f.size) }));

export interface MenuItem extends FileChip {
  added: boolean;
}

/** Pure: the attach menu, marking the files already attached. */
export function attachMenu(
  files: ChatFile[],
  all: ChatFile[] = CHAT_FILES,
): MenuItem[] {
  return all.map((f) => ({
    id: f.id,
    name: f.name,
    sizeLabel: formatSize(f.size),
    added: files.some((x) => x.id === f.id),
  }));
}

/** Pure: attach a file, or detach it when it is attached already. */
export function toggleChatFile(
  files: ChatFile[],
  id: string,
  all: ChatFile[] = CHAT_FILES,
): ChatFile[] {
  if (files.some((f) => f.id === id)) return files.filter((f) => f.id !== id);
  const found = all.find((f) => f.id === id);
  return found ? [...files, found] : files;
}
