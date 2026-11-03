import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  storeEffector as store,
  timeEffector as time,
} from "@service-laboratory/pavlus/plugins";
import { addMinutes } from "../mail-list/mail.ts";
import {
  type Compose,
  composeView,
  type ComposeView,
  FILES,
  hasErrors,
  menuFiles,
  type MenuFile,
  newCompose,
  removeFile,
  setField,
  type TextField,
  toggleFile,
  validateCompose,
} from "./compose.ts";
import view from "./mail-composer.pavlus";

export interface ComposerState {
  draft: Compose;
  ui: ComposeView;
  files: MenuFile[];
  clock: number;
  note: string;
}

const start = (): Compose => ({
  ...newCompose("c1", "t-new"),
  to: "daniel.okafor@halcyon.example, wei.lin@northfield",
  subject: "Notes from the launch review",
  body: "Hi Daniel,\n\nHere are my notes from the review. The last address in the To field is missing its domain, so Send will say so.",
});

const first = start();

export const initial: ComposerState = {
  draft: first,
  ui: composeView(first),
  files: menuFiles(first),
  clock: 0,
  note: "",
};

export class MailComposerPage extends Component<ComposerState> {
  view = view;

  "comp.field"(msg: Message, s: ComposerState): Effect[] {
    const name = msg.payload as TextField;
    return [
      ...this._show(setField(s.draft, name, msg.event?.value ?? ""), s),
      time.setTimeout("comp-save", 900, "stamp"),
    ];
  }

  "comp.toggleCc"(_msg: Message, s: ComposerState): Effect[] {
    return this._show({ ...s.draft, showCc: true }, s);
  }

  "comp.attachMenu"(_msg: Message, s: ComposerState): Effect[] {
    return this._show({ ...s.draft, attachOpen: !s.draft.attachOpen }, s);
  }

  "comp.attach"(msg: Message, s: ComposerState): Effect[] {
    const file = FILES.find((f) => f.id === msg.payload);
    if (!file) return [];
    return [
      ...this._show(toggleFile(s.draft, file), s),
      time.setTimeout("comp-save", 900, "stamp"),
    ];
  }

  "comp.removeAttach"(msg: Message, s: ComposerState): Effect[] {
    return this._show(removeFile(s.draft, msg.payload as string), s);
  }

  "comp.minimize"(_msg: Message, s: ComposerState): Effect[] {
    return this._show({ ...s.draft, minimized: !s.draft.minimized }, s);
  }

  "comp.contacts"(): Effect[] {
    return [store.set("note", "The contacts popover opens here.")];
  }

  "comp.send"(_msg: Message, s: ComposerState): Effect[] {
    const errors = validateCompose(s.draft);
    if (hasErrors(errors)) {
      return this._show({ ...s.draft, errors }, s);
    }
    return [
      ...this._show(start(), s),
      store.set("note", "Sent. The window is ready for the next message."),
    ];
  }

  "comp.discard"(_msg: Message, s: ComposerState): Effect[] {
    return [
      ...this._show(newCompose("c2", "t-new"), s),
      store.set("note", "Draft discarded."),
    ];
  }

  "comp.close"(): Effect[] {
    return [store.set("note", "Draft saved and the window closed.")];
  }

  stamp(_msg: Message, s: ComposerState): Effect[] {
    return [
      ...this._show(
        {
          ...s.draft,
          saved: "saved",
          savedAt: addMinutes("09:41", s.clock),
        },
        s,
      ),
      store.set("clock", s.clock + 1),
    ];
  }

  leave(): Effect[] {
    return [time.cancel("comp-save")];
  }

  _show(draft: Compose, _s: ComposerState): Effect[] {
    return [
      store.set("draft", draft),
      store.set("ui", composeView(draft)),
      store.set("files", menuFiles(draft)),
    ];
  }
}

export const page = new MailComposerPage();
