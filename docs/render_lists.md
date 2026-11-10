# Lists: point-wise updates from application code

- **Scope:** application level only (`admin-app/` and future apps). Nothing here
  changes the framework — it uses what is already public: `Patch` as data,
  `view.render` / `view.diff` as pure functions, `DomPlugin.update`, and the
  `paint` handler that every component already owns.
- **Status:** implemented. The helpers live in
  [`admin-app/app/list-patches.ts`](../admin-app/app/list-patches.ts), wired
  into the users page (`sort` and `removed` leave notes; `paint` spends them),
  with equivalence tests in
  [`admin-app/tests/list-patches.test.ts`](../admin-app/tests/list-patches.test.ts).
- **Related:** [framework/docs/architecture.md](../framework/docs/architecture.md)
  (how `diff` works), [framework/docs/child-views.md](../framework/docs/child-views.md)
  (composition), [docs/refactor/doc.md](refactor/doc.md) (what was deferred and
  why — minimal-edit diff among it).

---

## 1. Where lists stand today

A `for` block compiles into marker-delimited item ranges, keyed by the `key`
expression:

```
tbody
  if rows.length == 0
    tr ...
  for user in rows key user.id
    +Row#row(user=user selected={selected.includes(user.id)} ...)
```

- the whole list is wrapped in `Ns` / `Ne` markers,
- every item is wrapped in `#<key>N[` / `#<key>N]` markers, and **every node id
  inside an item is derived from the item's key** (`#<key><node>`),
- on update, the compiled `diff` guards on `prev.rows !== next.rows` (plus every
  outer field the item subtree reads), maps both sides to key arrays and hands
  them to `diffKeyedList`
  ([framework/src/runtime/helpers.ts](../framework/src/runtime/helpers.ts)),
  which removes, inserts, moves and then calls `common` for every surviving
  item — where a `===` on the item reference skips the content diff.

Two properties of the update flow make everything below possible:

1. **Every store write answers separately.** A handler that returns eight
   `store.set(..., { onSuccess: "paint" })` effects gets eight paint answers,
   each carrying `{ prev, next }` of the states around _that one write_
   ([framework/src/plugins/store/mod.ts](../framework/src/plugins/store/mod.ts)).
   A paint answer's prev/next therefore differ in **exactly one store path** —
   same-tick changes to other fields land in their own answers. The core
   processes messages strictly one at a time, effects in order, answers queued
   in order ([framework/src/core/mod.ts](../framework/src/core/mod.ts)).
2. **Patches are plain data** and the paint handler is application code:
   `DomPlugin.update(view.diff(prev, next))` is a convention, not a law. The
   component may compute the patches any way it likes
   ([framework/src/plugins/dom/mod.ts](../framework/src/plugins/dom/mod.ts)
   applies them; boundaries re-scope ids and message ids transparently).

## 2. The problem: the handler's knowledge is thrown away

When a handler removes one row, it _knows_ the change is "row 42 is gone". The
paint answer then re-derives that fact from `prev`/`next` by diffing: two key
arrays (`n × String()`), two `Map`s with duplicate checks, a removal walk, an
insert/move walk whose `order.indexOf` makes it **O(n²)** in the worst case,
and `n` `common` calls. For the paged table (10–100 rows) this is noise; for
unpaged or frequently repainted lists (live tables, feeds) it is the cost that
dominates. Index-keyed lists are worse still — but they are out of scope: this
strategy requires real keys (§7).

The four list changes an application makes are each simpler than the general
reconciliation:

| Change | What the handler knows              | Minimal work                            |
| ------ | ----------------------------------- | --------------------------------------- |
| remove | which keys went away                | `remove` patches — pure id arithmetic   |
| update | which key's item was replaced       | diff of that one item's subtree         |
| sort   | same items, new order               | `move` patches only                     |
| add    | which keys appeared (and where not) | render the new items, one anchor lookup |

## 3. The strategy

**Carry the intent of the write to its paint answer; turn it into patches with
pure application-level helpers; verify it cheaply; fall back to `view.diff`
whenever it does not hold.**

- The handler records a **note** — plain data describing what it did to the
  rendered list — next to the write it is about to return.
- The paint answer that actually changed the rendered list consumes the note
  and calls a helper; every other answer (and any change without a note —
  undo, time travel, external writes) takes the generic `view.diff` path,
  which is always correct.
- The helpers verify the note against `prev`/`next` with cheap O(n) scans
  (keys and references, never item contents). A mismatch — a wrong, stale or
  incomplete note — means fallback, never wrong DOM.

