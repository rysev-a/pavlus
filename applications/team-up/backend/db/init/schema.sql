-- team-up, the port: the core of the original model (service-doc.md §4) on
-- Postgres. Computed things (match, "looking for people", founder, unread)
-- stay computed — nothing here stores a percentage.

drop table if exists
  notifications, messages, thread_participants, threads, friendships,
  applications, slot_skills, slots, projects, profiles_skills,
  profiles_professions, profiles, skills, professions_skills, professions,
  sessions, users
cascade;

create table users (
  id         serial primary key,
  email      text unique not null,
  name       text not null default '',
  password_hash text not null,             -- scrypt$N$r$p$salt$key (crypto plugin)
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
  status  text not null default 'not-searching',  -- searching | open | not-searching
  domains text[] not null default '{}'
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
  status        text not null default 'open'   -- open | joined | left
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
