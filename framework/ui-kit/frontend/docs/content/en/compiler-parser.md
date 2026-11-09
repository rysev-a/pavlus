---
summary: How the parser turns template lines and indentation into a typed AST. Learn each node type with its real fields, how expressions are parsed, how node ids are assigned, and how errors report a line and a column.
---
## What the parser does

The parser is the first stage of the compiler. It takes the text of a template and returns a **tree**, the AST (abstract syntax tree). It does not run anything, does not know your state and does not write any JavaScript. It only answers the question "what does this text say?" and fails with a clear message when the text says nothing sensible.

The function is `parse(source)` and the result has this shape:

```ts
interface TemplateAst {
  imports: { local: string; from: string }[];
  nodes: Node[];
}
```

`imports` are the `import` lines at the top. `nodes` are the top-level nodes of the template. A node is one of six types: `element`, `text`, `if`, `for`, `embed` and `outlet`. Everything below the top level hangs under an `element`, an `if` branch or a `for`.

The smallest interesting template is one element with one interpolation. The demo shows its AST in the format used on this site (one line per node, with the node id and what it reads).

::demo ids-small open=ast

There are two nodes: the element `p` with the node id `#0`, and a text node `#1` inside it. The real object behind this listing looks like this (the parser output, formatted for reading):

```json
{
  "imports": [],
  "nodes": [
    {
      "type": "element",
      "nid": 0,
      "tag": "p",
      "classes": [],
      "toggles": [],
      "attrs": [],
      "events": [],
      "children": [
        {
          "type": "text",
          "nid": 1,
          "line": 1,
          "parts": ["Hello, ", { "k": "id", "name": "name" }]
        }
      ],
      "pos": { "line": 1, "col": 1 }
    }
  ]
}
```

Two details are worth keeping in mind. A text node is a list of **parts**: a part is either a plain string or an expression object (`k` is the kind of expression). And the inline text of `p Hello, {name}` is not a property of the element: the parser turns it into a real child node. From here on the compiler only sees a tree of nodes.

## Lines and indentation

The parser works line by line. First it prepares the lines:

1. It splits the source at line breaks and skips empty lines.
2. A tab in the indentation is an error: `Tabs are not allowed, use spaces`.
3. A line that starts with `//` is dropped. On the other lines, a trailing `// comment` is cut off, but only when the `//` follows a space and is outside quotes, parentheses and braces. This is why `href="http://example.com"` is safe.
4. Each remaining line remembers its number, its indent (the count of leading spaces) and its trimmed text.

Then it builds the tree with a **stack of open parents**. For every line, the parser removes from the stack every parent that is not indented less than the line. What stays on top is the parent of the line. The line is appended to the children of that parent, and then it is pushed onto the stack itself.

::demo indent open=ast

In this template `li Two` has a child `b`, because `b bold` is indented more than `li Two`. The line `p After` has the indent of `ul`, so everything up to `li Two` and `b bold` is popped from the stack, and `p` becomes the next top-level node.

Two rules keep the tree honest.

- **All children of one parent must use the same indent.** The first child sets the indent, and any later sibling with another indent gives `Inconsistent indentation`. How many spaces you use is up to you (two is the convention); how many more than the parent is not fixed. What matters is that siblings agree.
- **Some lines are leaves.** A void element (`br`, `img`, `input` and the rest of the HTML void tags), a text line, an embed and an outlet cannot have children. A child under them gives `This line cannot have children`.

```pavlus-invalid bad-indent.pavlus
div
  p one
    span child of one
   p two
```

```text
bad-indent.pavlus: Inconsistent indentation (line 4, col 1)
```

The parser reads line 4 (`   p two`, three spaces). Its parent is `div`, whose children use an indent of 2, so the line is rejected. The error always points at column 1, because the problem is the indentation as a whole.

## Which kind of line is this?

After the indentation is settled, the parser looks at the start of the line and decides what it is. The checks run in this order, and the first match wins.

| The line starts with | It is | Node |
| --- | --- | --- |
| `import Name from "path"` | an import (top of the file only) | an entry of `imports` |
| `if expr` | a condition | `IfNode` |
| `else if expr` or `else` | the next branch of the previous `if` | a new branch in that `IfNode` |
| `for item in list` | a loop | `ForNode` |
| the pipe character and a space | a text line | `TextNode` |
| `{` | a text line that starts with an expression | `TextNode` |
| `+outlet` | the routed child | `OutletNode` |
| `+` | a child view | `EmbedNode` |
| anything else | an element | `ElementNode` |

The trailing colon of `if x:` and `for a in b:` is optional and ignored. `else` has to follow an `if` or an `else if` that is on the same level; otherwise you get ``` `else` without matching `if` ```.

