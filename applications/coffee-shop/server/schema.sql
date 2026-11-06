-- The tables of the design, made from the rows the simulation starts with.
-- It runs when the server starts (server/db.ts) and changes nothing that is there.

create table if not exists "customers" (
  "id" serial primary key,
  "name" text,
  "email" text not null,
  "phone" text,
  "points" integer,
  "created_at" timestamptz,
  constraint "customers_email_key" unique ("email")
);

create table if not exists "products" (
  "id" serial primary key,
  "name" text not null,
  "category" text,
  "price" double precision,
  "active" boolean,
  constraint "products_name_key" unique ("name")
);

create table if not exists "orders" (
  "id" serial primary key,
  "customer_id" integer,
  "customer_name" text,
  "items" jsonb,
  "total" double precision,
  "status" text,
  "created_at" timestamptz
);
