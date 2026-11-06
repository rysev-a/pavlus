import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./edit-profile.pavlus";

export const BIO_MAX = 160;

export interface Profile {
  name: string;
  username: string;
  email: string;
  bio: string;
  role: string;
  notifyEmail: boolean;
  notifyPush: boolean;
  notifyNews: boolean;
}

export type Errors = Record<string, string>;

export interface EditProfileState {
  /** What is saved (Reset goes back to it). */
  saved: Profile;
  /** What the form shows. */
  draft: Profile;
  dirty: boolean;
  justSaved: boolean;
  errors: Errors;
  initials: string;
  hue: number;
  bioCount: number;
  bioLeft: number;
  /** The role as a label, for the line under the name. */
  roleLabel: string;
}

export const ROLES: { value: string; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Administrator" },
  { value: "editor", label: "Editor" },
  { value: "viewer", label: "Viewer" },
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME = /^[a-z0-9_.-]{3,20}$/;

/** Pure: up to two initials of a name. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/** Pure: a hue 0-359 from a name, so each person has their own colour. */
export function hueOf(name: string): number {
  let h = 0;
  for (const ch of name.trim().toLowerCase())
    h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/** Pure: does the form differ from what is saved? */
export function isDirty(saved: Profile, draft: Profile): boolean {
  return (Object.keys(saved) as (keyof Profile)[]).some(
    (k) => saved[k] !== draft[k],
  );
}

/** Pure: what is wrong with a profile, by field. */
export function validate(p: Profile): Errors {
  const errors: Errors = {};
  if (!p.name.trim()) errors.name = "Tell us your name.";
  if (!USERNAME.test(p.username))
    errors.username = "3 to 20 characters: lowercase letters, digits, . _ -";
  if (!EMAIL.test(p.email)) errors.email = "Enter a valid email address.";
  if (p.bio.length > BIO_MAX) errors.bio = `At most ${BIO_MAX} characters.`;
  return errors;
}

export const roleLabel = (role: string): string =>
  ROLES.find((r) => r.value === role)?.label ?? role;

/** Pure: everything the view derives from the draft and the saved profile. */
export function derive(
  saved: Profile,
  draft: Profile,
): Pick<
  EditProfileState,
  "dirty" | "initials" | "hue" | "bioCount" | "bioLeft" | "roleLabel"
> {
  return {
    dirty: isDirty(saved, draft),
    initials: initialsOf(draft.name),
    hue: hueOf(draft.name),
    bioCount: draft.bio.length,
    bioLeft: BIO_MAX - draft.bio.length,
    roleLabel: roleLabel(draft.role),
  };
}

const START: Profile = {
  name: "Maya Okafor",
  username: "maya.okafor",
  email: "maya@northwind.studio",
  bio: "Product designer at Northwind. I draw interfaces, break them, and then rebuild them better.",
  role: "editor",
  notifyEmail: true,
  notifyPush: false,
  notifyNews: false,
};

export const initial: EditProfileState = {
  saved: START,
  draft: START,
  justSaved: false,
  errors: {},
  ...derive(START, START),
};

const derived = (saved: Profile, draft: Profile): Effect[] =>
  Object.entries(derive(saved, draft)).map(([k, v]) => store.set(k, v));

export class EditProfile extends Component<EditProfileState> {
  view = view;

  /** `setText("name")`: text inputs, the textarea and the select. */
  setText(msg: Message, state: EditProfileState): Effect[] {
    const field = msg.payload as keyof Profile;
    let value = String(msg.event?.value ?? "");
    if (field === "bio") value = value.slice(0, BIO_MAX);
    const draft = { ...state.draft, [field]: value };
    return [
      store.set(`draft.${field}`, value),
      store.set("justSaved", false),
      ...this._clearError(state, field, draft),
      ...derived(state.saved, draft),
    ];
  }

  /** `setFlag("notifyEmail")`: the switches. */
  setFlag(msg: Message, state: EditProfileState): Effect[] {
    const field = msg.payload as keyof Profile;
    const value = Boolean(msg.event?.checked);
    const draft = { ...state.draft, [field]: value };
    return [
      store.set(`draft.${field}`, value),
      store.set("justSaved", false),
      ...derived(state.saved, draft),
    ];
  }

  save(_msg: Message, state: EditProfileState): Effect[] {
    const errors = validate(state.draft);
    if (Object.keys(errors).length > 0) return [store.set("errors", errors)];
    return [
      store.set("errors", {}),
      store.set("saved", state.draft),
      store.set("justSaved", true),
      ...derived(state.draft, state.draft),
    ];
  }

  reset(_msg: Message, state: EditProfileState): Effect[] {
    return [
      store.set("draft", state.saved),
      store.set("errors", {}),
      store.set("justSaved", false),
      ...derived(state.saved, state.saved),
    ];
  }

  dismiss(): Effect[] {
    return [store.set("justSaved", false)];
  }

  _clearError(
    state: EditProfileState,
    field: string,
    draft: Profile,
  ): Effect[] {
    if (state.errors[field] === undefined) return [];
    const errors = { ...state.errors };
    const now = validate(draft)[field];
    if (now) errors[field] = now;
    else delete errors[field];
    return [store.set("errors", errors)];
  }
}

export const page = new EditProfile();
