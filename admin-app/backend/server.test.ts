import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerResponse } from "node:http";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { sendStatic } from "./server.ts";

/** A `ServerResponse` that records what was sent. */
function fakeRes() {
  const res = {
    status: 0,
    headers: {} as Record<string, string | number>,
    body: "",
    writeHead(status: number, headers: Record<string, string | number>) {
      res.status = status;
      res.headers = headers;
    },
    end(data?: string | Uint8Array) {
      res.body = data === undefined ? "" : data.toString();
    },
  };
  return res;
}

const serve = async (pathname: string, dist: string) => {
  const res = fakeRes();
  await sendStatic(pathname, res as unknown as ServerResponse, dist);
  return res;
};

describe("static files from dist/", () => {
  let dist: string;

  beforeAll(async () => {
    dist = join(await mkdtemp(join(tmpdir(), "admin-app-dist-")), "dist");
    await mkdir(join(dist, "assets"), { recursive: true });
    await writeFile(join(dist, "index.html"), "<html>index</html>");
    await writeFile(join(dist, "assets", "app.js"), "console.log(1)");
  });
  afterAll(() => rm(dist, { recursive: true, force: true }));

  test("the index and real files are served with their content type", async () => {
    const index = await serve("/", dist);
    expect(index.status).toBe(200);
    expect(index.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(index.body).toBe("<html>index</html>");

    const js = await serve("/assets/app.js", dist);
    expect(js.status).toBe(200);
    expect(js.headers["content-type"]).toBe("text/javascript; charset=utf-8");
    expect(js.body).toBe("console.log(1)");
  });

  test("a route without an extension gets the index (single-page app)", async () => {
    const res = await serve("/users/42", dist);
    expect(res.status).toBe(200);
    expect(res.body).toBe("<html>index</html>");
  });

  test("a missing file is a 404, not the index", async () => {
    const res = await serve("/assets/missing.js", dist);
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body)).toEqual({
      error: "no file /assets/missing.js",
    });
  });

  test("paths cannot escape dist/", async () => {
    for (const p of [
      "/../../etc/passwd",
      "/..%2F..%2Fetc/passwd",
      "/assets/../../index.html",
    ]) {
      const res = await serve(p, dist);
      expect(res.status, p).not.toBe(500);
      expect(res.body, p).not.toMatch(/root:/);
    }
  });

  test("without a build, the answer says so", async () => {
    const res = await serve("/", join(dist, "nope"));
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body).error).toMatch(/npm run build/);
  });
});
