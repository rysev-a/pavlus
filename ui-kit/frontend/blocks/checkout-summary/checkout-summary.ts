import { Component } from "@service-laboratory/pavlus";
import {
  type CartLine,
  money,
  summaryOf,
  totals,
  defaultConfig,
} from "../shop-cart/shop-cart.ts";
import view from "./checkout-summary.pavlus";

export interface SummaryRow {
  id: string;
  emoji: string;
  hue: number;
  name: string;
  note: string;
  amountLabel: string;
  /** A download: a link and the file name; empty when the row has none. */
  href: string;
  file: string;
  hasDownload: boolean;
}

export interface ConfirmationState {
  title: string;
  text: string;
  orderNo: string;
  rows: SummaryRow[];
  /** The caption of the figures under the rows. */
  figures: { label: string; value: string; strong: boolean }[];
  ctaLabel: string;
}

/** `7` -> `PV-1007`: numbers come from a counter in the state, never a clock. */
export const orderNumber = (counter: number, prefix = "PV"): string =>
  `${prefix}-${1000 + counter}`;

/** `Fraunces Pro`, `commercial` -> `fraunces-pro-commercial.zip`. */
export function fileName(name: string, variant = "", ext = "zip"): string {
  const slug = `${name} ${variant}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug}.${ext}`;
}

/** A small text file as a `data:` link: a stand-in for the real download. */
export function downloadHref(name: string, license: string): string {
  const text = `${name}\nLicense: ${license}\n\nThank you for your purchase.\nThis is a demo file: the shop has no real files.\n`;
  return `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
}

export interface ConfirmationOptions {
  title: string;
  text: string;
  orderNo: string;
  ctaLabel: string;
  /** Each row gets a download link (digital goods). */
  downloads?: boolean;
  /** Printed under the name instead of the variant. */
  note?: (line: CartLine) => string;
}

/** What the confirmation shows for a cart that was paid. */
export function confirmationOf(
  lines: CartLine[],
  promo: string,
  config = defaultConfig,
  options: ConfirmationOptions,
): ConfirmationState {
  const t = totals(lines, promo, config);
  const s = summaryOf(t, config);
  const figures = [{ label: "Subtotal", value: s.subtotal, strong: false }];
  if (s.hasDiscount)
    figures.push({ label: "Promo code", value: s.discount, strong: false });
  if (s.hasShipping)
    figures.push({ label: s.shipLabel, value: s.shipping, strong: false });
  figures.push({ label: s.taxLabel, value: s.tax, strong: false });
  figures.push({ label: "Total paid", value: s.total, strong: true });
  return {
    title: options.title,
    text: options.text,
    orderNo: options.orderNo,
    ctaLabel: options.ctaLabel,
    rows: lines.map((l) => {
      const choice = l.choices.find((c) => c.id === l.choice)?.label ?? "";
      const file = options.downloads
        ? fileName(l.name, l.choice || l.variant)
        : "";
      return {
        id: l.key,
        emoji: l.emoji,
        hue: l.hue,
        name: l.name,
        note:
          options.note?.(l) ??
          ([l.variant, choice].filter(Boolean).join(" · ") || ""),
        amountLabel: `${l.qty > 1 ? `${l.qty} × ` : ""}${money(l.price)}`,
        href: options.downloads
          ? downloadHref(l.name, choice || l.variant)
          : "",
        file,
        hasDownload: Boolean(options.downloads),
      };
    }),
    figures,
  };
}

// ---- the page of the block ----

const demoLines = (): CartLine[] => [
  {
    key: "font|",
    id: "font",
    name: "Fraunces Pro",
    variant: "",
    price: 14900,
    emoji: "🔤",
    hue: 260,
    qty: 1,
    max: 1,
    choices: [
      { id: "personal", label: "Personal license", price: 4900 },
      { id: "commercial", label: "Commercial license", price: 14900 },
    ],
    choice: "commercial",
    priceLabel: "$149.00",
    totalLabel: "$149.00",
    atMax: true,
    hasChoices: true,
  },
  {
    key: "ui|",
    id: "ui",
    name: "Harbor UI Kit",
    variant: "",
    price: 6900,
    emoji: "🧩",
    hue: 200,
    qty: 1,
    max: 1,
    choices: [{ id: "personal", label: "Personal license", price: 6900 }],
    choice: "personal",
    priceLabel: "$69.00",
    totalLabel: "$69.00",
    atMax: true,
    hasChoices: false,
  },
];

export const initial: { done: ConfirmationState } = {
  done: confirmationOf(
    demoLines(),
    "",
    { ...defaultConfig, shipMode: "none" },
    {
      title: "Thank you, your files are ready",
      text: "A receipt is on its way to you. The links stay valid for 30 days.",
      orderNo: orderNumber(42),
      ctaLabel: "Keep shopping",
      downloads: true,
    },
  ),
};

/** Only data: the page has no messages of its own. */
export class CheckoutSummaryPage extends Component<typeof initial> {
  view = view;
}

export const page = new CheckoutSummaryPage();
