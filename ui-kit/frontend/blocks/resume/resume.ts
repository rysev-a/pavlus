import { Component } from "@service-laboratory/pavlus";
import { type FullItem, withLists } from "../timeline/timeline.ts";
import view from "./resume.pavlus";

export interface Contact {
  /** The icon classes: `k-icon-mail`, `k-rs-icon-pin`... */
  icon: string;
  label: string;
  href: string;
}

export interface Skill {
  name: string;
  /** 0-100. */
  level: number;
  label: string;
}

export interface Language {
  name: string;
  level: string;
}

export interface ResumeData {
  name: string;
  title: string;
  initials: string;
  contacts: Contact[];
  summary: string;
  experience: FullItem[];
  education: FullItem[];
  skills: Skill[];
  languages: Language[];
}

/** Pure: the word for a level bar. */
export function levelLabel(level: number): string {
  if (level >= 90) return "Expert";
  if (level >= 75) return "Advanced";
  if (level >= 50) return "Intermediate";
  return "Familiar";
}

/** Pure: a skill with its level clamped to 0-100 and the word for it. */
export function skill(name: string, level: number): Skill {
  const clamped = Math.max(0, Math.min(100, Math.round(level)));
  return { name, level: clamped, label: levelLabel(clamped) };
}

/** Pure: `Ann Lee` -> `AL`. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");
}

export interface ResumeState {
  resume: ResumeData;
}

export const initial: ResumeState = {
  resume: {
    name: "Mira Okafor",
    title: "Product designer and frontend engineer",
    initials: initialsOf("Mira Okafor"),
    contacts: [
      {
        icon: "k-icon-mail",
        label: "mira@okafor.dev",
        href: "mailto:mira@okafor.dev",
      },
      { icon: "k-rs-icon-pin", label: "Lisbon, Portugal", href: "#location" },
      {
        icon: "k-rs-icon-globe",
        label: "okafor.dev",
        href: "https://okafor.dev",
      },
      {
        icon: "k-rs-icon-phone",
        label: "+351 912 345 678",
        href: "tel:+351912345678",
      },
    ],
    summary:
      "Designer who ships her own work. Eight years of building product interfaces end to end: research, prototypes, design systems and the production frontend. I like small teams, plain language and interfaces that stay out of the way.",
    experience: withLists([
      {
        key: "e3",
        period: "2022 - now",
        title: "Lead product designer",
        org: "Kestrel Health, Lisbon",
        points: [
          "Redesigned patient onboarding: completion went from 54% to 81%.",
          "Built the design system (140 components) shared by four product teams.",
        ],
      },
      {
        key: "e2",
        period: "2019 - 2022",
        title: "Product designer",
        org: "Fieldnote, remote",
        points: [
          "Designed the mobile app from the first sketch to 200k users.",
          "Ran weekly usability sessions and kept a research library for the team.",
        ],
      },
      {
        key: "e1",
        period: "2017 - 2019",
        title: "UI designer",
        org: "Studio Marlow, Porto",
        text: "Websites and identities for restaurants, galleries and small publishers.",
      },
    ]),
    education: withLists([
      {
        key: "d2",
        period: "2013 - 2016",
        title: "BA in Communication Design",
        org: "University of Porto",
      },
      {
        key: "d1",
        period: "2021",
        title: "Accessibility for web designers",
        org: "Online course, 120 hours",
      },
    ]),
    skills: [
      skill("Interface design", 95),
      skill("Design systems", 90),
      skill("TypeScript and CSS", 78),
      skill("User research", 70),
      skill("Motion", 48),
    ],
    languages: [
      { name: "Portuguese", level: "Native" },
      { name: "English", level: "Fluent" },
      { name: "Spanish", level: "Conversational" },
    ],
  },
};

/** Only data: the page has no messages of its own. */
export class ResumePage extends Component<ResumeState> {
  view = view;
}

export const page = new ResumePage();
