// Migrations, as data: 001 creates the schema, 002 seeds the demo data
// (3 shops, 10 products, 3 users, 5 orders). The postgres plugin runs them in
// order, one transaction each, behind an advisory lock — safe with two
// instances booting at once. A database that already has the migrations table
// skips both; a fresh one (the dev volume on first boot, or the throwaway
// schema of every e2e run) gets exactly this data.

export const migrations = [
  {
    name: "001_init",
    sql: `
      create table shops (
        id serial primary key,
        name text not null,
        slug text not null unique,
        description text not null default '',
        created_at timestamptz not null default now()
      );

      create table categories (
        id serial primary key,
        shop_id integer not null references shops(id) on delete cascade,
        name text not null,
        slug text not null,
        created_at timestamptz not null default now(),
        unique (shop_id, slug)
      );

      create table products (
        id serial primary key,
        shop_id integer not null references shops(id) on delete cascade,
        category_id integer not null references categories(id),
        name text not null,
        slug text not null,
        description text not null default '',
        price_cents integer not null check (price_cents >= 0),
        stock integer not null default 0 check (stock >= 0),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (shop_id, slug)
      );
      create index products_category on products (category_id, id);

      create table users (
        id serial primary key,
        email text not null unique,
        name text not null,
        created_at timestamptz not null default now()
      );

      create table orders (
        id serial primary key,
        user_id integer not null references users(id) on delete cascade,
        shop_id integer not null references shops(id) on delete cascade,
        status text not null default 'pending'
          check (status in ('pending', 'paid', 'shipped', 'cancelled')),
        total_cents integer not null default 0 check (total_cents >= 0),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create index orders_user on orders (user_id, id desc);
      create index orders_shop on orders (shop_id, id desc);

      create table order_items (
        id serial primary key,
        order_id integer not null references orders(id) on delete cascade,
        product_id integer not null references products(id),
        quantity integer not null check (quantity > 0),
        unit_price_cents integer not null check (unit_price_cents >= 0)
      );
      create index order_items_order on order_items (order_id, id);
    `,
  },
  {
    name: "002_seed",
    // Historical data: the unit prices are snapshotted per item, so the seed
    // does not (and should not) touch the current stock.
    sql: `
      insert into shops (id, name, slug, description) values
        (1, 'Orb Coffee Roasters', 'orb-coffee',
         'Small-batch specialty coffee, roasted weekly'),
        (2, 'Nimbus Books', 'nimbus-books',
         'Fiction and computing books from the cloud'),
        (3, 'Volt Electronics', 'volt-electronics',
         'Audio gear and desk accessories');
      select setval('shops_id_seq', 3);

      insert into categories (id, shop_id, name, slug) values
        (1, 1, 'Espresso', 'espresso'),
        (2, 1, 'Filter', 'filter'),
        (3, 2, 'Fiction', 'fiction'),
        (4, 2, 'Computing', 'computing'),
        (5, 3, 'Audio', 'audio'),
        (6, 3, 'Accessories', 'accessories');
      select setval('categories_id_seq', 6);

      insert into products
        (id, shop_id, category_id, name, slug, description, price_cents, stock) values
        (1, 1, 1, 'Daterra Sunrise Espresso 250g', 'daterra-sunrise-espresso',
         'Brazilian espresso, chocolate and hazelnut', 1850, 40),
        (2, 1, 1, 'Nightshift Blend 1kg', 'nightshift-blend',
         'The dark roast for milk drinks', 5200, 12),
        (3, 1, 2, 'Ethiopia Guji Washed 250g', 'ethiopia-guji-washed',
         'Floral and citrus, pour-over or filter', 2150, 25),
        (4, 1, 2, 'V60 Paper Filters (100)', 'v60-paper-filters',
         'White, size 02', 900, 120),
        (5, 2, 3, 'The Cloud Atlas', 'the-cloud-atlas',
         'A novel of six lives, one comet', 1599, 33),
        (6, 2, 3, 'Pavlus Nights', 'pavlus-nights',
         'Essays on message-driven systems', 1299, 21),
        (7, 2, 4, 'Pure Functions in Production', 'pure-functions-in-production',
         'Effects, plugins and other honest abstractions', 4499, 14),
        (8, 3, 5, 'Orb Buds Pro', 'orb-buds-pro',
         'Noise-cancelling earbuds, 30h case', 12900, 8),
        (9, 3, 5, 'Studio Monitor One', 'studio-monitor-one',
         'A flat-response desktop speaker', 49900, 3),
        (10, 3, 6, 'USB-C Everything Cable 2m', 'usb-c-everything-cable',
         '240W braided USB-C cable', 1900, 60);
      select setval('products_id_seq', 10);

      insert into users (id, email, name) values
        (1, 'ann@example.com', 'Ann Petrova'),
        (2, 'ben@example.com', 'Ben Okafor'),
        (3, 'cy@example.com', 'Cy Lindqvist');
      select setval('users_id_seq', 3);

      insert into orders (id, user_id, shop_id, status, total_cents) values
        (1, 1, 1, 'paid', 4600),
        (2, 2, 1, 'shipped', 3950),
        (3, 3, 2, 'pending', 6098),
        (4, 1, 3, 'paid', 16700),
        (5, 2, 3, 'cancelled', 49900);
      select setval('orders_id_seq', 5);

      insert into order_items (order_id, product_id, quantity, unit_price_cents) values
        (1, 1, 2, 1850),
        (1, 4, 1, 900),
        (2, 3, 1, 2150),
        (2, 4, 2, 900),
        (3, 7, 1, 4499),
        (3, 5, 1, 1599),
        (4, 8, 1, 12900),
        (4, 10, 2, 1900),
        (5, 9, 1, 49900);
      select setval('order_items_id_seq', 9);
    `,
  },
];