Two enabling facts do the heavy lifting:

- _Per-write answers_ (§1.1): a note about "the `rows` write" is never polluted
  by same-tick changes to `selected`, `sortKey`, etc. — those arrive in their
  own answers with their own generic diffs. This also means the synthetic
  states of §4.3/§4.4 are sound.
- _Key-derived node ids_ (§1): patches computed for an item **in isolation**
  carry the right ids for that item anywhere in the list. An item diffed alone
  produces patches that land on the real DOM nodes.

## 4. The helpers

One file per app, e.g. `admin-app/app/list-patches.ts`. Imports are types and
one runtime function — the app stays pure, isomorphic, and testable (patches
are data; no DOM needed to test them).

```ts
import type { Patch, View, VNode } from "@pavlus/client";
import { diffKeyedList } from "@pavlus/client/runtime";
```

### 4.1 The binding

Everything the helpers must know about one `for` block:

```ts
/** What the handler did to the rendered list. Rides with the write. */
export type ListNote =
  | { kind: "add"; keys: string[] } // these keys appeared
  | { kind: "remove"; keys: string[] } // these keys went away
  | { kind: "update"; keys: string[] } // these keys' items were replaced
  | { kind: "sort" } // same items, new order
  | { kind: "replace" }; // anything else — force the generic diff

/** One `for` block of one template. */
export interface ListBinding<S, I> {
  /** The state field the template loops over: `for user in rows` → "rows". */
  field: keyof S & string;
  /** The item key — the template's `key` expression, as a string. */
  keyOf: (item: I) => string;
  /** Marker before the item with `key`: `"#<key>N["`. */
  start: (key: string) => string;
  /** Marker after the item with `key`: `"#<key>N]"`. */
  end: (key: string) => string;
  /** The marker after the last item: `"Ne"`. */
  listEnd: string;
}
```

`field` and `keyOf` mirror the template's `for user in rows key user.id`;
`start` / `end` / `listEnd` are copied from the compiled module, which is
readable on purpose — open `user-list.pavlus?import` in DevTools and copy the
`itemStartId` / `itemEndId` it already builds. The numbers (`N`) are the
compiler's node counters: stable for a given template, shifted only by edits
around the loop. A dev-time assert (§9) catches a stale binding on the first
render.

### 4.2 remove — pure id arithmetic

No rendering, no scanning, not even `next`:

```ts
/** `remove` patches for the noted keys. O(k) — ids only, no rendering. */
export function removePatches<S, I>(
  b: ListBinding<S, I>,
  keys: string[],
): Patch[] {
  return keys.map((key): Patch => ({
    op: "remove",
    from: b.start(key),
    to: b.end(key),
  }));
}
```

### 4.3 update — diff one item through the template

The item's patches must come from the template itself (texts, classes, handler
payloads — hand-writing them would couple the app to node numbers it cannot
see). The trick: **diff a synthetic state pair that contains only the noted
items**. Because node ids come from keys, and the synthetic pair's other fields
are equal (per-write answers make that true of the real pair too), the output
is exactly the noted items' patches:

```ts
/** The items of a state's list field — the template's `(state.rows) || []`. */
const itemsOf = <S, I>(b: ListBinding<S, I>, s: S): readonly I[] =>
  ((s as Record<string, unknown>)[b.field] ?? []) as readonly I[];

/** The state with its list field replaced — synthetic pairs are built on it. */
const withItems = <S, I>(b: ListBinding<S, I>, s: S, items: I[]): S =>
  ({ ...(s as object), [b.field]: items }) as S;
```

```ts
/**
 * The noted items' content patches: one synthetic diff through the real
 * template. Both sides hold the same keys in the same order, so the keyed
 * walk touches only the noted items — it cannot even see the rest of the
 * list, which is not in the synthetic pair.
 */
export function updatePatches<S, I>(
  view: View<S>,
  b: ListBinding<S, I>,
  prev: S,
  next: S,
  keys: string[],
): Patch[] {
  const wanted = new Set(keys);
  const pick = (list: readonly I[]): I[] =>
    list.filter((item) => wanted.has(b.keyOf(item)));
  return view.diff(
    withItems(b, next, pick(itemsOf(b, prev))),
    withItems(b, next, pick(itemsOf(b, next))),
  );
}
```

Why the outer fields are safe: the synthetic pair spreads `next` on both sides,
so any expression outside the item (`selected.includes(user.id)`, an embed's
props) is equal on both sides and produces no patches — which matches the real
answer, where those fields did not change either (§1). An update whose note is
incomplete — a second item also changed — is rejected by verification (§4.6),
because the synthetic pair would silently drop that item's patches.

