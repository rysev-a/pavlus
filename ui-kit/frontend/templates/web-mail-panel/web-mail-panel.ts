// A webmail client: folders and labels with unread counts, a searchable and
// filterable list with bulk actions, a reading pane with threads, and a compose
// window with drafts. Every block is a stateless view; the state lives here as
// a `core` object, and `derive(core)` recomputes everything the views show.
import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  domEffector as dom,
  storeEffector as store,
  timeEffector as time,
} from "@service-laboratory/pavlus/plugins";
import {
  type Compose,
  composeFromMail,
  FILES,
  composeView,
  type ComposeView,
  hasErrors,
  isBlank,
  mailFromCompose,
  menuFiles,
  type MenuFile,
  newCompose,
  removeFile,
  replyDraft,
  setField,
  type TextField,
  toggleFile,
  validateCompose,
} from "../../blocks/mail-composer/compose.ts";
import {
  type ContactRow,
  contactRows,
} from "../../blocks/contact-pop/contact-pop.ts";
import {
  type FolderItem,
  folderItems,
  type LabelItem,
  labelItems,
  type Shortcut,
  SHORTCUTS,
} from "../../blocks/mail-folders/mail-folders.ts";
import { type MailRow, rowsOf } from "../../blocks/mail-list/mail-list.ts";
import {
  type Action,
  addAddress,
  addMinutes,
  applyAction,
  type Filter,
  folderCounts,
  labelCounts,
  type Mail,
  removeMail,
  threadsOf,
  toggleIn,
  toggleStar,
  TODAY,
  upsertMail,
  type View,
} from "../../blocks/mail-list/mail.ts";
import {
  readerActions,
  type ReaderAction,
} from "../../blocks/mail-reader/mail-reader.ts";
import {
  defaultExpanded,
  type ReaderThread,
  threadView,
} from "../../blocks/mail-reader/thread.ts";
import {
  type BulkButton,
  bulkButtons,
  filterChips,
  type FilterChip,
  moveTargets,
  toolbarLabel,
} from "../../blocks/mail-toolbar/mail-toolbar.ts";
import { hueOf } from "../../blocks/msg-basics/msg-basics.ts";
import { CONTACTS, LABELS, MAILS, ME, ME_NAME } from "./web-mail-data.ts";
import view from "./web-mail-panel.pavlus";

export type Pane = "folders" | "list" | "reader";

export interface Core {
  mails: Mail[];
  view: View;
  query: string;
  filter: Filter;
  /** Thread ids ticked in the list. */
  selected: string[];
  /** The thread open in the reading pane. */
  openId: string;
  /** The messages of the open thread that are expanded. */
  expanded: string[];
  /** Small screens show one pane at a time. */
  pane: Pane;
  moveOpen: boolean;
  compose: Compose | null;
  contactsOpen: boolean;
  contactsField: "to" | "cc";
  contactsQuery: string;
  /** Minutes since 09:41, for the stamps of what the user writes. */
  clock: number;
  nextId: number;
  toast: string;
  /** The mail before the last action, for Undo. */
  undo: Mail[] | null;
}

export interface Derived {
  folders: FolderItem[];
  labels: LabelItem[];
  rows: MailRow[];
  listTitle: string;
  emptyTitle: string;
  emptyText: string;
  filters: FilterChip[];
  selectedCount: number;
  barLabel: string;
  allSelected: boolean;
  buttons: BulkButton[];
  targets: { id: string; name: string }[];
  reader: ReaderThread | null;
  actions: ReaderAction[];
  composeUi: ComposeView | null;
  composeFiles: MenuFile[];
  contactList: ContactRow[];
  contactsLabel: string;
  inboxUnread: number;
}

export const nameOf = (email: string): string =>
  CONTACTS.find((c) => c.email === email)?.name ??
  (email === ME ? ME_NAME : email.split("@")[0].replace(/[._]/g, " "));

const VIEW_NAMES: Record<string, string> = {
  inbox: "Inbox",
  starred: "Starred",
  sent: "Sent",
  drafts: "Drafts",
  archive: "Archive",
  spam: "Spam",
  trash: "Trash",
};

/** Pure: the title above the list. */
export const listTitleOf = (v: View): string =>
  v.startsWith("label:") ? `Label: ${v.slice(6)}` : (VIEW_NAMES[v] ?? v);

