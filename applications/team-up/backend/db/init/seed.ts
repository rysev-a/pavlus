/**
 * The demo world (db:init and the test reseed share it): six members, three
 * projects with seven slots, one application, two friendships, two chats.
 * The passwords must be scrypt hashes in the crypto plugin's
 * `scrypt$N$r$p$salt$key` format, so a login through the plugin works.
 * Everyone's demo password: `teamup123`.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Query } from "./query.ts";

const N = 16384,
  R = 8,
  P = 1,
  KEY = 32,
  SALT = 16;
const b64 = (b: Buffer): string => b.toString("base64url");

/** The crypto plugin's hash format, so `cryptoEffector.verify` accepts it. */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT);
  const key = scryptSync(password, salt, KEY, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${b64(salt)}$${b64(key)}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, n, r, p, salt, key] = stored.split("$");
  if (scheme !== "scrypt") return false;
  const want = Buffer.from(key, "base64url");
  const got = scryptSync(
    password,
    Buffer.from(salt, "base64url"),
    want.length,
    {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    },
  );
  return want.length === got.length && timingSafeEqual(want, got);
}

const SKILL: Record<string, number> = {
  postgres: 101,
  redis: 102,
  mongodb: 103,
  nodejs: 111,
  rust: 112,
  go: 113,
  python: 114,
  react: 121,
  vue: 122,
  typescript: 123,
  css: 124,
  swift: 131,
  swiftui: 132,
  kotlin: 141,
  compose: 142,
  figma: 151,
  photoshop: 152,
  blender: 153,
  tableau: 161,
  powerbi: 162,
};
const PROF: Record<string, number> = {
  backend: 1,
  frontend: 2,
  mobile: 3,
  design: 4,
  analytics: 5,
};

/** The demo members: email → name, city, status, professions, skills 1..10. */
const MEMBERS = [
  {
    email: "ann@team.up",
    name: "Anna Founder",
    slug: "anna",
    city: "Berlin",
    status: "searching",
    professions: { backend: "senior" },
    skills: { postgres: 8, redis: 7, rust: 7, go: 6 },
  },
  {
    email: "bob@team.up",
    name: "Bob Backend",
    slug: "bob",
    city: "Prague",
    status: "open",
    professions: { backend: "middle" },
    skills: { postgres: 6, redis: 5, nodejs: 7, python: 6 },
  },
  {
    email: "clara@team.up",
    name: "Clara Front",
    slug: "clara",
    city: "Berlin",
    status: "searching",
    professions: { frontend: "senior" },
    skills: { react: 9, vue: 6, typescript: 9, css: 8 },
  },
  {
    email: "dmitry@team.up",
    name: "Dmitry Design",
    slug: "dmitry",
    city: "Lisbon",
    status: "open",
    professions: { design: "middle" },
    skills: { figma: 8, photoshop: 6 },
  },
  {
    email: "elena@team.up",
    name: "Elena Mobile",
    slug: "elena",
    city: "Astana",
    status: "searching",
    professions: { mobile: "senior" },
    skills: { swift: 9, swiftui: 8, kotlin: 7, compose: 6 },
  },
  {
    email: "felix@team.up",
    name: "Felix Analyst",
    slug: "felix",
    city: "Prague",
    status: "not-searching",
    professions: { analytics: "junior" },
    skills: { tableau: 7, powerbi: 5, python: 5 },
  },
];

