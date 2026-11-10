# The template engine: compiled, not interpreted

A `.pavlus` template never reaches the browser as a template. The compiler turns
it into an ES module with two pure functions, and that module is what the
browser runs:

```ts
render(state): VNode[]            // the whole view for a state
diff(prev, next): Patch[]         // the DOM operations that turn one state's view into another's
```

Everything this document describes follows from that one decision. There is no
template parser in the bundle, no virtual-DOM tree to walk on every change, no
reactive proxies watching your objects, no expression evaluator. The work that
other engines do at runtime, pavlus does once, at build time, and writes down
the result as readable JavaScript.

## 1. From a template to a module

```
users.pavlus ──▶ parse ──▶ TemplateAst ──▶ analyze (what each node reads)
                                              │
                                              ▼
                                   codegen ──▶ users.pavlus.js
                                                 export { render, diff, meta }
```

- **Parse** (`framework/client/src/template/parser.ts`): the indentation-based
  source becomes a small AST: elements, text with holes, `if` / `else if` /
  `else`, `for … in … key …`, embeds (`+Child#name(...)`), `+outlet`, and
  imports of child views. Four other syntaxes (pug, an Angular-like one, JSX and
  block HTML, in `src/syntaxes/`) parse into the same AST, so the rest of the
  pipeline never knows which one you wrote.
- **Analyze** (`src/compiler/analyze.ts`): for every node, the set of state
  roots it reads. A text hole `{user.name}` reads `user`; a loop body reads the
  loop variable and whatever else it names. This set is what makes `diff`
  cheap, see below.
- **Codegen** (`src/compiler/codegen.ts` and `src/compiler/emit/`): the AST
  becomes source text, written by layered emitters (base → expressions → render
  → diff) that share one writer and one name scope, so the output has readable
  names (`userList`, `prevUserKeys`, `liChildren`) and a `// line N:` comment
  for every template line.
- **The Vite plugin** (`src/vite/mod.ts`) runs all of it when a `.pavlus` file
  is imported. `compileTemplate(source)` from `@pavlus/client/compiler` is the
  same function, callable from a script or a test.

## 2. What the output looks like

