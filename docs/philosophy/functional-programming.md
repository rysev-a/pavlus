# Functional programming: pure functions, composition, cheap tests

pavlus is not functional for the sake of a style. It is functional because every
part of the architecture is a function from data to data, and that is what makes
the parts composable and the tests fast. This document names the functions and
shows the tests they allow.

## 1. Everything is a function of its inputs

| Piece          | Signature                                   | Inputs it may read              |
| -------------- | ------------------------------------------- | ------------------------------- |
| a handler      | `(message, state) → Effect[]`               | the message, the state          |
| a view         | `render(state) → VNode[]`, `diff(prev, next) → Patch[]` | the state           |
| a view model   | `(state fields) → fields the template reads` | what it is given               |
| a store change | `(state, change) → state`                   | the state, the change           |
| a plugin       | `handle(effect, ctx)`: the one impure kind   | the effect, the world           |

The first four are pure and deterministic: the same inputs, the same output, no
clock, no randomness, no I/O. The fifth is where impurity lives, behind a
contract ([plugins.md](./plugins.md)). This table is the whole discipline.

## 2. Data in, data out

Messages, effects, vnodes, patches and the state are plain objects. Nothing in
the loop is a closure or a class instance that a log could not show. That is
why:

- the debug panel can show every step with its payload and timing;
- the store can keep a history and **time-travel**: every recorded change
  stores its inverse effect, so undo and "go back to this moment" need no
  snapshots;
- a server can render a view with the same `render` and a client can revive the
  state it serialized (`serializeState`, `reviveState`);
- a test can compare effects with `toEqual` and never has to spy on anything.

## 3. Immutability, and why `===` is enough

The store never mutates. `store.set("users.3.name", v)` builds a new state that
shares every untouched branch with the old one (structural sharing). This is
not a style preference: the generated `diff` compares state roots with `===`,
so an unchanged branch is skipped at the cost of one comparison, and a changed
one is found without walking anything. Mutating the state in place would make
`diff` miss updates. Purity and performance are the same decision here.

## 4. View models: logic has one home

The template language is deliberately tiny (a hole is a literal or a path;
[template-engine.md](./template-engine.md), section 3). Whatever needs
computing is computed in code, as a pure function of the state, and the result
is stored where the template reads it. The repository has three shapes of this:

**A view-model function** for a block of related fields:

```ts
/** Pure: everything the bar reads, from the fields it depends on. */
export function barOf(s: BarInputs): Bar {
  const onFlow = s.tab === "flow";
  const appPanelOn = s.panelOpen && s.target === "app";
  return {
    flowHref: `/projects/${s.projectId}/flow`,
    onFlow,
    flowCurrent: onFlow ? "page" : "false",
    saveBusy: s.save === "saving",
    appPanelOn,
    appPanelPressed: appPanelOn ? "true" : "false",
    isDark: s.look.mode === "dark",
    ...
  };
}
```

and one place that keeps it in step: every handler that changes an input writes
through `_write(state, changes)`, which emits the writes and `store.set("bar",
barOf(next))`. The template says `class:vd-tab--on={bar.onFlow}` and nothing
more.

**Flags next to the value they are derived from:**

```ts
export const statusFlags = (status, items) => ({
  status,
  loading: status === "loading",
  failed: status === "failed",
  ready: status === "ready",
  empty: status === "ready" && items.length === 0,
});
```

**A row mapper** for lists: `itemsOf(rows, asking)` turns server rows into what
each `<li>` reads, including `flowHref`, `when` ("5 min ago") and
`deleteLabel`.

In each case the computation is a function you can call in a test with a
literal and compare with a literal. The template, which cannot be unit-tested
as cheaply, has nothing left to get wrong.

## 5. Composition: functions of functions

Because a component normalizes to `(message, state) → Effect[]` (`toHandler`),
components compose like functions:

| Combinator                         | Does                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `compose(a, b)`                    | runs both on the same message, concatenates the effects                    |
| `mapMessage(inner, f)`             | transforms messages on the way in                                          |
| `mapEffects(inner, f)`             | transforms effects on the way out                                          |
| `namespace(prefix, child, opts)`   | a child under a prefix: messages in, reply ids and store paths out, its own state slice |
| `withLogging(inner, label)`        | a `logger` effect before the effects                                       |
| `paintOnWrite(inner)`              | every store write without a reply answers `paint`                          |

`paintOnWrite` is a few lines: `mapEffects` over the inner component, adding
`onSuccess: "paint"` to store effects that have none. `children` and `routing`
are `namespace` applied for you. There is no plugin API for "middleware"
because a function that takes a handler and returns a handler is already one.

Views compose the same way: `+Child#name(props)` in a template calls the child's
`render` and `diff` with the props as its state; the generated code passes an
`idSuffix` so node ids stay unique and a `messagePrefix` so the child's events
carry its name.

## 6. Tests: fast because nothing has to be faked

Three kinds of tests cover almost everything, and none of them needs a browser.

**A handler test.** Call the method with a message and a state; read the
effects. From `applications/diagram-programming/tests/app.test.ts`:

```ts
const e = routeTo(base, "/projects/4/flow");
expect(sets(e, "flowStudio")).toHaveLength(1);      // the editor was reset
expect(sets(e, "openId")).toEqual([4]);
expect(e.some((x) => x.plugin === "http")).toBe(true);  // and the project was asked for
```

`sets(effects, path)` is a short helper that picks the `store.set` values
for a path. There is no mock server: the handler returned a request, the test
reads the request.

**A view-model test.** A pure function with a literal in and a literal out:

```ts
expect(itemsOf(rows, 3, now)[0]).toEqual({
  id: 3, name: "A", when: "1 min ago",
  flowHref: "/projects/3/flow", uiHref: "/projects/3/interface",
  asking: true, deleteLabel: "Delete A",
});
```

**A view test**, when the DOM matters. `mountView(view, state)` from
`@pavlus/client/testing` mounts a compiled view in jsdom; `set(next)` runs
`diff` and applies the patches; `messages` records what the DOM plugin
dispatched when the test clicked something. The compiler's own goldens go one
step further and pin the generated code itself.

Plugins are tested on their own, with a fake context, as shown in
[plugins.md](./plugins.md), section 7.

What this looks like in numbers, on a laptop:

| Suite                        | Tests | Time   |
| ---------------------------- | ----- | ------ |
| `@pavlus/client`             | 580   | ~3 s   |
| `@pavlus/ui-kit`             | ~870  | ~5 s   |
| `diagram-programming`        | 49    | ~1 s   |

Most of that time is spawning workers. The tests themselves are function calls.

## 7. The habits, in one list

- A handler returns effects; it never calls anything that has an effect.
- Compute in code, store the result, let the template read it.
- Never mutate the state; the store does the copying, `diff` trusts identity.
- Compose with functions (`compose`, `mapEffects`, `namespace`), not with hooks
  or plugins of the framework.
- Test by calling the function. If a test needs a mock, ask whether the code
  under test should have been a plugin.

## 8. Where to read next

- [framework/docs/philosophy.md](../../framework/docs/philosophy.md): the
  template contract this style supports.
- `framework/client/src/component/mod.ts`: `toHandler`, the combinators and
  `namespace`, each a short function.
- `framework/client/src/testing/mod.ts`: `mountView`.
