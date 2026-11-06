export type Layout = "newsletter" | "promo" | "announcement";

export interface EmailDraft {
  from: string;
  subject: string;
  preheader: string;
  headline: string;
  /** Paragraphs separated by a blank line; `{{name}}` is the first name. */
  body: string;
  cta: string;
  layout: Layout;
}

export interface EmailView {
  from: string;
  subject: string;
  preheader: string;
  headline: string;
  paragraphs: string[];
  cta: string;
  layout: Layout;
  footer: string;
  emoji: string;
}

const EMOJI: Record<Layout, string> = {
  newsletter: "📰",
  promo: "🎁",
  announcement: "📣",
};

/** Pure: `{{name}}` replaced by a value (every occurrence). */
export function fill(text: string, name: string): string {
  return text.split("{{name}}").join(name);
}

/** Pure: the paragraphs of a body (blank lines separate them). */
export function paragraphsOf(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Pure: how many words the body has. */
export function wordCount(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

/** Pure: what is wrong with the draft before it is scheduled, by field. */
export function emailErrors(d: EmailDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!d.subject.trim()) errors.subject = "Write a subject.";
  else if (d.subject.length > 70)
    errors.subject = "Keep the subject under 70 characters.";
  if (wordCount(d.body) < 5) errors.body = "The body is too short.";
  if (!d.cta.trim()) errors.cta = "The button needs a label.";
  return errors;
}

/** Pure: the preview of a draft for one recipient. */
export function emailView(d: EmailDraft, name: string): EmailView {
  return {
    from: d.from,
    subject: fill(d.subject, name),
    preheader: fill(d.preheader, name),
    headline: fill(d.headline, name),
    paragraphs: paragraphsOf(d.body).map((p) => fill(p, name)),
    cta: d.cta,
    layout: d.layout,
    footer:
      "You get this email because you subscribed. Unsubscribe at any time.",
    emoji: EMOJI[d.layout],
  };
}
