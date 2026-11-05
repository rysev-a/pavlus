import { computed, createStore, effect } from "../../src/mod.ts";
import type { Product } from "./api.ts";

export interface CartLine {
  id: number;
  name: string;
  price: number;
  qty: number;
}

const KEY = "maximus-shop-cart";

function load(): CartLine[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as CartLine[]) : [];
  } catch {
    return []; // private mode, blocked storage, corrupt JSON: start empty
  }
}

/** A store persisted to localStorage; every page shares this one instance. */
export const cart = createStore<{ lines: CartLine[] }>({ lines: load() });

/** Start persisting the cart (call once, under the app's root owner). */
export function persistCart(): void {
  effect(() => {
    const json = JSON.stringify(cart.lines);
    try {
      globalThis.localStorage?.setItem(KEY, json);
    } catch {
      /* quota or blocked: the cart keeps working in memory */
    }
  });
}

export const count = computed(() => cart.lines.reduce((n, l) => n + l.qty, 0));
export const subtotal = computed(() =>
  cart.lines.reduce((n, l) => n + l.price * l.qty, 0),
);

export function addToCart(p: Product): void {
  const line = cart.lines.find((l) => l.id === p.id);
  if (line) line.qty++;
  else cart.lines.push({ id: p.id, name: p.name, price: p.price, qty: 1 });
}

export function setQty(id: number, qty: number): void {
  const i = cart.lines.findIndex((l) => l.id === id);
  if (i < 0) return;
  if (qty <= 0) cart.lines.splice(i, 1);
  else cart.lines[i]!.qty = qty;
}

export function clearCart(): void {
  cart.lines.splice(0, cart.lines.length);
}

export const money = (n: number): string => `$${n.toFixed(2)}`;
