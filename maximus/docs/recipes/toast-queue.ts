import { each, html, onCleanup, signal } from "../../src/mod.ts";

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "error";
}

/** A toast queue: at most `max` visible, each auto-dismissed after `ttl` ms. */
export function createToaster(options: { max?: number; ttl?: number } = {}) {
  const max = options.max ?? 3;
  const ttl = options.ttl ?? 4000;
  const toasts = signal<Toast[]>([]);
  const queue: Toast[] = [];
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  let nextId = 1;

  function show() {
    while (toasts.peek().length < max && queue.length > 0) {
      const t = queue.shift()!;
      toasts.update((all) => [...all, t]);
      timers.set(
        t.id,
        setTimeout(() => dismiss(t.id), ttl),
      );
    }
  }
  function dismiss(id: number) {
    clearTimeout(timers.get(id));
    timers.delete(id);
    toasts.update((all) => all.filter((t) => t.id !== id));
    show(); // a slot is free: promote the next queued toast
  }
  function push(text: string, kind: Toast["kind"] = "info") {
    const id = nextId++;
    queue.push({ id, text, kind });
    show();
    return id;
  }
  // Call inside a component or root so pending timers die with it.
  function disposeWith() {
    onCleanup(() => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      queue.length = 0;
    });
  }
  return { toasts, push, dismiss, disposeWith };
}

export function Toasts(props: { toaster: ReturnType<typeof createToaster> }) {
  props.toaster.disposeWith();
  return html`
    <div class="toasts" role="status" aria-live="polite">
      ${each(
        props.toaster.toasts,
        (t) => t.id,
        (t) => html`
          <div class=${() => "toast " + t().kind}>
            ${() => t().text}
            <button
              aria-label="dismiss"
              @click=${() => props.toaster.dismiss(t().id)}
            >
              x
            </button>
          </div>
        `,
      )}
    </div>
  `;
}
