# Porting the original teamUP to pavlus — the contract

You are porting one feature of the original teamUP service (a Rust/axum app
with Askama templates and htmx) to the pavlus stack. This file is the contract
every part of the port follows. Read it fully before writing code.

## Where things are

| What | Where |
|---|---|
| The original service | `/Users/rysev-a/Projects/lab/.worktrees/main/web-services/team-up/backend/` (`src/`, `templates/`, `public/`) |
| The pavlus port | `/Users/rysev-a/Projects/pavlus/applications/team-up/` |
| The frontend | `app/` — `app/app.ts` (the root), `app/app.pavlus` (the shell), one folder per page (`app/feed/feed.pavlus` + `app/feed/feed.ts`) |
| The backend | `backend/` — `backend/app.ts` (the pure application), `backend/routes.ts` (the route table), `backend/api/*.ts` (one class per module), `backend/db/services/*.ts` (the SQL) |
| The database | `backend/db/init/schema.sql` (the tables), `backend/db/init/seed.ts` (the demo world) |
| The styles | `public/css/*.css` — the ORIGINAL's class names (`.users-list__chip`, `.srch__card`, `.blog-card__tag`, …). Use the original's class names, they are the contract with the CSS. |

**The original's templates are the source of truth for the markup.** Read
`templates/*.html` and `templates/partials/*.html` in the original and port
the markup, the class names and the order of the blocks. The port does not
use htmx: the pavlus app re-renders through the store instead (a link with a
query, a click that navigates).

## The rules

1. **The state slices are the contract.** `app/state.ts` already declares the
   shape of every page's data (e.g. `MembersSlice`, `ProjectCard`,
   `MemberCard`). Your API must answer **exactly** those shapes — the template
   reads them by name. Do not change `app/state.ts`; if you need a field that
   is not there, add it there and say so in your report.
2. **The texts are translated on the server.** The backend owns the language:
   `trOf(req)` gives a translator (`tr.tr("Projects")` → the Russian text when
   the request asks for it; `tr.trPlural(one, other, n)` for counts). Every
   user-visible string that comes from the data (a city, a label, a kind, a
   status, a count) goes through `tr`. The template then renders the ready
   text.
