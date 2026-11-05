/**
 * State transfer between server and client: whatever the server learned while
 * rendering (resource results, ...) rides along in the HTML as JSON and is
 * handed to the client before it hydrates, so it does not fetch again.
 *
 * @module
 */
import { createContext } from "../core/mod.ts";

export const DEFAULT_STATE_ID = "__MAXIMUS_STATE__";

/** A per-request bag of JSON-compatible values. Resources read it on the client and write it on the server. */
export class TransferState {
  private readonly data = new Map<string, unknown>();
  constructor(init?: Record<string, unknown>) {
    if (init !== undefined)
      for (const k of Object.keys(init)) this.data.set(k, init[k]);
  }
  get<T = unknown>(key: string): T | undefined {
    return this.data.get(key) as T | undefined;
  }
  has(key: string): boolean {
    return this.data.has(key);
  }
  set(key: string, value: unknown): void {
    this.data.set(key, value);
  }
  /** Read and remove: use it on the client so a later refetch does not see stale server data. */
  take<T = unknown>(key: string): T | undefined {
    const v = this.data.get(key) as T | undefined;
    this.data.delete(key);
    return v;
  }
  delete(key: string): boolean {
    return this.data.delete(key);
  }
  get size(): number {
    return this.data.size;
  }
  toJSON(): Record<string, unknown> {
    return Object.fromEntries(this.data);
  }
}

/** The transfer state of the nearest `renderToString`/`renderToStream`/`hydrate`, or `null` outside one. */
export const TransferCtx = createContext<TransferState | null>(null);

/** Call during component setup. On the server: write results into it; on the client: read (and `take`) them. */
export function useTransferState(): TransferState | null {
  return TransferCtx.use();
}

/**
 * JSON that is safe to embed in HTML: `<`, `>`, `&`, U+2028 and U+2029 are
 * written as `\uXXXX` escapes, so neither `</script>` nor a line terminator
 * can end the surrounding script early (valid inside `<script type="application/json">`
 * and inside a JavaScript literal alike).
 */
export function serializeState(
  state: TransferState | Record<string, unknown>,
): string {
  const json =
    JSON.stringify(state instanceof TransferState ? state.toJSON() : state) ??
    "{}";
  return json.replace(
    /[<>&\u2028\u2029]/g,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}

export function deserializeState(text: string): TransferState {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw new TypeError(
      "Maximus ssr: the serialized state must be a JSON object",
    );
  return new TransferState(parsed as Record<string, unknown>);
}

/** `<script type="application/json" id="...">...</script>` for the state. */
export function stateScript(
  state: TransferState | Record<string, unknown>,
  id: string = DEFAULT_STATE_ID,
): string {
  return `<script type="application/json" id="${id}">${serializeState(state)}</script>`;
}
