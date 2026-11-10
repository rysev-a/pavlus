# direct: templates compiled to DOM code, no vdom

`direct` is a second back end for the **same template language**. The parser,
the AST and every syntax in `src/syntaxes` are shared; only the code
generator and the DOM plugin differ.

|                        | vdom pipeline (`compiler/` + `plugins/dom`)                    | direct (`direct/` + `plugins/direct`)                                   |
| ---------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| generated per template | `render(state) -> VNode[]` and `diff(prev, next) -> Patch[]`   | one `create(env, state) -> Block`                                       |
| what is kept           | nothing in the view; the plugin keeps an id -> node table      | the block's closure keeps the last value of every binding               |
| an update              | build vnodes / diff two states / patch list / id lookups / DOM | compare each bound value with its last one, write the DOM if it changed |
| first render           | build vnodes, then DOM from vnodes                             | `cloneNode(true)` of a static skeleton, then fill the dynamic spots     |
| effects (plugin)       | `dom.mount / unmount / update / focus / blur`                  | the same effects, plugin name `dom` too (swap `new DomPlugin()`)        |

```ts
import { createDirectDomPlugin } from "@pavlus/client/plugins/direct";
// ... plugins: [store, createDirectDomPlugin()]  instead of new DomPlugin()
```

Compile templates with the direct target, either way:

```ts
// vite.config.ts
plugins: [pavlus({ target: "direct" })];
// or programmatically
import {
  compileDirectTemplate,
  compileDirectToView,
} from "@pavlus/client/direct";
```

The generated module imports its helpers from
`@pavlus/client/direct/runtime` and exports `create` and `meta`
(and a default `{ create, meta }`), where the vdom module exports `render` and
`diff`. A component's `view` is such a module's default export (cast it:
`view = directView as any`, `Component.view` is typed for vdom views).
`createApp({ mount })` works unchanged: `viewOf` hands the component to the
view as its owner.

## How it works

**Skeleton.** The static part of each block (an element subtree with its
static attributes and text) is built once, with `createElement` /
`setAttribute` calls (never from HTML, so the HTML parser's restructuring of
`<p><div>` or nested `<a>` cannot change the shape the compiled paths rely on),
and cloned with `cloneNode(true)` per instance. `svg` and `math` elements are
created in their own namespace, and the generator passes the enclosing
namespace down to an `if`/`for` body's skeleton, so inline `<svg>` works
(including dynamic children inside it). Dynamic nodes are reached
from the clone by a precomputed chain of `firstChild` / `nextSibling`. Dynamic
text starts as an empty text node; `if` / `for` / embeds / `+outlet` each own
one empty comment (the anchor) that marks where their content goes (content is
inserted _before_ it).

**Block.** `create(env, s)` returns `{ e, f, u, n, d }`: `f` is what to insert
(the element itself for a single-root block, else a fragment), `u(state, ...loop
variables)` updates, `d()` removes listeners and destroys child blocks, `n(out)`
lists the top-level nodes (multi-root blocks; `e` is the node for single-root
ones). The block is built and filled while detached, then inserted once.

**Update.** `u` assigns the live variables (`s` and the loop variables, which the
event handlers read, so a payload is always computed from the _current_ state),
then runs one `try { compute; if (v !== last) { last = v; write } }` per
binding. Each block also guards itself: if every free identifier it reads
(`s.title`, the loop item...) is identical to the last call, it returns at
once. That is what makes "one row changed in a list of 1000" cost a pointer
comparison per other row. (It is the same assumption the vdom `diff` makes:
state is immutable; mutating an object in place is invisible to both.)

Bindings whose expression calls anything (`{total(rows)}`,
`{name.toUpperCase()}`) get one more guard, per binding: the generated code
remembers the inputs it read and skips the call while they keep their
references — a compiled `computed` without a runtime graph, valid under the
same purity assumption (a template expression is a function of what it
reads). `meta.deps` publishes the graph as data: one row per binding
(`{ line, of, reads, checked }`), so a tool can answer "who updates this DOM
node" statically, which neither a signals runtime nor a vdom diff can.

**`if`** mounts and drops a sub-block between its anchor and its siblings when
the selected branch index changes, and forwards `u` otherwise. **`for`** keeps
the item blocks in two parallel arrays (keys, blocks) and reconciles in place:
common prefix and suffix are only updated; a pure append or tail removal is one
pass with one batched insert; otherwise the middle is matched by key (a `Map`),
removed items are dropped, new ones created, and the items outside a longest
increasing subsequence are moved. Unkeyed `for` goes by index.