## Elements

An element line has this form: an optional tag, any number of `.class` and `#id`, an optional `(attributes)` and then optional inline text. The tag defaults to `div`. Let us parse a line that uses most of the pieces.

::demo selector-attrs open=ast

The AST shows only the dependencies, so here is the real node, with the long parts trimmed:

```json
{
  "type": "element",
  "nid": 0,
  "tag": "a",
  "classes": ["btn"],
  "toggles": [{ "name": "on", "test": { "k": "id", "name": "open" } }],
  "attrs": [
    { "name": "id", "value": ["go"] },
    { "name": "href", "value": [{ "k": "id", "name": "url" }] },
    { "name": "disabled", "value": null }
  ],
  "events": [
    {
      "name": "click",
      "msg": "save",
      "args": [{ "k": "id", "name": "id" }, { "k": "lit", "value": 2 }],
      "prevent": true,
      "stop": false
    }
  ],
  "children": [{ "type": "text", "nid": 1, "line": 1, "parts": ["Go"] }],
  "pos": { "line": 1, "col": 1 }
}
```

Each piece of the line lands in its own field:

- `.btn` goes to `classes`. `#go` is stored as an ordinary attribute named `id` (it is added first, before the attributes in parentheses).
- `class:on=open` goes to `toggles`: a class name and a condition. It is not an attribute.
- `@click.prevent=save(id, 2)` goes to `events`. The part after `@` is the DOM event name, with modifiers (`prevent`, `stop`) turned into flags. The expression must be a message id such as `save`, `users.remove` or a call of one; its arguments are expressions. Anything else is an error: `Event handler must be a message id like `save` or `remove(item)``.
- `href=url` is an attribute whose value is a list with one expression. `disabled` without a value has `value: null`: a boolean attribute.

An attribute value is always a list of parts, like a text node. A quoted value with no braces, such as `"go"`, is a list with one string. That is how the compiler tells a static attribute (only strings) from a dynamic one (it has an expression). This difference decides a lot later on.

### Three kinds of attribute value

An attribute value can be written in three ways, and the parser reads each differently.

- **Quoted**: `title="Open {name}"`. The text between quotes is split into strings and `{expressions}`, exactly like a text line.
- **Braced**: `hidden={count === 0}`. Everything between the braces is one expression, so it can contain spaces.
- **Bare**: `href=url`. The value ends at the first space, comma or closing `)` that is not inside brackets or quotes. It is parsed as one expression.

The bare form is where the most common first mistake happens. An expression with spaces needs braces:

```pavlus-invalid bare.pavlus
ul
  for link in links
    a(class:current=link.href === page) {link.label}
```

```text
bare.pavlus: Unexpected "=" in attributes (line 3, col 31)
```

The bare value `link.href` ended at the space, and the parser then met `===` where it expected an attribute name. The fix is braces: `class:current={link.href === page}`.

## Text lines, joins and escapes

A line that starts with `|` is a text node. The parser removes the pipe and one space after it. A text line can have expressions in braces, and a backslash before a brace keeps it as a literal character.

::demo escapes open=ast

The comment line is gone, and so is the trailing comment after `Home`, although the quoted URL kept its `//`. In the paragraph, `\{` and `\}` became plain braces, and `{n}` became an expression.

When two text nodes follow each other, the parser puts a newline in front of the second one. In HTML a newline between words is shown as a space, so two lines read as one paragraph, like in the pug template language.

::demo text-join open=ast

The second text node has the parts `"\n"`, `"two "` and the expression `x`. You can see the newline in the HTML: `one` and `two 2` are on different lines of the source. The same rule joins the inline text of an element (`p Hello`) with a `|` line below it.

## Conditions and loops

An `if` line starts an `IfNode`. The node has a list of `branches`. Each branch has a `test` (an expression, or `null` for `else`) and its `children`. The lines `else if` and `else` do not create nodes of their own: they add a branch to the `if` node right before them.

::demo if-chain open=ast

The AST view prints one node per `if`, and then `then`, `else if` and `else` groups under it. The node ids show something to remember: the `if` is `#0`, the three `p` elements and their texts are `#1` to `#6`, and the branches themselves have no ids. A branch is not a node.

The real fields of the node, with the children left out:

```json
{
  "type": "if",
  "nid": 0,
  "line": 1,
  "branches": [
    { "test": { "k": "binary", "op": "===", "left": { "k": "id", "name": "status" }, "right": { "k": "lit", "value": "loading" } }, "children": [] },
    { "test": { "k": "binary", "op": "===", "left": { "k": "id", "name": "status" }, "right": { "k": "lit", "value": "error" } }, "children": [] },
    { "test": null, "children": [] }
  ]
}
```

