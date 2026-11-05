/**
 * A tiny overlay for the devtools: timeline, time travel slider, owner count.
 * `document.body.append(devtoolsPanel())` or `render(() => devtoolsPanel(), host)`.
 *
 * @module
 */
import {
  computed,
  createOwner,
  getOwner,
  root,
  runWithOwner,
  signal,
} from "../core/mod.ts";
import { each, html, show } from "../dom/mod.ts";
import type { View } from "../dom/mod.ts";
import { PANEL_OWNER, getDevtools } from "./devtools.ts";
import type { Devtools, TimelineEntry } from "./devtools.ts";

function preview(v: unknown): string {
  if (v === undefined) return "";
  try {
    const s =
      typeof v === "string"
        ? JSON.stringify(v)
        : (JSON.stringify(v) ?? String(v));
    return s.length > 60 ? s.slice(0, 57) + "..." : s;
  } catch {
    return String(v);
  }
}

const CSS = `
.mxdt{position:fixed;right:8px;bottom:8px;z-index:2147483000;width:340px;max-height:60vh;display:flex;flex-direction:column;font:12px/1.4 ui-monospace,monospace;color:#e8e8ee;background:#16161d;border:1px solid #3a3a4a;border-radius:8px;box-shadow:0 4px 24px #0006}
.mxdt header,.mxdt .tt{display:flex;gap:6px;align-items:center;padding:6px 8px}
.mxdt header strong{flex:1}
.mxdt button{font:inherit;color:inherit;background:#2a2a38;border:1px solid #444;border-radius:4px;padding:1px 6px;cursor:pointer}
.mxdt button:disabled{opacity:.4;cursor:default}
.mxdt ul{margin:0;padding:0 8px 8px;list-style:none;overflow:auto;flex:1}
.mxdt li{padding:1px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mxdt li b{color:#8ab4ff;font-weight:600}
.mxdt li.signal b{color:#9be39b}
.mxdt li.error b{color:#ff8a8a}
.mxdt input[type=range]{flex:1}
`;

/** The overlay as a view. Its own effects are excluded from the timeline. */
export function devtoolsPanel(devtools: Devtools = getDevtools()): View {
  const build = (): View => {
    const parent = getOwner();
    const owner = createOwner(parent, PANEL_OWNER);
    return runWithOwner(owner, () => {
      const open = signal(true, { name: "devtools:open" });
      const paused = signal(false, { name: "devtools:paused" });
      const recent = computed(() => devtools.entries().slice(-60).reverse());
      const ownerCount = computed(
        () => (devtools.entries(), devtools.snapshot().ownerCount),
      );
      const tt = devtools.timeTravel;
      const rowClass = (e: TimelineEntry): string =>
        e.type === "error"
          ? "error"
          : e.type.startsWith("signal")
            ? "signal"
            : "";
      return html`<div class="mxdt" data-mx-devtools>
        <style></style>
        <header>
          <strong>Maximus</strong>
          <span
            >${() => devtools.entries().length} events, ${ownerCount}
            owners</span
          >
          <button @click=${() => devtools.clear()}>clear</button>
          <button
            @click=${() => {
              if (devtools.paused) devtools.resume();
              else devtools.pause();
              paused.set(devtools.paused);
            }}
          >
            ${() => (paused() ? "resume" : "pause")}
          </button>
          <button @click=${() => open.update((o) => !o)}>
            ${() => (open() ? "-" : "+")}
          </button>
        </header>
        ${show(
          open,
          () =>
            html`<div class="tt">
                <button
                  ?disabled=${() => (tt.position(), !tt.canBack())}
                  @click=${() => tt.back()}
                >
                  &#9664;
                </button>
                <input
                  type="range"
                  min="0"
                  max=${() => tt.entries().length}
                  .value=${() => String(tt.position())}
                  @input=${(e: Event) => tt.goto(Number((e.target as HTMLInputElement).value))}
                />
                <button
                  ?disabled=${() => (tt.position(), !tt.canForward())}
                  @click=${() => tt.forward()}
                >
                  &#9654;
                </button>
                <span>${() => tt.position()}/${() => tt.entries().length}</span>
              </div>
              <ul>
                ${each(
                  recent,
                  (e) => e.seq,
                  (e) =>
                    html`<li class=${() => rowClass(e())}>
                      <b>${() => e().type}</b> ${() => e().name ?? ""}
                      <code>${() => preview(e().value)}</code>
                    </li>`,
                )}
              </ul>`,
        )}
      </div>`;
    }) as View;
  };
  const view = getOwner() === null ? root(() => build()) : build();
  const style = (view as Element).querySelector("style");
  if (style !== null) style.textContent = CSS;
  return view;
}