A pleasant special case: `{ kind: "update", keys: [] }` on a pair whose list
reference changed but whose items did not (a re-derived `rows` with the same
content) verifies as "nothing to do" and returns zero patches — skipping the
whole keyed walk for a no-op.

### 4.4 add — render the new items, re-anchor

Render the added items through the template against an empty list (each diff
emits their `insert` patches, anchored at the list end), then re-anchor each
contiguous run before the first item that survives after it:

```ts
/** `insert` patches for the noted keys, at their real positions. */
export function addPatches<S, I>(
  view: View<S>,
  b: ListBinding<S, I>,
  next: S,
  keys: string[],
): Patch[] {
  const wanted = new Set(keys);
  const patches: Patch[] = [];
  let run: I[] = [];
  let anchor: string | null = null;

  const flush = (): void => {
    if (run.length === 0) return;
    const before = anchor ?? b.listEnd;
    // The synthetic pair flips every block that reads the list — the
    // empty-state `if rows.length == 0`, for one. Keep only the inserts
    // that are the run's items: each starts with its key-derived marker.
    const starts = new Set(run.map((item) => b.start(b.keyOf(item))));
    for (const p of view.diff(
      withItems(b, next, []),
      withItems(b, next, run),
    )) {
      if (p.op !== "insert") continue;
      const first = p.nodes[0];
      if (first?.t === "marker" && starts.has(first.id))
        patches.push({ ...p, before });
    }
    run = [];
  };

  for (const item of itemsOf(b, next)) {
    if (wanted.has(b.keyOf(item))) {
      run.push(item); // part of the added run
      continue;
    }
    if (run.length > 0) anchor = b.start(b.keyOf(item)); // first survivor after it
    flush();
  }
  anchor = null; // a trailing run goes before the list end
  flush();
  return patches;
}
```

Sequential inserts before the same anchor stack in array order, so a run comes
out in the right order. No content of any surviving item is read.

### 4.5 sort — moves only

A permutation cannot be produced without looking at both orders — that is
information, not overhead. What the note _removes_ is everything else: key
arrays' duplicate checks and the `common` walk (n reference compares). The move
walk itself reuses the public, tested reconciler with everything else turned
into no-ops:

```ts
/** `move` patches that turn the prev order into the next order. */
export function sortPatches<S, I>(
  b: ListBinding<S, I>,
  prev: readonly I[],
  next: readonly I[],
): Patch[] {
  const moves: Patch[] = [];
  diffKeyedList(prev.map(b.keyOf), next.map(b.keyOf), b.start, b.listEnd, {
    remove: () => {},
    insert: () => {},
    move: (key, beforeId) =>
      moves.push({
        op: "move",
        from: b.start(key),
        to: b.end(key),
        before: beforeId,
      }),
    common: () => {},
  });
  return moves;
}
```

The move set is correct but not minimal (a longest-increasing-subsequence would
move fewer nodes; the framework deliberately keeps the simple walk — see
[docs/refactor/doc.md](refactor/doc.md), "deferred on purpose"). Items must be
reordered **by reference** (`[...rows].sort(cmp)`, not rebuilt objects) — then
no item's content is even looked at, here or in the generic path.

### 4.6 The dispatcher and the verification net

One entry point: verify the note, use it or return `null` for the caller's
`view.diff` fallback.

```ts
/**
 * Patches for a verified note, or null when the note does not describe
 * prev → next exactly (then the caller uses view.diff). Verification reads
 * keys and references only — never item contents.
 */
export function listPatches<S, I>(
  view: View<S>,
  b: ListBinding<S, I>,
  prev: S,
  next: S,
  note: ListNote,
): Patch[] | null {
  const a = itemsOf(b, prev);
  const z = itemsOf(b, next);
  switch (note.kind) {
    case "replace":
      return null;
    case "remove":
      // empty ↔ non-empty can flip a same-field `if` (the "No users match"
      // row): that insert lives outside this list — take the generic diff
      if (a.length === 0 || z.length === 0) return null;
      return removedExactly(a, z, b.keyOf, note.keys)
        ? removePatches(b, note.keys)
        : null;
    case "add":
      if (a.length === 0 || z.length === 0) return null;
      return addedExactly(a, z, b.keyOf, note.keys)
        ? addPatches(view, b, next, note.keys)
        : null;
    case "update":
      return updatedExactly(a, z, b.keyOf, note.keys)
        ? updatePatches(view, b, prev, next, note.keys)
        : null;
    case "sort":
      return sortedExactly(a, z, b.keyOf) ? sortPatches(b, a, z) : null;
  }
}
```

