import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import view from "./auth.pavlus";

export type Errors = Record<string, string>;

export interface SigninForm {
  email: string;
  password: string;
  remember: boolean;
  errors: Errors;
  done: boolean;
}

export interface RegisterForm {
  name: string;
  email: string;
  password: string;
  confirm: string;
  terms: boolean;
  errors: Errors;
  done: boolean;
}

export interface AuthState {
  signin: SigninForm;
  register: RegisterForm;
}

export const initial: AuthState = {
  signin: { email: "", password: "", remember: true, errors: {}, done: false },
  register: {
    name: "",
    email: "",
    password: "",
    confirm: "",
    terms: false,
    errors: {},
    done: false,
  },
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Pure: what is wrong with a sign-in form, by field. */
export function validateSignin(
  f: Pick<SigninForm, "email" | "password">,
): Errors {
  const errors: Errors = {};
  if (!EMAIL.test(f.email)) errors.email = "Enter a valid email address.";
  if (!f.password) errors.password = "Enter your password.";
  return errors;
}

/** Pure: what is wrong with a registration form, by field. */
export function validateRegister(
  f: Pick<RegisterForm, "name" | "email" | "password" | "confirm" | "terms">,
): Errors {
  const errors: Errors = {};
  if (!f.name.trim()) errors.name = "Tell us your name.";
  if (!EMAIL.test(f.email)) errors.email = "Enter a valid email address.";
  if (f.password.length < 8) errors.password = "Use at least 8 characters.";
  if (f.confirm !== f.password) errors.confirm = "The passwords do not match.";
  if (!f.terms) errors.terms = "You need to accept the terms.";
  return errors;
}

export class Auth extends Component<AuthState> {
  view = view;

  /** `setField("signin", "email")`: the template names the form and the field. */
  setField(msg: Message): Effect[] {
    const [form, name] = msg.payload as [string, string];
    const checkbox = name === "remember" || name === "terms";
    const value = checkbox
      ? Boolean(msg.event?.checked)
      : (msg.event?.value ?? "");
    return [
      store.set(`${form}.${name}`, value),
      store.set(`${form}.done`, false),
    ];
  }

  submitSignin(_msg: Message, state: AuthState): Effect[] {
    const errors = validateSignin(state.signin);
    return [
      store.set("signin.errors", errors),
      store.set("signin.done", Object.keys(errors).length === 0),
    ];
  }

  submitRegister(_msg: Message, state: AuthState): Effect[] {
    const errors = validateRegister(state.register);
    return [
      store.set("register.errors", errors),
      store.set("register.done", Object.keys(errors).length === 0),
    ];
  }
}

export const page = new Auth();
