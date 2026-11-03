DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS roles;

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

CREATE TABLE products (
  id    serial PRIMARY KEY,
  name  text NOT NULL,
  price numeric(8, 2) NOT NULL,
  stock integer NOT NULL DEFAULT 0
);

CREATE TABLE payments (
  id      serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users (id),
  amount  numeric(9, 2) NOT NULL,
  status  text NOT NULL DEFAULT 'paid',
  paid_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX payments_user_id ON payments (user_id);