/** Pure: what the list says when there is nothing to show. */
export function emptyOf(
  v: View,
  query: string,
  filter: Filter,
): { title: string; text: string } {
  if (query.trim()) {
    return {
      title: `No results for "${query.trim()}"`,
      text: "Check the spelling, try other words, or clear the search.",
    };
  }
  if (filter !== "all") {
    return {
      title: "Nothing matches this filter",
      text: "Switch back to All to see every conversation.",
    };
  }
  const by: Record<string, { title: string; text: string }> = {
    inbox: {
      title: "Inbox zero",
      text: "You have read everything. Time for a coffee.",
    },
    starred: {
      title: "No starred conversations",
      text: "Star a conversation to find it here quickly.",
    },
    sent: { title: "Nothing sent yet", text: "Messages you send appear here." },
    drafts: {
      title: "No drafts",
      text: "A message you start and do not send is kept here.",
    },
    archive: {
      title: "Nothing archived",
      text: "Archive what you are done with and it will wait here.",
    },
    spam: { title: "No spam", text: "Good news: your spam folder is empty." },
    trash: {
      title: "Trash is empty",
      text: "Deleted conversations stay here until you remove them for good.",
    },
  };
  return (
    by[v] ?? {
      title: "No mail with this label",
      text: "Labelled conversations show up here.",
    }
  );
}

/** Pure: the message of the snackbar after a bulk action. */
export function bulkToast(action: Action, n: number): string {
  const what = `${n} ${n === 1 ? "conversation" : "conversations"}`;
  const by: Record<Action, string> = {
    read: `${what} marked as read`,
    unread: `${what} marked as unread`,
    star: `${what} starred`,
    unstar: `${what} unstarred`,
    archive: `${what} archived`,
    trash: `${what} moved to Trash`,
    spam: `${what} reported as spam`,
    inbox: `${what} moved to Inbox`,
    delete: `${what} deleted forever`,
  };
  return by[action];
}

/** Does the action take the conversation out of the folder it is read in? */
export const leavesView = (action: Action): boolean =>
  ["archive", "trash", "spam", "inbox", "delete"].includes(action);

/** Pure: the mail the next conversation of the list leads to (for J and K). */
export function neighbour(ids: string[], openId: string, step: 1 | -1): string {
  if (ids.length === 0) return "";
  const at = ids.indexOf(openId);
  if (at === -1) return ids[0];
  return ids[Math.min(ids.length - 1, Math.max(0, at + step))];
}

export function derive(s: Core): Derived {
  const threads = threadsOf(s.mails, s.view, s.query, s.filter);
  const ids = threads.map((t) => t.id);
  const visibleSelected = s.selected.filter((id) => ids.includes(id));
  const empty = emptyOf(s.view, s.query, s.filter);
  const reader = s.openId
    ? threadView(s.mails, s.openId, ME, s.expanded, nameOf)
    : null;
  const fieldText = s.compose
    ? s.contactsField === "cc"
      ? s.compose.cc
      : s.compose.to
    : "";
  return {
    folders: folderItems(folderCounts(s.mails), s.view),
    labels: labelItems(LABELS, labelCounts(s.mails, LABELS), s.view),
    rows: rowsOf(threads, s.selected, s.openId, ME, nameOf),
    listTitle: listTitleOf(s.view),
    emptyTitle: empty.title,
    emptyText: empty.text,
    filters: filterChips(s.filter),
    selectedCount: visibleSelected.length,
    barLabel: toolbarLabel(visibleSelected.length, threads.length),
    allSelected:
      threads.length > 0 && visibleSelected.length === threads.length,
    buttons: bulkButtons(s.view),
    targets: moveTargets(s.view),
    reader,
    actions: readerActions(s.view, reader?.starred ?? false),
    composeUi: s.compose ? composeView(s.compose) : null,
    composeFiles: s.compose ? menuFiles(s.compose) : [],
    contactList: contactRows(CONTACTS, s.contactsQuery, fieldText, ME),
    contactsLabel: s.contactsField === "cc" ? "Cc" : "To",
    inboxUnread: folderCounts(s.mails).inbox.unread,
  };
}

const core: Core = {
  mails: MAILS,
  view: "inbox",
  query: "",
  filter: "all",
  selected: [],
  openId: "t1",
  expanded: defaultExpanded(MAILS, "t1"),
  pane: "list",
  moveOpen: false,
  compose: null,
  contactsOpen: false,
  contactsField: "to",
  contactsQuery: "",
  clock: 0,
  nextId: 100,
  toast: "",
  undo: null,
};

export interface MailState extends Core, Derived {
  shortcuts: Shortcut[];
  meHue: number;
}

export const initial: MailState = {
  ...core,
  ...derive(core),
  shortcuts: SHORTCUTS,
  meHue: hueOf(ME_NAME),
};

