import { html, onCleanup, onMount, portal, show } from "../../src/mod.ts";
import type { Accessor, Child } from "../../src/mod.ts";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/** Keep Tab / Shift+Tab inside `root`. Returns the keydown handler. */
export function trapFocus(root: HTMLElement) {
  return (e: KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !root.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !root.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };
}

function ModalBody(props: { onClose: () => void; children: () => Child }) {
  const opener = document.activeElement as HTMLElement | null;
  let dialog!: HTMLElement;
  const trap = (e: KeyboardEvent) => {
    if (e.key === "Escape") props.onClose();
    else trapFocus(dialog)(e);
  };
  onMount(() => {
    // the node is attached now: move focus inside
    (dialog.querySelector<HTMLElement>(FOCUSABLE) ?? dialog).focus();
  });
  // restore focus when the modal goes away
  onCleanup(() => opener?.focus());
  return html`
    <div class="backdrop">
      <div
        class="dialog"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        ref=${(el: HTMLElement) => (dialog = el)}
        @keydown=${trap}
      >
        ${props.children()}
      </div>
    </div>
  `;
}

/** Render `children` in a modal on document.body while `open()` is true. */
export function Modal(props: {
  open: Accessor<boolean>;
  onClose: () => void;
  children: () => Child;
}) {
  return show(props.open, () =>
    portal(document.body, () =>
      ModalBody({ onClose: props.onClose, children: props.children }),
    ),
  );
}