3. **A rich title** (the original's `{{ t.tr("Strong <span>teams</span> …")|safe }}`)
   is a list of parts: `{ text: string; accent: boolean }[]`. The backend
   splits the markup into the parts; the template renders the accented ones in
   a `<span>`. See `RichPart` in `app/state.ts`.
4. **Never invent a class name.** Use the original's. If a class the original
   uses does not exist in `public/css/`, it is already ported (the port copied
   the original's rules); if it is really missing, say so in your report.

## The framework (pavlus)

### The frontend

A page is a class that extends `Component`:

```ts
import { Component, type Effect, type Message } from "@pavlus/frontend";
import {
  httpEffector as http,
  routerEffector as router,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import type { AppState } from "../state.ts";
import view from "./members.pavlus";

export type MembersSlice = AppState["members"];

export class MembersPage extends Component<MembersSlice> {
  view = view;

  /** The page's own slice changed: it diffs itself and hands the patches over. */
  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as { prev: MembersSlice; next: MembersSlice };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  /** The page was entered: it asks the backend for its data. */
  enter(): Effect[] {
    return [
      http.request({ id: "members", url: "/api/public/members?…", onSuccess: "members.loaded", onError: "members.failed" }),
    ];
  }

  "members.loaded"(msg: Message): Effect[] {
    const data = (msg.payload as { data: MembersSlice }).data;
    return [store.set("data", data, { onSuccess: "paint" })];
  }
}
```

- The slice of a page is `AppState["<key>"]`; the routing entry's `key` in
  `app/app.ts` names it (`key: "members"` → `state.members`).
- `store.set("field", value, { onSuccess: "paint" })` writes into the page's
  own slice (the paths are relative to it) and answers "paint" when it lands.
- A message the page does not handle falls through to the framework's default
  (`navigate` → `router.navigate`).
- `enter()` is called when the route enters the page; `paint` after every write.

**The template language** (`.pavlus`, indentation-based):

```
main.page
  section.users-list
    div.container
      h1 Members
      for user in users key user.slug
        a.user-card(href="/users/{user.slug}")
          h3.user-card__name {user.name}
          if user.city
            p.user-card__city {user.city}
      if users.length == 0
        p.shell__muted Nothing here
```

- Arrow functions with expression bodies work in expressions
  (`xs.filter(x => x.on)`); object literals and template strings do not.
  Ternaries, `.includes(...)`, method calls and comparisons all work.
- Text: `| a literal` or `| {an.expression}`. The expression form keeps the
  spaces of the data; the literal form is trimmed.
- Attributes: `name="literal"`, `name={expression}`, `name="a/{id}/b"` (the
  string interpolates), `class:toggle={expression}` (a class toggle).
- Events: `@click=handler`, `@click=handler("arg")` (a string literal only).
- `for x in list key x.id`, `if cond` / `else if` / `else`.
- A view-only child (no behaviour of its own) is imported in the template:
  `import Header from "./site/header.pavlus"` and used as `+Header#header(site=site)`.
- A child with behaviour of its own is a component: the template stays the
  view, the class (`app/site/header.ts`) is the logic, and the parent declares
  it in `children` (`{ header: { component, key: "site" } }`). The child's state
  is the slice of the key, its store writes are rooted at it, its events are
  prefixed with the instance name, and it paints itself (`DomPlugin.update`).

### The backend

A module is a class whose methods are the handlers of the messages with those
ids; `backend/app.ts` asks the modules in order and the first one that has the
method answers. Read `backend/api/profiles.ts` and
`backend/db/services/profile-service.ts` before writing: they are the pattern.

```ts
import {
  type HttpReq,
  httpEffector,
  oneOf,
  requestsEffector,
  type ServerState,
} from "@pavlus/backend";
import { db, sql } from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/core";

export class BlogAPI {
  /** GET /api/public/blog */
  "blog.list"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    return [BlogService.list(/* … */)];
  }

  "blog.list.onSuccess"(message: Message): Effect[] {
    const rows = oneOf<BlogRow[]>(message);
    return [httpEffector.makeResponse(200, { … })];
  }
}
```

- `db.select({ id, errorId, query: sql`…` })` — the answer arrives as the
  message `id`; `oneOf(message)` reads the rows. `db.execute` for a write.
- The ids of the steps are namespaced per module (`"blog.list.onSuccess"`).
- `httpEffector.makeResponse(status, body)` answers.
- `requestsEffector.set("key", value)` / `.merge({…})` park data for the next
  step of the same request (read it with `sliceOf(message, state)` from
  `backend/api/session.ts`).
- The request payload is `{ method, path, query, headers, cookies, params,
  body }` — `params` holds the `:slug` captures, `query` the parsed query
  string, `cookies` the parsed cookies.
- The language: `trOf(req)` (from `backend/i18n/mod.ts`) — the `lang` cookie
  or `Accept-Language`.
- The language switch is a link to `GET /api/lang/:code`
  (`backend/api/site.ts`): the server writes the `lang` cookie, saves the
  language of the account (a signed-in visitor) and answers a 302 back to the
  page (`?next=…`, else the referer). The original did it in the browser with
  `document.cookie` and `location.reload()`; the port does it on the server, so
  the switch works without JavaScript.

**Shared helpers you must use** (do not rewrite them):

- `backend/lib/paging.ts` — `pagingOf(total, requested, perPage)`,
  `links(paging, path, rawQuery, {previous, next})`, `requestedPage(rawQuery)`.
  24 projects per page, 48 members per page.
- `backend/lib/urls.ts` — `parseFilters(rawQuery, multiKeys)`,
  `usersHref(filters)`, `toggleHref(filters, key, value)`, `sortHref(filters,
  value)`, `catalogHref(filters)`.
- `backend/lib/views.ts` — `initialsOf`, `avatarHueClass`, `formatDate`,
  `excerpt`, `roleCssClass`, `roleOf`, `kindLabel`, `workModeLabel`,
  `statusLabel`, `payLabel`, `budgetLabel`, `deadlineLabel`, `matchClass`.
- `backend/i18n/mod.ts` — `Tr`, `trOf`, `localeOf`.

## The database

`backend/db/init/schema.sql` already has what the public site needs:

- `posts (pid, title, content, date, tags)` — the blog.
- `profiles` has `labels text[]`, `birth_year`, `created_at`, `updated_at`,
  `last_login_at` next to the fields the port already had.
- `projects` has `work_mode`, `city`, `website`, `budget`, `budget_currency`,
  `deadline`, `created_at` next to the fields the port already had.
- `favorites (user_id, slug)`, `saved_searches (id, user_id, name, query)`,
  `reports (id, kind, target, reason, details, user_id, created_at)`.
- The directories: `professions (slug, name)`, `skills (slug, name,
  parent_id)`, `profiles_professions (user_id, profession_id, bucket)`,
  `profiles_skills (user_id, skill_id, level)`, `slots (…, profession_id,
  bucket, description, pay, pay_from, pay_to, currency, user_id, status)`,
  `slot_skills (slot_id, skill_id, level)`.
- The access model of the back office (the original's `auth` package): `roles
  (name)`, `permissions (name)`, `user_roles (user_id, role)`,
  `role_permissions (role, permission)`, `admin_sessions`, `auth_tokens`
  (the one-time tokens of the account recovery), `rate_events` (the db-backed
  rate limits) and `system_tasks` (the background work).

The seed: `backend/db/init/seed.ts` holds the demo world (six members, three
projects). **Your own seed goes into a new file** `backend/db/init/seed-<your
feature>.ts`, exporting `export async function seed<Feature>(query: Query)` —
`Query` is the type of `backend/db/init/query.ts` (`query<T>(sql, params)`).
Do not edit `seed.ts`; the integration wires your function in.

## The URL space of the original

The original's SPA lives under `/app`. The port mirrors it:

| The original | The port | What it is |
|---|---|---|
| `/app` | `/app` | the welcome page (the greeting, the profile card) |
| `/app/login`, `/app/signup` | the same | the forms |
| `/app/forgot`, `/app/reset`, `/app/verify` | the same | the account recovery |
| `/app/projects` | `/app/projects` | my projects (the tabs) |
| `/app/projects/activity` | `/app/projects/activity` | the applications and the invitations |
| `/app/projects/match` | `/app/projects/match` | the recommended slots (the feed) |
| `/app/projects/new` | the same | the form that creates a project |
| `/app/projects/:slug` | the same | the project page |
| `/app/friends` | the same | the friends |
| `/app/people/:slug` | the same | somebody's public page |
| `/app/messages`, `/app/messages/:id` | the same | the inbox and a thread |
| `/app/professions` | the same | the professions and the skills |
| `/app/skills` | the same | the old address — it goes to the professions |
| `/app/settings` | the same | the settings |
| `/app/moderation` | the same | the queue of the moderators |
| `/app/profile` | the same | the profile editor |
| `/app/admin/*` | the same | the back office |
| `/app/startups*` | the same | the old address — it goes to `/app/projects*` |

The public site keeps the original's addresses: `/`, `/projects`,
`/projects/:slug`, `/blog`, `/blog/:pid`, `/users`, `/users/:slug`, `/about`;
`/startups` is the old address of `/projects` and answers a 301.

**Two routes may not share a name.** The name of a route is its last static
segment (`/app/admin/roles` → `roles`), and the framework refuses two routes
with the same name. Two addresses of the same page therefore need two
instances of the page class (`app/app.ts` keeps them as separate fields).

## The back office

The original's `admin_api` package is ported in `backend/api/admin.ts` (the
endpoints), `backend/db/services/rbac-service.ts` (the queries) and
`app/admin/` (the panel). The differences from the original, on purpose:

- the original guards the panel with a bearer token of its own; the port's
  panel lives inside the app, so the app's session cookie is the identity;
- the guard is the same: the `manage` permission opens the panel, and the
  `admin` role passes every check;
- the lists keep the original's envelope `{total, items}` (the moderation
  queue of team-up keeps its own `{reports}` / `{suspended}`);
- the panel's frame (`GET /api/admin/panel`) carries the sections, the
  texts and the languages — the port translates on the server.

The panel's styles are the `ui_kit` package's own (copied to
`public/css/admin/`), plus the admin's extras (`admin.css`). The icons are
Lucide's: the port keeps them as masks (`public/icons/admin/*.svg`, the
`.ui-icon` rule of `public/css/port.css`) — a mask follows `currentColor` for
free, and the icons were drawn this way before the dom runtime learned the
svg namespace (inline `<svg>` works now).

## The account recovery

The original's `auth` package is ported in `backend/api/auth-recovery.ts` and
`backend/db/services/auth-token-service.ts`; the pages are one component with
three addresses (`app/recovery/`):

- `POST /api/auth/forgot` — always `202 {ok:true}`, for a known and for an
  unknown address alike (the original never says which one it is). The link
  goes to the log when the account exists: the port has no mailer, and the
  original's mailer does the same in its dev mode.
- `POST /api/auth/reset` — the new password (at least 8 characters); every
  session of the account ends.
- `POST /api/auth/verify` — the address is confirmed.
- The tokens live in `auth_tokens` (only the SHA-256 of the token is stored)
  and expire: the verification in a day, the new password in an hour. The
  rate limits (3 per address and 10 per ip an hour) are counted in the db
  (`rate_events`).

## The rules of the port

1. **Do not edit** `app/app.ts`, `app/app.pavlus`, `app/state.ts`,
   `backend/app.ts`, `backend/routes.ts`, `backend/db/init/schema.sql`,
   `backend/db/init/seed.ts`, `public/css/*`, or the files of another feature.
   Report the exact lines the integration has to add (the route table entries,
   the seed call, the new files).
2. **Do not** `git commit`, `git add` or change the git state.
3. **Type check** your work: from `applications/team-up` run
   `../../node_modules/.bin/tsc --noEmit`. It must be clean. (The repository
   will not compile until every feature lands — the other features' files do
   not exist yet — so if `tsc` reports errors in files that are not yours,
   ignore them and check only your own.)
4. **Biome** formats the code: from the repository root run
   `npx biome format --write applications/team-up/<your files>`. The style is
   two spaces, double quotes, trailing commas, 80 columns.
5. Comment the code the way the port does: a short header per file saying
   what it is, and a comment where a decision is not obvious.

## The report

When you are done, report:
- the files you created,
- the API routes you need (the exact `backend/routes.ts` lines),
- the seed call the integration has to add,
- anything you could not port and why.