**Embeds** `+Name#inst(props)` create the child block with a child `env`
(`ns` = parent's `ns + "inst."`, so events are `inst.event`, as in the vdom
pipeline; `o` = the child's component from `childEnv(env.o, name, state)`). The
props object is rebuilt, and the child updated, only when a prop value (or the
spread object) changed. Dynamic `+{expr}#name` swaps the child block when the
view changes (a view and a component holding the same view count as one),
exactly as the vdom `diff` does; `+outlet` resolves with the same
`routing` matching as the vdom `resolveOutlet` (shared `routing/mod.ts`) and
requires pages that are direct views.

## One template, annotated

```
ul.todos
  for t in todos key t.id
    li(class:done=t.done @click=toggle(t.id)) {t.title}
  p.count {todos.length} items
```

compiles to (names shortened; `src/direct/mod.ts` prints the real thing):

```js
// the static skeletons, built once per document
const sk10 = skel([["li", [], ""]], true); // <li></li>, one root
const sk16 = skel(
  [["ul", ["class", "todos"], 0, ["p", ["class", "count"], ""]]],
  true,
);
//                                                 ^ anchor (comment)    ^ dynamic text

function block6(env, s, $t, $index) {
  // the body of the `for`: one item
  const f = sk10(env.rt.doc).cloneNode(true); // the <li>
  const r9 = f.firstChild; // its text node, by path
  let c7 = false,
    t8 = "",
    g11 = UNSET; // last values: class toggle, text, guard
  const ls = []; // listeners to remove in d()
  on(env.rt, ls, f, "click", (ev) => {
    // ONE listener per element
    let p;
    try {
      p = $t?.id;
    } catch (e) {
      fail(env, e);
      return;
    } // payload from the CURRENT $t
    send(env, "toggle", p, ev); // id = env.ns + "toggle", plus the event snapshot
  });
  function u(s$, $t$, $index$) {
    s = s$;
    $t = $t$;
    $index = $index$; // live variables for the handler above
    if ($t === g11) return; // the row's only input is unchanged: done
    g11 = $t;
    try {
      // class:done=t.done
      const c7$ = !!$t?.done;
      if (c7$ !== c7) {
        c7 = c7$;
        setAttr(f, "class", joinClasses([c7$ ? "done" : ""]));
      }
    } catch (e) {
      fail(env, e);
    } // a throwing binding is reported, the rest go on
    try {
      // {t.title}
      const v = "" + toText($t?.title);
      if (v !== t8) {
        t8 = v;
        r9.data = v;
      } // text node data, never innerHTML
    } catch (e) {
      fail(env, e);
    }
  }
  function d() {
    off(env.rt, ls);
  }
  u(s, $t, $index);
  return { e: f, f, u, d };
}

function block1(env, s) {
  // the template
  const f = sk16(env.rt.doc).cloneNode(true); // the <ul>
  const r3 = f.firstChild; // anchor of the `for`
  const r14 = f.lastChild.firstChild; // the count's text node
  const l2 = list(env.rt, r3); // the keyed list runtime
  let t13 = "",
    g17 = UNSET;
  function u(s$) {
    s = s$;
    if (s.todos === g17) return;
    g17 = s.todos;
    try {
      l2.r(
        toList(s.todos),
        ($t, $index) => $t?.id, // key
        ($t, $index) => block6(env, s, $t, $index), // create an item
        (b, $t, $index) => b.u(s, $t, $index),
      ); // update an item
    } catch (e) {
      fail(env, e);
    }
    try {
      const v = "" + toText(s.todos?.length) + " items";
      if (v !== t13) {
        t13 = v;
        r14.data = v;
      }
    } catch (e) {
      fail(env, e);
    }
  }
  function d() {
    l2.d();
  }
  u(s);
  return { e: f, f, u, d };
}
```

## Robustness, by construction

- No `innerHTML` anywhere. Text is `Text.data`; attributes are `setAttribute`;
  the skeleton is built with DOM calls. Interpolated data cannot become markup.
- Dynamic `href` / `src` / `action` / `formaction` / `poster` values go
  through `safeUrl` (`javascript:`, `vbscript:` and `data:text/html` become
  `about:blank`; whitespace and control characters inside the scheme are
  ignored, as browsers do). Binding data to an `on*` attribute or `srcdoc` is a
  **compile error** (use `@event`); a _static_ `onclick="..."` is the author's
  own text and stays allowed. These two rules are deliberate differences from
  the vdom pipeline, which sets whatever it is given.
- `value` / `checked` / `selected` are written as properties as well as
  attributes (and only when different from the live value, so the caret does
  not jump); `disabled` and the other boolean attributes are attributes
  (`false` / `null` removes). Children of an element are updated before its
  `value`, so `<select value=x>` over a `for` of options works on first paint.
- An error thrown by one binding (a getter, a bad call) goes to the plugin's
  `onError` (default `console.error`); its last value is kept and the other
  bindings still update. A misconfiguration (`+outlet` without `routing`) is a
  `FatalError` and is thrown. A payload that throws sends no message.
- Updates are not re-entrant: an `update` effect that arrives while one runs is
  queued (the latest wins) and applied right after.
- `unmount` removes the nodes and every listener the plugin added
  (`stats().listeners` goes back to 0); block `d()` is recursive.
- Duplicate keys in a `for` are detected before anything moves; the error is
  reported and the list is left as it was (the vdom pipeline throws).

## Differences from the vdom pipeline (read before swapping)

- **Keys** compare with `===`, not `String(key)`: `1` and `"1"` are different keys.
- **`update` ignores `prev`.** The view remembers what it painted; `next` is
  what it shows. (`prev === next` and "same state again" are no-ops.)
- A `for` over `null`, a string or a number is empty; iterables and
  array-likes are accepted.
- Static embed owner (`childEnv` with a `select` spec) is re-resolved when the
  child's props change or its row is updated, not on every parent update.

## What you lose

- **Patches as data.** `diff()` returns a plain list a test can assert on
  (`expect(view.diff(a, b)).toEqual([])`, the "minimal patches" tests in
  `dom.test.ts`) and a devtool can log. Here the "patch" is a direct DOM
  write; the equivalent assertions are DOM-level (node identity, mutation
  observers). There is no `diff` export at all.
- **Time travel / replay of view changes.** Pure `render(state)` can be
  re-run for any state, anywhere (a debug panel, a snapshot test, a worker).
  A direct block is a stateful object tied to a document.
- **SSR parity.** Not implemented: the direct plugin does **not hydrate**
  (a server render in the container, as produced by `ssr.renderToString`, is
  removed and replaced). `renderToString(view, state, doc)` exists, but it
  needs a DOM implementation (it builds the block in `doc` and reads
  `innerHTML`), so it is not a DOM-free string builder like the vdom one.
- **Cheap whole-view inspection** (the Apps/devtools view of vnodes and ids).
- **Pure compile output.** vdom `render`/`diff` have no side effects and can
  be unit-tested without a DOM; a direct template needs one (jsdom is enough).
- Two pipelines are two things to keep in agreement. The shared test
  (`plugins/direct/direct.test.ts`) runs both on the same templates and state
  sequences and compares the DOM, which is the safety net.

## Benchmark

`node --experimental-strip-types src/direct/bench.ts [rows] [iterations]`
(1000 rows, 25 iterations; a table of rows with 3 text cells, a class toggle
and a click listener). **jsdom is not a browser**: no layout, style or paint,
and each DOM call is JavaScript with its own cost, so this measures the JS
work of the two pipelines plus jsdom's per-call cost. The machine also ran
other jobs, so the spread is large (min..max in the output). Median ms of the
timed steps, one representative run (a second run was within roughly 30% on
every line):

```
scenario                             vdom ms direct ms vdom/dir
initial render, 1000 rows              110.2     67.1    1.64x
update 1 cell                           1.79     0.13   13.44x
update every cell                       3.80     1.57    2.43x
keyed shuffle (random permutation)      28.0     17.7    1.58x
keyed reverse                           25.1     11.4    2.19x
append 100 rows                         12.5     5.30    2.35x
remove 100 rows (tail)                  9.31     0.98    9.46x
remove 100 rows (middle)                6.48     0.81    7.98x
insert 100 rows (middle)                9.39     4.13    2.27x
select a row (class toggle)             1.79     0.25    7.05x
```

Read it as: in jsdom the direct pipeline did less work in every scenario
measured; the large ratios are on updates that touch few rows, where vdom
still renders and diffs the whole list and direct skips unchanged rows by
identity. The shuffle and the initial render are dominated by jsdom's own
DOM-call cost, so their ratio is the smallest. None of this has been measured
in a real browser; no claim is made about one.
