import {
  Component,
  type Children,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import pageView from "./contact-form.pavlus";
import view from "./view.pavlus";

export type Errors = Record<string, string>;

export interface ContactState {
  title: string;
  intro: string;
  topics: string[];
  budgets: string[];
  name: string;
  email: string;
  topic: string;
  budget: string;
  message: string;
  consent: boolean;
  errors: Errors;
  sent: boolean;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Pure: what is wrong with a contact form, by field. Empty when it is fine. */
export function validateContact(
  f: Pick<ContactState, "name" | "email" | "topic" | "message" | "consent">,
): Errors {
  const errors: Errors = {};
  if (f.name.trim().length < 2) errors.name = "Tell us your name.";
  if (!EMAIL.test(f.email.trim()))
    errors.email = "Enter a valid email address.";
  if (!f.topic) errors.topic = "Pick what this is about.";
  const words = f.message.trim().split(/\s+/).filter(Boolean).length;
  if (words < 5) errors.message = "Write at least a few words (5 or more).";
  if (!f.consent) errors.consent = "We need your OK to reply to you.";
  return errors;
}

export function contactState(over: Partial<ContactState> = {}): ContactState {
  return {
    title: "Tell us about your project",
    intro: "We reply within one business day.",
    topics: ["New project", "Support", "Partnership", "Something else"],
    budgets: ["Not sure yet", "Under $10k", "$10k - $50k", "$50k +"],
    name: "",
    email: "",
    topic: "New project",
    budget: "Not sure yet",
    message: "",
    consent: false,
    errors: {},
    sent: false,
    ...over,
  };
}

const CHECKBOXES = new Set(["consent"]);

/** The contact form with its own state: fields, errors and the sent flag. */
export class ContactForm extends Component<ContactState> {
  view = view;

  /** `setField("email")`: the template names the field, the event has the value. */
  setField(msg: Message): Effect[] {
    const name = msg.payload as string;
    const value = CHECKBOXES.has(name)
      ? Boolean(msg.event?.checked)
      : (msg.event?.value ?? "");
    return [store.set(name, value)];
  }

  submit(_msg: Message, state: ContactState): Effect[] {
    const errors = validateContact(state);
    return [
      store.set("errors", errors),
      store.set("sent", Object.keys(errors).length === 0),
    ];
  }

  /** "Send another": a fresh form, but the person stays known. */
  again(_msg: Message, state: ContactState): Effect[] {
    return [
      store.set("sent", false),
      store.set("message", ""),
      store.set("consent", false),
      store.set("errors", {}),
      store.set("topic", state.topics[0] ?? ""),
    ];
  }
}

export const contactForm = new ContactForm();

export interface ContactPageState {
  contact: ContactState;
}

export const initial: ContactPageState = { contact: contactState() };

export class ContactFormPage extends Component<ContactPageState> {
  view = pageView;
  children: Children<ContactPageState> = {
    contact: { component: contactForm, key: "contact" },
  };
}

export const page = new ContactFormPage();
