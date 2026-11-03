import { Component } from "@service-laboratory/pavlus";
import { type EmailDraft, type EmailView, emailView } from "./mail.ts";
import view from "./email-preview.pavlus";

const base: EmailDraft = {
  from: "Lumen Coffee <hello@lumen.example>",
  subject: "{{name}}, the winter roasts are here",
  preheader: "Three small-batch roasts, shipped this week.",
  headline: "Winter roasts, small batches",
  body: "Hi {{name}},\n\nWe roasted three new coffees for the cold months: a chocolate-heavy blend, a washed Ethiopian and a dark roast that works in a moka pot.\n\nOrder before Friday and your beans leave the roastery the same week.",
  cta: "See the roasts",
  layout: "newsletter",
};

export interface EmailPreviewState {
  news: EmailView;
  promo: EmailView;
  note: EmailView;
}

export const initial: EmailPreviewState = {
  news: emailView(base, "Anna"),
  promo: emailView(
    {
      ...base,
      layout: "promo",
      subject: "20% off all winter roasts",
      headline: "20% off until Sunday",
      body: "Use code WINTER20 at checkout.\n\nFree shipping on orders over $30.",
      cta: "Shop the sale",
    },
    "Anna",
  ),
  note: emailView(
    {
      ...base,
      layout: "announcement",
      subject: "We are moving the roastery",
      headline: "We are moving, not stopping",
      body: "From 1 December we roast in a bigger space two streets away. Orders keep shipping as usual.\n\nThank you for growing with us, {{name}}.",
      cta: "Read the story",
    },
    "Anna",
  ),
};

/** Only data: the page has no messages of its own. */
export class EmailPreviewPage extends Component<EmailPreviewState> {
  view = view;
}

export const page = new EmailPreviewPage();