const CORE_KEYS = Object.keys(core) as (keyof Core)[];
const coreOf = (state: MailState): Core => {
  const c: Record<string, unknown> = {};
  for (const k of CORE_KEYS) c[k] = state[k];
  return c as unknown as Core;
};

const SAVE = "wm-save";
const TOAST = "wm-toast";

export class WebMailPanel extends Component<MailState> {
  view = view;

  // ---- folders ----
  "nav.go"(msg: Message, s: MailState): Effect[] {
    return this._commit(s, {
      view: msg.payload as View,
      query: "",
      filter: "all",
      selected: [],
      openId: "",
      moveOpen: false,
      pane: "list",
    });
  }

  "nav.compose"(_msg: Message, s: MailState): Effect[] {
    return this._open(s, newCompose(`m${s.nextId}`, `t${s.nextId}`));
  }

  "nav.shortcut"(msg: Message, s: MailState): Effect[] {
    const id = msg.payload as string;
    const open = s.reader;
    const need = (): Effect[] =>
      this._commit(s, { toast: "Open a conversation first." }, [
        time.setTimeout(TOAST, 4000, "toastGone"),
      ]);
    switch (id) {
      case "compose":
        return this["nav.compose"](msg, s);
      case "search":
        return [
          ...this._commit(s, { pane: "list" }),
          time.setTimeout("wm-focus", 0, "focusSearch"),
        ];
      case "reply":
      case "replyAll":
      case "forward":
        return open ? this._reply(s, open.lastId, id) : need();
      case "archive":
      case "trash":
        return open ? this._act(s, [open.id], id) : need();
      case "next":
      case "prev": {
        const next = neighbour(
          s.rows.map((r) => r.id),
          s.openId,
          id === "next" ? 1 : -1,
        );
        return next
          ? this["list.open"]({ id: "list.open", payload: next }, s)
          : [];
      }
    }
    return [];
  }

  focusSearch(): Effect[] {
    return [dom.focus("#k-mtool-search")];
  }

  showFolders(_msg: Message, s: MailState): Effect[] {
    return this._commit(s, { pane: "folders" });
  }

  // ---- toolbar ----
  "bar.setQuery"(msg: Message, s: MailState): Effect[] {
    return this._commit(s, {
      query: msg.event?.value ?? "",
      selected: [],
    });
  }

  "bar.clear"(_msg: Message, s: MailState): Effect[] {
    return this._commit(s, { query: "", selected: [] });
  }

  "bar.filter"(msg: Message, s: MailState): Effect[] {
    return this._commit(s, { filter: msg.payload as Filter, selected: [] });
  }

  "bar.selectAll"(_msg: Message, s: MailState): Effect[] {
    return this._commit(s, {
      selected: s.allSelected ? [] : s.rows.map((r) => r.id),
    });
  }

  "bar.toggleMove"(_msg: Message, s: MailState): Effect[] {
    return this._commit(s, { moveOpen: !s.moveOpen });
  }

  "bar.bulk"(msg: Message, s: MailState): Effect[] {
    return this._act(s, this._selection(s), msg.payload as Action);
  }

  "bar.moveTo"(msg: Message, s: MailState): Effect[] {
    return this._act(s, this._selection(s), msg.payload as Action);
  }

  // ---- the list ----
  "list.open"(msg: Message, s: MailState): Effect[] {
    const id = msg.payload as string;
    if (s.view === "drafts") {
      const draft = s.mails
        .filter((m) => m.thread === id && m.folder === "drafts")
        .pop();
      if (draft) return this._open(s, composeFromMail(draft));
    }
    const expanded = defaultExpanded(s.mails, id);
    return this._commit(s, {
      openId: id,
      expanded,
      mails: applyAction(s.mails, [id], "read"),
      pane: "reader",
      moveOpen: false,
    });
  }

  "list.check"(msg: Message, s: MailState): Effect[] {
    return this._commit(s, {
      selected: toggleIn(s.selected, msg.payload as string),
    });
  }

  "list.star"(msg: Message, s: MailState): Effect[] {
    return this._commit(s, {
      mails: toggleStar(s.mails, msg.payload as string),
    });
  }

  // ---- the reading pane ----
  "read.back"(_msg: Message, s: MailState): Effect[] {
    return this._commit(s, { pane: "list", openId: "" });
  }

  "read.toggle"(msg: Message, s: MailState): Effect[] {
    return this._commit(s, {
      expanded: toggleIn(s.expanded, msg.payload as string),
    });
  }

