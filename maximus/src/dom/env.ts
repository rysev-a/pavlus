/**
 * The seam between the DOM layer and its environment. In a browser nothing is
 * set and `doc()` is just `document`. `maximus/ssr` installs hooks here while
 * it renders on the server (a virtual document, template-instance tagging,
 * promise collection) or adopts server HTML (`claim`).
 *
 * @module
 */

/** What the DOM layer knows about a compiled template; passed to the ssr hooks. */
export interface TemplateInfo {
  /** The static strings of the call site. */
  strings: readonly string[];
  /** Hole bindings; `node` is a tree-walk index (elements and comments). */
  parts: ReadonlyArray<{ kind: number; node: number; sole: boolean }>;
  /** Highest tree-walk index the bindings need (a child hole's end marker included). */
  maxNode: number;
  /** The content is exactly one Element. */
  single: boolean;
}

/** Server nodes that stand in for a template instance during hydration. */
export interface Claim {
  /** Located nodes by tree-walk index (the same order `html` uses for its clone). */
  nodes: Node[];
  /** Called after the bindings are attached: drop the markers, return the Element or a fragment. */
  finish(): Node;
}

export interface SuspenseBoundary {
  start: Comment;
  end: Comment;
  pending: () => number;
}

export interface DomEnv {
  /** Replaces `document` (the virtual DOM on the server). */
  doc: Document | null;
  /** True while rendering on the server. */
  server: boolean;
  /** Server: the sequence number of a template instance, taken when its `html` call starts (the moment the client claims it). */
  seq: (() => number) | null;
  /** Server: tag a freshly built template instance so that `hydrate` can find it. */
  tag: ((info: TemplateInfo, result: Node, seq: number) => Node) | null;
  /** Client hydration: take the server nodes of the next template instance, or null to build it fresh. */
  claim: ((info: TemplateInfo) => Claim | null) | null;
  /** Server: every promise registered with any suspense boundary. */
  pending: ((p: Promise<unknown>) => void) | null;
  /** Server: a suspense boundary was created. */
  suspense: ((b: SuspenseBoundary) => void) | null;
  /** Hydration: report a server/client difference. */
  mismatch: ((message: string) => void) | null;
}

export const env: DomEnv = {
  doc: null,
  server: false,
  seq: null,
  tag: null,
  claim: null,
  pending: null,
  suspense: null,
  mismatch: null,
};

/** The document nodes are created with. */
export function doc(): Document {
  return env.doc ?? document;
}

/** Short stable fingerprint of a template call site (FNV-1a, base 36). */
export function hashStrings(strings: readonly string[]): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < strings.length; i++) {
    const s = strings[i]!;
    for (let j = 0; j < s.length; j++) {
      h ^= s.charCodeAt(j);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0xff;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
