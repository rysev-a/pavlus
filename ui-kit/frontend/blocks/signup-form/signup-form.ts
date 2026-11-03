import {
  Component,
  type Children,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import pageView from "./signup-form.pavlus";
import view from "./view.pavlus";

export type Errors = Record<string, string>;

export interface PlanOption {
  id: string;
  label: string;
}

export interface Strength {
  /** 0 (empty) to 4 (strong). */
  level: number;
  label: string;
}

export interface SignupState {
  title: string;
  intro: string;
  button: string;
  plans: PlanOption[];
  name: string;
  email: string;
  password: string;
  plan: string;
  terms: boolean;
  strength: Strength;
  errors: Errors;
  done: boolean;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Pure: how good a password is, 0 to 4, with a word for it. */
export function passwordStrength(password: string): Strength {
  if (!password) return { level: 0, label: "" };
  let level = 0;
  if (password.length >= 8) level++;
  if (password.length >= 12) level++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) level++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) level++;
  level = Math.max(1, Math.min(4, level));
  return { level, label: ["", "Weak", "Fair", "Good", "Strong"][level] };
}

/** Pure: what is wrong with a sign-up form, by field. Empty when it is fine. */
export function validateSignup(
  f: Pick<SignupState, "name" | "email" | "password" | "plan" | "terms">,
): Errors {
  const errors: Errors = {};
  if (f.name.trim().length < 2) errors.name = "Tell us your name.";
  if (!EMAIL.test(f.email.trim()))
    errors.email = "Enter a valid email address.";
  if (f.password.length < 8) errors.password = "Use at least 8 characters.";
  if (!f.plan) errors.plan = "Pick a plan to start with.";
  if (!f.terms) errors.terms = "You need to accept the terms.";
  return errors;
}

export function signupState(over: Partial<SignupState> = {}): SignupState {
  return {
    title: "Create your account",
    intro: "Free for 14 days. No card needed.",
    button: "Create account",
    plans: [
      { id: "free", label: "Free" },
      { id: "pro", label: "Pro" },
      { id: "team", label: "Team" },
    ],
    name: "",
    email: "",
    password: "",
    plan: "pro",
    terms: false,
    strength: { level: 0, label: "" },
    errors: {},
    done: false,
    ...over,
  };
}

/** The sign-up form with its own state. */
export class SignupForm extends Component<SignupState> {
  view = view;

  setField(msg: Message): Effect[] {
    const name = msg.payload as string;
    if (name === "terms")
      return [store.set("terms", Boolean(msg.event?.checked))];
    const value = msg.event?.value ?? "";
    return [
      store.set(name, value),
      ...(name === "password"
        ? [store.set("strength", passwordStrength(value))]
        : []),
    ];
  }

  submit(_msg: Message, state: SignupState): Effect[] {
    const errors = validateSignup(state);
    return [
      store.set("errors", errors),
      store.set("done", Object.keys(errors).length === 0),
    ];
  }

  /** The parent (a pricing table) can choose the plan: `send("signup", "choosePlan", id)`. */
  choosePlan(msg: Message): Effect[] {
    return [store.set("plan", msg.payload as string)];
  }
}

export const signupForm = new SignupForm();

export interface SignupPageState {
  signup: SignupState;
}

export const initial: SignupPageState = { signup: signupState() };

export class SignupFormPage extends Component<SignupPageState> {
  view = pageView;
  children: Children<SignupPageState> = {
    signup: { component: signupForm, key: "signup" },
  };
}

export const page = new SignupFormPage();
