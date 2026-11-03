import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  storeEffector as store,
  timeEffector as time,
} from "@service-laboratory/pavlus/plugins";
import view from "./sonner.pavlus";

type Kind = "default" | "success" | "error";

export interface Toast {
  id: number;
  kind: Kind;
  title: string;
  description: string;
  /** 0 = the newest, in front. */
  index: number;
  /** How far up the stack the toast sits, in px. */
  offset: number;
}

export interface SonnerState {
  toasts: Toast[];
  nextId: number;
}

export const initial: SonnerState = { toasts: [], nextId: 1 };

const TEXT: Record<Kind, [string, string]> = {
  default: ["Event created", "Sunday, December 03, 2023 at 9:00 AM"],
  success: ["Changes saved", "Your profile was updated."],
  error: ["Something went wrong", "The request failed, try again."],
};

const MAX = 3;
const HEIGHT = 72;

/** Pure: the toasts of the stack with their place (newest first). */
export function stack(toasts: Toast[]): Toast[] {
  return toasts
    .slice(0, MAX)
    .map((t, index) => ({ ...t, index, offset: index * HEIGHT }));
}

export class Sonner extends Component<SonnerState> {
  view = view;

  show(msg: Message, state: SonnerState): Effect[] {
    const kind = msg.payload as Kind;
    const [title, description] = TEXT[kind];
    const toast: Toast = {
      id: state.nextId,
      kind,
      title,
      description,
      index: 0,
      offset: 0,
    };
    return [
      store.set("toasts", stack([toast, ...state.toasts])),
      store.set("nextId", state.nextId + 1),
      time.setTimeout(`toast:${toast.id}`, 4000, "dismiss", toast.id),
    ];
  }

  dismiss(msg: Message, state: SonnerState): Effect[] {
    return [
      store.set(
        "toasts",
        stack(state.toasts.filter((t) => t.id !== msg.payload)),
      ),
      time.cancel(`toast:${msg.payload}`),
    ];
  }

  clear(): Effect[] {
    return [store.set("toasts", []), time.cancelAll()];
  }
}

export const page = new Sonner();
