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

INSERT INTO permissions (code, description) VALUES
  ('users.read',       'See the users'),
  ('users.write',      'Create and edit users'),
  ('roles.read',       'See the roles'),
  ('roles.write',      'Create and edit roles'),
  ('permissions.read', 'See the permissions'),
  ('permissions.write', 'Create and edit permissions'),
  ('shop.read',        'Browse the catalogue'),
  ('shop.write',       'Manage products and categories'),
  ('orders.read',      'See the orders'),
  ('orders.write',     'Change the orders'),
  ('system.read',      'See tasks and processes'),
  ('system.manage',    'Run tasks and manage the system');

-- admin: everything; editor: read everywhere plus the shop; viewer: read only.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
 WHERE r.name = 'admin'
    OR (r.name = 'editor'
        AND (p.code LIKE '%.read' OR p.code IN ('shop.write', 'orders.write')))
    OR (r.name = 'viewer' AND p.code LIKE '%.read');

INSERT INTO categories (name) VALUES
  ('Peripherals'),
  ('Audio'),
  ('Displays'),
  ('Storage'),
  ('Networking'),
  ('Cables'),
  ('Desk Accessories'),
  ('Lighting'),
  ('Power'),
  ('Video');

INSERT INTO products (name, price, stock, category_id) VALUES
  ('Mechanical Keyboard',       149.00, 12, 1),
  ('Wireless Mouse',             49.90, 34, 1),
  ('USB-C Dock',                199.00,  7, 9),
  ('4K Monitor',                449.50,  5, 3),
  ('Laptop Stand',               59.00, 20, 7),
  ('Webcam 1080p',               89.90, 15, 10),
  ('Noise-Cancelling Headset',  249.00,  3, 2),
  ('External SSD 1TB',          129.90, 25, 4),
  ('Desk Mat',                   29.00, 40, 7),
  ('HDMI Cable 2m',              12.50, 60, 6),
  ('Ergonomic Trackball',        79.90, 18, 1),
  ('Split Mechanical Keyboard', 219.00,  6, 1),
  ('Wireless Presenter',         39.90, 22, 1),
  ('Graphics Tablet',           189.00,  9, 1),
  ('Studio Microphone',         159.00, 11, 2),
  ('USB Microphone',             99.00, 17, 2),
  ('Desktop Speakers',          129.00, 13, 2),
  ('Monitor Headphones',        179.00,  8, 2),
  ('USB Audio Interface',       229.00,  4, 2),
  ('Ultrawide Monitor',         699.00,  3, 3),
  ('Portable Monitor',          259.00, 10, 3),
  ('Monitor Light Bar',          69.90, 21, 8),
  ('Monitor Arm',                89.00, 14, 7),
  ('Screen Privacy Filter',      49.00, 16, 3),
  ('NVMe SSD 2TB',              179.00, 12, 4),
  ('External HDD 4TB',          119.00, 19, 4),
  ('SD Card 256GB',              39.90, 28, 4),
  ('USB Flash Drive 128GB',      19.90, 45, 4),
  ('RAID Enclosure',            349.00,  2, 4),
  ('Wi-Fi 6 Router',            199.00,  6, 5),
  ('Mesh Wi-Fi Point',          149.00,  9, 5),
  ('Gigabit Switch 8-port',      59.90, 13, 5),
  ('USB LAN Adapter',            24.90, 31, 5),
  ('Cable Kit braided',          29.90, 26, 6),
  ('USB-C Cable 2m',             14.90, 50, 6),
  ('DisplayPort Cable 3m',       18.90, 35, 6),
  ('Adapter Set USB-C',          34.90, 24, 6),
  ('KVM Switch',                 89.90,  7, 6),
  ('Cable Clips',                 9.90, 64, 7),
  ('Monitor Riser',              39.90, 23, 7),
  ('Under-Desk Drawer',          44.90, 15, 7),
  ('Desk Organizer',             34.00, 20, 7),
  ('LED Desk Lamp',              79.90, 12, 8),
  ('RGB Light Strip',            49.90, 27, 8),
  ('Smart Bulb Kit',             59.90, 18, 8),
  ('Desk Floodlight',            99.00,  8, 8),
  ('Wall Charger 65W',           44.90, 30, 9),
  ('Power Bank 20000mAh',        59.90, 21, 9),
  ('UPS 850VA',                 139.00,  5, 9),
  ('Magnetic Cable Manager',     12.90, 42, 9);

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

