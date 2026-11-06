-- Visual Design: what the application keeps.
-- A project is a name and its documents: `flow` (the Flow Studio diagram) and
-- `interface` (the Visual Builder project, wired to that diagram), each the JSON
-- text the studio exports, and `theme` (the colour theme of the app being designed). It runs when the server starts and changes nothing there.

create table if not exists projects (
  id serial primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists project_docs (
  project_id integer not null references projects (id) on delete cascade,
  key text not null,
  text text not null,
  updated_at timestamptz not null default now(),
  primary key (project_id, key)
);
