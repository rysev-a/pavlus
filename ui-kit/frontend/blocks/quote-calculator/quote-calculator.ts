import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { patch } from "../admin-shell/shell.ts";
import type { Mode } from "../shipment-tracker/tracker.ts";
import {
  type ModeChoice,
  type Quote,
  type QuoteForm,
  quoteView,
} from "./quote.ts";
import view from "./quote-calculator.pavlus";

export interface QuoteState {
  calc: {
    form: QuoteForm;
    errors: Record<string, string>;
    modes: ModeChoice[];
    quote: Quote | null;
    canExpress: boolean;
  };
}

const START: QuoteForm = {
  weight: "1800",
  volume: "6",
  distance: "1100",
  mode: "road",
  declared: "12000",
  insured: false,
  express: false,
};

const build = (form: QuoteForm): QuoteState["calc"] => ({
  form,
  ...quoteView(form),
});

export const initial: QuoteState = { calc: build(START) };

export class QuotePage extends Component<QuoteState> {
  view = view;

  "calc.field"(msg: Message, state: QuoteState): Effect[] {
    const key = msg.payload as keyof QuoteForm;
    const form = { ...state.calc.form, [key]: msg.event?.value ?? "" };
    return patch({ calc: build(form) });
  }

  "calc.mode"(msg: Message, state: QuoteState): Effect[] {
    const form = { ...state.calc.form, mode: msg.payload as Mode };
    return patch({ calc: build(form) });
  }

  "calc.flag"(msg: Message, state: QuoteState): Effect[] {
    const key = msg.payload as "insured" | "express";
    const form = { ...state.calc.form, [key]: Boolean(msg.event?.checked) };
    return patch({ calc: build(form) });
  }
}

export const page = new QuotePage();
