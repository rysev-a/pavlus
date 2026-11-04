import type { DocSource } from "../../blocks/docs-layout/docs.ts";

/** The pages of the docs of Fennel, a small (made-up) validation library. */
export const PAGES: DocSource[] = [
  {
    id: "introduction",
    title: "Introduction",
    group: "Getting started",
    summary:
      "Fennel checks that data has the shape you expect, and gives you the TypeScript type for free.",
    body: `## What Fennel does

Data from the outside world (a form, a request body, a config file) is never as tidy as your types claim. Fennel lets you describe the shape once, as a **schema**, and then use it to check the data and to infer the type.

- Small: under 4 kB gzipped, with no dependencies.
- Typed: the type of a schema is inferred, so you never write it twice.
- Plain: a schema is a value. Pass it around, compose it, test it.

> [!NOTE] Fennel 2
> This is the documentation of version 2. If you are upgrading, read [Migrating from v1](page:migrating) first.

## A first look

\`\`\`ts user.ts
import { object, string, number } from "fennel";

const User = object({
  name: string().min(1),
  age: number().int().min(0),
});

const user = User.parse({ name: "Ann", age: 31 });
\`\`\`

Next, [install the package](page:installation) and follow the [quick start](page:quick-start).
`,
  },
  {
    id: "installation",
    title: "Installation",
    group: "Getting started",
    summary: "Add Fennel to a project with your package manager.",
    body: `## Requirements

Fennel runs on Node 20 or newer and in every modern browser. TypeScript 5.0 or newer is recommended; plain JavaScript works too.

## Install the package

\`\`\`sh
npm install fennel
# or
pnpm add fennel
\`\`\`

## Check that it works

\`\`\`ts
import { string } from "fennel";

console.log(string().parse("hello")); // "hello"
\`\`\`

> [!TIP] Strict mode
> Turn on \`"strict": true\` in your \`tsconfig.json\`. Inference is much more precise with it, and optional fields are reported correctly.

### Using a CDN

For a quick experiment you can load Fennel as a module from a CDN. Do not do this in production: pin the version and host the file yourself.
`,
  },
  {
    id: "quick-start",
    title: "Quick start",
    group: "Getting started",
    summary: "Validate a sign-up form in five minutes.",
    body: `## Describe the data

A sign-up form has a name, an email and a password. Describe each field with a schema and put them in an object.

\`\`\`ts signup.ts
import { object, string } from "fennel";

export const Signup = object({
  name: string().min(2, "Tell us your name"),
  email: string().email(),
  password: string().min(8),
});
\`\`\`

## Check the input

Use \`safeParse\` for user input: it never throws, and returns the issues so you can show them next to the fields.

\`\`\`ts
const result = Signup.safeParse(form);

if (!result.ok) {
  for (const issue of result.issues) {
    console.log(issue.path.join("."), issue.message);
  }
}
\`\`\`

## Get the type

\`\`\`ts
import type { Infer } from "fennel";

type SignupData = Infer<typeof Signup>;
// { name: string; email: string; password: string }
\`\`\`

That is all. To go further, read about [schemas](page:schemas) and [errors](page:errors).
`,
  },
  {
    id: "schemas",
    title: "Schemas",
    group: "Guides",
    summary: "Build schemas from primitives and compose them into bigger ones.",
    body: `## Primitives

Every schema starts from a primitive. Each one checks the type of the value and can be refined with rules.

| Schema | Accepts | Common rules |
| --- | --- | --- |
| \`string()\` | text | \`min\`, \`max\`, \`email\`, \`regex\` |
| \`number()\` | numbers, not NaN | \`int\`, \`min\`, \`max\` |
| \`boolean()\` | true or false | none |
| \`date()\` | a valid Date | \`min\`, \`max\` |

## Objects and arrays

\`object\` takes a shape, \`array\` takes the schema of one item.

\`\`\`ts
const Post = object({
  title: string(),
  tags: array(string()).max(5),
  author: object({ id: string(), name: string() }),
});
\`\`\`

### Optional and default values

Mark a field as optional with \`.optional()\`, or give it a value to use when it is missing with \`.default(value)\`.

\`\`\`ts
const Settings = object({
  theme: string().default("light"),
  language: string().optional(),
});
\`\`\`

## Unions

\`union\` accepts a value that matches any of the schemas. Use \`literal\` to build tagged unions.

\`\`\`ts
const Shape = union([
  object({ kind: literal("circle"), radius: number() }),
  object({ kind: literal("square"), side: number() }),
]);
\`\`\`

> [!WARNING] Order matters
> A union tries its schemas in order and returns the first match. Put the most specific schema first.
`,
  },
  {
    id: "errors",
    title: "Parsing and errors",
    group: "Guides",
    summary:
      "What happens when the input is wrong, and how to show it to people.",
    body: `## Two ways to parse

| Method | When the input is valid | When it is not |
| --- | --- | --- |
| \`parse\` | returns the typed value | throws a \`FennelError\` |
| \`safeParse\` | \`{ ok: true, value }\` | \`{ ok: false, issues }\` |

Use \`parse\` where bad data is a bug (reading your own config), and \`safeParse\` where it is expected (user input).

## Issues

An issue says where the problem is and what it is. The **path** is the list of keys that leads to the value.

\`\`\`json
{
  "path": ["author", "name"],
  "code": "too_small",
  "message": "Must have at least 1 character"
}
\`\`\`

### Custom messages

Every rule accepts a message as its last argument. Write it for the person who will read it, not for the developer.

\`\`\`ts
string().min(8, "Use at least 8 characters");
\`\`\`

## Collecting all issues

By default Fennel reports every issue, not just the first, so a form can show all its errors at once. Pass \`{ abortEarly: true }\` to stop at the first one.

> [!TIP] Flatten for forms
> \`flatten(issues)\` turns the list into an object keyed by field name: \`{ email: "Enter a valid email" }\`.
`,
  },
  {
    id: "custom-rules",
    title: "Custom rules",
    group: "Guides",
    summary: "Add your own checks and transforms to any schema.",
    body: `## A rule is a pure function

Use \`check\` to add a rule. The function receives the value and returns an error message, or nothing when the value is fine.

\`\`\`ts
const Username = string().check((value) =>
  /^[a-z0-9_]+$/.test(value) ? undefined : "Use lower case letters, digits and _",
);
\`\`\`

## Rules across fields

To compare two fields, put the rule on the object. The issue is reported on the path you choose.

\`\`\`ts
const Passwords = object({ password: string(), confirm: string() }).check(
  (v) => (v.password === v.confirm ? undefined : { path: ["confirm"], message: "The passwords do not match" }),
);
\`\`\`

## Transforms

\`transform\` changes the value after it has been checked, and changes the inferred type with it.

\`\`\`ts
const Email = string().email().transform((s) => s.toLowerCase());
\`\`\`

> [!WARNING] Keep rules pure
> A rule runs every time the data is parsed, possibly many times. It must not call the network or depend on the clock. If it needs to, do that outside the schema.
`,
  },
  {
    id: "inference",
    title: "TypeScript inference",
    group: "Guides",
    summary: "Get the type of a schema, and keep input and output types apart.",
    body: `## Infer

\`Infer<typeof Schema>\` is the type of the value a schema produces. Declare the schema, derive the type, and the two can never drift apart.

\`\`\`ts
const Product = object({ id: string(), price: number() });
type Product = Infer<typeof Product>;
\`\`\`

## Input and output

When a schema has a default or a transform, what goes in is not what comes out. Fennel has a type for each:

| Type | Meaning |
| --- | --- |
| \`Input<S>\` | what \`parse\` accepts |
| \`Infer<S>\` | what \`parse\` returns |

\`\`\`ts
const S = object({ n: string().transform(Number) });
type In = Input<typeof S>; // { n: string }
type Out = Infer<typeof S>; // { n: number }
\`\`\`

> [!NOTE] Optional fields
> With \`"strict": true\`, an optional field is typed as \`string | undefined\`, and the key may be missing.
`,
  },
  {
    id: "api",
    title: "API reference",
    group: "Reference",
    summary: "Every function and method, in one place.",
    body: `## Constructors

| Function | Returns |
| --- | --- |
| \`string()\` | a schema for text |
| \`number()\` | a schema for numbers |
| \`boolean()\` | a schema for true or false |
| \`literal(v)\` | a schema for exactly \`v\` |
| \`object(shape)\` | a schema for an object |
| \`array(item)\` | a schema for a list |
| \`union(list)\` | a schema for one of several |

## Methods of every schema

| Method | What it does |
| --- | --- |
| \`parse(input)\` | returns the value or throws |
| \`safeParse(input)\` | returns a result, never throws |
| \`optional()\` | allows \`undefined\` |
| \`default(v)\` | uses \`v\` when missing |
| \`check(fn)\` | adds a rule |
| \`transform(fn)\` | maps the checked value |

## Options

\`parse\` and \`safeParse\` take an options object as their second argument.

| Option | Default | Meaning |
| --- | --- | --- |
| \`abortEarly\` | \`false\` | stop at the first issue |
| \`strip\` | \`true\` | remove keys the schema does not know |

### Errors

\`FennelError\` has an \`issues\` list. Each issue has a \`path\`, a \`code\` and a \`message\`.
`,
  },
  {
    id: "migrating",
    title: "Migrating from v1",
    group: "Reference",
    summary: "What changed in version 2 and how to update your code.",
    body: `## Breaking changes

> [!DANGER] parseSync is gone
> \`parseSync\` was removed. Use \`parse\`, which is synchronous unless a rule is async.

- \`v.string()\` is now \`string()\`: functions are imported by name.
- Errors are \`FennelError\`, not \`ValidationError\`.
- \`strip\` is on by default: unknown keys are removed, not kept.

## Step by step

1. Update the package to \`fennel@2\`.
2. Replace the \`v.\` prefix with named imports.
3. Rename \`ValidationError\` to \`FennelError\` in your \`catch\` blocks.
4. Run your tests, and check the places where unknown keys mattered.

\`\`\`ts
// before
import v from "fennel";
const Name = v.string().min(1);

// after
import { string } from "fennel";
const Name = string().min(1);
\`\`\`

## Getting help

If something is not covered here, open an issue with a small example. We read all of them.
`,
  },
];