-- Twenty orders placed by the users, the newest first when listed.
INSERT INTO orders (user_id, total, status, created_at) VALUES
  (2, 149.00, 'new',       '2026-11-02 10:15'),
  (5, 698.40, 'paid',      '2026-11-01 16:42'),
  (1,  49.90, 'paid',      '2026-10-31 09:05'),
  (8, 259.00, 'shipped',   '2026-10-30 19:20'),
  (3,  29.90, 'paid',      '2026-10-29 12:00'),
  (6, 449.50, 'shipped',   '2026-10-27 14:35'),
  (4,  99.00, 'paid',      '2026-10-26 11:50'),
  (7, 129.90, 'delivered', '2026-10-24 17:10'),
  (2,  59.90, 'paid',      '2026-10-23 08:25'),
  (5, 179.00, 'cancelled', '2026-10-21 20:45'),
  (1, 229.00, 'shipped',   '2026-10-20 13:15'),
  (8,  39.90, 'paid',      '2026-10-18 15:40'),
  (3, 349.00, 'paid',      '2026-10-16 10:55'),
  (6,  14.90, 'delivered', '2026-10-14 09:30'),
  (4, 249.00, 'delivered', '2026-10-12 18:05'),
  (7,  89.90, 'paid',      '2026-10-10 11:20'),
  (2, 199.00, 'shipped',   '2026-10-08 16:00'),
  (5,  44.90, 'paid',      '2026-10-06 14:50'),
  (1,  69.90, 'delivered', '2026-10-04 10:35'),
  (8, 159.00, 'cancelled', '2026-10-02 19:25');

-- Thirty background tasks: ten jobs cycled through three runs.
INSERT INTO tasks (title, status, progress)
SELECT (ARRAY['Cleanup temp files', 'Sync inventory', 'Send weekly digest',
              'Rotate API keys', 'Reindex search', 'Backup database',
              'Generate invoices', 'Fetch exchange rates',
              'Prune old sessions', 'Warm caches'])[1 + ((g - 1) % 10)]
         || ' #' || g,
       (ARRAY['done', 'running', 'queued', 'failed'])[1 + (g % 4)],
       CASE (ARRAY['done', 'running', 'queued', 'failed'])[1 + (g % 4)]
         WHEN 'done' THEN 100
         WHEN 'running' THEN 20 + (g * 7) % 70
         ELSE 0
       END
  FROM generate_series(1, 30) AS g;

-- Twenty processes: the services a demo deployment would run.
INSERT INTO processes (name, pid, cpu, memory, status)
SELECT (ARRAY['postgres', 'node server', 'redis-server', 'nginx',
              'worker:mailer', 'worker:images', 'cron', 'sshd', 'systemd',
              'vite dev'])[1 + ((g - 1) % 10)]
         || CASE WHEN g > 10 THEN ' (2)' ELSE '' END,
       1000 + g * 7,
       ((g * 13) % 87)::numeric + 0.5,
       64 + (g * 29) % 512,
       (ARRAY['running', 'running', 'sleeping'])[1 + (g % 3)]
  FROM generate_series(1, 20) AS g;

INSERT INTO sessions (user_id, ip, created_at, expires_at) VALUES
  (1, '203.0.113.10',   '2026-11-02 08:55', '2026-11-09 08:55'),
  (2, '198.51.100.24',  '2026-11-01 19:30', '2026-11-08 19:30'),
  (3, '203.0.113.77',   '2026-11-01 09:12', '2026-11-08 09:12'),
  (4, '198.51.100.6',   '2026-10-31 21:05', '2026-11-07 21:05'),
  (5, '203.0.113.140',  '2026-10-31 07:48', '2026-11-07 07:48'),
  (6, '198.51.100.101', '2026-10-30 22:19', '2026-11-06 22:19'),
  (7, '203.0.113.58',   '2026-10-30 06:33', '2026-11-06 06:33'),
  (8, '198.51.100.77',  '2026-10-29 18:57', '2026-11-05 18:57');

INSERT INTO notifications (title, body, read, created_at) VALUES
  ('Backup finished',       'The nightly backup completed in 4m 12s.',        true,  '2026-11-02 03:15'),
  ('New order received',    'Order #21 was placed by bob@example.com.',       false, '2026-11-02 10:16'),
  ('Payment failed',        'The card was declined for order #25.',           false, '2026-11-01 12:40'),
  ('Disk usage at 80%',     'The database volume is filling up.',             false, '2026-10-31 05:00'),
  ('Deploy succeeded',      'Version 2.4.1 is live on all nodes.',            true,  '2026-10-30 15:22'),
  ('Certificate renewed',   'The TLS certificate is valid for another year.', true,  '2026-10-28 09:00');

INSERT INTO settings (id, theme) VALUES (1, 'light');
