DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS processes;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS categories;

CREATE TABLE roles (
  id          serial PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT ''
);

CREATE TABLE users (
  id      serial PRIMARY KEY,
  name    text NOT NULL,
  email   text NOT NULL UNIQUE,
  role_id integer NOT NULL REFERENCES roles (id)
);

CREATE INDEX users_role_id ON users (role_id);

CREATE TABLE permissions (
  id          serial PRIMARY KEY,
  code        text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT ''
);

-- Which role may what: the admin's role holds every permission.
CREATE TABLE role_permissions (
  role_id       integer NOT NULL REFERENCES roles (id),
  permission_id integer NOT NULL REFERENCES permissions (id),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE categories (
  id   serial PRIMARY KEY,
  name text NOT NULL UNIQUE
);

CREATE TABLE products (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  price       numeric(8, 2) NOT NULL,
  stock       integer NOT NULL DEFAULT 0,
  category_id integer NOT NULL REFERENCES categories (id)
);

CREATE INDEX products_category_id ON products (category_id);

CREATE TABLE payments (
  id      serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users (id),
  amount  numeric(9, 2) NOT NULL,
  status  text NOT NULL DEFAULT 'paid',
  paid_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX payments_user_id ON payments (user_id);

-- Orders are placed by users ("from users"): one row per order.
CREATE TABLE orders (
  id         serial PRIMARY KEY,
  user_id    integer NOT NULL REFERENCES users (id),
  total      numeric(9, 2) NOT NULL,
  status     text NOT NULL DEFAULT 'new',
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX orders_user_id ON orders (user_id);

CREATE TABLE tasks (
  id       serial PRIMARY KEY,
  title    text NOT NULL,
  status   text NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0
);

CREATE TABLE processes (
  id     serial PRIMARY KEY,
  name   text NOT NULL,
  pid    integer NOT NULL,
  cpu    numeric(4, 1) NOT NULL DEFAULT 0,
  memory integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running'
);

CREATE TABLE sessions (
  id         serial PRIMARY KEY,
  user_id    integer NOT NULL REFERENCES users (id),
  ip         text NOT NULL DEFAULT '',
  created_at timestamp NOT NULL DEFAULT now(),
  expires_at timestamp NOT NULL
);

CREATE INDEX sessions_user_id ON sessions (user_id);

CREATE TABLE notifications (
  id         serial PRIMARY KEY,
  title      text NOT NULL,
  body       text NOT NULL DEFAULT '',
  read       boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now()
);

-- One row (id = 1): the app's look, currently only the theme.
CREATE TABLE settings (
  id    integer PRIMARY KEY CHECK (id = 1),
  theme text NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark'))
);
