-- The demo users: eight named ones first (the e2e tests rely on ann@ and
-- bob@ being on page 1), then 492 generated ones to fill fifty pages.
-- Runs after seed.sql: the roles must exist, the ids continue the named eight.
INSERT INTO users (name, email, role_id)
SELECT (ARRAY['Liam', 'Olivia', 'Noah', 'Emma', 'Ava', 'Ethan', 'Mia', 'Lucas',
              'Sophia', 'Mason', 'Isla', 'Logan', 'Aria', 'Jack', 'Luna',
              'Owen', 'Nora', 'Leo', 'Riley', 'Zoe'])[1 + ((g - 9) % 20)]
         || ' '
         || (ARRAY['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia',
                   'Miller', 'Davis', 'Martinez', 'Lopez', 'Wilson', 'Anderson',
                   'Taylor', 'Thomas', 'Moore', 'Jackson', 'Martin', 'Lee',
                   'Walker', 'Hall'])[1 + ((g - 9) % 20)],
       'u' || g || '@example.com',
       1 + (g % 3)
  FROM generate_series(9, 500) AS g;
