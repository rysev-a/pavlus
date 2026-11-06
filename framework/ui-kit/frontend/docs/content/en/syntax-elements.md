---
summary: A template is an indented tree of elements. Learn how to write tags, classes, ids, text and attributes, from a one-line paragraph to a small card.
---
## The smallest template

A pavlus template is a text file, usually named `something.pavlus`. Each line is one thing: an element, a piece of text, or a keyword. **Indentation** says what is inside what, as in Python or YAML. There are no closing tags and no braces around blocks.

The smallest useful template is one line: a tag name followed by its text.

::demo hello

The demo above is compiled by the real compiler, right now, in your browser. You see the template, the HTML that `render` produced, and, further down, the module the compiler generated. Open the folded sections when you are curious; the rest of this page only uses the first two.

> [!TIP] Spaces, not tabs
> Indent with two spaces. A line indented more than the previous one becomes its child; a line indented less ends the block.

## Classes and ids

After the tag name you can add classes with a dot and an id with a hash, in the same order you would write a CSS selector. The tag name can be left out: `.card` means `div.card`.

::demo selectors

Several classes are chained: `a.btn.btn-primary`. Without a tag the element is a `div`, so `#app` is `<div id="app">`.

## Text

Text after the tag, on the same line, is the first child of the element. For longer or mixed content, put text on its own lines that start with a pipe `|`. Every `|` line is one text node, and the text may contain `{expressions}` (see the next page).

::demo text-lines

A line that starts with `//` is a comment. It never reaches the output.

## Attributes

Attributes go in parentheses after the tag, separated by spaces. A value can be a quoted string, a number-like literal, or an expression.

::demo attributes

- `type="button"` is a plain string.
- `disabled` without a value is a boolean attribute: it is present, and means *true*.
- `href=url` has no quotes, so `url` is **an expression**: it reads the field `url` of the state.
- `title="Open {name}"` is a string with a hole in it; the compiler turns it into a concatenation.

> [!NOTE] Quotes decide what a value is
> `class="x"` is the text `x`. `class=x` is the state field `x`. This is the most common first mistake, and the compiler cannot warn about it, because both forms are valid.

## Toggling a class

A static class is written with a dot. A class that depends on the state is written as an attribute named `class:name`, with a condition for its value. The class is on the element when the condition is true.

::demo class-toggle

Note the second step of the demo: only the `class` attribute is patched, nothing else. How the compiler knows what to patch is the subject of the [compiler section](page:compiler-diff).

## Putting it together

Here is a small card that uses everything on this page. Read it from the top: the outer `div`, a heading with an id, a paragraph, then a button with several attributes.

::demo card open=ast

The AST section shows, for every node, the part of the state it reads. Nodes with *reads: none* can never change, so the generated `diff` skips them entirely.

## What you learned

- A line is an element: `tag.class#id(attr=value) text`.
- Indentation is nesting. A leading `|` makes a text line. `//` makes a comment.
- Quoted values are text, unquoted values are expressions, `class:name=cond` toggles a class.

Next: [expressions and interpolation](page:syntax-expressions).
