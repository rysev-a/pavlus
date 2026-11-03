---
summary: Connect clicks, typing and form submits to your code. Learn the @event=message(args) syntax, payloads, the prevent and stop modifiers, how a message gets its id, and what the compiled template really holds.
---
## Events are data

A page that only shows values is a document. To make it interactive, the template must say "when the user does this, tell the application". In pavlus, this is done with an **event binding**, and the thing that is sent is not a function. It is a *message*: a small piece of plain data with an id and an optional payload.

An event binding is an attribute whose name starts with `@`. The part after the `@` is the DOM event (`click`, `input`, `submit`, `keydown`, ...). The value is the id of the message to send.

::demo click open=vnodes

Look at the vnodes: the button element in the `render` result holds `events: { click: { id: "save" } }`. There is no function in it. The template does not know what `save` does. It only says which message the click means. Your application has a handler for `save` and decides what to change in the state.

This design has a reason. A virtual node that is only data can be compared, logged, recorded and replayed. The template stays a pure function of the state, and all the logic stays in one place, in the components, where it is easy to test.

## Sending a value with the message

Most events need to say *which* thing was clicked. The binding can look like a call with **arguments**. The arguments are ordinary [expressions](page:syntax-expressions), evaluated on the state when the template is rendered. The result travels with the message as its **payload**.

::demo payload open=vnodes

The Remove button carries `{ id: "remove", payload: 1 }`: the value of `item.id` at render time. When the user clicks, the handler for `remove` receives that payload and knows which item to delete.

Look at the first step. When `item.id` changes from 1 to 2, `diff` returns a patch with the operation `handler`:

```text
{"op":"handler","id":"3","event":"click","msg":{"id":"remove","payload":2}}
```

The listener is already on the real DOM element. The patch only replaces the message that the listener will send. In the second step the title changes, the payload does not, and the only patch is the text one.

### Several arguments

With one argument, the payload is that value. With two or more, the payload is an **array** of them, in order.

::demo several-args

The payload here is `[5, "up", 1]`. With no arguments, or with empty parentheses, there is no payload at all, so `@click=save` and `@click=save()` are the same.

::demo empty-parens

> [!NOTE] One value or an array
> The shape of the payload depends on how many arguments you wrote: one argument gives that value, two or more give an array. If you plan to add a second argument later, remember that the handler has to change from `msg.payload` to `msg.payload[0]`. Many authors send a single value, or a single object built in the state, for this reason.

## What may be written as the handler

The part before the parentheses is a **message id**. It is a name, or names joined by dots:

::demo dotted

Here the id is `users.open`. A dotted id is useful to group messages, and it is what makes the prefix of components work (see below).

The compiler accepts only a name, or a chain of names, optionally followed by a call. Anything else is an error:

```pavlus-invalid
button(@click=ready ? start : stop) Go
```

This one fails in the attribute parser: `Unexpected "?" in attributes (line 1, col 21)`, because a bare value ends at the first space. Wrapped in braces it reaches the next check, with this message:

```pavlus-invalid
button(@click={ready ? start : stop}) Go
```

```text
Event handler must be a message id like `save` or `remove(item)` (line 1, col 8)
```

The same message is shown for `@click=items[0]` and for a call of a call, `a.b(1)(2)`. A binding with no value at all, `button(@click)`, says `"@click" needs an expression value`.

## Modifiers: prevent and stop

The browser does some things by itself. A click on a link follows the link. A submit on a form reloads the page. A click also bubbles up to the parents of the element, and their handlers run too. Often you want to turn that off.

You can do that with **modifiers**, written after the event name, separated by dots:

| Modifier | What it does |
| --- | --- |
| `.prevent` | calls `preventDefault()` on the DOM event: the link is not followed, the form is not submitted |
| `.stop` | calls `stopPropagation()`: the parents' listeners do not see the event |

They can be combined, in any order: `@click.prevent.stop=openHelp`.

::demo modifiers open=vnodes

Look at the vnodes. The modifiers are not part of the event name. They are two flags on the message, `prevent: true` and `stop: true`. The DOM plugin reads them when the event happens, calls the DOM method, and only then sends the message. So the page stays pure data here too.

A modifier that the compiler does not know is silently ignored: `@click.foo=save` is the same as `@click=save`. Check the spelling of `.prevent` when a form still reloads the page.

> [!WARNING] Several bindings for the same event
> One element can have many different events (`@input`, `@keydown`, `@focus`), but only one binding per event name. If you write `@click` twice on the same element, the last one wins and the first is dropped without an error.

::demo many-events

## What the handler receives

When the user clicks, the DOM plugin sends your application a message object with three fields:

| Field | Value |
| --- | --- |
| `id` | the message id, with the prefix of the embedded components in front of it |
| `payload` | the payload from the template, or `undefined` |
| `event` | a small snapshot of the DOM event |

The snapshot, `msg.event`, is the only place where the browser leaks into your logic, and it is deliberately small: `type` (the event name), `value` (the `value` of the element, when it is a string), `checked` (for checkboxes) and `key` (for keyboard events). This is enough for forms.

