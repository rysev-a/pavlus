# Writing the Docs

The Docs section of the ui-kit site is `/docs/<slug>`: 25 pages, each a Markdown
file per language, `content/<lang>/<slug>.md` (en, es, de, ru, zh). The list of
pages, their groups and their titles in each language are in `pages.ts`; do not
change it. The page body is yours.

## The format

A page is Markdown, a small subset (see `markdown.ts`):

```
---
summary: One or two sentences: what the reader will know after this page.
---
## A heading (h2)

A paragraph with `code`, **bold** and a [link](https://example.com) or a
[link to another docs page](page:compiler-diff).

### A subheading (h3)

- a list
1. a numbered list

| Col | Col |
| --- | --- |
| a   | b   |

```pavlus app.pavlus
p Hello, {name}
```

> [!TIP] Optional title
> A callout. Tones: NOTE, TIP, WARNING, DANGER.

::demo my-demo
::demo my-demo open=module,ast
::playground
```

- Do not write an `# h1`: the page title comes from `pages.ts`.
- Code fences: `pavlus`, `ts`, `js`, `json`, `css`, `sh`, `text`. Every ```` ```pavlus ````
  block **must compile** (a test compiles it). A template that is meant to fail
  is a ```` ```pavlus-invalid ```` block (highlighted, not compiled). A fence may
  have a title after the language: ```` ```ts app.ts ````.
- No raw HTML. No images. No nested lists. No inline links to code files.
- `::demo name` embeds a **live demo**: the page's `demos/<slug>.ts` exports
  `demos: Record<string, Demo>` (see `demo.ts`: `template`, `state`, `steps`,
  optional `components`). The reader sees the template, the state, the real HTML
  `render(state)` returns, the real patches `diff(prev, next)` returns for each
  step, and folded: the generated module, the AST with what each node reads, the
  vnodes. `open=module,ast,vnodes` unfolds those. **Step labels must be
  language-neutral** (`count 2 → 3`), they are not translated.
- `::playground` is the editable playground (only on `compiler-playground`).

## Look at `content/en/syntax-elements.md` and `demos/syntax-elements.ts`

They are the model of the style. Read them first.

## What good looks like

The reader knows nothing about pavlus. Every page:

1. Opens with a plain-words description of the idea, then **the simplest possible
   example** (usually a `::demo` of 1–3 lines).
2. Adds one idea at a time, each with an example, ordered from simple to complex.
   The middle of the page has realistic examples; the end has a bigger one that
   combines everything, then `## What you learned` (3–5 bullets) and a line
   `Next: [title](page:slug).`
3. Explains **why**, not only what: what the compiler does with this, why the
   design is that way, what the pitfalls are (callouts for pitfalls).
4. Is accurate. **Read the real source before you write**, and run every demo.
   Never invent an API, an option, a message name or an output. When the text
   quotes output (a patch, a generated line), take it from the real run:
   `SHOW=<slug> npx vitest run frontend/tests/docs-show.test.ts` (from the
   `ui-kit/` directory) prints html, AST, patches, vnodes and the generated
   module of every demo of that page.
5. Is long enough to be a real document: 1500–3000 words of prose and at least
   14 blocks; the compiler pages are the deepest (use many `::demo`s, and quote
   generated code in `ts` fences when you explain it line by line).
6. Is written in clear, short sentences. Define a term the first time it is used.
   Address the reader as "you". English prose is simple on purpose: it will be
   translated into Spanish, German, Russian and Chinese, so avoid idioms, puns
   and culture-bound jokes. Keep technical words (render, diff, patch, vnode,
   state, message, effect, plugin, embed, outlet) in English in every language.

Tests (`ui-kit/frontend/tests/docs.test.ts`) check, per page: the English file
exists with a summary, ≥3 `##` headings and >12 blocks; the page's demos exist,
compile and run without error and none is unused; `pavlus` code blocks compile.
Run them for your pages: `npx vitest run frontend/tests/docs.test.ts -t "<slug>"`
(ignore failures of the es/de/ru/zh "keeps the shape" tests: translators come
later). Also run `npx tsc --noEmit -p .` for your demos file.

## The translators' contract (so the English page must keep to it)

A translation must have **exactly the same blocks in the same order**: same
headings count, same code fences (byte-identical, comments included), same
`::demo` lines, same list lengths, same table sizes, same callout tones. So:
write code comments sparingly (English-only comments inside code stay in
English in every language); put explanations in prose, not in code comments.

## Where the truth is

- Template language: `framework/src/template/parser.ts`, `expr.ts`, `ast.ts`,
  `errors.ts`; the tests in `framework/src/compiler/compiler.test.ts`; fixtures
  and goldens `framework/src/compiler/__fixtures__`, `__goldens__`;
  `docs/site/scripts/examples.ts` (existing English docs examples).
- Compiler: `framework/src/compiler/{mod,codegen,analyze}.ts`, `emit/*.ts`;
  runtime `framework/src/runtime/{helpers,vnode}.ts`; the Vite plugin
  `framework/src/vite/mod.ts`.
- Components, messages, routing, SSR: `framework/src/component/mod.ts`,
  `core/`, `routing/mod.ts`, `ssr/mod.ts`; `framework/docs/*.md`;
  `framework/README.md`.
- Plugins: `framework/src/plugins/*/` and `framework/docs/plugins/`; the
  ui-kit's own plugins: `ui-kit/frontend/{theme,random,source}.ts`,
  `docs/plugin.ts`.
- A real application: `ui-kit/frontend/app.ts`, `app.pavlus`, `main.ts`, and
  `ui-kit/AUTHORING.md` (conventions and template-language pitfalls).

## Rules for working in a shared checkout

Several people write pages at the same time in this one checkout. Touch only
your own files (`content/en/<your slugs>.md`, `demos/<your slugs>.ts`). Do not
run any `git` command, do not edit `pages.ts`, `ui.ts` or any other file.
