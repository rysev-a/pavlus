---
summary: Real problems and their fixes. Template errors with the exact messages, the common mistakes (quotes, missing keys, mutation, handlers that return nothing), setup and deployment problems, how to debug with the logger and the compiler, and a list of frequent questions.
---
## How to read a problem

Problems in a pavlus application come from three places, and each shows itself in a different way.

- **A template does not compile.** The error comes at build time, from the Vite plugin, with the path of the file and a position: `(line 3, col 5)`. Lines and columns start at 1.
- **The application throws at run time.** The message starts with `pavlus:` (or `pavlus/dom:`, `pavlus/ssr:`, `pavlus/ws:`) and says what is wrong and, most of the time, what to do. It is in the browser console.
- **Nothing happens.** There is no message at all. These are the hardest, and most of this page is about them. The rule to remember: a message that nobody handles is not an error, it is an empty list of effects.

If you are lost, go through this list in order. It finds almost every "nothing happens".

1. Open the console. Is there a `pavlus:` error?
2. Is the message name right? Log every step (see "Debugging" below) and look for the message you expect.
3. Did the handler return the effect you expect?
4. Is the plugin for that effect registered in `createApp({ plugins })`?
5. Did the state change? In development, look at `pavlus.store.getState()`.
6. Does the template read that field? A node that does not read a field never changes when the field does.

## Template errors

The compiler stops at the first error. These are the real messages, produced by running the templates through `compileTemplate`. Vite shows them with the path of the file in front.