/** Everything users reference: profiles, projects, slots, chats, one application. */
export async function seedWorld(query: Query): Promise<void> {
  const ids = new Map<string, number>();
  for (const m of MEMBERS) {
    const rows = await query<{ id: number }>(
      `insert into users (email, name, password_hash) values ($1,$2,$3) returning id`,
      [m.email, m.name, hashPassword("teamup123")],
    );
    const id = rows[0].id;
    ids.set(m.slug, id);
    await query(
      `insert into profiles (user_id, slug, city, status) values ($1,$2,$3,$4)`,
      [id, m.slug, m.city, m.status],
    );
    for (const [prof, bucket] of Object.entries(m.professions))
      await query(`insert into profiles_professions values ($1,$2,$3)`, [
        id,
        PROF[prof],
        bucket,
      ]);
    for (const [skill, level] of Object.entries(m.skills))
      await query(`insert into profiles_skills values ($1,$2,$3)`, [
        id,
        SKILL[skill],
        level,
      ]);
  }
  const ann = ids.get("anna")!,
    bob = ids.get("bob")!,
    dmitry = ids.get("dmitry")!;

  // Orbit Labs (startup): a filled design seat and two open slots.
  const orbit = (
    await query<{ id: number }>(
      `insert into projects (owner_id, slug, name, tagline, description, kind, tags)
       values ($1,'orbit-labs','Orbit Labs','A rust-flavoured tools studio',
               'We build small sharp dev-tools and want a second backend and a frontend.','startup','{devtools, rust}')
       returning id`,
      [ann],
    )
  )[0].id;
  const slots = await query<{ id: number; profession_id: number }>(
    `insert into slots (project_id, profession_id, bucket, description, user_id, status) values
       ($1, 1, 'senior', 'Second backend: storage, sync, release plumbing', null, 'open'),
       ($1, 2, 'middle', 'The console UI: views, forms, the patch timeline', null, 'open')
     returning id, profession_id`,
    [orbit],
  );
  await query(
    `insert into slots (project_id, profession_id, bucket, user_id, status) values ($1, 4, 'middle', $2, 'joined')`,
    [orbit, dmitry],
  );
  const backendSlot = slots.find((s) => s.profession_id === 1)!.id;
  await query(
    `insert into slot_skills values ($1, 112, 7), ($1, 101, 6)`, // rust 7, postgres 6
    [backendSlot],
  );

  // Nord HR (company): paid vacancies.
  await query(
    `insert into projects (owner_id, slug, name, tagline, kind, tags) values
       ($1,'nord-hr','Nord HR','We match tech people with nordic companies','company','{hr}')`,
    [ann],
  );
  const nord = (
    await query<{ id: number }>(`select id from projects where slug='nord-hr'`)
  )[0].id;
  await query(
    `insert into slots (project_id, profession_id, bucket, pay, pay_from, pay_to, currency) values
       ($1, 2, 'senior', 'paid', 150000, 250000, 'RUB'),
       ($1, 5, 'junior', 'paid', 60000, null, 'RUB')`,
    [nord],
  );

  // Copy Boost (part-time): one paid job slot.
  await query(
    `insert into projects (owner_id, slug, name, tagline, kind) values
       ($1,'copy-boost','Copy Boost','Landing pages that sell, in a week','part-time')`,
    [bob],
  );
  const copy = (
    await query<{ id: number }>(
      `select id from projects where slug='copy-boost'`,
    )
  )[0].id;
  await query(
    `insert into slots (project_id, profession_id, bucket, pay, pay_from, currency) values
       ($1, 4, 'middle', 'paid', 30000, 'RUB')`,
    [copy],
  );

  // Bob applied to Orbit's backend slot.
  await query(
    `insert into applications (slot_id, user_id, message, profession_id, bucket) values
       ($1, $2, 'Postgres is my home turf; rust is growing.', 1, 'middle')`,
    [backendSlot, bob],
  );

  // Friendships: ann+bob are friends; clara asked ann.
  await query(
    `insert into friendships values ($1,$2,'friends'), ($2,$1,'friends')`,
    [ann, bob],
  );
  const clara = ids.get("clara")!;
  await query(
    `insert into friendships values ($1,$2,'waiting'), ($2,$1,'incoming')`,
    [clara, ann],
  );

  // Chats: a dm (ann+bob) and Orbit's project thread (ann+bob+dmitry).
  const dm = (
    await query<{ id: number }>(
      `insert into threads (type) values ('dm') returning id`,
    )
  )[0].id;
  await query(
    `insert into thread_participants values ($1,$2,null), ($1,$3,null)`,
    [dm, ann, bob],
  );
  await query(
    `insert into messages (thread_id, user_id, body) values ($1,$2,'Saw your application — nice rust numbers'), ($1,$3,'Thanks! The storage sync doc is mine'), ($1,$2,'Come to the call tomorrow?')`,
    [dm, ann, bob],
  );
  const pt = (
    await query<{ id: number }>(
      `insert into threads (type, project_id) values ('project', $1) returning id`,
      [orbit],
    )
  )[0].id;
  await query(
    `insert into thread_participants values ($1,$2,null), ($1,$3,null), ($1,$4,null)`,
    [pt, ann, bob, dmitry],
  );
  await query(
    `insert into messages (thread_id, user_id, body) values ($1,$2,'Dmitry joined — the design seat is his'), ($1,$3,'Welcome!')`,
    [pt, ann, dmitry],
  );
}
