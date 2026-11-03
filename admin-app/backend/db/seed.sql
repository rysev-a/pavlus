INSERT INTO roles (name, description) VALUES
  ('admin',  'Full access to everything'),
  ('editor', 'Can change content'),
  ('viewer', 'Read only');

INSERT INTO users (name, email, role_id) VALUES
  ('Ann',    'ann@example.com',    1),
  ('Bob',    'bob@example.com',    2),
  ('Anton',  'anton@example.com',  2),
  ('Clara',  'clara@example.com',  3),
  ('Dmitry', 'dmitry@example.com', 3),
  ('Elena',  'elena@example.com',  2),
  ('Fedor',  'fedor@example.com',  3),
  ('Galina', 'galina@example.com', 1);

INSERT INTO products (name, price, stock) VALUES
  ('Mechanical Keyboard',       149.00, 12),
  ('Wireless Mouse',             49.90, 34),
  ('USB-C Dock',                199.00,  7),
  ('4K Monitor',                449.50,  5),
  ('Laptop Stand',               59.00, 20),
  ('Webcam 1080p',               89.90, 15),
  ('Noise-Cancelling Headset',  249.00,  3),
  ('External SSD 1TB',          129.90, 25),
  ('Desk Mat',                   29.00, 40),
  ('HDMI Cable 2m',              12.50, 60);

INSERT INTO payments (user_id, amount, status, paid_at) VALUES
  (1, 149.00, 'paid',     '2026-10-30 14:05'),
  (2,  49.90, 'paid',     '2026-10-29 09:12'),
  (3, 199.00, 'paid',     '2026-10-27 18:40'),
  (8, 449.50, 'paid',     '2026-10-25 11:30'),
  (4,  59.00, 'refunded', '2026-10-22 16:00'),
  (5,  89.90, 'paid',     '2026-10-19 08:45'),
  (6, 249.00, 'paid',     '2026-10-15 20:10'),
  (7, 129.90, 'pending',  '2026-10-12 13:25'),
  (2,  29.00, 'paid',     '2026-10-08 10:00'),
  (1,  12.50, 'paid',     '2026-10-01 17:55');
