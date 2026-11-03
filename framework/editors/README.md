# Editor support

| Directory | What |
|---|---|
| [`tree-sitter-pavlus`](./tree-sitter-pavlus) | Tree-sitter grammar for `.pavlus` templates. Editor independent (Zed, Neovim, Helix...). |
| [`zed`](./zed) | Zed extension: language config, highlight queries, bracket matching. |

## Zed: install locally

```sh
./editors/zed/dev-extension.sh
```

Then in Zed: command palette → `zed: install dev extension` → pick the
directory the script prints (`~/.cache/pavlus-zed/zed-pavlus`). Open any
`.pavlus` file, for example `admin-app/frontend/dashboard/dashboard.pavlus`.

Why a script: Zed loads a grammar from a git repository at a fixed revision.
The script regenerates and tests the grammar, commits it to a scratch
repository **outside** this project and writes an extension whose
`extension.toml` points at it. Nothing in this project is changed. Re-run it
after editing the grammar or the queries, then rebuild the extension from
Zed's Extensions page.

To publish later: put `tree-sitter-pavlus` in its own repository, put `zed`
in another, and fill in the `TODO`s in `zed/extension.toml` (repositories and
a commit SHA of the grammar).

## What is covered

- Highlighting: comments, `import`/`if`/`else`/`for`/`in`/`key`, tags,
  `.class` and `#id`, attributes, `@events` (with the message id as a
  function), `class:name` toggles, `+Component#instance(props)`,
  `+{expr}` and `+outlet`, `{interpolation}`, `|` text lines, expressions.
- Comment toggling (`// `), bracket matching, auto-closing of `() [] {} "" ''`
  (not inside strings, text or comments).

## What is not

- **Indentation.** Pavlus is indentation based but each construct fits on one
  line, so the grammar is line based and the tree is flat. Zed's
  `indents.scm` needs nested nodes, so there is no smart indent; Zed keeps the
  previous line's indentation.
- **Language server.** Highlighting comes from tree-sitter, not from an LSP.
  An LSP would add diagnostics (the compiler already reports `line:col`
  errors), hover and completion; it is a separate piece of work.
- Text lines are not highlighted (they are plain text), and a few invalid
  forms the compiler rejects parse leniently (for example a bare attribute
  value with spaces, `class:on=a === b`, which needs braces).

## Developing the grammar

```sh
cd editors/tree-sitter-pavlus
npm install
npm test        # generates (ABI 14) and runs the corpus and highlight tests
npx tree-sitter parse test/samples/all.pavlus
```

- `test/corpus/*.txt`: parse trees. `test/highlight/*.pavlus`: capture
  assertions at exact columns. The queries are the Zed ones
  (`zed/languages/pavlus/highlights.scm`, symlinked into `queries/`).
- The grammar mirrors `src/template/parser.ts`: when the template syntax
  changes, change both, and add a corpus test.
- ABI 14 is pinned for compatibility with older tree-sitter hosts.
