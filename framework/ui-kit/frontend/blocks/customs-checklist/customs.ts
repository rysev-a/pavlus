export type DocState = "missing" | "uploaded" | "approved";

export interface DocItem {
  id: string;
  title: string;
  note: string;
  required: boolean;
  state: DocState;
}

export interface DocRow {
  id: string;
  title: string;
  note: string;
  required: boolean;
  state: DocState;
  stateLabel: string;
  tone: "destructive" | "warning" | "success" | "muted";
  actionLabel: string;
}

export interface Progress {
  approved: number;
  total: number;
  /** Required documents not yet approved. */
  requiredLeft: number;
  pct: number;
  ready: boolean;
  text: string;
}

const NEXT: Record<DocState, DocState> = {
  missing: "uploaded",
  uploaded: "approved",
  approved: "missing",
};

export const nextDocState = (s: DocState): DocState => NEXT[s];

/** Pure: one click on a document moves it to the next step. */
export const cycleDoc = (items: DocItem[], id: string): DocItem[] =>
  items.map((d) => (d.id === id ? { ...d, state: nextDocState(d.state) } : d));

const LABEL: Record<
  DocState,
  { text: string; tone: DocRow["tone"]; action: string }
> = {
  missing: { text: "Missing", tone: "destructive", action: "Mark uploaded" },
  uploaded: { text: "Uploaded, to check", tone: "warning", action: "Approve" },
  approved: { text: "Approved", tone: "success", action: "Reopen" },
};

export const docRows = (items: DocItem[]): DocRow[] =>
  items.map((d) => ({
    ...d,
    stateLabel: LABEL[d.state].text,
    tone: LABEL[d.state].tone,
    actionLabel: LABEL[d.state].action,
  }));

/** Pure: how far the paperwork is. The shipment can clear when every required document is approved. */
export function progressOf(items: DocItem[]): Progress {
  const approved = items.filter((d) => d.state === "approved").length;
  const requiredLeft = items.filter(
    (d) => d.required && d.state !== "approved",
  ).length;
  return {
    approved,
    total: items.length,
    requiredLeft,
    pct: items.length === 0 ? 0 : Math.round((approved / items.length) * 100),
    ready: items.length > 0 && requiredLeft === 0,
    text:
      requiredLeft === 0
        ? "Ready to clear customs"
        : `${requiredLeft} required ${requiredLeft === 1 ? "document" : "documents"} to go`,
  };
}
