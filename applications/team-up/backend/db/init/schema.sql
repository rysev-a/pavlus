-- team-up, the port: the core of the original model (service-doc.md §4) on
-- Postgres. Computed things (match, "looking for people", founder, unread)
-- stay computed — nothing here stores a percentage.

drop table if exists
  notifications, messages, thread_participants, threads, friendships,
  applications, slot_skills, slots, projects, profiles_skills,
  profiles_professions, profiles, skills, professions_skills, professions,
  sessions, users,
  -- the public site (the original teamUP): the blog, the saved searches,
  -- the starred projects and the reports
  reports, favorites, saved_searches, posts,
  blocks, suspensions, avatars, notify_settings,
  -- the account recovery and the back office (the original's `auth` package)
  auth_tokens, rate_events, role_permissions, user_roles, permissions, roles,
  admin_sessions, system_tasks
cascade;

create table users (
  id         serial primary key,
  email      text unique not null,
  name       text not null default '',
  password_hash text not null,             -- scrypt$N$r$p$salt$key (crypto plugin)
  locale     text not null default 'en',    -- the account's language preference
  is_admin   boolean not null default false, -- the back office
  created_at timestamptz not null default now()
);

create table sessions (
  token      text primary key,
  user_id    int not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- directories (an admin fills them; the user chooses)
create table professions (
  id   serial primary key,
  slug text unique not null,
  name text not null
);
create table skills (
  id        serial primary key,
  slug      text unique not null,
  name      text not null,
  parent_id int references skills(id) on delete cascade
);
create table professions_skills (
  profession_id int not null references professions(id) on delete cascade,
  skill_id      int not null references skills(id) on delete cascade,
  primary key (profession_id, skill_id)
);

create table profiles (
  user_id int primary key references users(id) on delete cascade,
  slug    text unique not null,
  city    text not null default '',
  bio     text not null default '',
  -- the contacts of the member: only the friends and the member see them
  contacts text not null default '',
  status  text not null default 'not-searching',  -- searching | open | not-searching
  domains text[] not null default '{}',
  labels  text[] not null default '{}',   -- the public directory's labels
  birth_year int,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  last_login_at timestamptz
);
create table profiles_professions (
  user_id       int not null references users(id) on delete cascade,
  profession_id int not null references professions(id) on delete cascade,
  bucket        text not null check (bucket in ('junior','middle','senior','lead')),
  primary key (user_id, profession_id)
);
create table profiles_skills (           -- leaves only, no zero: no row = no rating
  user_id  int not null references users(id) on delete cascade,
  skill_id int not null references skills(id) on delete cascade,
  level    int not null check (level between 1 and 10),
  primary key (user_id, skill_id)
);

-- projects (the product says "project"; `startup` names stay internal)
create table projects (
  id          serial primary key,
  owner_id    int not null references users(id) on delete cascade,
  slug        text unique not null,
  name        text not null,
  tagline     text not null default '',
  description text not null default '',
  kind        text not null default 'startup' check (kind in ('startup','company','part-time')),
  tags        text[] not null default '{}',
  status      text not null default 'active'   -- active | paused | done | cancelled
  -- the public catalog (the original teamUP's startup fields)
  , work_mode text not null default 'remote' check (work_mode in ('remote','office','hybrid'))
  , city      text not null default ''
  , website   text not null default ''
  , budget    int
  , budget_currency text
  , deadline  date
  , created_at timestamptz not null default now()
);
create table slots (                      -- a role slot; user_id null = a vacancy
  id            serial primary key,
  project_id    int not null references projects(id) on delete cascade,
  profession_id int not null references professions(id),
  bucket        text not null check (bucket in ('junior','middle','senior','lead')),
  description   text not null default '',
  pay           text check (pay in ('unpaid','equity','paid')),
  pay_from      int check (pay_from is null or pay_from between 1 and 100000000),
  pay_to        int check (pay_to is null or pay_to between 1 and 100000000),
  currency      text,
  user_id       int references users(id) on delete set null,
  -- the invitation lives on the slot itself (the original's model): the slot
  -- holds the invitee, the inviter and the status `invited`
  invited_by    int references users(id) on delete set null,
  status        text not null default 'open'   -- open | invited | joined | left
);
create table slot_skills (                -- what the slot requires (leaves, 1..10)
  slot_id  int not null references slots(id) on delete cascade,
  skill_id int not null references skills(id) on delete cascade,
  level    int not null check (level between 1 and 10),
  primary key (slot_id, skill_id)
);

create table applications (
  id            serial primary key,
  slot_id       int not null references slots(id) on delete cascade,
  user_id       int not null references users(id) on delete cascade,
  message       text not null default '',
  profession_id int references professions(id),
  bucket        text,
  status        text not null default 'new',    -- new | accepted | declined | withdrawn
  created_at    timestamptz not null default now(),
  unique (slot_id, user_id)
);

create table friendships (                -- mirrored pair: 2 rows per relation
  user_id   int not null references users(id) on delete cascade,
  friend_id int not null references users(id) on delete cascade,
  status    text not null check (status in ('waiting','incoming','friends','removed')),
  primary key (user_id, friend_id)
);

create table threads (
  id         serial primary key,
  type       text not null check (type in ('dm','project')),
  project_id int references projects(id) on delete cascade
);
create table messages (
  id         serial primary key,
  thread_id  int not null references threads(id) on delete cascade,
  user_id    int not null references users(id),
  body       text not null,
  sent_at    timestamptz not null default now()
);
create table thread_participants (
  thread_id            int not null references threads(id) on delete cascade,
  user_id              int not null references users(id) on delete cascade,
  last_read_message_id int references messages(id),
  primary key (thread_id, user_id)
);

create table notifications (              -- what the queue consumer writes
  id         serial primary key,
  user_id    int not null references users(id) on delete cascade,
  kind       text not null,               -- message | application | friend
  body       text not null,
  created_at timestamptz not null default now()
);

create index on slots (project_id);
create index on applications (user_id);
create index on messages (thread_id, id);

-- ---------------------------------------------------------------- the public site

-- the blog: a post is addressed by its pid (the original's /blog/{pid})
create table posts (
  pid     text primary key,
  title   text not null,
  content text not null default '',
  date    date not null default current_date,
  tags    text[] not null default '{}'
);

-- a signed-in member's starred projects (the catalog's star button)
create table favorites (
  user_id int not null references users(id) on delete cascade,
  slug    text not null,
  primary key (user_id, slug)
);

-- a signed-in member's saved searches (the catalog's "Saved searches" box)
create table saved_searches (
  id      serial primary key,
  user_id int not null references users(id) on delete cascade,
  name    text not null,
  query   text not null default '',
  created_at timestamptz not null default now()
);

-- the report dialog of a member, a project or a message
create table reports (
  id           serial primary key,
  kind         text not null check (kind in ('person','project','message')),
  target       text not null,
  reason       text not null check (reason in ('spam','abuse','fake','other')),
  details      text not null default '',
  user_id      int references users(id) on delete set null,
  target_label text not null default '',   -- how the target is called
  subject_id   int references users(id) on delete set null,  -- who answers for it
  excerpt      text not null default '',   -- the text of a reported message
  status       text not null default 'open'
                check (status in ('open','actioned','dismissed')),
  action       text not null default '',   -- dismiss | cancel_project | remove_message | suspend
  note         text not null default '',
  handled_at   timestamptz,
  handled_by   int references users(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- a block is one-way: the blocked member cannot write to the blocker
create table blocks (
  user_id    int not null references users(id) on delete cascade,
  slug       text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, slug)
);

-- a suspended member is hidden from the directory until the suspension ends
create table suspensions (
  user_id    int primary key references users(id) on delete cascade,
  reason     text not null default '',
  until      timestamptz,
  created_at timestamptz not null default now()
);

-- the picture of a member (the original keeps it in its own table too)
create table avatars (
  user_id    int primary key references users(id) on delete cascade,
  mime       text not null default 'image/png',
  data       bytea not null,
  updated_at timestamptz not null default now()
);

-- which e-mails a member wants (the topics of the settings page)
create table notify_settings (
  user_id      int primary key references users(id) on delete cascade,
  applications boolean not null default true,
  friends      boolean not null default true,
  messages     boolean not null default true
);

create index on posts (date);
create index on saved_searches (user_id);
create index on reports (status);
create index on reports (user_id);

-- ---------------------------------------------------------------------------
-- the account recovery (the original's `auth` package): the one-time tokens
-- of the verification of the address and of the new password. Only the hash of
-- a token is stored — the letter carries the token itself.
-- ---------------------------------------------------------------------------
create table auth_tokens (
  id         serial primary key,
  user_id    int not null references users(id) on delete cascade,
  kind       text not null check (kind in ('verify_email','password_reset')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index on auth_tokens (user_id, kind);

-- the rate limits of the db (the original counts the events in the database,
-- so they hold across the instances)
create table rate_events (
  id serial primary key,
  key text not null,
  at timestamptz not null default now()
);
create index on rate_events (key, at);

-- ---------------------------------------------------------------------------
-- the back office (the original's `auth` package): roles and permissions.
-- The `admin` role is the superuser; the `manage` permission opens the panel.
-- ---------------------------------------------------------------------------
create table roles (
  name text primary key
);

create table permissions (
  name text primary key
);

create table user_roles (
  user_id int not null references users(id) on delete cascade,
  role   text not null references roles(name) on delete cascade,
  primary key (user_id, role)
);

create table role_permissions (
  role       text not null references roles(name) on delete cascade,
  permission text not null references permissions(name) on delete cascade,
  primary key (role, permission)
);

-- the sessions of the back office (the original stores them in the database:
-- an opaque token, only its hash is kept)
create table admin_sessions (
  id           serial primary key,
  user_id      int not null references users(id) on delete cascade,
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  last_active  timestamptz not null default now(),
  expires_at   timestamptz not null
);
create index on admin_sessions (user_id);

-- the tasks of the system (the original's `system_tasks`): the letters, the
-- cleanups and the other background work
create table system_tasks (
  id          serial primary key,
  kind        text not null,
  payload     jsonb not null default '{}'::jsonb,
  status      text not null default 'queued'
              check (status in ('queued','running','done','failed','cancelled')),
  attempts    int not null default 0,
  last_error  text not null default '',
  run_at      timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index on system_tasks (status, run_at);