The checks — all O(n), all cheap:

| Check            | Guarantees                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `removedExactly` | `next` is `prev` minus the noted keys: same surviving items (by reference), same order — the note is _complete_         |
| `addedExactly`   | `prev` is `next` minus the noted keys, survivors identical and in order                                                 |
| `updatedExactly` | same keys in the same order; every **unnoted** item is the same reference (nothing else changed), noted keys may differ |
| `sortedExactly`  | same item references as a set, no duplicate keys — a pure permutation                                                   |

```ts
/** next is prev without `gone` — survivors identical, order kept. */
function removedExactly<I>(
  a: readonly I[],
  z: readonly I[],
  keyOf: (i: I) => string,
  gone: string[],
): boolean {
  const drop = new Set(gone);
  let i = 0;
  for (const item of a) {
    const key = keyOf(item);
    if (drop.has(key)) {
      drop.delete(key);
      continue;
    }
    if (i >= z.length || z[i] !== item || keyOf(z[i]) !== key) return false;
    i++;
  }
  return i === z.length && drop.size === 0;
}

/** prev is next without `added` — survivors identical, order kept. */
function addedExactly<I>(
  a: readonly I[],
  z: readonly I[],
  keyOf: (i: I) => string,
  added: string[],
): boolean {
  const extra = new Set(added);
  let i = 0;
  for (const item of z) {
    const key = keyOf(item);
    if (extra.has(key)) {
      extra.delete(key);
      continue;
    }
    if (i >= a.length || a[i] !== item || keyOf(a[i]) !== key) return false;
    i++;
  }
  return i === a.length && extra.size === 0;
}

/** same keys, same order; only noted items may be different references. */
function updatedExactly<I>(
  a: readonly I[],
  z: readonly I[],
  keyOf: (i: I) => string,
  keys: string[],
): boolean {
  if (a.length !== z.length) return false;
  const wanted = new Set(keys);
  for (let i = 0; i < a.length; i++) {
    const key = keyOf(a[i]);
    if (keyOf(z[i]) !== key) return false; // a key never moves on an update
    if (!wanted.has(key) && a[i] !== z[i]) return false; // an unnoted item changed
  }
  return true;
}

/** the very same items, possibly in another order. */
function sortedExactly<I>(
  a: readonly I[],
  z: readonly I[],
  keyOf: (i: I) => string,
): boolean {
  if (a.length !== z.length) return false;
  const pool = new Set(a);
  const keys = new Set<string>();
  for (const item of z) {
    if (!pool.has(item)) return false;
    const key = keyOf(item);
    if (keys.has(key)) return false; // duplicate keys would throw deeper down
    keys.add(key);
  }
  return keys.size === new Set(a.map(keyOf)).size;
}
```

## 5. Wiring it into a component

The users page, as it stands, with three notes added (the `rows` binding for
its `for user in rows key user.id`; copy the marker builders from the compiled
module):

```ts
/** The `for user in rows key user.id` block of user-list.pavlus. */
const rows: ListBinding<ListState, User> = {
  field: "rows",
  keyOf: (u) => String(u.id),
  start: (key) => `#${key}37[`, // ← the numbers come from the compiled module
  end: (key) => `#${key}37]`, //   (copy its itemStartId / itemEndId; the
  listEnd: "37e", //    dev assert below flags it going stale)
};
```

The note slot and the paint dispatcher:

```ts
export class UserList extends Component<ListState> {
  view = view;

  /** What the running handler did to `rows`; spent by the answer that changed it. */
  private note: ListNote | undefined;

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as { prev: ListState; next: ListState };
    let patches: Patch[];
    if (prev.rows !== next.rows) {
      // this answer is the rows write: the note (if any) belongs to it
      const note = this.note;
      this.note = undefined;
      patches = (note && listPatches(view, rows, prev, next, note)) ?? view.diff(prev, next);
    } else {
      // another field's answer: its guards skip the list anyway
      patches = view.diff(prev, next);
    }
    return [DomPlugin.update(patches)];
  }
