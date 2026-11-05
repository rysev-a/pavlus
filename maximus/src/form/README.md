# maximus/form

Forms on signals: every field has its own `value`, `error`, `touched`, `dirty` and `validating` signals, so a keystroke updates exactly the nodes that read that field.

```ts
import { createForm, html, required, email, minLength } from "maximus";

function SignUp() {
  const f = createForm({
    initial: {
      email: "",
      password: "",
      address: { city: "" },
      tags: [] as string[],
    },
    onSubmit: async (values) => {
      await api.signUp(values);
    },
  });
  const mail = f.field("email", { validate: [required(), email()] });
  const pw = f.field("password", { validate: [required(), minLength(8)] });
  return html` <form @submit=${f.submit}>
    <input type="email" ${mail.bind} />
    <p id=${mail.errorId}>${mail.error}</p>
    <input type="password" ${pw.bind} />
    <input ${f.field("address.city").bind} />
    <button ?disabled=${f.submitting}>
      ${() => (f.submitting() ? "Sending..." : "Sign up")}
    </button>
    ${() => (f.submitError() ? html`<p role="alert">Could not sign up</p>` : null)}
  </form>`;
}
```

## The form

|                                                                                                    |                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createForm({ initial, schema?, onSubmit?, validateOn?, debounce?, validators? })`                 | create it in a component (timers and listeners are cleaned up with the owner)                                                                                                   |
| `f.field(path, options?)`                                                                          | a field; `path` is `"email"`, `"address.city"`, `"tags.0"` (typed against `initial`; any string also works) or a function `() => string` for a reactive path (rows of an array) |
| `f.array(path)`                                                                                    | `{ items, length, add(value, at?), remove(i), move(from, to), swap(a, b), clear() }`                                                                                            |
| `f.values()`, `f.setValues(partial)`                                                               | the whole data (immutable updates; `initial` is never mutated)                                                                                                                  |
| `f.submit(event?)`                                                                                 | use as `@submit=${f.submit}`                                                                                                                                                    |
| `f.submitting()`, `f.submitError()`, `f.submitCount()`                                             |                                                                                                                                                                                 |
| `f.valid()`, `f.dirty()`, `f.validating()`, `f.errors()`, `f.formErrors()`                         |                                                                                                                                                                                 |
| `f.validate()`                                                                                     | validate everything now (fields, then the schema); resolves to a boolean                                                                                                        |
| `f.setErrors({ email: "taken", "address.city": ["a", "b"], "": "form level" })`, `f.clearErrors()` | server errors                                                                                                                                                                   |
| `f.reset(next?)`, `f.touchAll()`, `f.dispose()`                                                    |                                                                                                                                                                                 |

`valid()` means "no known errors": a field is checked when it validates, `await f.validate()` (or a submit) checks everything.

## A field

`value` (a signal: `f.value()`, `.set()`, `.update()`, `.peek()`), `error()` (first message; order: server, validators, schema), `errors()`, `touched` (a signal), `dirty()` (deep comparison with the initial value), `validating()`, `errorId()`, `set(v)`, `validate()`, `reset()`, `bind`.

**`bind`** is a directive (use it bare in the tag, or with `...${}`) for `input` (text-like, number, range, checkbox, radio, file), `textarea` and `select` (also `multiple`):

- text-like, textarea, select: the string value; number/range: a `number` (`undefined` when empty); a checkbox is a boolean, or toggles its `value` in an array field (checkbox group); radios set the string value of the checked one; file inputs give `File | null` (`File[]` with `multiple`); `select multiple` gives `string[]`.
- `input`, `change` and `blur` flow in; the DOM is written from the signal (only when it differs, so the caret does not jump); a missing `name` is set to the path.
- `aria-invalid="true"` and `aria-describedby` (your own tokens are kept, the field's `errorId()` is added) follow the error. Render the message in an element with `id=${field.errorId}`.
- It also works on the server (`renderToString` writes `value`, `checked`, `selected` into the HTML).

## Validation

A validator is `(value, { values, path, signal }) => message | message[] | undefined`, sync or async. Built-ins: `required`, `minLength`, `maxLength`, `pattern`, `email`, `min`, `max`, `equalsField(path)`. All but `required` skip empty values so they compose. Register them per field (`f.field("x", { validate: [...] })`) or in `createForm({ validators: { x: [...], "tags.*": [...] } })` (`*` is any array index; validators of a reactive-path field apply to every index).

When: `validateOn` is `"input"`, `"change"` (default: the DOM `change` event and `field.set`), `"blur"` or `"submit"`. After a field was validated once, or after the first submit, it re-validates while typing ("reward early, punish late").

- **Debounce.** `debounce` (form default or per field) delays validation caused by typing; blur, change, submit and `validate()` are immediate. While the delay or an async validator runs, `validating()` is true.
- **Stale results.** A newer validation of the same field aborts the previous one (its `ctx.signal` fires, so pass it to `fetch`) and its result is discarded. The same holds for the schema.
- **Schema.** `schema` is a [Standard Schema](https://standardschema.dev) (anything with `~standard.validate`: Zod, Valibot, ArkType, ...) or a function `(values) => ({ path: message })`. Issue paths become field paths (`items.0.qty`); issues without a path are form-level (`f.formErrors()`). Validating a field refreshes only that field's schema issues; `validate()` and submit refresh all. `onSubmit` receives the schema's **output** (transforms and coercions applied).

## Submit

`f.submit(event?)`: prevents the default, ignores a second submit while one runs, marks the fields touched, clears server errors, validates everything (awaiting async validators and the schema), **focuses the first invalid field** (in document order) if any, otherwise calls `onSubmit(output, form)`. A thrown or rejected `onSubmit` is caught into `f.submitError()`; `submitting()` covers the call. To show server-side validation, call `form.setErrors(...)` from `onSubmit` (a field's server error clears as soon as its value changes).

## Arrays

```ts
const tags = f.array("tags");
html`${each(
    tags.items,
    (it) => it.key,
    (item) => {
      const tag = f.field(() => `tags.${item().index}`); // follows the item when rows move
      return html`<li>
        <input ${tag.bind} />
        <button type="button" @click=${() => tags.remove(item().index)}>
          x
        </button>
      </li>`;
    },
  )} <button type="button" @click=${() => tags.add("")}>add</button>`;
```

`item.key` is stable across moves and removals; touched flags, errors and "validated" marks move with the item when the array is reordered or an item is removed.

## Limits

- Validators that depend on another field (`equalsField`) re-run when their own field validates; re-validate the dependent field yourself when the other one changes.
- `select` options inserted after the directive ran (a dynamic `each` of options) need the value re-applied: the directive does it once on mount; set the field again if options arrive later.
- Paths are typed to a depth of six; deeper ones fall back to `unknown`.