A component is a class. **Each method is a handler for the message with the same name.** A handler is pure: it receives the message and the current state, and returns a list of effects, for example "set this path in the store".

```ts todo.ts
import {
  Component,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import view from "./todo.pavlus";

interface State {
  text: string;
  tasks: { id: number; title: string }[];
}

class Todo extends Component<State> {
  view = view;

  setText(msg: Message) {
    return [store.set("text", msg.event?.value ?? "")];
  }

  remove(msg: Message, state: State) {
    return [
      store.set(
        "tasks",
        state.tasks.filter((t) => t.id !== msg.payload),
      ),
    ];
  }
}
```

The template of this component has `input(value=text @input=setText)` and `button(@click=remove(task.id))`. The names match the method names. A message with no method is not an error: nothing happens and no effects are returned. This makes a typo in a message id quiet, so test your page by clicking it.

The state shown in the input is only a seed. The browser keeps what the user typed. The `@input` handler copies it to the state, and the state keeps the rest of the application up to date.

## Events in loops

Events inside a `for` loop are the most common case. The payload is what tells the handler which item was clicked.

::demo in-loop open=vnodes

Each task has its own pair of buttons, and the payload of each is the `id` of its task: 10 for the first and 20 for the second. There is one handler for `toggle`, not one function per row, and it works for any number of rows. The `.stop` on the second button keeps the click from reaching the list item, if the item had a handler of its own.

Why is it `task.id` and not the position of the task in the list? When the list changes, positions change, but ids do not. A message that carries the id always means the same task. Also see the [next page](page:syntax-control-flow) about `key`.

## Where the message id gets its prefix

When a template is embedded in another with `+Name#instance`, the embedded template is a separate file with its own messages: it says `@click=pick(id)` and does not know who will use it. The parent gives each embedded instance a **name**, and the compiler puts that name, and a dot, in front of every message id that comes out of it.

::demo with-component open=vnodes

The `Row` template sends `pick`. The two instances are named `first` and `second`, so the messages are `first.pick` and `second.pick`. The `Reset` button belongs to the parent and has no prefix. The generated module shows how it works:

```ts
ulChildren.push(...Row.render(
  { "id": 1, "label": "One" },
  idSuffix + "/1",
  messagePrefix + "first.",
  childEnv(env, "first", state),
));
```

Every compiled view has a parameter `messagePrefix`. A top-level view gets an empty one. An embed passes `messagePrefix + "first."`, and each event is written as `id: messagePrefix + "pick"`. If `Row` embedded something itself, the prefix would grow by one more name: `first.cell.pick`. The child needs no knowledge of its parents, so the same template can be placed anywhere.

If you do not write `#name`, the name is the imported name with a lower-case first letter:

::demo default-name

The first embed sends `userCard.open`, the second, with `#admin`, sends `admin.open`. Use an explicit name for any template that you embed more than once, so that the messages of the instances can be told apart.

On the application side, the prefix is what is used to send messages down to the right child component, and to give the parent a way to watch the messages of its children by a handler with a quoted name, such as `"first.pick"(msg) { ... }`. This is described in [components](page:concepts-components) and [messages](page:concepts-messages).

## What stays the same, and what changes

Compare two things you saw in this page. A binding without arguments (`@click=save`) has no `id` on its element in the vnode, because nothing about it can ever change, so `diff` never needs to find it.

::demo static-event

When `busy` changes, only the class patch is produced. The event binding is not looked at. A binding with arguments is different: the compiler remembers the element's id and, when `diff` finds a different payload, it emits one `handler` patch. A node whose bindings, attributes and text can not change costs nothing at update time.

## Putting it together

A small list with an input, using what you saw. The template is the following, and you can try the same shape in the [playground](page:compiler-playground):

```pavlus
section.todo
  form(@submit.prevent=add)
    input(type="text" placeholder="New task" value=text @input=setText)
    button(type="submit") Add
  ul
    for task in tasks key task.id
      li(class:done=task.done)
        input(type="checkbox" checked={task.done} @change=toggle(task.id))
        span {task.title}
        button(type="button" @click.stop=remove(task.id)) x
```

Read the events from the top:

- `@submit.prevent=add` stops the browser from reloading the page, then sends `add`. The handler reads the text from the state, because `@input=setText` has been copying it there with every key.
- `@input=setText` sends `setText` with `msg.event.value`.
- `@change=toggle(task.id)` sends `toggle` with the id of the task. The handler can read `msg.event.checked` too.
- `@click.stop=remove(task.id)` sends `remove` with the id and stops the click from bubbling.

There are four message ids and three payloads, and not one function in the template.

## What you learned

- `@event=name(args)` sends a message, not a function. One argument is the payload, several arguments make an array, none gives no payload.
- `.prevent` and `.stop` are flags on the message; the DOM plugin applies them, then sends the message.
- A handler is a component method named after the message id; it receives `msg.id`, `msg.payload` and a small `msg.event` (`type`, `value`, `checked`, `key`).
- An embedded template sends its messages with the instance name as a prefix: `first.pick`.
- When a payload changes, `diff` returns a `handler` patch; a binding without arguments is never patched.

Next: [conditions and loops](page:syntax-control-flow).
