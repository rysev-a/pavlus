// Migrations, as data. The postgres plugin runs them in order, one
// transaction each, behind an advisory lock (safe with two instances booting).

export const migrations = [
  {
    name: "001_init",
    sql: `
      create table users (
        id serial primary key,
        email text not null unique,
        password_hash text not null,
        created_at timestamptz not null default now()
      );
      create table todos (
        id serial primary key,
        user_id integer not null references users(id) on delete cascade,
        title text not null,
        done boolean not null default false,
        position integer not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create index todos_user_position on todos (user_id, position, id);
      create table chat_messages (
        id serial primary key,
        room text not null,
        user_id integer not null references users(id) on delete cascade,
        email text not null,
        text text not null,
        created_at timestamptz not null default now()
      );
      create index chat_room_id on chat_messages (room, id desc);
    `,
  },
];