```

And the handlers — the whole change is one line each:

```ts
  /** A header click: sort by that column, toggling the direction. */
  sort(msg: Message, s: ListState): Effect[] {
    const by = msg.payload as SortKey;
    const dir: 1 | -1 = s.sortKey === by ? (s.sortDir === 1 ? -1 : 1) : 1;
    const users = sortBy(s.users, by, dir);   // same objects, new order
    this.note = { kind: "sort" };             // ← the intent, for the rows answer
    return [
      store.set("users", users, { onSuccess: "paint" }),
      store.set("sortKey", by, { onSuccess: "paint" }),
      store.set("sortDir", dir, { onSuccess: "paint" }),
      ...this.repage(s, { users }),
    ];
  }
```

Why the note is always there when it matters — the lifecycle:

1. The handler sets `this.note` and returns its writes. Nothing else runs
   until the handler returns (the core is single-threaded, one message at a
   time).
2. The writes' effects run in order; each changed write queues its `paint`
   answer. The `users` / `sortKey` / `sortDir` / `total` / … answers diff pairs
   where `rows` did not change — the note is not theirs and stays.
3. The `rows` answer arrives; `prev.rows !== next.rows` is true, the note is
   consumed and cleared. If no rows-changing answer ever comes (the write was
   a no-op, the note was mistaken), the note sits until the next handler
   overwrites it — and were a later rows answer to consume a stale one,
   verification rejects it and the generic diff runs.

Rejected alternatives, for the record:

- **Per-intent answer ids** (`onSuccess: "paintSort"`, one handler per kind):
  works (boundaries namespace any `{ prev, next }` answer the same way), but
  multiplies handlers and cannot carry _which key_ — the payload is fixed.
- **Eager patches from the handler** (emit `DomPlugin.update` right next to the
  write): the paint answer would later diff the same change again and double-
  apply; patches must have exactly one producer — the answer.
- **The note in the store** (a `_note` field): pollutes state, history and
  time travel with plumbing. A component field is transient and never
  serialized — like the component instances an app already holds.

## 6. Derived lists: the deriver decides the note

`rows` is not the stored list — it is a page window over `filterUsers(users)`
computed by `repage`. A note must describe the **rendered** list, and the
derivation can distort the intent:

- deleting a row in the middle of a full page slides the next page's first row
  into the window — for `rows` that is a remove _plus_ an add, i.e. `replace`;
- deleting the last row of the last page just shortens the window — a clean
  `remove`;
- a page turn or filter change rewrites the whole window — `replace`.

So the rule is: **the code that derives the list decides whether the note
survives.** For the users page:

```ts
  removed(msg: Message, s: ListState): Effect[] {
    const id = (msg.payload as { data: { deleted: number } }).data.deleted;
    const users = s.users.filter((u) => u.id !== id);
    // The window keeps its rows only when the deleted row is on it, and the
    // window neither slides (enough matches left to refill it) nor gets
    // clamped (it was an over-long last page).
    const after = filterUsers(users, s.filter);
    const pages = Math.max(1, Math.ceil(after.length / s.pageSize));
    const onPage = s.rows.some((u) => u.id === id);
    const steady = onPage && s.page <= pages && after.length < s.page * s.pageSize;
    this.note = steady ? { kind: "remove", keys: [String(id)] } : undefined;
    return [ /* the writes, unchanged */ ];
  }
