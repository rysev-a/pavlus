// The side panel of a chat: pure.
import {
  type Chat,
  ME,
  type Person,
  stampOf,
} from "../conversation-list/chat.ts";
import { formatSize } from "../mail-list/mail.ts";
import { hueOf, initialsOf } from "../msg-basics/msg-basics.ts";

export interface MemberRow {
  id: string;
  name: string;
  initials: string;
  hue: number;
  role: string;
  online: boolean;
  you: boolean;
}

export interface PinnedRow {
  id: string;
  who: string;
  text: string;
  time: string;
}

export interface SharedFile {
  id: string;
  name: string;
  sizeLabel: string;
  who: string;
}

export interface InfoView {
  id: string;
  name: string;
  initials: string;
  hue: number;
  emoji: string;
  group: boolean;
  subtitle: string;
  about: string;
  muted: boolean;
  archived: boolean;
  canLeave: boolean;
  members: MemberRow[];
  memberCount: number;
  pinned: PinnedRow[];
  files: SharedFile[];
}

const clip = (text: string, max = 80): string =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

/** Pure: admins first, then you, then the others by name. */
export function sortMembers(rows: MemberRow[]): MemberRow[] {
  const rank = (r: MemberRow): number =>
    r.role === "Admin" ? 0 : r.you ? 1 : 2;
  return [...rows].sort(
    (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name),
  );
}

/** Pure: what the info panel shows for a chat. */
export function infoView(chat: Chat, people: Person[]): InfoView {
  const nameOf = (id: string): string =>
    id === ME ? "You" : (people.find((p) => p.id === id)?.name ?? id);
  const realName = (id: string): string =>
    people.find((p) => p.id === id)?.name ?? id;
  const online = (id: string): boolean =>
    id === ME || (people.find((p) => p.id === id)?.online ?? false);
  const members = sortMembers(
    chat.members.map((id) => ({
      id,
      name: id === ME ? `${realName(id)} (you)` : nameOf(id),
      initials: initialsOf(realName(id)),
      hue: hueOf(realName(id)),
      role: chat.admins.includes(id) ? "Admin" : "",
      online: online(id),
      you: id === ME,
    })),
  );
  const pinned = chat.messages
    .filter((m) => m.pinned)
    .sort((a, b) => stampOf(b).localeCompare(stampOf(a)))
    .map((m) => ({
      id: m.id,
      who: nameOf(m.from),
      text: clip(m.text || m.files[0]?.name || ""),
      time: m.time,
    }));
  const files = chat.messages.flatMap((m) =>
    m.files.map((f) => ({
      id: `${m.id}-${f.id}`,
      name: f.name,
      sizeLabel: formatSize(f.size),
      who: nameOf(m.from),
    })),
  );
  const other = chat.members.find((m) => m !== ME) ?? "";
  return {
    id: chat.id,
    name: chat.name,
    initials: initialsOf(chat.name),
    hue: hueOf(chat.name),
    emoji: chat.kind === "group" ? chat.emoji : "",
    group: chat.kind === "group",
    subtitle:
      chat.kind === "group"
        ? `${chat.members.length} members`
        : (people.find((p) => p.id === other)?.status ?? ""),
    about: chat.about,
    muted: chat.muted,
    archived: chat.archived,
    canLeave: chat.kind === "group",
    members,
    memberCount: members.length,
    pinned,
    files,
  };
}
