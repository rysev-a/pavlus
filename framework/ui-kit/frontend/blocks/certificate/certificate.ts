import { Component } from "@pavlus/frontend";
import view from "./certificate.pavlus";

export interface CertificateProps {
  name: string;
  course: string;
  /** `3 November 2026`: given by the app, a block has no clock. */
  date: string;
  /** Lines of fine print under the name: `120 XP`, `Level 4`... */
  facts: { label: string; value: string }[];
  serial: string;
}

/** Pure: a stable serial for a certificate from the name and the course. */
export function serialOf(name: string, course: string): string {
  let h = 0x811c9dc5;
  for (const ch of `${name.trim().toLowerCase()}|${course}`) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const hex = h.toString(16).toUpperCase().padStart(8, "0");
  return `${hex.slice(0, 4)}-${hex.slice(4)}`;
}

/** Pure: a name for the certificate: trimmed, with a fallback. */
export const displayName = (
  typed: string,
  fallback = "A curious learner",
): string => typed.trim().replace(/\s+/g, " ") || fallback;

export const props = (
  name: string,
  course: string,
  date: string,
  facts: CertificateProps["facts"],
): CertificateProps => ({
  name: displayName(name),
  course,
  date,
  facts,
  serial: serialOf(displayName(name), course),
});

export interface CertificateState {
  cert: CertificateProps;
}

export const initial: CertificateState = {
  cert: props("Alex Rivera", "Linux and Git basics", "3 November 2026", [
    { label: "XP", value: "412" },
    { label: "Level", value: "4" },
    { label: "Lessons", value: "6 of 6" },
  ]),
};

export class CertificatePage extends Component<CertificateState> {
  view = view;
}

export const page = new CertificatePage();
