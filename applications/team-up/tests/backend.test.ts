// The port's flows, end to end over real sockets: auth, the match feed (the
// pure compute is tested in match.test.ts), the accept chain, friends, chat
// over HTTP, and the live part — ws delivery through redis pub/sub plus the
// notification queue with the online filter.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Backend, startBackend } from "./backend.ts";

let api: Backend;

beforeAll(async () => {
  api = await startBackend();
  await api.reseed();
});

afterAll(async () => {
  await api?.close();
});

describe("auth", () => {
  it("registers a member, logs in, answers me, logs out", async () => {
    const r = await api.fetch("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: "test@team.up",
        password: "secret1",
        name: "Test Member",
      }),
      headers: { "content-type": "application/json" },
    });
    expect(r.status).toBe(200);
    const cookie = String(r.headers.get("set-cookie"));
    expect(cookie).toContain("teamup_session=");

    const me = await api.as(cookie.slice(0, cookie.indexOf(";")))(
      "/api/auth/me",
    );
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ email: "test@team.up" });

    const out = await api.as(cookie.slice(0, cookie.indexOf(";")))(
      "/api/auth/logout",
      { method: "POST" },
    );
    expect(out.status).toBe(200);
    const again = await api.as(cookie.slice(0, cookie.indexOf(";")))(
      "/api/auth/me",
    );
    expect(again.status).toBe(401);
  });

  it("refuses a wrong password", async () => {
    const r = await api.fetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "bob@team.up", password: "nope-nope" }),
      headers: { "content-type": "application/json" },
    });
    expect(r.status).toBe(401);
  });
});

describe("the match", () => {
  it("orders bob's feed: the orbit backend slot first, at 50%", async () => {
    const bob = await api.login("bob@team.up");
    const r = await api.as(bob)("/api/match/feed");
    expect(r.status).toBe(200);
    const feed = (await r.json()) as {
      slotId: number;
      projectName: string;
      match: { percent: number; gradeOk: boolean; details: string[] } | null;
    }[];
    expect(feed[0]).toMatchObject({
      projectName: "Orbit Labs",
      slotId: 1,
    });
    expect(feed[0].match).toMatchObject({
      percent: 50,
      gradeOk: false,
      details: ["0/7", "6/6"],
    });
  });

  it("hard-filters the profession: clara sees no backend slot", async () => {
    const clara = await api.login("clara@team.up");
    const r = await api.as(clara)("/api/match/feed");
    const feed = (await r.json()) as { slotId: number; match: unknown }[];
    expect(feed.every((f) => f.slotId !== 1)).toBe(true);
  });
});

describe("applications", () => {
  it("accept fills the slot, declines the rest, joins the chat", {
    timeout: 15000,
  }, async () => {
    const ann = await api.login("ann@team.up");
    const bob = await api.login("bob@team.up");
    const clara = await api.login("clara@team.up");

    // clara applies to orbit's backend slot too (it is still open here —
    // this test reseeded the world; the profession filter is soft for her)
    const apply = await api.as(clara)("/api/slots/1/apply", {
      method: "POST",
      body: JSON.stringify({ message: "I also grow into rust" }),
      headers: { "content-type": "application/json" },
    });
    expect(apply.status).toBe(201);

    const inbox = await api.as(ann)("/api/projects/orbit-labs/applications");
    const rows = (await inbox.json()) as { userId: number }[];
    expect(rows.length).toBeGreaterThanOrEqual(2);

    // ann accepts bob's (id 1, seeded)
    const accept = await api.as(ann)("/api/applications/1/accept", {
      method: "POST",
    });
    expect(accept.status).toBe(200);

    // the slot is filled with bob
    const project = await api.as(ann)("/api/projects/orbit-labs");
    const slots = (
      (await project.json()) as { slots: { userId: number | null }[] }
    ).slots;
    expect(slots.find((s) => s.userId === 2)).toBeTruthy();

    // clara's is declined
    const mine = await api.as(clara)("/api/applications/mine");
    const apps = (await mine.json()) as { userId: number; status: string }[];
    const mineApp = apps.find((a) => a.userId === 3);
    expect(mineApp?.status).toBe("declined");

    // bob is in the project's chat now
    const threads = await api.as(bob)("/api/chat/threads");
    const list = (await threads.json()) as { projectId: number | null }[];
    expect(list.some((t) => t.projectId === 1)).toBe(true);
  });
});

