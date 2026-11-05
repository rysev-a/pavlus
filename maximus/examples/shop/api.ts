/**
 * A tiny in-memory "backend": fetch-like functions that take a while,
 * honour an AbortSignal and fail the way a network does.
 */
export type Category = "tea" | "coffee" | "gear" | "books";

export interface Product {
  id: number;
  name: string;
  category: Category;
  price: number;
  rating: number;
  blurb: string;
  hue: number;
}

export interface OrderInput {
  name: string;
  email: string;
  address: string;
  shipping: "standard" | "express";
  lines: { id: number; name: string; price: number; qty: number }[];
}

export interface Order extends OrderInput {
  id: number;
  total: number;
  pending?: boolean;
}

export const categories: readonly Category[] = [
  "tea",
  "coffee",
  "gear",
  "books",
];

const names: Record<Category, string[]> = {
  tea: ["Sencha", "Earl Grey", "Jasmine Pearl", "Rooibos", "Oolong", "Matcha"],
  coffee: [
    "Ethiopia Natural",
    "Colombia Washed",
    "Espresso Blend",
    "Decaf Swiss",
    "Kenya AA",
    "Sumatra",
  ],
  gear: [
    "Gooseneck Kettle",
    "Burr Grinder",
    "Pour-over Dripper",
    "Tea Strainer",
    "Scale",
    "Travel Tumbler",
  ],
  books: [
    "The Tea Book",
    "Coffee Atlas",
    "Brew Science",
    "Slow Mornings",
    "Water & Leaves",
    "Cupping Notes",
  ],
};

export const catalog: readonly Product[] = categories.flatMap((cat, ci) =>
  names[cat].map((name, i) => ({
    id: ci * 6 + i + 1,
    name,
    category: cat,
    price: 8 + ((ci * 7 + i * 5) % 9) * 4 + (cat === "gear" ? 20 : 0),
    rating: Math.min(5, 3 + ((ci + i * 2) % 5) / 2 + 0.5 * (i % 2)),
    blurb: `${name}: a ${cat} favourite, packed fresh and shipped within a day.`,
    hue: (ci * 80 + i * 17) % 360,
  })),
);

/** Simulated network latency in milliseconds (tests set it to 0). */
export const delay = { ms: 250 };

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Resolve `value` after the latency; reject with the abort reason when the signal fires first. */
function respond<T>(value: () => T, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = (): void => {
      clearTimeout(t);
      reject(signal!.reason);
    };
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      try {
        resolve(value());
      } catch (e) {
        reject(e);
      }
    }, delay.ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export interface ProductQuery {
  q?: string;
  category?: string;
  sort?: string;
  max?: number;
}

export function listProducts(
  query: ProductQuery,
  signal?: AbortSignal,
): Promise<Product[]> {
  return respond(() => {
    const q = (query.q ?? "").trim().toLowerCase();
    let out = catalog.filter(
      (p) =>
        (q === "" || p.name.toLowerCase().includes(q)) &&
        (!query.category || p.category === query.category) &&
        (!query.max || p.price <= query.max),
    );
    switch (query.sort) {
      case "price-asc":
        out = [...out].sort((a, b) => a.price - b.price || a.id - b.id);
        break;
      case "price-desc":
        out = [...out].sort((a, b) => b.price - a.price || a.id - b.id);
        break;
      case "rating":
        out = [...out].sort((a, b) => b.rating - a.rating || a.id - b.id);
        break;
    }
    return out;
  }, signal);
}

export function getProduct(id: number, signal?: AbortSignal): Promise<Product> {
  return respond(() => {
    const p = catalog.find((x) => x.id === id);
    if (!p) throw new ApiError(`No product with id ${id}`, 404);
    return p;
  }, signal);
}

/** Emails the "server" already knows. */
const registered = new Set(["taken@example.com"]);

export function emailAvailable(
  email: string,
  signal?: AbortSignal,
): Promise<boolean> {
  return respond(() => !registered.has(email.toLowerCase()), signal);
}

let orders: Order[] = [];
let nextOrder = 1000;

export function listOrders(signal?: AbortSignal): Promise<Order[]> {
  return respond(() => [...orders], signal);
}

export function orderTotal(o: Pick<OrderInput, "lines" | "shipping">): number {
  return (
    o.lines.reduce((n, l) => n + l.price * l.qty, 0) +
    (o.shipping === "express" ? 9 : 4)
  );
}

/** Fails for `fail@example.com` (the demo's "payment declined"). */
export function placeOrder(
  input: OrderInput,
  signal?: AbortSignal,
): Promise<Order> {
  return respond(() => {
    if (input.email.toLowerCase() === "fail@example.com")
      throw new ApiError("Payment declined", 402);
    const order: Order = {
      ...input,
      id: nextOrder++,
      total: orderTotal(input),
    };
    orders = [order, ...orders];
    return order;
  }, signal);
}
