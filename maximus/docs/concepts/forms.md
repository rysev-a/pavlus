# Forms

`maximus/form` keeps a form as a set of signals: each field has its own `value`, `error`, `touched`, `dirty` and `validating`, so a keystroke updates exactly the nodes that read that field. The snippets run as tests in `docs/concepts/concepts.test.ts`; the full reference is [`src/form/README.md`](../../src/form/README.md).

## createForm

```ts
import { createForm, required, email } from "maximus/form";

function SignUp() {
  const f = createForm({
    initial: { email: "", password: "" },
    onSubmit: async (values) => {
      await api.signUp(values); // a thrown error lands in f.submitError()
    },
  });
  const mail = f.field("email", {
    validate: [
      required(),
      email(),
      async (v, { signal }) => {
        // async: a newer run aborts this one
        const taken = await api.emailTaken(v, signal);
        return taken ? "already registered" : undefined;
      },
    ],
  });
  const pw = f.field("password", { validate: [required()] });
  return html`<form @submit=${f.submit}>
    <input type="email" ${mail.bind} />
    <small id=${mail.errorId}
      >${() => (mail.touched() ? mail.error() : "")}</small
    >
    <input type="password" ${pw.bind} />
    <button ?disabled=${f.submitting}>Sign up</button>
  </form>`;
}
```

- `f.field(path, { validate })` returns `{ value, error, errors, touched, dirty, validating, errorId, set, bind, validate, reset }`. Paths can be nested (`"address.city"`) or reactive.
- `bind` is a directive for `input` (text, number, checkbox, radio, file), `textarea` and `select`. It keeps `aria-invalid` and `aria-describedby` in sync (render the message in an element with `id=${field.errorId}`).
- Validators are sync or async functions `(value, { values, path, signal }) => message | undefined`, or built-ins: `required minLength maxLength pattern email min max equalsField`. `schema` accepts any [Standard Schema](https://standardschema.dev) (Zod, Valibot, ArkType) or a plain function `(values) => ({ path: message })`.
- Validation runs on `change` and blur by default (`validateOn`), and on input once a field was validated or the form was submitted. Typing-triggered validation is debounced; a newer run of a field aborts the older one and drops its result.
- `f.submit` prevents the default, ignores a second submit while one runs, validates everything (waiting for async validators), **focuses the first invalid field**, and only then calls `onSubmit` with the schema's output. `f.submitting()`, `f.valid()`, `f.reset()`, `f.setErrors({ email: "taken" })` for server-side errors.
- `f.array(path)` gives stable-keyed items with `add/remove/move/swap`; touched flags and errors move with the items.

## With actions

A form is the natural place for an `action`: do the work in `onSubmit` through `action.run`, and let the action invalidate the queries that show the data.

```ts
const place = action(placeOrder, { invalidates: [["orders"]] });
const f = createForm({
  initial,
  onSubmit: async (v) => {
    await place.run(v);
    if (place.error()) f.setErrors({ "": "Could not place the order" });
  },
});
```

## Without the module

Because everything is a signal, a one-off input does not need `createForm`: `.value=${signal}` plus `@input` is enough (see the [templates](./templates.md) page). Use `createForm` as soon as you want touched/dirty/async rules, a11y wiring or submit handling.

## Not there yet

Validators that depend on another field re-run only when their own field validates (re-validate the dependent field yourself); options inserted into a `<select>` after mount need the value re-applied; no built-in persistence of drafts.
