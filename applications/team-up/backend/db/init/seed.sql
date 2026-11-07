-- The directories: professions and the skill tree (an admin fills them, the
-- user chooses). Branches are navigation; only leaves carry a level.

insert into professions (slug, name) values
  ('backend',  'Backend developer'),
  ('frontend', 'Frontend developer'),
  ('mobile',   'Mobile developer'),
  ('design',   'Designer'),
  ('analytics','Analyst');

-- skills: id, slug, name, parent_id (parents are branches, not ratable)
insert into skills (id, slug, name, parent_id) values
  (100, 'db',        'Databases',    null),
  (101, 'postgres',  'Postgres',     100),
  (102, 'redis',     'Redis',        100),
  (103, 'mongodb',   'MongoDB',      100),
  (110, 'backend',   'Backend languages', null),
  (111, 'nodejs',    'Node.js',      110),
  (112, 'rust',      'Rust',         110),
  (113, 'go',        'Go',           110),
  (114, 'python',    'Python',       110),
  (120, 'frontend',  'Frontend',     null),
  (121, 'react',     'React',        120),
  (122, 'vue',       'Vue',          120),
  (123, 'typescript','TypeScript',   120),
  (124, 'css',       'CSS',          120),
  (130, 'ios',       'iOS',          null),
  (131, 'swift',     'Swift',        130),
  (132, 'swiftui',   'SwiftUI',      130),
  (140, 'android',   'Android',      null),
  (141, 'kotlin',    'Kotlin',       140),
  (142, 'compose',   'Jetpack Compose', 140),
  (150, 'design',    'Design tools', null),
  (151, 'figma',     'Figma',        150),
  (152, 'photoshop', 'Photoshop',    150),
  (153, 'blender',   'Blender',      150),
  (160, 'analytics', 'Analytics',    null),
  (161, 'tableau',   'Tableau',      160),
  (162, 'powerbi',   'Power BI',     160);
-- python (114) belongs to backend and analytics both: a skill may sit in two trees.

insert into professions_skills (profession_id, skill_id)
select p.id, s.id from professions p join skills s on s.slug in
  ('postgres','redis','mongodb','nodejs','rust','go','python') where p.slug='backend'
union select p.id, s.id from professions p join skills s on s.slug in
  ('react','vue','typescript','css') where p.slug='frontend'
union select p.id, s.id from professions p join skills s on s.slug in
  ('swift','swiftui','kotlin','compose','typescript') where p.slug='mobile'
union select p.id, s.id from professions p join skills s on s.slug in
  ('figma','photoshop','blender') where p.slug='design'
union select p.id, s.id from professions p join skills s on s.slug in
  ('tableau','powerbi','python','postgres') where p.slug='analytics';
