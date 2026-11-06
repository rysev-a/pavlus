---
summary: Split a page into templates and put them together with import and +Name. Learn props, instance names and message prefixes, dynamic embeds with +{expr}, children that render nothing, and the +outlet line for routed pages.
---
## One template, many files

A page grows. A header, a card, a table row and a form field all want to be written once and used in many places. In pavlus every `.pavlus` file is a template, and one template can **embed** another. The embedded template is called a *child view* (or just a child), and the one that embeds it is its parent.

Embedding takes two steps: you **import** the child at the top of the file, and you **use** it with a line that starts with a plus sign.

::demo badge

The first line, `import Badge from "./badge.pavlus"`, brings the child in under the local name `Badge`. The line `+Badge#status(label=text)` renders it at that place. `label=text` passes a **prop**: inside `badge.pavlus` (here: `span.badge {label}`) the state has a field `label`, and its value is the `text` of the parent.

The child sees nothing else. It does not know the state of its parent, only the props it was given. This is what makes a child reusable: its inputs are listed at the place where it is used.

Look at the step: when `text` changes, one `text` patch comes out, with the id `1/2`. The child's own node ids get a suffix (`/2`) from the line that embeds it, so that two instances of one child never produce the same id.

## The import line

```pavlus
import Card from "./card.pavlus"
import UserList from "../users/view.pavlus"

section
  +Card#intro(title="Welcome")
```

All `import` lines go first, before any element, at column 0. The name must start with a capital letter. These are the errors the parser reports:

```text
"card" cannot be used as a component name (start with a capital letter, not String/Array/Map/Set/Error) (line 1, col 1)
"Card" is imported twice (line 2, col 1)
`import` lines must be at the top of the file (line 2, col 1)
```

The capital letter is how the template tells a component from a tag: `+Card` can only be an imported component. `String`, `Array`, `Map`, `Set` and `Error` are refused because the generated code uses them itself.

The path is written as it will be resolved by your bundler. The compiler copies the line into the generated module as a normal ES import (`import Badge from "./badge.pavlus";`, open the module of the demo above to see it), and the Vite plugin compiles the imported file in the same way. A child is a module with a `render` and a `diff`, as every template is.

If you use a name that is not imported, you get a message that says what to do:

```text
"Card" is not imported. Add `import Card from "..."` or use +{Card} for a component that comes from the state (line 2, col 4)
```

## The embed line: +Name#id(props)

The whole syntax of an embed is:

```text
+Name#instance(prop=value other="text {x}" flag ...spread)
```

- `Name` is the imported name.
- `#instance` is the **instance name**. It is optional for a static embed. Without it the name is the imported name with a lower-case first letter: `+UserCard` is `userCard`.
- The parentheses with props are optional.
- Nothing else may follow on the line, and an embed cannot have child lines. Text after it gives `Unexpected "x" after component`, and an indented line below it gives `This line cannot have children`.

The instance name does three jobs. It prefixes the **messages** of the child (see below). It is the key of the child in the `children` table of the logic (see the end of the page). And it is what the compiler lists in the `meta.embeds` of the module.

## Props

A prop is written in the same way as an attribute, and has the same value forms. The difference is what happens to it: it is not put in the HTML, it becomes a field of the child's state.

::demo props

Read the three embeds:

| Value | Example | What the child gets |
| --- | --- | --- |
| quoted text | `kind="static"` | the string |
| text with holes | `kind="user {user.id}"` | a string, with `toText` for each hole |
| an expression | `label=user.name`, `count=items.length` | the value itself, with its type kept |
| a bare name | `active` | `true` |
| a spread | `...user` | every field of the object |

The **type is kept** for an expression: `count=items.length` gives the child a number, and `label=user.items` would give it the array itself, not a text. A string with holes and other text is always a string. A quoted prop that is only one hole, `kind="{x}"`, is the same as `kind=x`: the type is kept.

