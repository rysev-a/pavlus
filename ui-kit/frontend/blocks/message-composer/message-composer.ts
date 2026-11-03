import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { patch } from "../admin-shell/shell.ts";
import {
  composerView,
  type ComposerView,
  insertField,
  isClean,
  type MessageTemplate,
  validateMessage,
  type Values,
} from "./compose.ts";
import view from "./message-composer.pavlus";

export const TEMPLATES: MessageTemplate[] = [
  {
    id: "welcome",
    label: "Welcome",
    subject: "Welcome to the team, {first_name}!",
    body: "Hi {first_name},\n\nWe are glad you are joining us on {start_date}. {manager} will meet you at the {office} entrance at 9:30, and {buddy} is your buddy for the first weeks.\n\nSee you soon!",
  },
  {
    id: "week",
    label: "First week",
    subject: "Your first week, {first_name}",
    body: "Hi {first_name},\n\nYour first week starts on {start_date}. Monday is for accounts and equipment, then you meet the team. {buddy} will show you around the {office} office.",
  },
  {
    id: "docs",
    label: "Missing documents",
    subject: "A few documents are still missing",
    body: "Hi {first_name},\n\nBefore {start_date} we still need your signed contract and bank details. {manager} can help if anything is unclear.",
  },
];

export const VALUES: Values = {
  first_name: "Noa",
  start_date: "Monday, November 9",
  manager: "Elena Rossi",
  buddy: "Tomas Berg",
  office: "Lisbon",
};

export interface MessageComposerState {
  active: string;
  subject: string;
  body: string;
  composer: ComposerView;
}

const first = TEMPLATES[0];

export const initial: MessageComposerState = {
  active: first.id,
  subject: first.subject,
  body: first.body,
  composer: composerView(
    TEMPLATES,
    first.id,
    first.subject,
    first.body,
    VALUES,
    "Noa Levi <noa.levi@example.com>",
  ),
};

export class MessageComposerPage extends Component<MessageComposerState> {
  view = view;

  _show(
    state: MessageComposerState,
    change: Partial<Pick<MessageComposerState, "active" | "subject" | "body">>,
    sent = "",
    check = false,
  ): Effect[] {
    const next = { ...state, ...change };
    const errors = check
      ? validateMessage(next.subject, next.body, VALUES)
      : { subject: "", body: "" };
    return patch({
      ...change,
      composer: composerView(
        TEMPLATES,
        next.active,
        next.subject,
        next.body,
        VALUES,
        state.composer.to,
        errors,
        check && isClean(errors) ? "Sent to Noa" : sent,
      ),
    });
  }

  "composer.template"(msg: Message, state: MessageComposerState): Effect[] {
    const t = TEMPLATES.find((x) => x.id === msg.payload);
    return t
      ? this._show(state, { active: t.id, subject: t.subject, body: t.body })
      : [];
  }

  "composer.setsubject"(msg: Message, state: MessageComposerState): Effect[] {
    return this._show(state, { subject: msg.event?.value ?? "" });
  }

  "composer.setbody"(msg: Message, state: MessageComposerState): Effect[] {
    return this._show(state, { body: msg.event?.value ?? "" });
  }

  "composer.insert"(msg: Message, state: MessageComposerState): Effect[] {
    const field = String(msg.payload).replace(/[{}]/g, "");
    return this._show(state, { body: insertField(state.body, field) });
  }

  "composer.send"(_msg: Message, state: MessageComposerState): Effect[] {
    return this._show(state, {}, "", true);
  }
}

export const page = new MessageComposerPage();
