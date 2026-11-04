import type { Demo } from "../demo.ts";

const form = {
  name: "",
  email: "",
  plan: "free",
  terms: false,
  errors: {} as Record<string, string>,
  busy: false,
  done: false,
};

const rows = [
  { id: 1, name: "Ann Lee", role: "Admin", status: "active", visits: 42 },
  { id: 2, name: "Bob Ray", role: "Editor", status: "paused", visits: 7 },
  { id: 3, name: "Cid Moss", role: "Viewer", status: "active", visits: 0 },
];

const filters = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
];

const table = {
  filters,
  status: "all",
  query: "",
  total: 3,
  visible: rows,
};

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "activity", label: "Activity" },
  { id: "settings", label: "Settings" },
];

const panel = {
  tabs,
  active: "overview",
  user: { name: "Ann", email: "ann@example.com" },
  events: ["Signed in", "Changed avatar"],
  notify: true,
};

export const demos: Record<string, Demo> = {
  form: {
    template: `form.signup(@submit.prevent=submit)
  h3 Create an account
  label
    span Name
    input(type="text" name="name" value=name placeholder="Your name" @input=setName class:invalid={errors.name})
    if errors.name
      small.error {errors.name}
  label
    span Email
    input(type="email" name="email" value=email @input=setEmail class:invalid={errors.email})
    if errors.email
      small.error {errors.email}
  label
    span Plan
    select(name="plan" @change=setPlan)
      option(value="free" selected={plan === "free"}) Free
      option(value="pro" selected={plan === "pro"}) Pro
  label.check
    input(type="checkbox" checked={terms} @change=setTerms)
    span I accept the terms
    if errors.terms
      small.error {errors.terms}
  button(type="submit" disabled={busy} class:loading={busy}) {busy ? "Saving..." : "Sign up"}
  if done
    p.success Welcome, {name}!`,
    state: form,
    steps: [
      {
        label: "validation errors appear",
        prev: form,
        next: {
          ...form,
          errors: { name: "Enter your name.", terms: "Accept the terms." },
        },
      },
      {
        label: "name typed",
        prev: { ...form, errors: { name: "Enter your name.", terms: "Accept the terms." } },
        next: { ...form, name: "Ann", errors: { terms: "Accept the terms." } },
      },
      {
        label: "submit: busy",
        prev: { ...form, name: "Ann", terms: true },
        next: { ...form, name: "Ann", terms: true, busy: true },
      },
      {
        label: "saved: done",
        prev: { ...form, name: "Ann", terms: true, busy: true },
        next: { ...form, name: "Ann", terms: true, done: true },
      },
    ],
  },
  table: {
    template: `section.users
  header.toolbar
    for f in filters key f.id
      button(type="button" class:active={f.id === status} @click=setStatus(f.id)) {f.label}
    input(type="search" value=query placeholder="Search" @input=setQuery)
  table
    thead
      tr
        th Name
        th Role
        th(class="num") Visits
        th
    tbody
      for row in visible key row.id
        tr(class:paused={row.status === "paused"})
          td {row.name}
          td {row.role}
          td.num {row.visits > 0 ? row.visits : "none"}
          td
            button(type="button" @click=toggleStatus(row.id, row.status)) {row.status === "active" ? "Pause" : "Resume"}
            button(type="button" @click.stop=remove(row.id)) Delete
      if visible.length === 0
        tr.empty
          td(colspan="4") No users match
  footer {visible.length} of {total}`,
    state: table,
    steps: [
      {
        label: "filter: paused",
        prev: table,
        next: { ...table, status: "paused", visible: [rows[1]] },
      },
      {
        label: "filter: nobody",
        prev: { ...table, status: "paused", visible: [rows[1]] },
        next: { ...table, status: "paused", query: "zz", visible: [] },
      },
      {
        label: "Bob resumed",
        prev: table,
        next: {
          ...table,
          visible: [rows[0], { ...rows[1], status: "active" }, rows[2]],
        },
      },
      {
        label: "order reversed",
        prev: table,
        next: { ...table, visible: [rows[2], rows[1], rows[0]] },
      },
    ],
  },
  tabs: {
    template: `div.panel
  div.tabs(role="tablist")
    for tab in tabs key tab.id
      button.tab(type="button" role="tab" aria-selected={tab.id === active ? "true" : "false"} class:active={tab.id === active} @click=select(tab.id)) {tab.label}
  div.body(role="tabpanel")
    if active === "overview"
      h3 {user.name}
      p {user.email}
    else if active === "activity"
      if events.length
        ul
          for e in events key e
            li {e}
      else
        p.muted No activity yet
    else
      label
        input(type="checkbox" checked={notify} @change=setNotify)
        span Send me email`,
    state: panel,
    steps: [
      {
        label: "tab overview → activity",
        prev: panel,
        next: { ...panel, active: "activity" },
      },
      {
        label: "tab activity → settings",
        prev: { ...panel, active: "activity" },
        next: { ...panel, active: "settings" },
      },
      {
        label: "new event while on activity",
        prev: { ...panel, active: "activity" },
        next: { ...panel, active: "activity", events: ["New event", ...panel.events] },
      },
    ],
  },
  comments: {
    template: `// a comment line is dropped
p Visible // a trailing comment is dropped
p See https://example.com/a//b for details
p(title="a // b") Inside quotes it stays
| A text line keeps // everything`,
    state: {},
  },
  "bare-words": {
    template: `Hello world
| Hello world`,
    state: {},
  },
  "loop-typo": {
    template: `for x of xs
  p {x}`,
    state: { xs: [1, 2] },
  },
  "unquoted-target": {
    template: `a(href="/docs" target=_blank) Docs
a(href="/docs" target="_blank") Docs`,
    state: {},
  },
};