Props are written in order, and a later one wins: in the third embed `...user` brings `label` ("From spread") and `count=0` replaces a `count` that the spread might have had. A prop that is not given is `undefined`, which is why the title of the third chip starts with `: `: `kind` is missing, and `toText(undefined)` is empty.

Prop names must be plain identifiers. A name like `data-x` is an error: `"data-x" is not a valid prop name`. And a spread is allowed only in a component (`+Name(...x)`); on an element it is `` `...spread` is only allowed in component props ``.

## When does the child update?

Every embed gets its own guard in the parent's `diff`. The generated code for an embed with two props:

```ts
if (prev.noteTitle !== next.noteTitle || prev.noteBody !== next.noteBody) {
  patches.push(...Card.diff(
    { "title": prev.noteTitle, "body": prev.noteBody },
    { "title": next.noteTitle, "body": next.noteBody },
    idSuffix + "/2",
    messagePrefix + "note.",
    childEnv(env, "note", next),
  ));
}
```

The parent builds the old props and the new props from its two states, and calls the child's own `diff` with them. If none of the names read by the props changed, the child is not called at all.

::demo child-diff

In the first step the body changes and the card's `diff` returns one `text` patch. In the second step only the heading changes, and the card is not looked at. A child is as cheap as a part of the parent template.

## Messages from a child

A child's events are sent with the instance name as a prefix. This was explained on [the events page](page:syntax-events): the `reset` button of a counter becomes `apples.reset` or `pears.reset`, according to the instance.

::demo two-instances

Two instances of the same `Counter` have two names, so the application can tell them apart. In the step, `pears` changes. The `value` prop changes, so the text patch comes out, and so does a `handler` patch, because the payload of `reset(value)` has changed too. The id in that patch is already `pears.reset`:

```text
{"op":"handler","id":"5/1","event":"click","msg":{"id":"pears.reset","payload":6}}
```

The prefix grows with every level: a child of a child gives `apples.cell.reset`. Identity inside a loop is a different thing. The instance name is fixed in the template and can not depend on the item, so inside a loop you tell the instances apart with the payload:

::demo in-loop

Every row sends the message `row.toggle`, with the id of its task as the payload. The handler `"row.toggle"` of the parent gets that id. Notice the id of the class patch, `0#2/2`: the node of the row (`0`), the key of the item (`#2`) and the embed (`/2`) all appear in it.

## Embeds inside if and for

An embed is a node like any other. It can be inside `if`, `else`, `for` or another element. Its position is decided by the lines around it.

::demo in-if

When `open` becomes true, the panel is rendered from scratch and inserted. When it goes back to false, it is cleared. The child's state does not stay in the DOM: next time, it is rendered again from the props.

## A child that renders nothing

A child template is a normal template, so it may have nothing to show, for example because its only node is an `if` that is false. That is allowed. The parent keeps a place for it, and the other lines of the parent are not moved.

::demo empty-child

Follow the steps. At the start there is no notice in the page, and `After the notice` is in the right place. When `message` becomes `Saved`, the child's `if` inserts a `p` at the place of the child (note the marker ids, which end in `/2`). When the message changes, only the text changes. When it goes empty, the notice is cleared. The parent did nothing special: all the work is in the child's own `diff`.

## Dynamic embeds: +{expr}

Sometimes the child is not known when you write the template: a tab bar that shows a different view per tab, a widget chosen by the user. You cannot import something that comes from the state, so pavlus has a second form, where the child is the **value of an expression**:

```pavlus
div.tabs
  +{tab.component}#content(...tab.state)
```

The expression gives a view, or a component that has a `view`. A dynamic embed *must* have an instance name (`#content`), because there is no imported name to take one from: `+{tab}(x=1)` is an error, `A dynamic component needs an instance name: +{expr}#name(...)`.

What the page does when the value changes:

- the value is **the same view**: its own `diff` runs, as for a static embed;
- the value is **another view**: the old content is cleared between the two markers and the new view is rendered from scratch. The two templates are never compared with each other;
- the value is `null` or `undefined`: the embed renders nothing.

::demo dynamic-empty

