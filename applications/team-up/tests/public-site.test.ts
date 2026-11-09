import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Backend, startBackend } from "./backend.ts";

/**
 * The public site: the shell of the original teamUP (the language and the
 * visitor of the header) and the old addresses.
 */
describe("the public site", () => {
  let api: Backend;

  beforeAll(async () => {
    api = await startBackend();
  }, 30000);

  afterAll(async () => {
    await api.close();
  });

  it("answers the shell: the language, the locales and the texts", async () => {
    const r = await api.fetch("/api/site");
    expect(r.status).toBe(200);
    const site = (await r.json()) as {
      lang: string;
      locales: { code: string; name: string; active: boolean }[];
      nav: { signedIn: boolean };
      strings: Record<string, string>;
    };
    expect(site.lang).toBe("en");
    expect(site.locales.map((l) => l.code)).toEqual(["en", "ru"]);
    expect(site.locales[0]?.active).toBe(true);
    expect(site.nav.signedIn).toBe(false);
    expect(site.strings.projects).toBe("Projects");
    expect(site.strings.members).toBe("Members");
  });

  it("translates the texts when the `lang` cookie asks for Russian", async () => {
    const r = await api.fetch("/api/site", {
      headers: { cookie: "lang=ru" },
    });
    const site = (await r.json()) as {
      lang: string;
      locales: { code: string; active: boolean }[];
      strings: Record<string, string>;
    };
    expect(site.lang).toBe("ru");
    expect(site.locales.find((l) => l.code === "ru")?.active).toBe(true);
    expect(site.strings.projects).toBe("Проекты");
    expect(site.strings.members).toBe("Участники");
    expect(site.strings.signIn).toBe("Войти");
  });

  it("shows the signed-in visitor in the header", async () => {
    const cookie = await api.login("ann@team.up");
    const r = await api.as(cookie)("/api/site");
    const site = (await r.json()) as {
      nav: { signedIn: boolean; email: string; initials: string };
    };
    expect(site.nav.signedIn).toBe(true);
    expect(site.nav.email).toBe("ann@team.up");
    expect(site.nav.initials).toBe("AF");
  });

  it("redirects the old addresses of the original", async () => {
    // the redirect is not followed: the answer itself is what matters
    const r = await api.fetch("/startups", { redirect: "manual" });
    expect(r.status).toBe(301);
    expect(r.headers.get("location")).toContain("/projects");
    const one = await api.fetch("/startups/orbit-labs", { redirect: "manual" });
    expect(one.status).toBe(301);
    expect(one.headers.get("location")).toContain("/projects/orbit-labs");
  });

  it("answers the pages of the public site", async () => {
    const blog = await api.fetch("/api/public/blog");
    expect(blog.status).toBe(200);
    const posts = (await blog.json()) as {
      posts: { pid: string; title: string; date: string }[];
      tags: { title: string; href: string; active: boolean }[];
      sorts: { title: string; active: boolean }[];
    };
    expect(posts.posts.length).toBeGreaterThan(0);
    expect(posts.posts[0]?.date).toMatch(/^\w{3} \d+, \d{4}$/);
    expect(posts.tags.length).toBeGreaterThan(0);
    expect(posts.sorts.filter((s) => s.active)).toHaveLength(1);

    const one = await api.fetch("/api/public/blog/seed-1");
    expect(one.status).toBe(200);
    const post = (await one.json()) as {
      post: { pid: string; paragraphs: string[] };
    };
    expect(post.post.pid).toBe("seed-1");
    expect(post.post.paragraphs.length).toBeGreaterThan(0);

    const members = await api.fetch("/api/public/members");
    expect(members.status).toBe(200);
    const directory = (await members.json()) as {
      users: { slug: string; name: string }[];
      pager: unknown[];
    };
    expect(directory.users.length).toBeGreaterThan(0);
    expect(directory.pager.length).toBeGreaterThan(0);

    const catalog = await api.fetch("/api/public/projects");
    expect(catalog.status).toBe(200);
    const projects = (await catalog.json()) as {
      cards: { slug: string; name: string }[];
      filters: Record<string, { value: string }[]>;
    };
    expect(projects.cards.length).toBeGreaterThan(0);
    expect(projects.filters.kind?.length).toBeGreaterThan(0);
  });

  it("translates the pages when the `lang` cookie asks for Russian", async () => {
    const r = await api.fetch("/api/public/members", {
      headers: { cookie: "lang=ru" },
    });
    const members = (await r.json()) as {
      strings: { title: string; level: string };
    };
    expect(members.strings.title).toBe("Участники");
    expect(members.strings.level).toBe("Уровень:");
  });

  it("takes a report and keeps the blocked people apart", async () => {
    const cookie = await api.login("ann@team.up");
    const report = await api.as(cookie)("/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "person",
        target: "bob",
        reason: "spam",
        details: "the test's report",
      }),
    });
    expect(report.status).toBe(201);

    // the same report again is refused
    const again = await api.as(cookie)("/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "person",
        target: "bob",
        reason: "spam",
        details: "",
      }),
    });
    expect(again.status).toBe(409);

    // the blocks
    const blocked = await api.as(cookie)("/api/blocks/bob", { method: "POST" });
    expect(blocked.status).toBe(204);
    const list = await api.as(cookie)("/api/blocks");
    const blocks = (await list.json()) as { blocks: { slug: string }[] };
    expect(blocks.blocks.map((b) => b.slug)).toContain("bob");
    const unblocked = await api.as(cookie)("/api/blocks/bob", {
      method: "DELETE",
    });
    expect(unblocked.status).toBe(204);
  });

  it("stars a project and keeps the search", async () => {
    const cookie = await api.login("ann@team.up");
    const starred = await api.as(cookie)("/api/favorites/orbit-labs", {
      method: "POST",
    });
    expect(starred.status).toBe(204);
    const list = await api.as(cookie)("/api/favorites");
    const favorites = (await list.json()) as { slugs: string[] };
    expect(favorites.slugs).toContain("orbit-labs");
    const unstarred = await api.as(cookie)("/api/favorites/orbit-labs", {
      method: "DELETE",
    });
    expect(unstarred.status).toBe(204);

    const saved = await api.as(cookie)("/api/saved-searches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Rust teams",
        query: "?q=rust&kind=company",
      }),
    });
    expect(saved.status).toBe(201);
    const searches = await api.as(cookie)("/api/saved-searches");
    const kept = (await searches.json()) as { searches: { id: number }[] };
    expect(kept.searches.length).toBeGreaterThan(0);
    const removed = await api.as(cookie)(
      `/api/saved-searches/${kept.searches[0]?.id}`,
      { method: "DELETE" },
    );
    expect(removed.status).toBe(204);
  });
});
