// A small mailbox for the demo pages of the mail blocks.
import type { Contact, Mail } from "./mail.ts";

export const ME = "maya.chen@halcyon.example";

export const DEMO_CONTACTS: Contact[] = [
  { name: "Maya Chen", email: ME },
  { name: "Daniel Okafor", email: "daniel.okafor@halcyon.example" },
  { name: "Priya Raman", email: "priya@brightpath.example" },
  { name: "Tomás Herrera", email: "tomas.herrera@halcyon.example" },
  { name: "Wei Lin", email: "wei.lin@northfield.example" },
  { name: "Orbit Billing", email: "billing@orbit.example" },
];

/** Pure: the display name of an address (the part before the `@` as a fallback). */
export function nameOfIn(contacts: Contact[]): (email: string) => string {
  return (email) =>
    contacts.find((c) => c.email === email)?.name ??
    email.split("@")[0].replace(/[._]/g, " ");
}

const m = (
  id: string,
  thread: string,
  from: string,
  email: string,
  subject: string,
  body: string,
  day: string,
  time: string,
  extra: Partial<Mail> = {},
): Mail => ({
  id,
  thread,
  from,
  email,
  to: [ME],
  cc: [],
  subject,
  body,
  day,
  time,
  folder: "inbox",
  read: false,
  starred: false,
  labels: [],
  attachments: [],
  ...extra,
});

export const DEMO_MAILS: Mail[] = [
  m(
    "d1",
    "dt1",
    "Daniel Okafor",
    "daniel.okafor@halcyon.example",
    "Q4 launch brief: final read before Thursday",
    "Hi Maya,\n\nThe brief is attached. Could you read sections 3 and 4 before Thursday's review? The rollout dates changed.\n\nThanks,\nDaniel",
    "2026-11-03",
    "09:12",
    {
      labels: ["Work"],
      starred: true,
      attachments: [{ id: "a1", name: "Q4-launch-brief.pdf", size: 2_411_520 }],
    },
  ),
  m(
    "d7",
    "dt1",
    "Maya Chen",
    ME,
    "Re: Q4 launch brief: final read before Thursday",
    "Thanks Daniel, I will read sections 3 and 4 tonight.\n\nQuick question: is the October 28 date for the beta still correct?\n\n> The brief is attached. Could you read sections 3 and 4 before Thursday's review?",
    "2026-11-03",
    "09:30",
    {
      folder: "sent",
      read: true,
      to: ["daniel.okafor@halcyon.example"],
      labels: ["Work"],
    },
  ),
  m(
    "d8",
    "dt1",
    "Daniel Okafor",
    "daniel.okafor@halcyon.example",
    "Re: Q4 launch brief: final read before Thursday",
    "Good catch: the beta moved to November 12. I updated the brief and attached the new version.\n\n> Quick question: is the October 28 date for the beta still correct?",
    "2026-11-03",
    "10:02",
    {
      labels: ["Work"],
      attachments: [
        { id: "a2", name: "Q4-launch-brief-v2.pdf", size: 2_452_480 },
      ],
    },
  ),
  m(
    "d2",
    "dt2",
    "Priya Raman",
    "priya@brightpath.example",
    "Homepage mockups, round two",
    "Maya, the second round is in the shared folder. I simplified the hero and moved pricing up.",
    "2026-11-03",
    "08:40",
    { labels: ["Design"] },
  ),
  m(
    "d3",
    "dt3",
    "Orbit Billing",
    "billing@orbit.example",
    "Your October invoice is ready",
    "Your invoice for October is ready: $184.00. It will be charged on November 5.",
    "2026-11-02",
    "17:05",
    { read: true, labels: ["Finance"] },
  ),
  m(
    "d4",
    "dt4",
    "Wei Lin",
    "wei.lin@northfield.example",
    "Intro: Maya, meet the Northfield team",
    "Hello both, I would like to introduce Maya from Halcyon. Maya, Tomás runs partnerships here.",
    "2026-11-02",
    "11:30",
    { read: true, cc: ["tomas.herrera@halcyon.example"] },
  ),
  m(
    "d5",
    "dt5",
    "Tomás Herrera",
    "tomas.herrera@halcyon.example",
    "Lunch on Friday?",
    "Free on Friday around 12:30? The new ramen place opened on Pine.",
    "2026-10-30",
    "16:48",
    { read: true },
  ),
  m(
    "d6",
    "dt6",
    "Maya Chen",
    ME,
    "Team offsite agenda",
    "Draft agenda for the offsite:\n\n- Welcome and goals\n- Roadmap workshop\n- Dinner",
    "2026-11-01",
    "20:14",
    { folder: "drafts", read: true, to: ["daniel.okafor@halcyon.example"] },
  ),
];
