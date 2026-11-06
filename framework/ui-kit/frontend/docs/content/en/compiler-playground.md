---
summary: An editable playground that runs the real compiler in your browser. Change a template and a state, and see the HTML, the generated module and what each node reads. Seven experiments show you what to change and what to look for.
---
## Try it

Below are two text boxes: a template on the left and a state, written as JSON, on the right. The button **Compile and run** sends both to the real compiler, in your browser, and shows the result under the boxes. Nothing is sent to a server. **Reset** brings back the example you started with.

::playground

The first time, press **Compile and run** without changing anything. The starting example has a heading, a sentence with a condition inside the text, a keyed list with a class toggle, and an `if` with an `else`. Then read on to learn what the output sections mean, and try the experiments below.

## What you see after Compile and run

The output has the same sections as the demos in the other pages of this section:

- **Template** and **State**: what you compiled and the JSON that was parsed.
- **Result (HTML of render(state))**: the HTML that `render` returned for your state. Markers are not shown here.
- **Generated module**: the full text of the module that `compileTemplate` returned, open by default.
- **AST and what each node reads**: one line per node, with the root names of the state it depends on. This is the dependency set that the guards of `diff` are made from. It is open by default.
- **The vnodes render(state) returns**: the raw data, folded. Open it to see the ids and the markers.

If the template has an error, you see **The compiler stopped:** and the message, with the file name `playground.pavlus` and the line and column. If the state is not valid JSON, you see **The state is not valid JSON:** and the parser's message.

> [!NOTE] What the playground cannot do
> It runs `render` once, for the state you give it. It has no second state, so there is no patch list here: to see patches, use the demos in the pages before this one, or call `diff` in a test as shown in [the tooling page](page:compiler-tooling). You can still read the `diff` function in the generated module, and that is what the experiments below do. Imports, `+{expr}` embeds and `+outlet` need views and components that JSON cannot carry, so they stop with an error here.

## Seven experiments

For each experiment, paste the template in the left box, the state in the right box, and press **Compile and run**.

### 1. A template that reads nothing

```pavlus
p Hello, world
```

```json
{}
```

Open the generated module and go to `diff`. It has only `if (prev === next) return patches;` and `return patches;`. There is no import line, because no helper is needed, and the vnodes have no `id` fields. Nothing in this template can ever change, so the compiler wrote nothing for it.

### 2. Reading one field

```pavlus
p Hello, {name}
```

```json
{ "name": "Ann", "theme": "light" }
```

The AST says *reads: name*, and the guard in `diff` compares `prev.name !== next.name`. The field `theme` is in the state and is never mentioned in the module. Now change the template to `p Hello, {name}, theme {theme}` and compile again: the guard grows by one comparison, and so does the text.

### 3. A parent and a child with the same dependencies

```pavlus
p(title=text) {text}
```

```json
{ "text": "Hi" }
```

Find the guard `if (prev.text !== next.text)`. Inside it you see the `title` attribute and also the text. The comment `// line 1: text` has no `if` of its own, because the paragraph's guard already covers it. Change the attribute to `title=other` and compile again: now the text has its own guard.

### 4. The branch index

```pavlus
if n > 1
  p many
else if n === 1
  p one
else
  p none
```

```json
{ "n": 1 }
```

The result is `<p>one</p>`. In the module, find `nextBranch`: a chain of conditions that ends in the number of the `else` branch. Delete the `else` and its line, and compile again: the chain now ends in `-1`, the "nothing shown" value. Open the vnodes: the `if` is wrapped in two marker nodes, with the ids `0s` and `0e`.

### 5. Keyed and unkeyed loops

```pavlus
ul
  for item in items key item.id
    li {item.name}
```

```json
{ "items": [{ "id": 7, "name": "Ann" }, { "id": 9, "name": "Bob" }] }
```

Find the line that starts with `const prevItemKeys`. It maps every item to `String((item)?.id)`. Now delete ` key item.id` from the template and compile again: the line becomes `String(itemIndex)`. Look at the vnodes in both versions: the markers of the items are named after the key, `1[#7` and `1[#9` in the first, `1[#0` and `1[#1` in the second. Those names are what the patches `remove` and `move` use.

### 6. An event with arguments

```pavlus
button(class:on=on @click=pick(id, kind)) Pick
```

```json
{ "on": true, "id": 1, "kind": "a" }
```

The vnode of the button has an `events` field with `"click": { "id": "pick", "payload": [1, "a"] }`: the handler is data. In `diff`, the two arguments are compared with `sameValues`, and the class is rebuilt with `joinClasses`. Change `@click=pick(id, kind)` to `@click.prevent=pick(id, kind)` and look for `prevent: true`. Change it to `@click=pick` and the handler disappears from `diff`, because a handler without arguments cannot change. The button keeps its `id`, because its class can still change.

### 7. Mistakes

Break the template on purpose. Remove the closing brace:

```pavlus-invalid
p Hello, {name
```

The output is replaced by the message `playground.pavlus: Unclosed { (line 1, col 8)`. Put the brace back, and now write a line with an `if` and no condition:

```pavlus
if
  p one
```

This is not an error. The result is `<if><p>one</p></if>`, an element called `if`. It is a reminder that the output is the best way to find out what the compiler understood.

## What to look at in the module

When you open the generated module of any template, go through it in this order:

1. The **import line** tells you which helpers the template needs. A longer line means more features.
2. **`meta`** lists the embedded children and says if there is an outlet.
3. In **`render`**, follow the comments `// line N: ...`. Each one is a line of your template. Variables are named after it: `liChildren` is the children of an `li`, `userList` is the list of a `for user in ...`.
4. In **`render`**, see which nodes have an `id`. Only nodes that can be patched have one.
5. In **`diff`**, find the comments `(reads: ...)`. The line below each one is a guard.
6. In **`diff`**, find the calls to `patches.push`. Each one is one of the eight patch operations, and its fields are what the DOM plugin receives.
7. Look at **`idSuffix`** and **`messagePrefix`**. They are in every id and every message, so a template can be used inside a loop or inside another template.

## What you learned

- The playground runs `compileTemplate` and `render` in your browser. It shows the HTML, the module and the dependency set of every node, and it has no patch list.
- Changing one thing at a time, and comparing the module before and after, is the fastest way to learn the compiler.
- A template that reads nothing gets an empty `diff`; a node that shares its parent's dependencies shares its guard; a key changes how items are named.
- A typo can still compile. Read the result, not only the absence of an error.

Next: [Architecture: pure code and effects](page:concepts-architecture).