describe("friends", () => {
  it("requests, accepts, lists, removes", async () => {
    const ann = await api.login("ann@team.up");
    const elena = await api.login("elena@team.up");

    const ask = await api.as(elena)("/api/friends/anna", { method: "POST" });
    expect(ask.status).toBe(200);
    expect(await ask.json()).toMatchObject({ status: "waiting" });

    const yes = await api.as(ann)("/api/friends/elena/accept", {
      method: "POST",
    });
    expect(yes.status).toBe(200);
    expect(await yes.json()).toMatchObject({ status: "friends" });

    const list = await api.as(ann)("/api/friends");
    const rows = (await list.json()) as { slug: string }[];
    expect(rows.some((f) => f.slug === "elena")).toBe(true);

    const bye = await api.as(ann)("/api/friends/elena", { method: "DELETE" });
    expect(bye.status).toBe(200);
    const after = await api.as(ann)("/api/friends");
    expect(
      ((await after.json()) as { slug: string }[]).some(
        (f) => f.slug === "elena",
      ),
    ).toBe(false);
  });
});

describe("chat", () => {
  it("delivers live over ws (pub/sub) and queues a notification for the offline", {
    timeout: 15000,
  }, async () => {
    const ann = await api.login("ann@team.up");
    const bob = await api.login("bob@team.up");

    const ws = await api.chat(ann);
    ws.sendText(JSON.stringify({ type: "join", threadId: 1 }));
    const joined = JSON.parse(String((await ws.next()).data));
    expect(joined).toMatchObject({ type: "joined", threadId: 1 });

    // bob sends over HTTP; ann gets it live
    const sent = await api.as(bob)("/api/chat/threads/1/send", {
      method: "POST",
      body: JSON.stringify({ body: "knock knock" }),
      headers: { "content-type": "application/json" },
    });
    expect(sent.status).toBe(201);
    const live = JSON.parse(String((await ws.next()).data));
    expect(live).toMatchObject({
      type: "message",
      message: { body: "knock knock", author: "Bob Backend" },
    });

    // ann is online -> no notification for her; dmitry (thread 2) is
    // offline: bob posts there and dmitry gets a queued notification
    await api.as(bob)("/api/chat/threads/2/send", {
      method: "POST",
      body: JSON.stringify({ body: "for the offline" }),
      headers: { "content-type": "application/json" },
    });
    await api.drainNotifications();

    const dmitry = await api.login("dmitry@team.up");
    const notes = await api.as(dmitry)("/api/notifications");
    const rows = (await notes.json()) as { body: string }[];
    expect(rows.some((n) => n.body.includes("for the offline"))).toBe(true);

    // and the ws send: ann answers, gets her own ack
    ws.sendText(
      JSON.stringify({ type: "send", threadId: 1, body: "who's there" }),
    );
    const ack = JSON.parse(String((await ws.next()).data));
    expect(ack).toMatchObject({
      type: "message",
      message: { body: "who's there", author: "Anna Founder" },
    });

    ws.close();
    await ws.closed;
  });

  it("refuses a stranger's frame", async () => {
    const ann = await api.login("ann@team.up");
    const felix = await api.login("felix@team.up");
    const ws = await api.chat(felix);
    ws.sendText(JSON.stringify({ type: "join", threadId: 1 })); // ann+bob dm
    const err = JSON.parse(String((await ws.next()).data));
    expect(err).toMatchObject({ type: "error", error: "not your thread" });
    ws.close();
    await ws.closed;
    await api.as(ann)("/api/auth/me"); // ann stays unused but logged in
  });
});