A `for` line has more parts: an item name, an optional index name, the list expression and an optional `key` expression.

::demo for-index open=ast

```json
{
  "type": "for",
  "nid": 0,
  "line": 1,
  "item": "u",
  "index": "i",
  "of": { "k": "id", "name": "users" },
  "key": { "k": "member", "obj": { "k": "id", "name": "u" }, "prop": "id" },
  "children": []
}
```

The parser splits `users key u.id` at the word `key`. The key is what the loop uses to tell items apart when the list changes; without it, the position in the list is the key. The names `u` and `i` are only visible inside the loop. The next page, [dependency analysis](page:compiler-analysis), shows how the compiler uses that.

## Child views and the outlet

An `import` line gives a name to another template. A line that starts with `+` places it. The name before `#` is the **instance name**: it prefixes the messages of the child and is the key of its state.

::demo embeds open=ast

```json
{
  "type": "embed",
  "nid": 1,
  "component": "Badge",
  "dynamic": null,
  "name": "first",
  "props": [
    { "name": "label", "value": ["Hi ", { "k": "id", "name": "name" }] },
    { "name": "strong", "value": null }
  ],
  "pos": { "line": 4, "col": 3 }
}
```

The AST view shows the two embeds without their props, but the dependencies show the difference: `+Badge#first` reads `name`, and `+Badge#second(...extra)` reads `extra`, because a spread entry (`{ "spread": expr }`) is a prop too. A prop without a value (`strong`) means `true`.

The parser checks these rules, because the compiler cannot work around them:

- `import` lines are allowed only at the top of the file, at indent 0, before any node.
- The imported name must start with a capital letter and must not be one of `String`, `Array`, `Map`, `Set` or `Error`, which the generated code uses itself.
- `+Name` needs a matching import: `"Card" is not imported. Add `import Card from "..."` or use +{Card} for a component that comes from the state`.
- A dynamic embed, `+{expr}`, has no name to derive an instance name from, so it needs one: `+{view}#page`.
- `+outlet` takes nothing after it. It becomes an `OutletNode` with just `nid` and `line`.

## Expressions

Every `{...}`, every braced or bare attribute value and every condition goes to a second, separate parser in `expr.ts`. It handles a small subset of JavaScript on purpose. There are three steps: split the text into tokens (numbers, strings, names and punctuation), then climb through the precedence levels, then check that nothing is left over.

The result is a small tree. Each node has a `k` field with its kind:

| `k` | Fields | Written as |
| --- | --- | --- |
| `lit` | `value` | `1`, `"text"`, `true`, `false`, `null`, `undefined` |
| `id` | `name` | `count` |
| `member` | `obj`, `prop` | `user.name` and `user?.name` |
| `index` | `obj`, `index` | `list[0]` |
| `call` | `callee`, `args` | `format(price, "usd")` |
| `unary` | `op`, `arg` | `!done`, `-n`, `+n` |
| `binary` | `op`, `left`, `right` | `a + b`, `a === b`, `x ?? y` |
| `cond` | `test`, `then`, `else` | `ok ? "yes" : "no"` |
| `array` | `items` | `[1, x]` |

The binary operators and their precedence, from loosest to tightest: `??`, then `||`, then `&&`, then the equality operators (`==`, `!=`, `===`, `!==`), then the comparisons (`<`, `>`, `<=`, `>=`), then `+` and `-`, then `*`, `/` and `%`. Then the ternary `? :` is looser than all of them, and the unary operators bind tighter. Parentheses group as usual. So `a + b * 2` is `a + (b * 2)`.

::demo expressions open=ast

The AST view prints each expression back from its tree, with the added parentheses in `{a + (b * 2)}`: that is the tree, not your text. Also notice that `user?.name` is printed as `user.name`. The parser treats `.` and `?.` the same, because the generated code reads every member with `?.` anyway. A template cannot throw "cannot read properties of undefined".

Here are a few real trees. The text on the left is the expression, the JSON is what `parseExpr` returns:

```json
{ "k": "binary", "op": "+",
  "left": { "k": "id", "name": "a" },
  "right": { "k": "binary", "op": "*", "left": { "k": "id", "name": "b" }, "right": { "k": "lit", "value": 2 } } }
```

```json
{ "k": "cond",
  "test": { "k": "unary", "op": "!", "arg": { "k": "id", "name": "ok" } },
  "then": { "k": "id", "name": "n" },
  "else": { "k": "unary", "op": "-", "arg": { "k": "lit", "value": 1 } } }
```

The first is `a + b * 2`, the second is `!ok ? n : -1`.

