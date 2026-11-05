# Forms

> **API as designed.** `maximus/form` is **wave 2** and is not shipped in 0.1. This page documents the contract in `DESIGN.md`. Today you can build forms from signals (see below).

## createForm (as designed)

```ts
import { createForm } from "maximus/form";

const f = createForm({
  initial: { email: "", age: 0 },
  schema,                       // a Standard Schema object, or a function
  onSubmit: async (values) => { await api.signup(values); },
});

const email = f.field("email"); // { value, error, touched, dirty, bind, set }

html`
  <form @submit.prevent=${f.submit}>
    <input type="email" ...${email.bind} />
    <small>${() => (email.touched() ? email.error() : "")}</small>
    <button ?disabled=${() => f.submitting() || !f.valid()}>Sign up</button>
  </form>
`;
```

| member | meaning |
| --- | --- |
| `f.field(name)` | per-field signals: `value`, `error`, `touched`, `dirty`; `set(v)`; `bind`, a spread directive wiring value and events to an `<input>` |
| `f.submit` | validates then calls `onSubmit` |
| `f.submitting()` | signal, true while `onSubmit` is pending |
| `f.valid()` | signal, no field has an error |
| `f.reset()` | back to `initial` |

Validation: a schema (Standard Schema adapter) or a function, plus per-field and **async** validators, per the design. Unspecified: validation timing (on blur/change/submit), exact error shape (string vs issue list), array/nested field paths.

Because each field is a set of signals, typing in one input updates only that field's bindings.

## Today: forms from signals

```ts
function Signup() {
  const email = signal("");
  const touched = signal(false);
  const error = computed(() => (/^\S+@\S+$/.test(email()) ? "" : "enter an email"));

  return html`
    <form @submit.prevent=${() => !error() && save(email.peek())}>
      <input
        type="email"
        .value=${email}
        @input=${(e: Event) => email.set((e.target as HTMLInputElement).value)}
        @blur=${() => touched.set(true)}
      />
      <small>${() => (touched() ? error() : "")}</small>
      <button ?disabled=${() => !!error()}>Sign up</button>
    </form>
  `;
}
```

Notes: `.value=${signal}` sets the property reactively; `@input` is delegated and `@submit` is a real listener; `.prevent` calls `preventDefault`. In tests use `fire(input, "input", { value: "a@b.c" })` from `maximus/testing`.