The last case is the child that is not there. The `h2` and the `p` are in place, and nothing is between them. If the value is something that is not a view (a number, for example), `render` throws `pavlus: +{...} needs a view or a component with a view`.

> [!NOTE] Views in the state
> A view is a function-bearing object, not JSON. The store keeps it as it is, but a tool that saves or prints the state will not show it. When you need a state that you can serialize, keep a name in the state (`tab: "users"`) and choose with `if` and `else if`, both branches imported. The `+{expr}` form is for the cases where the set of children is open.

## +outlet: the page selected by the route

A single-page application has a shell (a header, a menu) and, in the middle, the page that the address selects. The shell needs a place for "the page". That is `+outlet`.

```pavlus
header.shell
  nav
    a(href="/") Home
    a(href="/about") About
main.page
  +outlet
```

`+outlet` takes nothing after it: a line such as `+outlet x` is an error. It renders the **routed child** of the component that owns the template. Which child that is comes from the `routing` table of the component:

```ts shell.ts
class AppShell extends Component<AppState> {
  view = view;
  routing: Routing<AppState> = {
    "/": { component: dashboard, key: "dashboard", name: "dashboard" },
    "/about": { view: aboutView },
    "*": { view: notFoundView },
  };
}
```

An outlet behaves like a dynamic embed. When the route changes to another page, the old page is cleared between the markers and the new one is rendered. When the route stays on the same page, only that page's `diff` runs. Its messages get the instance name as a prefix, as for any child: a page registered as `dashboard` sends `dashboard.something`. If no entry matches the address and there is no `"*"` entry, the outlet is empty, like a null child.

Because the route is not a field that the template can see, the compiler can not list the names an outlet reads. The nodes around it are checked on every change of state, and the pages inside still skip what did not change. This is why the `diff` code of a template with an outlet says `reads: the route and the routed child`.

The outlet needs a component, not only a template. If you mount just the view, `render` throws this error:

```text
pavlus: +outlet needs a component with a `routing` table; mount the component, not only its view
```

For that reason the demos of this page do not render an outlet. [Routing](page:concepts-routing) describes the whole mechanism.

## The logic side of a child

Everything above is about templates. A child template can also have a component with its own handlers. The parent declares it in the `children` table of its component, with the same name that the template gave to the instance:

```ts dashboard.ts
class Dashboard extends Component<DashboardState> {
  view = dashboardView;
  children: Children<DashboardState> = {
    users: {
      component: usersList,
      key: "users",
      props: (s) => ({ filter: s.filter }),
    },
  };
}
```

and the template says `+UsersList#users(...users filter=filter)`. The rule to remember is: `users` in the template, `users` in `children`, `users` in the state. A message `users.select` goes to the `select` handler of `usersList`, with the prefix removed. [Components](page:concepts-components) has the full story.

## Putting it together

A parent that uses a keyed loop, a condition and two kinds of child. The `Row` and `Panel` templates are the ones of the demos above.

```pavlus
import Row from "./row.pavlus"
import Panel from "./panel.pavlus"

section.tasks
  h3 Tasks ({tasks.length})
  ul
    for task in tasks key task.id
      +Row#row(id=task.id title=task.title done=task.done)
  if selected
    +Panel#details(title=selected.title)
  else
    p.muted Select a task
```

Every `row` message carries the id of its task, and every `details` message goes to the panel's logic. The parent template does not contain a single event handler of its own. It only decides which children exist and what each receives.

## What you learned

- `import Name from "./file.pavlus"` at the top, `+Name#id(props)` where the child goes; the child sees only its props.
- Props are quoted text, text with holes, expressions (keeping their type), bare flags or `...spread`; a later prop wins.
- The instance name prefixes the child's messages (`pears.reset`) and ties the child to the `children` of its component.
- `+{expr}#id` renders a view that is a value; a `null` value, an empty template and an unmatched outlet all render nothing.
- `+outlet` renders the routed child of the component that owns the template.

Next: [syntax reference](page:syntax-reference).