```

When the rule is hard to state, leave the note out — the generic diff is the
answer. And when the verification net still rejects a deriver's optimistic
note, the cost is one wasted O(n) scan, not wrong DOM.

For lists that are stored as rendered (no derivation), helpers can make notes
correct _by construction_ — `dropItem(users, keyOf, key)` returning
`{ list, note }` — so the intent and the array cannot drift apart. Worth
adding when a second page uses them; the users page's derivation makes its
notes a deriver decision instead.

## 7. Template conventions

The strategy leans on the compiled code's contracts; templates that follow
them make the notes valid:

1. **Always a stable `key`.** `for user in rows key user.id` — a key that is
   unique, immutable, and survives every other change. The default index keys
   make every operation a re-diff of shifted contents and every note
   unverifiable.
2. **The key is identity.** Changing a row's `id` is a remove plus an add —
   one note cannot express both, so key changes are `replace`, never an
   update.
3. **Replace items by reference, reorder without rebuilding.**
   `{ ...user, name }` on edit; `[...rows].sort(cmp)` on sort. `diff` trusts
   `===` — and so do the verifiers.
4. **The item subtree may read outer state freely** (`selected`, `starred`,
   embed props): per-write answers keep the synthetic pairs of §4.3 sound.
   But heavy per-item derivation belongs in the component (the existing `rows`
   convention), keeping the template a pure function of one item plus a few
   flags.
5. **A same-field `if` around a noted `for` must not flip with the note.** The
   empty-state row (`if rows.length == 0`) is the common case: its insert is
   not the list's patch. The dispatcher refuses add/remove notes on an empty
   crossing; other same-field wrappers (`if rows.length > 10` banners) are a
   convention — check the compiled guards' `reads:` comments — and the
   equivalence tests of §9 catch slips.
6. **One binding per `for` block, colocated with its component**, asserted in
   dev (§9). Two lists in one component: one note slot per binding.

## 8. Edge cases

| Case                                  | Behaviour                                                   |
| ------------------------------------- | ----------------------------------------------------------- |
| No note (undo, `restoreTo`, reload)   | generic `view.diff` — always correct                        |
| Note does not verify                  | `null` → generic `view.diff`                                |
| List emptied / filled by the note     | `replace` path (§4.6 empty-crossing guard)                  |
| `rows` reference changed, content not | `{ kind: "update", keys: [] }` → zero patches, no walk      |
| Two lists, one write                  | each binding has its own note; the other list's guards skip |
| SSR                                   | no paints on the server; helpers are pure and never run     |
| Duplicate keys                        | verifier rejects (the template itself throws on duplicates) |

## 9. Correctness and testing

- **The equivalence property.** Whenever a note verifies,
  `listPatches(...)` and `view.diff(prev, next)` must produce the same DOM.
  Test by mounting the same view twice (jsdom, as
  [framework/src/plugins/dom/dom.test.ts](../framework/src/plugins/dom/dom.test.ts)
  does), applying each patch set to its own mount, and comparing
  `innerHTML`. Drive it with generated prev/next pairs — removes at page
  boundaries, sorts, empty crossings, multi-key updates — and with the real
  users page's states.
- **Fallback tests.** Every unverifiable note returns `null`; the caller then
  diffs generically. A wrong note must never produce patches.
- **The binding assert** (run once in dev, on the first paint whose state
  renders the list's region — the users page's table is absent while
  `status == "loading"`, so the first paint is too early):

```ts
function assertBinding<S, I>(view: View<S>, b: ListBinding<S, I>, s: S): void {
  const ids = new Set<string>();
  const walk = (nodes: VNode[]): void => {
    for (const n of nodes) {
      if (n.id !== undefined) ids.add(n.id);
      if (n.t === "el") walk(n.children);
    }
  };
  walk(view.render(s));
  const first = itemsOf(b, s)[0];
  const ok =
    ids.has(b.listEnd) &&
    (first === undefined ||
      (ids.has(b.start(b.keyOf(first))) && ids.has(b.end(b.keyOf(first)))));
  if (!ok)
    throw new Error(
      `list binding is stale: no markers for "${b.field}" in the rendered view (template changed?)`,
    );
}
```

- **Debugging.** The patch stream is visible in the debug panel's effect view;
  a note turns a wall of patches into `{ remove }` / `{ move }` rows an
  engineer can read as intent.

## 10. What each note actually saves

Honest accounting — the DOM work is the same the generic path would do; the
win is skipped reconciliation on the JS side (and, with it, immunity to the
O(n²) order walk), plus explicit intent:

| Note   | Verification     | Patch work                          | Skipped from the generic path                        |
| ------ | ---------------- | ----------------------------------- | ---------------------------------------------------- |
| remove | O(n) keys + refs | O(k) id arithmetic                  | key arrays, maps, dup checks, O(n²) walk, n `common` |
| update | O(n) keys + refs | one diff of k item subtrees         | the same                                             |
| add    | O(n) keys + refs | render k items + anchor lookup      | the same                                             |
| sort   | O(n) refs        | move walk (same class as generic's) | key arrays, dup checks, n `common`                   |

When **not** to bother: paged or small lists (n ≤ ~100 — the generic path is
sub-millisecond and already minimal in DOM ops); lists behind heavy
filtering/paging where notes rarely survive derivation; anything index-keyed
until it is migrated to real keys.

## 11. Out of scope (framework-level ideas, deliberately not here)

- Compiled templates exposing their per-item diff (would make §4.3's synthetic
  pair unnecessary) or a named `for` whose binding the compiler emits (would
  kill §4.1's copy step).
- Minimal-move (LIS) reconciliation — deferred by
  [docs/refactor/doc.md](refactor/doc.md); `sortPatches` inherits the simple
  walk.
- A runtime that understands notes — the whole point of this document is that
  the application can do it alone, today, and that the framework stays small.
