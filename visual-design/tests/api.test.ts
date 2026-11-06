// The API end to end: real sockets and the real Postgres of compose.yaml
// (`npm run db:up`). Skipped when the database is not there.
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freePort, request } from "pavlus-server/testing";
import { ensureDatabase } from "../server/db.ts";
import { buildServer } from "../server/server.ts";

const URL =
  process.env.DATABASE_URL ??
  "postgres://app:app@127.0.0.1:54340/visual_design";

async function reachable(): Promise<boolean> {
  const c = new pg.Client({
    connectionString: URL,
    connectionTimeoutMillis: 1500,
  });
  c.on("error", () => {});
  try {
    await c.connect();
    await c.end();
    return true;
  } catch {
    return false;
  }
}

const up = await reachable();

describe.skipIf(!up)("projects API (real Postgres)", () => {
  let port = 0;
  let server: ReturnType<typeof buildServer>;
  const made: number[] = [];
  const call = (method: string, path: string, body?: unknown) =>
    request({ port }, { method, path, body });

  beforeAll(async () => {
    await ensureDatabase(URL);
    port = await freePort();
    server = buildServer({ url: URL, port });
    // wait until it answers
    for (let i = 0; i < 50; i++) {
      try {
        if ((await call("GET", "/health")).status === 200) return;
      } catch {
        /* not listening yet */
      }
      await new Promise((r) => setTimeout(r, 40));
    }
  });

  afterAll(async () => {
    for (const id of made) await call("DELETE", `/projects/${id}`);
    await server?.shutdown({ timeoutMs: 2000 });
  });

  it("creates a project with its documents and lists it first", async () => {
    const r = await call("POST", "/projects", {
      name: "  Coffee  ",
      docs: { flow: '{"name":"flow"}', interface: '{"name":"ui"}' },
    });
    expect(r.status).toBe(201);
    const project = (r.json as any).project;
    made.push(project.id);
    expect(project.name).toBe("Coffee");
    expect(project.docs).toEqual(["flow", "interface"]);

    const list = (await call("GET", "/projects")).json as any;
    expect(list.projects[0].id).toBe(project.id);
  });

  it("a new project without documents has none, and reads null", async () => {
    const r = await call("POST", "/projects", { name: "Empty" });
    const id = (r.json as any).project.id as number;
    made.push(id);
    expect((r.json as any).project.docs).toEqual([]);
    expect((await call("GET", `/projects/${id}/docs/flow`)).json).toEqual({
      text: null,
    });
  });

  it("saves a document again and again, and reads the last one", async () => {
    const id = made[0];
    expect(
      (await call("PUT", `/projects/${id}/docs/flow`, { text: "one" })).status,
    ).toBe(200);
    await call("PUT", `/projects/${id}/docs/flow`, { text: "two" });
    expect((await call("GET", `/projects/${id}/docs/flow`)).json).toEqual({
      text: "two",
    });
    // the other document is left alone
    expect((await call("GET", `/projects/${id}/docs/interface`)).json).toEqual({
      text: '{"name":"ui"}',
    });
  });

  it("renames, and an edit moves the project to the top", async () => {
    const [first, second] = made;
    expect(
      (await call("PATCH", `/projects/${first}`, { name: "Cafe" })).status,
    ).toBe(200);
    const got = (await call("GET", `/projects/${first}`)).json as any;
    expect(got.project.name).toBe("Cafe");
    await call("PUT", `/projects/${second}/docs/flow`, { text: "x" });
    const list = (await call("GET", "/projects")).json as any;
    expect(list.projects[0].id).toBe(second);
  });

  it("refuses what is not valid, and finds nothing that is not there", async () => {
    expect((await call("POST", "/projects", { name: "  " })).status).toBe(400);
    expect((await call("POST", "/projects", {})).status).toBe(400);
    expect(
      (await call("POST", "/projects", { name: "x", docs: { evil: "y" } }))
        .status,
    ).toBe(400);
    expect(
      (await call("PUT", `/projects/${made[0]}/docs/flow`, { text: 5 })).status,
    ).toBe(400);
    expect((await call("GET", `/projects/${made[0]}/docs/other`)).status).toBe(
      400,
    );
    expect((await call("GET", "/projects/999999")).status).toBe(404);
    expect((await call("GET", "/projects/abc")).status).toBe(404);
    expect(
      (await call("PUT", "/projects/999999/docs/flow", { text: "x" })).status,
    ).toBe(404);
    expect((await call("DELETE", "/projects/999999")).status).toBe(404);
  });

  it("keeps the theme of the app as a document of its own", async () => {
    const id = made[0];
    const look = JSON.stringify({ mode: "dark", palette: "vs-dracula" });
    expect(
      (await call("PUT", `/projects/${id}/docs/theme`, { text: look })).status,
    ).toBe(200);
    expect((await call("GET", `/projects/${id}/docs/theme`)).json).toEqual({
      text: look,
    });
    const got = (await call("GET", `/projects/${id}`)).json as any;
    expect(got.project.docs).toContain("theme");
    // the other documents are left alone
    expect(
      ((await call("GET", `/projects/${id}/docs/interface`)).json as any).text,
    ).toBe('{"name":"ui"}');
  });

  it("deleting a project deletes its documents", async () => {
    const id = (
      (await call("POST", "/projects", { name: "Gone", docs: { flow: "f" } }))
        .json as any
    ).project.id as number;
    expect((await call("DELETE", `/projects/${id}`)).status).toBe(200);
    expect((await call("GET", `/projects/${id}`)).status).toBe(404);
    const c = new pg.Client({ connectionString: URL });
    await c.connect();
    const left = await c.query(
      "select 1 from project_docs where project_id = $1",
      [id],
    );
    await c.end();
    expect(left.rowCount).toBe(0);
  });

  it("takes a big document", async () => {
    const id = made[0];
    const text = "x".repeat(3 * 1024 * 1024);
    expect(
      (await call("PUT", `/projects/${id}/docs/flow`, { text })).status,
    ).toBe(200);
    expect(
      (
        ((await call("GET", `/projects/${id}/docs/flow`)).json as any)
          .text as string
      ).length,
    ).toBe(text.length);
  });
});
