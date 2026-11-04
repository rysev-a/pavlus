/**
 * The "profile" module: your own profile, or another user's (`go` with
 * `params: { userId }`). Tabs: About me (the fields, and an edit form on your
 * own), Contacts (contact info, friends, requests), Photo (your avatar) and
 * Settings (account, password, sign out, delete the account; own profile only).
 *
 * View events are `profile.<name>`; the replies of the upload effect come back as
 * `profile.avatarPicked` / `profile.avatarFailed` (the shell registers every
 * handler of a module under `<key>.<name>`, so a reply id is spelled that way).
 */
import {
  filesEffector,
  isImageDataUrl,
  type PickedImages,
} from "../../../../files.ts";
import {
  byId,
  nextId,
  paged,
  when,
  type Handler,
  type Module,
  type OrbitState,
  type Update,
} from "../../core.ts";
import { glyphOf, initialsOf, pictureStyle } from "../../pictures.ts";
import { hashPassword } from "../../auth.ts";
import type { Db, User } from "../../schema.ts";
import {
  checkAccount,
  checkPassword,
  checkProfile,
  defaultAvatar,
  deletionOf,
  formOf,
  ownedCommunities,
  parseInterests,
  PRESETS,
  type PasswordForm,
  type ProfileForm,
  type AccountForm,
  friendRow,
  relationOf,
  type Relation,
} from "./rules.ts";

export type Tab = "about" | "contacts" | "photo" | "settings";
export const PAGE_SIZE = 12;
/** An uploaded avatar longer than this (as a data URL) is refused. */
export const MAX_AVATAR_CHARS = 700_000;

export interface PersonRow {
  id: number;
  name: string;
  city: string;
  style: string;
  glyph: string;
  initials: string;
  /** "Mar 3, 10:00" for a request, "" otherwise */
  since: string;
}

export interface ProfileState {
  // --- UI state (what handlers change)
  /** whose profile; 0 = the signed-in user's */
  userId: number;
  tab: Tab;
  editing: boolean;
  form: ProfileForm;
  errors: Record<string, string>;
  friendQuery: string;
  friendPage: number;
  acc: AccountForm;
  accErrors: Record<string, string>;
  pw: PasswordForm;
  pwErrors: Record<string, string>;
  confirmDelete: boolean;
  deleteError: string;
  // --- view props (derived)
  found: boolean;
  own: boolean;
  relation: Relation;
  tabs: { id: Tab; label: string; active: boolean }[];
  head: {
    id: number;
    name: string;
    role: string;
    roleTone: string;
    city: string;
    lastSeen: string;
    friends: number;
    style: string;
    glyph: string;
    initials: string;
  };
  about: {
    name: string;
    city: string;
    birthday: string;
    text: string;
    website: string;
    interests: string[];
    hasInterests: boolean;
  };
  contact: { email: string; phone: string; website: string; visible: boolean };
  friends: PersonRow[];
  friendTotal: number;
  friendPages: number;
  friendPageNo: number;
  hasPrev: boolean;
  hasNext: boolean;
  incoming: PersonRow[];
  outgoing: PersonRow[];
  avatarStyle: string;
  avatarGlyph: string;
  avatarInitials: string;
  hasUpload: boolean;
  presets: { i: number; style: string; glyph: string; active: boolean }[];
  deleteBlockedBy: string;
}

const EMPTY_FORM: ProfileForm = {
  name: "",
  city: "",
  birthday: "",
  about: "",
  interests: "",
  website: "",
  phone: "",
};

/** The letters on an avatar: none when it has an emoji or is an uploaded photo. */
const markOf = (u: User): string =>
  glyphOf(u.avatar) || u.avatar.startsWith("data:") ? "" : initialsOf(u.name);

const personRow = (u: User, since = ""): PersonRow => ({
  id: u.id,
  name: u.name,
  city: u.city,
  style: pictureStyle(u.avatar),
  glyph: glyphOf(u.avatar),
  initials: markOf(u),
  since,
});

const ROLE: Record<User["role"], string> = {
  admin: "Administrator",
  moderator: "Moderator",
  user: "Member",
};
const TONE: Record<User["role"], string> = {
  admin: "destructive",
  moderator: "info",
  user: "secondary",
};