  "read.act"(msg: Message, s: MailState): Effect[] {
    const id = msg.payload as string;
    if (!s.openId) return [];
    if (id === "star") {
      return this._commit(s, { mails: toggleStar(s.mails, s.openId) });
    }
    const action: Action = id === "restore" ? "inbox" : (id as Action);
    return this._act(s, [s.openId], action);
  }

  "read.reply"(msg: Message, s: MailState): Effect[] {
    return this._reply(s, msg.payload as string, "reply");
  }

  "read.replyAll"(msg: Message, s: MailState): Effect[] {
    return this._reply(s, msg.payload as string, "replyAll");
  }

  "read.forward"(msg: Message, s: MailState): Effect[] {
    return this._reply(s, msg.payload as string, "forward");
  }

  // ---- the compose window ----
  "comp.field"(msg: Message, s: MailState): Effect[] {
    if (!s.compose) return [];
    const next = setField(
      s.compose,
      msg.payload as TextField,
      msg.event?.value ?? "",
    );
    return [...this._composeOnly(next), time.setTimeout(SAVE, 900, "stamp")];
  }

  "comp.toggleCc"(_msg: Message, s: MailState): Effect[] {
    return s.compose ? this._composeOnly({ ...s.compose, showCc: true }) : [];
  }

  "comp.attachMenu"(_msg: Message, s: MailState): Effect[] {
    return s.compose
      ? this._composeOnly({ ...s.compose, attachOpen: !s.compose.attachOpen })
      : [];
  }

  "comp.attach"(msg: Message, s: MailState): Effect[] {
    if (!s.compose) return [];
    const file = FILES.find((f) => f.id === msg.payload);
    if (!file) return [];
    return [
      ...this._composeOnly(toggleFile(s.compose, file)),
      time.setTimeout(SAVE, 900, "stamp"),
    ];
  }

  "comp.removeAttach"(msg: Message, s: MailState): Effect[] {
    return s.compose
      ? [
          ...this._composeOnly(removeFile(s.compose, msg.payload as string)),
          time.setTimeout(SAVE, 900, "stamp"),
        ]
      : [];
  }

  "comp.minimize"(_msg: Message, s: MailState): Effect[] {
    return s.compose
      ? this._composeOnly({ ...s.compose, minimized: !s.compose.minimized })
      : [];
  }

  "comp.contacts"(msg: Message, s: MailState): Effect[] {
    return this._commit(s, {
      contactsOpen: true,
      contactsField: msg.payload as "to" | "cc",
      contactsQuery: "",
      compose: s.compose ? { ...s.compose, attachOpen: false } : null,
    });
  }

  "comp.send"(_msg: Message, s: MailState): Effect[] {
    const c = s.compose;
    if (!c) return [];
    const errors = validateCompose(c);
    if (hasErrors(errors)) return this._composeOnly({ ...c, errors });
    const sent = mailFromCompose(
      { ...c, subject: c.subject.trim() || "(no subject)" },
      { name: ME_NAME, email: ME },
      "sent",
      TODAY,
      addMinutes("09:41", s.clock),
    );
    const mails = upsertMail(removeMail(s.mails, c.id), sent);
    const reading = s.openId === c.thread;
    return [
      ...this._commit(
        s,
        {
          mails,
          compose: null,
          contactsOpen: false,
          clock: s.clock + 1,
          expanded: reading ? [...s.expanded, sent.id] : s.expanded,
          toast: `Message sent to ${c.to.split(/[,;]/)[0].trim()}`,
          undo: null,
        },
        [time.cancel(SAVE)],
      ),
      time.setTimeout(TOAST, 4000, "toastGone"),
    ];
  }

  "comp.discard"(_msg: Message, s: MailState): Effect[] {
    const c = s.compose;
    if (!c) return [];
    return [
      ...this._commit(
        s,
        {
          mails: removeMail(s.mails, c.id),
          compose: null,
          contactsOpen: false,
          toast: "Draft discarded",
          undo: null,
        },
        [time.cancel(SAVE)],
      ),
      time.setTimeout(TOAST, 4000, "toastGone"),
    ];
  }

  /** The cross: a draft with something in it is kept, an empty one is dropped. */
  "comp.close"(_msg: Message, s: MailState): Effect[] {
    const c = s.compose;
    if (!c) return [];
    const blank = isBlank(c);
    const mails = blank
      ? removeMail(s.mails, c.id)
      : upsertMail(
          s.mails,
          mailFromCompose(
            c,
            { name: ME_NAME, email: ME },
            "drafts",
            TODAY,
            addMinutes("09:41", s.clock),
          ),
        );
    return [
      ...this._commit(
        s,
        {
          mails,
          compose: null,
          contactsOpen: false,
          clock: s.clock + 1,
          toast: blank ? "" : "Draft saved",
          undo: null,
        },
        [time.cancel(SAVE)],
      ),
      ...(blank ? [] : [time.setTimeout(TOAST, 4000, "toastGone")]),
    ];
  }

