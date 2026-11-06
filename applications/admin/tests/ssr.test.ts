import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createFlowFetch } from "@pavlus/backend";
import { renderDocument, renderPage } from "@pavlus/backend/ssr";
import * as frontend from "../app/entry-server.ts";
import { createAdminApp } from "../backend/app.ts";
import { createPool } from "../backend/db/pool.ts";
import { resetDatabase, resetStatements } from "../backend/db/init/reset.ts";
import { routes } from "../backend/routes.ts";

// The server render runs the app in-process: the API is the same pure
// application, executed over one pool by flow-fetch — no socket.
const pool = createPool();
const fetch = createFlowFetch(createAdminApp(resetStatements()), routes, pool);

beforeAll(async () => {
  try {
    await resetDatabase(pool);
  } catch (e) {
    throw new Error(
      `the tests need Postgres (docker compose up -d): ${String(e)}`,
    );
  }
});

afterAll(async () => {
  // Leave the development database as it was.
  await resetDatabase(pool);
  await pool.end();
});

test("the page renders on the server from the same pure app", async () => {
  const page = await renderPage(frontend, fetch);

  // The data is in before the render: the seed's users and roles are on the
  // page, no "Loading..." anywhere.
  expect(page.html).toContain("ann@example.com");
  expect(page.html).toContain("bob@example.com");
  expect(page.html).toContain("admin");
  expect(page.html).not.toContain("Loading...");

  // The shell's sidebar rides along: its one menu item, active on "/".
  expect(page.html).toContain("ui-sidebar-button");
  expect(page.html).toContain('data-active="true"');

  // The state rides along for the hydration.
  expect(page.state).toContain("ann@example.com");

  // The document: the page inside #app, the state before the app's script.
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
  const template = await readFile(join(ROOT, "index.html"), "utf8");
  const doc = renderDocument(template, page);
  expect(doc).toContain("window.__PAVLUS_STATE__");
  expect(doc).toContain('<div id="app">');
  expect(doc.indexOf("__PAVLUS_STATE__")).toBeLessThan(
    doc.indexOf("frontend/main.ts"),
  );
});
