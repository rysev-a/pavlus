/** A confirmation dialog for a destructive step, optionally asking to type a name. */

export interface ConfirmProps {
  open: boolean;
  title: string;
  text: string;
  confirmLabel: string;
  /** The confirm button is red. */
  danger: boolean;
  /** The text the person must type to confirm (empty: no field). */
  expect: string;
  typed: string;
  /** The confirm button works. */
  canConfirm: boolean;
  /** What the dialog is about (a machine id...), handed back by the host. */
  subject: string;
  /** What is going to happen: `delete`, `restore`... */
  kind: string;
}

export const closedConfirm = (): ConfirmProps => ({
  open: false,
  title: "",
  text: "",
  confirmLabel: "Confirm",
  danger: true,
  expect: "",
  typed: "",
  canConfirm: false,
  subject: "",
  kind: "",
});

/** Pure: the confirm button is on when nothing has to be typed, or the right text was. */
export const isConfirmed = (expect: string, typed: string): boolean =>
  expect === "" || typed.trim() === expect;

/** Pure: an open dialog. */
export function askConfirm(
  kind: string,
  subject: string,
  title: string,
  text: string,
  opts: { confirmLabel?: string; expect?: string; danger?: boolean } = {},
): ConfirmProps {
  const expect = opts.expect ?? "";
  return {
    open: true,
    title,
    text,
    confirmLabel: opts.confirmLabel ?? "Confirm",
    danger: opts.danger ?? true,
    expect,
    typed: "",
    canConfirm: isConfirmed(expect, ""),
    subject,
    kind,
  };
}

/** Pure: the dialog after the person typed. */
export const typeConfirm = (c: ConfirmProps, typed: string): ConfirmProps => ({
  ...c,
  typed,
  canConfirm: isConfirmed(c.expect, typed),
});
