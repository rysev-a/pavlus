/**
 * `npm run db:init` — the tables and the directory (schema.sql, seed.sql),
 * then the demo world (seed.ts, in JS: the passwords must be scrypt hashes
 * in the crypto plugin's format). Everyone's demo password: `teamup123`.
 */
import { createPool } from "../pool.ts";
import { resetDatabase } from "./reset.ts";
import { seedWorld } from "./seed.ts";

const pool = createPool();
try {
  await resetDatabase(pool);
  const query = <Row>(sql: string, params?: unknown[]) =>
    pool.query(sql, params).then((r) => r.rows as Row[]);
  await seedWorld(query);
  const { rows } = await pool.query<{
    users: number;
    projects: number;
    slots: number;
    messages: number;
  }>(
    `SELECT (SELECT count(*) FROM users)::int AS users,
            (SELECT count(*) FROM projects)::int AS projects,
            (SELECT count(*) FROM slots)::int AS slots,
            (SELECT count(*) FROM messages)::int AS messages`,
  );
  console.log(
    `team-up ready: ${rows[0].users} members, ${rows[0].projects} projects, ` +
      `${rows[0].slots} slots, ${rows[0].messages} messages (password: teamup123)`,
  );
} finally {
  await pool.end();
}
