import { Component, type Effect, type Message } from "@pavlus/frontend";
import { patch } from "../admin-shell/shell.ts";
import {
  type Canned,
  insertCanned,
  replyError,
  type StatusOption,
  statusOptions,
} from "./reply.ts";
import view from "./reply-box.pavlus";

const CANNED: Canned[] = [
  {
    id: "greet",
    label: "Greeting",
    text: "Hello {name}, thanks for getting in touch.",
  },
  {
    id: "invest",
    label: "Looking into it",
    text: "I am looking into this now and will update you within the hour.",
  },
  {
    id: "solved",
    label: "Solved",
    text: "This is fixed on our side. Please try again and tell me if anything is still off.",
  },
];

const CHOICES: [string, string][] = [
  ["open", "Open"],
  ["pending", "Pending"],
  ["solved", "Solved"],
];

export interface ReplyBoxState {
  draft: string;
  status: string;
  internal: boolean;
  error: string;
  canned: { id: string; label: string }[];
  statuses: StatusOption[];
  message: string;
}

export const initial: ReplyBoxState = {
  draft: "",
  status: "pending",
  internal: false,
  error: "",
  canned: CANNED.map((c) => ({ id: c.id, label: c.label })),
  statuses: statusOptions(CHOICES, "pending"),
  message: "Pick a canned reply, edit it and send.",
};

export class ReplyBoxPage extends Component<ReplyBoxState> {
  view = view;

  "reply.type"(msg: Message): Effect[] {
    return patch({ draft: msg.event?.value ?? "", error: "" });
  }

  "reply.insert"(msg: Message, state: ReplyBoxState): Effect[] {
    return patch({
      draft: insertCanned(state.draft, CANNED, msg.payload as string, "Elena"),
      error: "",
    });
  }

  "reply.setstatus"(msg: Message): Effect[] {
    const status = msg.event?.value ?? "open";
    return patch({ status, statuses: statusOptions(CHOICES, status) });
  }

  "reply.note"(msg: Message): Effect[] {
    return patch({ internal: msg.event?.checked ?? false });
  }

  "reply.send"(_msg: Message, state: ReplyBoxState): Effect[] {
    const error = replyError(state.draft);
    if (error) return patch({ error });
    return patch({
      draft: "",
      error: "",
      message: `${state.internal ? "Note added" : "Reply sent"}, status ${state.status}.`,
    });
  }
}

export const page = new ReplyBoxPage();