The template (a fixture of the compiler's own tests):

```
section
  if isLoading
    p.status Loading...
  else if isFailed
    p.status.status--error {error}
    button(@click=retry) Retry
  else
    ul
      for item in items
        li {item}
  if footer
    footer {footer}
```

`render` is a straight transcription. Each line of the template is a few lines
of JavaScript that push plain objects (`{ t: "el", tag, attrs, events, children }`,
`{ t: "text", text }`, `{ t: "marker", id }`) onto a list:

```js
function render(state, idSuffix = "", messagePrefix = "", env) {
  const nodes = [];
  // line 2: <section>
  const sectionChildren = [];
  // line 3: if
  sectionChildren.push({ t: "marker", id: idSuffix + "1s" });
  if (state.isLoading) {
    // line 4: <p.status>
    ...
  } else if (state.isFailed) {
    ...
    const buttonEvents = {
      "click": { id: messagePrefix + "retry", payload: undefined },
    };
    ...
  }
  sectionChildren.push({ t: "marker", id: idSuffix + "1e" });
  ...
  return nodes;
}
```

Note the `click` handler: an event is **data**, a message id and a payload. The
template does not bind a function; the DOM plugin reads this object when the
click happens and dispatches the message.

`diff` is where the compile step pays off. It is not a generic tree comparison:
it is code specialised for this template, guarded by what each part reads:

```js
function diff(prev, next, idSuffix = "", messagePrefix = "", env) {
  const patches = [];
  if (prev === next) return patches;
  // line 2: <section> (reads: isLoading, isFailed, error, items, footer)
  if (prev.isLoading !== next.isLoading || prev.isFailed !== next.isFailed || ...) {
    // line 3: if (reads: isLoading, isFailed, error, items)
    if (...) {
      const prevBranch = prev.isLoading ? 0 : prev.isFailed ? 1 : 2;
      const nextBranch = next.isLoading ? 0 : next.isFailed ? 1 : 2;
      if (prevBranch !== nextBranch) {
        // another branch: replace what is between the markers
        patches.push({ op: "clear", from: idSuffix + "1s", to: idSuffix + "1e" });
        ... render the new branch from `next` and push an "insert" patch
      } else {
        // the same branch: diff inside it
        if (nextBranch === 1) {
          if (prev.error !== next.error) {
            const prevText = "" + toText(prev.error);
            const nextText = "" + toText(next.error);
            if (prevText !== nextText) patches.push({ op: "text", id: idSuffix + "5", text: nextText });
          }
        }
        ...
      }
    }
    // line 12: if (reads: footer)
    if (prev.footer !== next.footer) { ... }
  }
  return patches;
}
```

Three things to see here:

1. **Subtree skip.** A node whose roots did not change (`prev.footer ===
   next.footer`) costs one comparison and emits nothing. The analysis in step 1
   wrote these guards; no runtime bookkeeping is needed to know what depends on
   what.
2. **Markers instead of a tree.** An `if` or a `for` is a pair of empty comment
   nodes in the DOM. Replacing a branch is "clear between these two ids, insert
   before the end id". Keyed lists reconcile by key (`diffKeyedList`) and emit
   `remove`, `insert`, `move` patches for the ranges between item markers.
3. **Patches are data.** `diff` returns eight kinds of plain objects (`text`,
   `attr`, `rmAttr`, `handler`, `insert`, `clear`, `remove`, `move`). The DOM
   plugin is the only code that interprets them; a test can look at them
   without a DOM at all.

The full file is `framework/client/src/compiler/__goldens__/if.js`. The golden
files pin the output byte for byte: **readable generated code is a tested
feature**, not an accident. You debug the code you see in DevTools, and there is
no source map because nothing is hidden.

## 3. Why expressions are only a literal or a path

The expression grammar of a template is:

```
Expr    := Literal | Path
Literal := number | string | true | false | null | undefined
Path    := identifier ("." identifier | "[" Literal "]")*
```

No operators, no calls, no ternaries, no arrow functions. The compiler names
each of them in a parse error that points to
[framework/docs/philosophy.md](../../framework/docs/philosophy.md). Events are
the one call-like shape, `@click=remove(item.id)`, and they are a message id
with path or literal arguments, parsed separately.

This is a language decision, and the engine is the reason it is cheap to make:

- **The dependency analysis is exact.** A hole is a path; its root is its
  dependency. There is no expression to analyze, no hidden read inside a
  callback, nothing that could depend on "everything". Every guard in `diff`
  is one `!==` on a root.
- **Nothing in a template can throw.** A missing path renders as nothing
  (`toText(undefined)` is the empty string, `user?.name` in the generated code
  is null-safe). There is no `items.filter` to fail on `undefined`.
- **The parser is tiny**, so every syntax front-end, the tree-sitter grammar and
  the Zed extension mirror the same small thing, and errors carry an exact
  `line:col`.
- **Logic has one home.** Filtering, sorting, formatting, class assembly, a
  negated flag: all of it is a function of the state, written in TypeScript,
  tested without rendering. The template reads the result. See
  [functional-programming.md](./functional-programming.md) for the shape of
  that code.

The compiler also **warns** when two holes stand with nothing static between
them (`{first} {last}`): that is composition, and composition is code (pass
`fullName`). It is a warning, not an error, because the result still renders.

## 4. What is not in the bundle

| Other engines do at runtime                        | pavlus                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------- |
| parse or hydrate a template                        | nothing: the module exports functions                               |
| build a virtual tree and diff it against the last  | `diff(prev, next)` is specialised code with guards per state root   |
| track dependencies with proxies or signals         | the dependencies are constants, written into `diff` at build time   |
| evaluate expressions in a sandbox                  | there are no expressions, only reads of paths                       |
| bind listeners per render                          | events are data; one stable listener per element and event type     |

The runtime that remains (`@pavlus/client/runtime`) is a handful of helpers the
generated code imports by name: `toText`, `joinClasses`, `setAttr`,
`diffKeyedList` and the like, each a small pure function.

## 5. Where to read next

- `framework/docs/architecture.md`, section 5, walks the compiler file by file,
  and section 6 the DOM plugin that applies the patches.
- `framework/client/src/compiler/__fixtures__/` and `__goldens__/`: every
  construct of the language and what it compiles to. Run `vitest -u` there
  after an intentional change of the output.
- [architecture.md](./architecture.md) here: where `render` and `diff` sit in
  the loop, and why painting is an effect like any other.