  /** The autosave: after a pause in typing the draft is stored in Drafts. */
  stamp(_msg: Message, s: MailState): Effect[] {
    const c = s.compose;
    if (!c) return [];
    const at = addMinutes("09:41", s.clock);
    const saved: Compose = { ...c, saved: "saved", savedAt: at };
    const mails = isBlank(c)
      ? removeMail(s.mails, c.id)
      : upsertMail(
          s.mails,
          mailFromCompose(c, { name: ME_NAME, email: ME }, "drafts", TODAY, at),
        );
    return this._commit(s, {
      compose: saved,
      mails,
      clock: s.clock + 1,
    });
  }

  // ---- the contacts popover ----
  "pop.setQuery"(msg: Message, s: MailState): Effect[] {
    return this._commit(s, { contactsQuery: msg.event?.value ?? "" });
  }

  "pop.pick"(msg: Message, s: MailState): Effect[] {
    const c = s.compose;
    if (!c) return [];
    const email = msg.payload as string;
    const next: Compose =
      s.contactsField === "cc"
        ? { ...c, cc: addAddress(c.cc, email), saved: "saving" }
        : { ...c, to: addAddress(c.to, email), saved: "saving" };
    return [
      ...this._commit(s, { compose: next }),
      time.setTimeout(SAVE, 900, "stamp"),
    ];
  }

  "pop.close"(_msg: Message, s: MailState): Effect[] {
    return this._commit(s, { contactsOpen: false });
  }

  // ---- the snackbar ----
  undoLast(_msg: Message, s: MailState): Effect[] {
    if (!s.undo) return [];
    return this._commit(s, { mails: s.undo, undo: null, toast: "Undone" }, [
      time.setTimeout(TOAST, 2500, "toastGone"),
    ]);
  }

  dismissToast(_msg: Message, s: MailState): Effect[] {
    return this._commit(s, { toast: "", undo: null }, [time.cancel(TOAST)]);
  }

  toastGone(_msg: Message, s: MailState): Effect[] {
    return this._commit(s, { toast: "", undo: null });
  }

  leave(): Effect[] {
    return [time.cancel(SAVE), time.cancel(TOAST), time.cancel("wm-focus")];
  }

  // ---- helpers ----
  _selection(s: MailState): string[] {
    const ids = s.rows.map((r) => r.id);
    return s.selected.filter((id) => ids.includes(id));
  }

  /** An action on conversations, with a snackbar and Undo. */
  _act(s: MailState, ids: string[], action: Action): Effect[] {
    if (ids.length === 0) return [];
    const mails = applyAction(s.mails, ids, action);
    const gone = leavesView(action) && ids.includes(s.openId);
    return [
      ...this._commit(s, {
        mails,
        selected: [],
        moveOpen: false,
        toast: bulkToast(action, ids.length),
        undo: s.mails,
        ...(gone ? { openId: "", pane: "list" as Pane } : {}),
      }),
      time.setTimeout(TOAST, 6000, "toastGone"),
    ];
  }

  _reply(
    s: MailState,
    messageId: string,
    mode: "reply" | "replyAll" | "forward",
  ): Effect[] {
    const m = s.mails.find((x) => x.id === messageId);
    if (!m) return [];
    return this._open(s, replyDraft(m, mode, ME, `m${s.nextId}`));
  }

  _open(s: MailState, compose: Compose): Effect[] {
    return this._commit(s, {
      compose,
      nextId: s.nextId + 1,
      contactsOpen: false,
      toast: "",
    });
  }

  /** Only the compose window changed: no need to recompute the lists. */
  _composeOnly(compose: Compose): Effect[] {
    return [
      store.set("compose", compose),
      store.set("composeUi", composeView(compose)),
      store.set("composeFiles", menuFiles(compose)),
    ];
  }

  _commit(
    state: MailState,
    patch: Partial<Core>,
    extra: Effect[] = [],
  ): Effect[] {
    const next: Core = { ...coreOf(state), ...patch };
    const derived = derive(next);
    return [
      ...(Object.keys(patch) as (keyof Core)[]).map((k) =>
        store.set(k, patch[k]),
      ),
      ...(Object.keys(derived) as (keyof Derived)[]).map((k) =>
        store.set(k, derived[k]),
      ),
      ...extra,
    ];
  }
}

export const page = new WebMailPanel();
