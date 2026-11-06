import { Component } from "@pavlus/frontend";
import view from "./msg-basics.pavlus";

/** Pure: `Maya Chen` → `MC`, `daniel@x.com` → `D`, `` → `?`. */
export function initialsOf(name: string): string {
  const words = name
    .replace(/<.*>/, "")
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  const letters =
    words.length === 1 ? words[0].slice(0, 1) : words[0][0] + words[1][0];
  return letters.toUpperCase();
}

/** Pure: a stable hue (0-359) for a name, so a person keeps one colour. */
export function hueOf(name: string): number {
  let h = 7;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/** The icons of this block: `span.k-icon.k-mi-<name>`. */
export const ICONS: string[] = [
  "inbox",
  "star",
  "star-fill",
  "send",
  "file",
  "spam",
  "trash",
  "archive",
  "tag",
  "reply",
  "reply-all",
  "forward",
  "clip",
  "smile",
  "pin",
  "bell-off",
  "users",
  "check-check",
  "clock",
  "edit",
  "mail-open",
  "filter",
  "minus",
  "maximize",
  "arrow-left",
  "user-plus",
  "log-out",
  "keyboard",
  "ban",
  "refresh",
];

export interface Person {
  name: string;
  initials: string;
  hue: number;
  online: boolean;
}

export const person = (name: string, online = false): Person => ({
  name,
  initials: initialsOf(name),
  hue: hueOf(name),
  online,
});

export interface BasicsState {
  icons: string[];
  people: Person[];
}

export const initial: BasicsState = {
  icons: ICONS,
  people: [
    person("Maya Chen", true),
    person("Daniel Okafor"),
    person("Priya Raman", true),
    person("Tomás Herrera"),
    person("Wei Lin"),
  ],
};

export class MsgBasicsPage extends Component<BasicsState> {
  view = view;
}

export const page = new MsgBasicsPage();
