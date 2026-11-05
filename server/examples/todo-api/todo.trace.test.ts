// (c) The readable flow of one request. The runtime keeps, per rid, the
// messages the app handled and the effects it returned, in order: that is the
// whole story of a request, with no tracing library. This test prints it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { traceOf } from "../../src/mod.ts";
import {
  type Instance,
  type Stack,
  stackAvailable,
  startStack,
  waitFor,
} from "./testkit.ts";

const up = await stackAvailable();

describe.skipIf(!up)("trace of one request", () => {
  let stack: Stack;
  let A: Instance;
  beforeAll(async () => {
    stack = await startStack();
    A = await stack.start();
  }, 30_000);
  afterAll(() => stack?.stop(), 30_000);

  it("prints traceOf(rid) for POST /login", async () => {
    const creds = { email: "trace@example.com", password: "trace-me-please" };
    await A.api("POST", "/signup", { body: creds });
    const res = await A.api("POST", "/login", { body: creds });
    const rid = String(res.headers["x-request-id"]);
    await waitFor(
      () => traceOf(rid).some((e) => e.name === "finished:request.done"),
      "request to finish",
    );

    const trace = traceOf(rid);
    const t0 = trace[0]!.t;
    const lines = trace.map(
      (e) => `${String(e.t - t0).padStart(4)}ms  ${e.kind.padEnd(7)} ${e.name}`,
    );
    console.log(
      `\ntraceOf("${rid}")  POST /login -> ${res.status}\n${lines.join("\n")}\n`,
    );

    // the shape of the flow, in order (messages are what the app handled,
    // effects are what it asked the plugins to do)
    const story = trace
      .filter((e) => e.kind !== "note" || e.name.startsWith("route:"))
      .map((e) =>
        e.kind === "message"
          ? `<- ${e.name}`
          : e.kind === "note"
            ? `~~ ${e.name}`
            : `-> ${e.name}`,
      );
    const wanted = [
      "<- http.request",
      "~~ route:auth.login",
      "-> redis.cmd", // INCR rl:<ip>
      "<- gate.counted",
      "-> pg.query", // select the user
      "<- auth.login.found",
      "-> crypto.verify",
      "<- auth.login.verified",
      "-> crypto.randomToken",
      "<- auth.login.token",
      "-> redis.cmd", // SET sess:<token> EX
      "<- auth.login.stored",
      "-> http.respond",
      "<- request.done",
    ];
    let at = 0;
    for (const w of wanted) {
      const found = story.indexOf(w, at);
      expect(
        found,
        `${w} after position ${at}\n${story.join("\n")}`,
      ).toBeGreaterThanOrEqual(0);
      at = found + 1;
    }
    expect(trace.at(-1)!.name).toBe("finished:request.done");
  });
});