function friendsOf(db: Db, uid: number): User[] {
  const users = byId(db.users);
  const out: User[] = [];
  for (const f of db.friends) {
    if (f.status !== "accepted") continue;
    const other =
      f.userId === uid ? f.friendId : f.friendId === uid ? f.userId : 0;
    const u = other ? users.get(other) : undefined;
    if (u) out.push(u);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

const NOT_FOUND = {
  id: 0,
  name: "",
  role: "",
  roleTone: "secondary",
  city: "",
  lastSeen: "",
  friends: 0,
  style: "",
  glyph: "",
  initials: "",
};

export const profileModule: Module<ProfileState> = {
  key: "profile",
  screens: ["profile"],

  initial: () => ({
    userId: 0,
    tab: "about",
    editing: false,
    form: EMPTY_FORM,
    errors: {},
    friendQuery: "",
    friendPage: 1,
    acc: { name: "", email: "" },
    accErrors: {},
    pw: { current: "", next: "", confirm: "" },
    pwErrors: {},
    confirmDelete: false,
    deleteError: "",
    found: false,
    own: false,
    relation: "none",
    tabs: [],
    head: NOT_FOUND,
    about: {
      name: "",
      city: "",
      birthday: "",
      text: "",
      website: "",
      interests: [],
      hasInterests: false,
    },
    contact: { email: "", phone: "", website: "", visible: false },
    friends: [],
    friendTotal: 0,
    friendPages: 1,
    friendPageNo: 1,
    hasPrev: false,
    hasNext: false,
    incoming: [],
    outgoing: [],
    avatarStyle: "",
    avatarGlyph: "",
    avatarInitials: "",
    hasUpload: false,
    presets: [],
    deleteBlockedBy: "",
  }),

  derive(state) {
    const s = state.profile;
    const db = state.db;
    const users = byId(db.users);
    const uid = s.userId > 0 ? s.userId : state.me;
    const user = users.get(uid);
    const own = uid === state.me && state.me > 0;
    if (!user)
      return {
        ...s,
        found: false,
        own: false,
        relation: "none",
        tabs: [],
        head: NOT_FOUND,
      };
    const relation = relationOf(db, state.me, uid);
    const tab: Tab =
      (s.tab === "photo" || s.tab === "settings") && !own ? "about" : s.tab;
    const labels: [Tab, string][] = [
      ["about", "About me"],
      ["contacts", "Contacts"],
    ];
    if (own) labels.push(["photo", "Photo"], ["settings", "Settings"]);
    const tabs = labels.map(([id, label]) => ({
      id,
      label,
      active: id === tab,
    }));

    const all = friendsOf(db, uid);
    const q = s.friendQuery.trim().toLowerCase();
    const list = q
      ? all.filter(
          (u) =>
            u.name.toLowerCase().includes(q) ||
            u.city.toLowerCase().includes(q),
        )
      : all;
    const pg = paged(list, s.friendPage, PAGE_SIZE);

    const me = users.get(state.me);
    const visible = own || relation === "friends" || me?.role === "admin";
    const incoming: PersonRow[] = [];
    const outgoing: PersonRow[] = [];
    if (own) {
      for (const f of db.friends) {
        if (f.status !== "pending") continue;
        if (f.friendId === uid) {
          const u = users.get(f.userId);
          if (u) incoming.push(personRow(u, when(f.since, state.now)));
        } else if (f.userId === uid) {
          const u = users.get(f.friendId);
          if (u) outgoing.push(personRow(u, when(f.since, state.now)));
        }
      }
    }
    const glyph = glyphOf(user.avatar);
    const blocking = own ? ownedCommunities(db, uid) : [];
    return {
      ...s,
      tab,
      found: true,
      own,
      relation,
      tabs,
      head: {
        id: user.id,
        name: user.name,
        role: ROLE[user.role],
        roleTone: TONE[user.role],
        city: user.city,
        lastSeen: when(user.lastSeen, state.now),
        friends: all.length,
        style: pictureStyle(user.avatar),
        glyph,
        initials: markOf(user),
      },
      about: {
        name: user.name,
        city: user.city,
        birthday: user.birthday,
        text: user.about,
        website: user.website,
        interests: user.interests,
        hasInterests: user.interests.length > 0,
      },
      contact: {
        email: visible ? user.email : "",
        phone: visible ? user.phone : "",
        website: user.website,
        visible,
      },
      friends: pg.items.map((u) => personRow(u)),
      friendTotal: list.length,
      friendPages: pg.pages,
      friendPageNo: pg.page,
      hasPrev: pg.page > 1,
      hasNext: pg.page < pg.pages,
      incoming,
      outgoing,
      avatarStyle: pictureStyle(user.avatar),
      avatarGlyph: glyph,
      avatarInitials: markOf(user),
      hasUpload: user.avatar.startsWith("data:"),
      presets: PRESETS.map((p) => ({
        i: p.i,
        style: pictureStyle(p.src),
        glyph: glyphOf(p.src),
        active: p.src === user.avatar,
      })),
      deleteBlockedBy: blocking.map((c) => c.name).join(", "),
    };
  },

  enter(params, state) {
    const id = Number(params?.userId);
    const target = Number.isFinite(id) && id > 0 && id !== state.me ? id : 0;
    return {
      slice: {
        userId: target,
        tab: params?.tab === "contacts" ? "contacts" : "about",
        editing: false,
        errors: {},
        friendQuery: "",
        friendPage: 1,
        accErrors: {},
        pw: { current: "", next: "", confirm: "" },
        pwErrors: {},
        confirmDelete: false,
        deleteError: "",
      },
    };
  },

  handlers: {} as Record<string, Handler>,
};

// ---- handlers ----

const me = (s: OrbitState): User | undefined =>
  s.me > 0 ? s.db.users.find((u) => u.id === s.me) : undefined;
const num = (p: unknown): number => Number(p) || 0;
const text = (e: { value?: string } | undefined): string => e?.value ?? "";

const h = profileModule.handlers;

h.tab = (p, _e, s) => {
  const tab = String(p) as Tab;
  const u = me(s);
  const slice: Record<string, unknown> = {
    tab,
    editing: false,
    confirmDelete: false,
    deleteError: "",
    errors: {},
  };
  if (tab === "settings" && u)
    Object.assign(slice, {
      acc: { name: u.name, email: u.email },
      accErrors: {},
      pw: { current: "", next: "", confirm: "" },
      pwErrors: {},
    });
  return { slice };
};

// -- about me

h.editStart = (_p, _e, s) => {
  const u = me(s);
  if (!u || s.profile.userId > 0) return;
  return {
    slice: { editing: true, tab: "about", form: formOf(u), errors: {} },
  };
};
h.editCancel = () => ({ slice: { editing: false, errors: {} } });
h.formField = (p, e, s) => {
  const key = String(p) as keyof ProfileForm;
  if (!(key in EMPTY_FORM)) return;
  const errors = { ...s.profile.errors };
  delete errors[key];
  return { slice: { form: { ...s.profile.form, [key]: text(e) }, errors } };
};
h.editSave = (_p, _e, s) => {
  const u = me(s);
  if (!u || !s.profile.editing) return;
  const f = s.profile.form;
  const errors = checkProfile(f, s.now);
  if (Object.keys(errors).length > 0) return { slice: { errors } };
  const next: User = {
    ...u,
    name: f.name.trim(),
    city: f.city.trim(),
    birthday: f.birthday.trim(),
    about: f.about.trim(),
    interests: parseInterests(f.interests),
    website: f.website.trim(),
    phone: f.phone.trim(),
  };
  return {
    put: { users: [next] },
    slice: { editing: false, errors: {} },
    notice: "Profile saved",
  };
};

// -- navigation to other screens / profiles

h.open = (p) => {
  const userId = num(p);
  return userId > 0
    ? { go: { screen: "profile", params: { userId } } }
    : undefined;
};
h.message = (p) => {
  const userId = num(p);
  return userId > 0
    ? { go: { screen: "messages", params: { userId } } }
    : undefined;
};
h.photos = (p) => {
  const userId = num(p);
  return userId > 0
    ? { go: { screen: "photos", params: { userId } } }
    : undefined;
};

// -- friends

h.friendSearch = (_p, e) => ({
  slice: { friendQuery: text(e), friendPage: 1 },
});
h.friendPage = (p, _e, s) => ({
  slice: { friendPage: Math.max(1, s.profile.friendPage + (num(p) || 0)) },
});

/** Add a friend (or accept, when that person already asked me). */
h.add = (p, _e, s) => {
  const other = num(p);
  const u = me(s);
  if (!u || other === u.id || !s.db.users.some((x) => x.id === other)) return;
  const rel = relationOf(s.db, u.id, other);
  if (rel === "received") return h.accept(other, undefined, s);
  if (rel !== "none") return;
  return {
    put: {
      friends: [
        {
          id: nextId(s.db.friends),
          userId: u.id,
          friendId: other,
          status: "pending",
          since: s.now,
        },
      ],
    },
    notice: "Friend request sent",
  };
};
h.accept = (p, _e, s) => {
  const other = num(p);
  const row = friendRow(s.db, s.me, other);
  if (!row || row.status !== "pending" || row.friendId !== s.me) return;
  return {
    put: { friends: [{ ...row, status: "accepted", since: s.now }] },
    notice: "You are friends now",
  };
};
h.decline = (p, _e, s) => {
  const row = friendRow(s.db, s.me, num(p));
  if (!row || row.status !== "pending" || row.friendId !== s.me) return;
  return { remove: { friends: [row.id] }, notice: "Request declined" };
};
h.cancel = (p, _e, s) => {
  const row = friendRow(s.db, s.me, num(p));
  if (!row || row.status !== "pending" || row.userId !== s.me) return;
  return { remove: { friends: [row.id] }, notice: "Request cancelled" };
};
h.remove = (p, _e, s) => {
  const row = friendRow(s.db, s.me, num(p));
  if (!row || row.status !== "accepted") return;
  return { remove: { friends: [row.id] }, notice: "Removed from your friends" };
};

// -- photo (avatar)

h.upload = (_p, _e, s) => {
  if (!me(s)) return;
  return {
    effects: [
      filesEffector.pickImages(
        512,
        false,
        "profile.avatarPicked",
        "profile.avatarFailed",
      ),
    ],
  };
};
h.avatarPicked = (p, _e, s) => {
  const u = me(s);
  const img = (p as Partial<PickedImages> | undefined)?.images?.[0];
  if (!u || !img) return;
  if (!isImageDataUrl(img.src) || img.src.length > MAX_AVATAR_CHARS)
    return { notice: "That image is too large or not a picture" };
  return {
    put: { users: [{ ...u, avatar: img.src }] },
    notice: "Photo updated",
  };
};
h.avatarFailed = (p) => ({ notice: `Could not load the photo: ${String(p)}` });
h.preset = (p, _e, s) => {
  const u = me(s);
  const preset = PRESETS.find((x) => x.i === num(p));
  if (!u || !preset) return;
  return {
    put: { users: [{ ...u, avatar: preset.src }] },
    notice: "Avatar changed",
  };
};
h.removePhoto = (_p, _e, s) => {
  const u = me(s);
  if (!u) return;
  return {
    put: { users: [{ ...u, avatar: defaultAvatar(u) }] },
    notice: "Photo removed",
  };
};

// -- settings

h.accField = (p, e, s) => {
  const key = String(p) as keyof AccountForm;
  if (key !== "name" && key !== "email") return;
  const accErrors = { ...s.profile.accErrors };
  delete accErrors[key];
  return { slice: { acc: { ...s.profile.acc, [key]: text(e) }, accErrors } };
};
h.accSave = (_p, _e, s) => {
  const u = me(s);
  if (!u) return;
  const errors = checkAccount(s.db, u.id, s.profile.acc);
  if (Object.keys(errors).length > 0) return { slice: { accErrors: errors } };
  const acc = s.profile.acc;
  return {
    put: { users: [{ ...u, name: acc.name.trim(), email: acc.email.trim() }] },
    slice: { accErrors: {} },
    notice: "Account saved",
  };
};
h.pwField = (p, e, s) => {
  const key = String(p) as keyof PasswordForm;
  if (key !== "current" && key !== "next" && key !== "confirm") return;
  const pwErrors = { ...s.profile.pwErrors };
  delete pwErrors[key];
  return { slice: { pw: { ...s.profile.pw, [key]: text(e) }, pwErrors } };
};
h.pwSave = (_p, _e, s) => {
  const u = me(s);
  if (!u) return;
  const errors = checkPassword(u, s.profile.pw);
  if (Object.keys(errors).length > 0) return { slice: { pwErrors: errors } };
  return {
    put: { users: [{ ...u, passwordHash: hashPassword(s.profile.pw.next) }] },
    slice: { pw: { current: "", next: "", confirm: "" }, pwErrors: {} },
    notice: "Password changed",
  };
};
h.signOut = (): Update => ({ me: 0, notice: "Signed out" });
h.deleteAsk = (_p, _e, s) => {
  const u = me(s);
  if (!u) return;
  const owned = ownedCommunities(s.db, u.id);
  if (owned.length > 0) {
    return {
      slice: {
        confirmDelete: false,
        deleteError: `You are the administrator of ${owned.map((c) => c.name).join(", ")}. Hand the community over or delete it first.`,
      },
    };
  }
  if (
    u.role === "admin" &&
    s.db.users.filter((x) => x.role === "admin" && x.status === "active")
      .length < 2
  ) {
    return {
      slice: {
        confirmDelete: false,
        deleteError:
          "You are the only administrator: make someone else an administrator first.",
      },
    };
  }
  return { slice: { confirmDelete: true, deleteError: "" } };
};
h.deleteCancel = () => ({ slice: { confirmDelete: false, deleteError: "" } });
h.deleteConfirm = (_p, _e, s) => {
  const u = me(s);
  if (!u || !s.profile.confirmDelete) return;
  const blocked = h.deleteAsk(undefined, undefined, {
    ...s,
    profile: { ...s.profile, confirmDelete: false },
  });
  if (blocked && (blocked as Update).slice?.deleteError) return blocked;
  const { remove, put } = deletionOf(s.db, u.id);
  return {
    remove,
    put,
    me: 0,
    slice: { confirmDelete: false, deleteError: "", userId: 0 },
    notice: "Your account was deleted",
  };
};