| You wrote | The message starts with | The fix |
| --- | --- | --- |
| A tab in the indentation | Tabs are not allowed | Indent with spaces. Two is the convention. |
| A line indented 4 under a parent and the next one 2 | Inconsistent indentation | Every level must use the same step. |
| `a(href=url` | Unclosed ( | Close the attribute list. |
| `p Hello {name` | Unclosed { | Close the expression, or write `\{` for a literal brace. |
| `p(title="abc) x` | Unterminated string | Close the quote. |
| `p {items.map(x => x)}` | Unexpected character "=" | No arrow functions. Compute the value in the handler. |
| `p {a = 1}` | Unexpected character "=" | An expression reads; it never assigns. |
| A template literal in braces | Unexpected character | No template literals. Use `"a " + b`. |
| `button(@click) Go` | "@click" needs an expression value | Write `@click=save`. |
| `button(@click=1+2) Go` | Event handler must be a message id | An event is a message id, optionally with arguments. |
| An `else` with no `if` above | else without matching if | Put `else` right after the `if` block, at the same indentation. |
| `+Row#r(a=1)` with no import | "Row" is not imported | Add the `import Row from "..."` line at the top. |
| An `import` below the first element | import lines must be at the top of the file | Move it. |
| `import row from "..."` | cannot be used as a component name | A component starts with a capital letter. |
| `+outlet(a=1)` | +outlet takes nothing after it | Write `+outlet` and nothing else. |
| A child under a text line (a line that starts with a pipe character) | This line cannot have children | Only elements have children. |
| `p {}` | Empty expression | Put something between the braces. |

And the exact text of each, for searching:

```text
Tabs are not allowed, use spaces (line 2, col 1)
Inconsistent indentation (line 3, col 1)
Unclosed ( (line 1, col 2)
Unclosed { (line 1, col 7)
Unterminated string (line 1, col 9)
Unexpected character "=" (line 1, col 16)
Unexpected character "`" (line 1, col 4)
"@click" needs an expression value (line 1, col 8)
Event handler must be a message id like `save` or `remove(item)` (line 1, col 8)
`else` without matching `if` (line 1, col 1)
"Row" is not imported. Add `import Row from "..."` or use +{Row} for a component that comes from the state (line 1, col 2)
`import` lines must be at the top of the file (line 2, col 1)
"row" cannot be used as a component name (start with a capital letter, not String/Array/Map/Set/Error) (line 1, col 1)
`+outlet` takes nothing after it (line 1, col 8)
This line cannot have children (line 2, col 1)
Empty expression (line 1, col 4)
```

Two templates that look wrong are accepted, and that is a mistake of the writer, not of the compiler: `if` with nothing after it and `for x todos` (no `in`) do not match the keywords, so each is read as an **element** called `if` or `for`. The page shows `<if>` in the DOM. If an element with such a name appears, check the line.

## Quotes decide what a value is

This is the most common first mistake. `href="url"` is the text `url`. `href=url` is the field `url` of the state. Both are valid, so the compiler cannot warn.

::demo quotes-text

::demo quotes-expression

The first demo has the link `href="url"`, a plain string, whatever the state is. The second reads the state: its HTML has the address, and when `url` changes it is one `attr` patch. If a link goes to `/url` or an attribute shows the name of a field, look for missing braces and unwanted quotes. Text in a template is the opposite: `p Hello, name` is the text `name`, and `p Hello, {name}` reads the field.

To show a brace as text, escape it:

::demo braces

## A `for` without a `key`

`key` is optional. Without it, the item's **index** is its identity. The page works, but removing an item from the start looks like a change of every item after it. Compare the patches of the same change, removing the first of three people.

::demo keyed

::demo unkeyed

With `key person.id` the patch is a single `remove` of the block of Ann. Without the key, the last block is removed, and the text of the two that remain is **rewritten** (`Bob` goes into the first block, `Eve` into the second). On text the result is the same. On anything that has a life of its own, it is not: an input that the visitor typed in, a focus, a scroll, a running CSS animation stays on its position in the list instead of moving with the item. Give a list a key whenever the items can be inserted, removed or reordered.

## Mutating the state

The compiled `diff` compares with `===`. If you change an array in place, the next state holds the same array, the comparison says "nothing changed", and nothing is patched. The store has the same rule: `store.set` of the same value records nothing.

::demo mutation

In the first step the array was changed with `push` and passed again. The patch list is empty, although the array has a third person. In the second step a new array is passed, and the diff inserts the item. In a handler, this means:

```ts
// wrong: the same array, the page does not change
state.items.push(todo);
return [store.set("items", state.items)];

// right: a new array
return [store.set("items", [...state.items, todo])];
```

The same applies to objects (`{ ...todo, done: true }`) and to the `.sort()` of an array (sort a copy). TypeScript helps if you declare the state with `readonly` fields and `ReadonlyArray`.

## Handler problems

**The handler returns something other than an array.** This one has a clear message:

```text
pavlus: handler "add" must return an array of effects
```

The usual cause is `return store.set("a", 1)` instead of `return [store.set("a", 1)]`. A handler that has nothing to do returns `[]`.

**The handler is not found.** This one has no message. A click on `@click=remvoe(todo.id)` sends the message `remvoe`, nobody handles it, and the result is an empty list of effects. Typos in the name, a handler that is `_private` (names that start with `_` and `#` members are never messages): all give silence. To catch it, log every step with the `onStep` option of `createApp`:

```ts
const app = createApp({
  app: shell,
  plugins,
  onStep: (message, effects) => {
    if (effects.length === 0) console.debug(`${message.id}: no effects`);
  },
});
```

Here is its output on a counter that handles `inc` and is sent `incc`:

```text
inc -> 1 effect(s)
incc -> 0 effect(s)  <- nobody handled it?
```

Some messages legitimately have no effects (a click that only matters in a parent), so read the list, don't treat each line as a bug.

**The id of a child message is wrong.** An event of a child that is embedded as `+Row#row` is sent as `row.select`. The parent handles it with a quoted method name: `"row.select"(msg) { ... }`. A handler named `select` in the parent never receives it. For a nested child the ids join: `grid.card.add`.

**`ctx.send` to a child that does not exist** throws: `pavlus: no child "nope" to send "x" to`.

**A class instead of an instance.** `createApp({ app: Todos })` is refused with `pavlus: Todos is a class: pass an instance (new Todos()), not the class`. A plain object is refused too: `pavlus: a component is a function or an instance of a class extending Component, got a plain object (defineComponent is gone: write a class that extends Component)`.

**`store.set` with a wrong path** does not fail. It creates the missing parents, so a typo (`"itemz"`) makes a new field, and the template that reads `items` does not change. Look at the state in the console, and at the history.

## Setup and plugin errors

These are thrown when the application starts or when an effect is performed. Each one names its fix.

```text
pavlus: no plugin "http" for effect "request"
pavlus: duplicate plugin "store"
pavlus: `mount` needs the dom plugin (new DomPlugin())
pavlus/dom: target "#nope" not found
pavlus: two children named "x" (routing "/x/:id"); give one a `name`
pavlus: +outlet needs a component with a `routing` table; mount the component, not only its view
pavlus/ws: no connection "chat"
pavlus: more than 10000 messages in one tick (message loop?)
```

- **no plugin** means that a handler returned an effect for a plugin that is not in the list. Register it, or you wrote the name of the plugin wrong.
- **target not found** means that the element for `mount` is not in `index.html`, or the script ran before it was there. Put the script at the end of `<body>`, or use `type="module"`, which is deferred.
- **two children named** is a routing table with two entries that end in the same segment. The page about [routing](page:concepts-routing) explains `name`.
- **+outlet needs a component** means that a view with an outlet was mounted without its component. Mount the component, not `component.view`.
- **message loop** means that handlers keep answering each other. A message from a plugin (a reply) handled by a handler that sends the request again is the usual case.
- **ws: no connection** means a `send` before the `onOpen` message, or after the socket closed.

### Types: `Cannot find module './page.pavlus'`

TypeScript does not know the `*.pavlus` files. The declaration is in the framework, and your project must include it. In `src/env.d.ts`:

```ts src/env.d.ts
/// <reference types="vite/client" />
/// <reference types="@pavlus/frontend/env" />
```

Without the `pavlus/env` line, every template import gives this error. A project with both lines compiles clean:

```text
src/app.ts(2,23): error TS2307: Cannot find module './about.pavlus' or its corresponding type declarations.
```

### `?raw` imports

Sometimes you want the **text** of a template, not the compiled module. The ui-kit does it for its Source tab: it shows the template, the logic and the styles of every page. Vite's `?raw` suffix gives the file as a string, and the pavlus plugin leaves `?raw`, `?url` and `?inline` imports alone:

```ts
import source from "./about.pavlus?raw";
import view from "./about.pavlus";
```

Run in a test, the first is the text, `section.about\n  h1 About\n  p A todo list`, and the second is the view with `render`, `diff` and `meta`. One thing goes wrong. The `pavlus/env` declaration covers `*.pavlus`, not `*.pavlus?raw`, so without `/// <reference types="vite/client" />` TypeScript says `Cannot find module './about.pavlus?raw'`.

For a whole folder, `import.meta.glob` with the options `{ query: "?raw", import: "default" }` returns a table of lazy loaders, one chunk per file, which is what the ui-kit's source plugin does.

## A 404 on a static host

Everything works on `npm run dev`, and on the published site a click on a link works but a reload gives "404 Not Found". Or the site is at `/pavlus/` and every page says "Page not found".

- **The reload gives a 404.** A static host looks for a file at that path. A single-page application has only `index.html`. Make the host answer every unknown path with `index.html`. On GitHub Pages, where you cannot change the rules, copy `index.html` to `404.html` at build time; the ui-kit does that with a tiny Vite plugin. The code is in [routing](page:concepts-routing).
- **"Page not found" under a prefix.** The router sees `/pavlus/button`, and no pattern matches it. Give the router plugin a `window` that hides the prefix (`windowAt(root)` in the ui-kit) and build the `href`s with it. Also set `base` in the Vite configuration, so that scripts and styles are requested from `/pavlus/assets/...` and not from `/assets/...`.
- **Images and icons 404.** In `index.html` use `%BASE_URL%favicon.svg`, and in code `import.meta.env.BASE_URL`.

## Debugging

### Log what happens

The logger plugin prints entries. It does not know what happened, so you ask for it. `withLogging(component, label)` asks for every message of one component, and it is the quickest way to see what the application does:

```ts
createApp({
  app: withLogging(shell, "shell"),
  plugins: [createStorePlugin(initialState), createLoggerPlugin(), new DomPlugin()],
  mount: "#app",
});
```

For a message `inc` with the payload 5, the logger gets this entry:

```json
["[counter] inc -> 1 effect(s)", { "payload": 5, "effects": ["store.set"] }]
```

The entry is a `debug` level entry. Some browsers hide `debug` messages by default (in Chrome, switch the console to the Verbose level to see them). The wrapper adds an effect, so the logger plugin must be registered, or the core throws `no plugin "logger"`.

### Poke at the application in development

The ui-kit exposes the application and the store, in development only:

```ts
if (import.meta.env?.DEV) {
  (globalThis as Record<string, unknown>).pavlus = { app, store };
}
```

In the console you can then send a message, read the state, and go back in time, because the store records every change with the effect that undoes it:

```text
pavlus.app.dispatch({ id: "header.toggleSidebar" })
pavlus.store.getState().sidebar
pavlus.store.history.length
pavlus.store.history.at(-1)
```

`store.undo()` and `store.restoreTo(timestamp)` are effects, so you apply them like any other: from a handler, or through the dev tools.

### Look at the compiler's output

A template is two pure functions, and you can call them yourself. `compileToView` from `@pavlus/frontend/compiler` compiles a string and gives you `render` and `diff`, without Vite:

```ts
import { compileToView } from "@pavlus/frontend/compiler";

const view = compileToView("p Hello, {name}");
console.log(JSON.stringify(view.render({ name: "Ann" })));
console.log(JSON.stringify(view.diff({ name: "Ann" }, { name: "Bob" })));
```

The first line prints the **vnodes**, the second the **patches**:

```json
[{"t":"el","tag":"p","attrs":{},"events":{},"children":[{"t":"text","id":"1","text":"Hello, Ann"}]}]
[{"op":"text","id":"1","text":"Hello, Bob"}]
```

The vnodes show the real attributes and the events as data (`events.click` is the message that the click will send). The patches show what would change in the DOM. If a patch list is empty when you expected a change, either the state is the same object (a mutation) or the node does not read that field. The demos on these pages show the same data, and each demo can unfold the AST: the line `reads: people` under a node says which fields can change it.

Compiled templates are readable JavaScript, in development as well as in the bundle. Open a `.pavlus` module in the Sources panel of DevTools (the file is called like `todos.pavlus?import`). The comments `// line 12: <li> (reads: user, selectedId)` say which line of the template a block comes from and what it depends on. There is deliberately no source map: DevTools shows the generated code, which is what runs.

### Test the page, not only the handler

When a bug is in the template, test it with `mountView` from `@pavlus/frontend/testing`, which mounts a view in jsdom without the core. This is a test for a counter template:

```ts
const h = mountView(view, { count: 0 });
h.set({ count: 1 });
expect(h.root.textContent).toContain("1");
(h.root.querySelector("button") as HTMLElement).click();
expect(h.messages[0]).toMatchObject({ id: "inc", event: { type: "click" } });
h.unmount();
```

## Questions and answers

- **Can I use an arrow function or a template literal in a template?** No, both are compile errors. The expression language is a small pure subset of JavaScript: paths (null safe), literals, operators, the conditional operator, array literals, index access (`items[0]`) and calls. A call of a method of a value works: `{name.toUpperCase()}` shows `ANN` for `ann`. Calls are null safe too, and that hides typos: `{fmt(name)}` calls the state field `fmt`, and when there is no such field it shows an empty text and no error. Anything longer than a short expression belongs in the handler: compute it there and keep the result in the state.
- **How do I show a filtered or sorted list?** Compute it in the handler, store it with `store.set`, and loop over the stored list. The [guide](page:guide-todo-app) does this for a filter.
- **Where do I put async code?** Nowhere in a handler. A handler returns effects, and a plugin does the asynchronous work and answers with a message. For a request use `http.request`, for a timer `time.setTimeout`.
- **How do I read what the user typed?** `msg.event?.value` for `@input`, `msg.event?.checked` for the `@change` of a checkbox, and `msg.event?.key` for keyboard events. The input keeps what the user typed; `value=field` only seeds it and follows later changes of the field.
- **Why does my page show an empty value instead of an error when a field is missing?** Paths in templates are null safe. `{user.name}` is an empty text when `user` is `null`. Handlers are plain TypeScript and are not null safe: use `?.` there.
- **How do I get the time or a random number?** Ask a plugin. `time.now("stamped")` replies with the time as a message; a random plugin is a few lines, and [writing your own plugin](page:plugins-custom) reads one.
- **How do I run something when the app starts?** Handle `mounted` in the root component (it is sent when the application is in the DOM), or pass `init: { id: "start" }` to `createApp`. In a routed page, handle `enter`.
- **How do I stop a timer when I leave a page?** Handle `leave` and return `time.cancel(id)`.
- **Can two components have a message with the same name?** Yes. Children are namespaced: a child's `select` is `row.select` for its parent. Two siblings with the same instance name are not allowed.
- **How do I name a handler `users.remove`?** With a quoted method name: `"users.remove"(msg: Message) { ... }`.
- **Can a component keep data in a class field?** Not data that changes. The instance is shared by every message, so it must be free of mutable state. Keep data in the store.
- **Can I draw with SVG?** Not as elements. The DOM plugin creates elements without an XML namespace, so an `svg` tag would not be drawn. The ui-kit uses CSS masks for icons and boxes, gradients and emoji for drawings.
- **Can I use pavlus without Vite?** The compiler is a plain function: `compileTemplate(source)` returns the text of an ES module. The Vite plugin is the integration that exists, and everything on these pages assumes it.
- **Why is my first render empty?** Because `route` is `null` until the router plugin reports. Mount first, then `mounted` starts `router.listen`. If you use your own `mounted`, it has to return `router.listen("routeChanged")` too.
- **Does the server render work with every plugin?** No. Give the server stand-ins for the plugins of the browser; see [server-side rendering](page:concepts-ssr).

## What you learned

- A template error carries a line and a column. A runtime error starts with `pavlus:` and names its fix. A silent failure is almost always a message nobody handles or an effect nobody performed.
- Quotes make text, no quotes make a field. A list that changes needs a `key`. State is never mutated.
- `onStep`, `withLogging`, `compileToView` and the dev console show the messages, the effects, the vnodes and the patches.
- A static host needs an `index.html` fallback, and a site under a prefix needs a router window that hides it.

You have reached the end of the Docs. The [overview](page:overview) lists every page, and the [compiler playground](page:compiler-playground) lets you try a template of your own.