> [!NOTE] What expressions cannot do
> There is no assignment, no template string, no object literal, no `typeof`, no `new` (arrow functions exist, with an expression body only). A template reads the state, it does not change it. Each of these gives a clear error at build time, for example `{x = 1}` gives `Unexpected character "="`, and "{`a`}" gives ``Unexpected character "`"``. Changes happen by sending a message from an event.

## Node ids

Every node gets a number, its **nid**, when the parser creates it. The counter starts at 0 for each template and goes up by one in document order: a parent before its children, a node before the nodes below it. The inline text of an element gets the next number right after the element.

Imports and branches get no number. Branches are part of an `if` node, and imports are not part of the tree.

::demo tree open=ast

Read the numbers in the listing. The `section` is `#0`, then `h2` is `#1` and its text `#2`. The `if` is `#3` and takes the ids `#4` to `#9` for everything inside its two branches. After the `if` comes the `footer` as `#10`, and its text as `#11`. That is plain depth-first order.

These numbers matter for the rest of the compiler. The code generator writes them into the strings that become ids in the vnodes (`"11"` for the footer text) and in patches. In a list, the id of a node is its nid followed by `#` and the item key (`"7#1"`), and the id of a child view's node is extended with `/` and the embed's nid (`"1/3"`). Two nodes of one template can never have the same id, because their nids differ, and two copies of a node in a list differ by key.

> [!TIP] Ids are not stable names
> Do not store a nid or write it in your own code. Add a line at the top of a template and every number below it moves by one. The numbers are an internal agreement between `render` and `diff` of the same compiled module.

## Positions and errors

The parser keeps source positions where an error might be reported. An element and an embed have a `pos` with a 1-based `line` and `col`. Other nodes have a `line`. Errors carry both numbers and use the same convention in every stage.

```ts
class TemplateError extends Error {
  readonly line: number;
  readonly col: number;
}
```

The message ends with the position in brackets, for example `Unclosed { (line 1, col 8)`. The two numbers are also available as `error.line` and `error.col`, so a tool such as an editor can underline the exact place. `compileTemplate` adds the file name in front when it knows one, which is what you see in the build log.

The column of an expression error is exact: the parser passes the position of the first character of the expression to the expression parser, which adds the offset of the token. One imprecision to know: for `Unclosed {` in text, the column counts from the start of the text after the tag, not from the start of the line. In the first example below the `{` is at column 10 of the line, and the message says 8. Some real messages, from compiling bad templates:

```pavlus-invalid unclosed.pavlus
p Hello, {user.name
```

```text
unclosed.pavlus: Unclosed { (line 1, col 8)
```

```pavlus-invalid expression.pavlus
p Total: {price *}
```

```text
expression.pavlus: Unexpected end of expression (line 1, col 18)
```

```pavlus-invalid branch.pavlus
p one
else
  p two
```

```text
branch.pavlus: `else` without matching `if` (line 2, col 1)
```

```pavlus-invalid event.pavlus
button(@click=a+b) Save
```

```text
event.pavlus: Event handler must be a message id like `save` or `remove(item)` (line 1, col 8)
```

Each error stops the parse at the first problem. The parser does not try to continue, so fix the first message and compile again.

> [!WARNING] Quotes decide what a value is
> `class="x"` is the text `x`. `class=x` is the field `x` of the state. Both are valid, so neither is an error. If a page shows nothing where you expect a class, check the quotes first.

## One AST, three readers

You have now seen everything the parser produces. It is a plain tree of plain objects with no methods, and three later stages read the same tree: analysis reads it to compute what each node reads, `render` generation reads it to write the vnodes, and `diff` generation reads it to write the comparisons. Because the stages share one tree, they cannot disagree about what the template means. Look at the big picture once more, with a template that has all node types except the embed:

::demo if-chain

The same template has, in the AST, an `if` with three branches. In `render` it becomes an `if / else if / else` chain between two markers. In `diff` it becomes a computation of the branch number for `prev` and for `next`, and a branch change becomes a `clear` and an `insert`. The step above shows exactly that. The details are in the next pages.

## What you learned

- `parse` reads lines and indentation into a tree of six node types. Indentation sets the parent, and all siblings must agree on it.
- Inline text becomes a real text node; attribute values and text are lists of parts (strings and expressions), which is how the compiler knows what is static.
- Expressions are parsed by a separate small parser into nine kinds of nodes. `.` and `?.` are the same, and a template can only read.
- Node ids are the order of creation in a depth-first walk. They are internal and become the ids of vnodes and patches.
- An error is a `TemplateError` with a line and a column; the build log shows the file name too.

Next: [Dependency analysis](page:compiler-analysis).
