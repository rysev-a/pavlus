// @vitest-environment jsdom
// The plugin library: the built-in manifests are made from the plugins of
// @pavlus/backend, and a plugin that grows on the server shows up here as a failure.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Effect, Message } from "@pavlus/frontend";
import { parseSync } from "vite";
import { describe, expect, test } from "vitest";
import {
  builtinFiles,
  SERVER_DIR,
  serverEffects,
  serverTypeOf,
} from "../plugin-library/build.ts";
import { addable, libraryEntries } from "../plugin-library/index.ts";
import {
  type FsState,
  initial,
  page,
  paletteOf,
} from "../templates/flow-studio/flow-studio.ts";
import {
  EFFECTS,
  PLUGIN_NAMES,
  parsePlugins,
} from "../templates/flow-studio/model.ts";
import { pluginStub } from "../templates/flow-studio/plugins.ts";

const SERVER = join(__dirname, "../../../../framework/backend/src/plugins");
const LIB = join(__dirname, "../plugin-library");
const readServer = (dir: string): string =>
  readFileSync(join(SERVER, dir, "mod.ts"), "utf8");

describe("the built-in manifests", () => {
  test("are what the generator makes from the server (run `npm run gen:plugins` if not)", () => {
    for (const f of builtinFiles(readServer))
      expect(readFileSync(join(LIB, "builtin", f.file), "utf8")).toBe(f.json);
    expect(readdirSync(join(LIB, "builtin")).sort()).toEqual(
      PLUGIN_NAMES.map((n) => `${n}.json`).sort(),
    );
  });

  test("every effect Flow Studio models is an effect the server has", () => {
    for (const e of EFFECTS) {
      const types = serverEffects(readServer(SERVER_DIR[e.plugin]));
      expect(types, `${e.type} on ${SERVER_DIR[e.plugin]}`).toContain(
        serverTypeOf(e),
      );
    }
  });

  test("the effects the server has and the design does not model are listed, not lost", () => {
    const by = Object.fromEntries(
      libraryEntries()
        .filter((x) => x.builtin)
        .map((x) => [x.name, x]),
    );
    expect(by.redis.unmodelled).toEqual(
      expect.arrayContaining(["publish", "subscribe"]),
    );
    expect(by.timer.unmodelled).toEqual(
      expect.arrayContaining(["timer.every", "cron"]),
    );
    expect(by.ws.unmodelled).toEqual(expect.arrayContaining(["join", "leave"]));
    expect(by.crypto.unmodelled).toEqual([]);
    for (const [name, e] of Object.entries(by)) {
      const server = serverEffects(readServer(SERVER_DIR[name]));
      const modelled = EFFECTS.filter((x) => x.plugin === name).map(
        serverTypeOf,
      );
      expect([...modelled, ...e.unmodelled].sort()).toEqual([...server].sort());
    }
  });

  test("serverEffects reads the union and not the comments around it", () => {
    const src = `type Base = { plugin: "x" };
export type XEffect =
  /** one; with a semicolon (and a bracket */
  | (Base & { type: "a"; n: number })
  // another; one
  | (Base & { type: "b.c" });
type Other = { type: "nope" };`;
    expect(serverEffects(src)).toEqual(["a", "b.c"]);
    expect(serverEffects("export const x = 1;")).toEqual([]);
  });
});

describe("the library", () => {
  const all = libraryEntries();

  test("lists the built-in plugins first, then the ready-made ones", () => {
    expect(
      all
        .filter((e) => e.builtin)
        .map((e) => e.name)
        .sort(),
    ).toEqual([...PLUGIN_NAMES].sort());
    expect(addable(all).map((e) => e.name)).toEqual([
      "mailer",
      "queue",
      "s3",
      "sms",
      "stripe",
    ]);
    expect(all.slice(0, PLUGIN_NAMES.length).every((e) => e.builtin)).toBe(
      true,
    );
  });

  test("each ready-made manifest is a valid plugin of the project, its effects named after it", () => {
    for (const e of addable(all)) {
      expect(typeof parsePlugins(JSON.stringify(e.manifest))).not.toBe(
        "string",
      );
      expect(e.manifest.effects.length).toBeGreaterThan(0);
      for (const x of e.manifest.effects) {
        expect(x.type.startsWith(`${e.name}.`)).toBe(true);
        expect(x.plugin).toBe(e.name);
      }
      expect(e.manifest.external).not.toBe("");
    }
  });

  test("each ready-made plugin makes a stub that parses", () => {
    for (const e of addable(all)) {
      const r = parseSync(`${e.name}.ts`, pluginStub(e.manifest), {
        lang: "ts",
      });
      expect(r.errors.map((x) => x.message)).toEqual([]);
    }
  });

  test("a built-in manifest keeps its own name, hints and effects", () => {
    const pg = all.find((e) => e.name === "pg")!;
    expect(pg.server).toBe("server/src/plugins/postgres");
    expect(pg.manifest.effects.map((x) => x.type)).toContain("pg.tx.begin");
    expect(pg.manifest.latency).toBe(12);
  });
});

function apply(state: FsState, effects: Effect[]): FsState {
  let s = state;
  for (const e of effects)
    if (e.plugin === "store" && e.type === "merge")
      s = { ...s, ...(e.value as object) };
  return s;
}
function sim(state: FsState) {
  const self = {
    state,
    last: [] as Effect[],
    send(id: string, payload?: unknown, event?: { value?: string }) {
      const msg: Message = { id, payload };
      if (event) msg.event = { type: "input", ...event };
      self.last = page.dispatch(msg, self.state);
      self.state = apply(self.state, self.last);
      return self;
    },
  };
  return self;
}
const ready = () => sim({ ...initial, ready: true }).send("setSide", "plugins");

describe("the library in the editor", () => {
  test("the Plugins tab shows the library and the built-in plugins with what is missing", () => {
    const s = ready();
    expect(s.state.libraryV.bundled.map((r) => r.name)).toEqual([
      "mailer",
      "queue",
      "s3",
      "sms",
      "stripe",
    ]);
    expect(
      s.state.libraryV.builtin.find((b) => b.name === "redis")!.unmodelled,
    ).toContain("publish");
    expect(s.state.libraryV.builtin.find((b) => b.name === "pg")!.server).toBe(
      "server/src/plugins/postgres",
    );
    expect(s.state.libraryV.bundled.every((r) => !r.added)).toBe(true);
  });

  test("a plugin of the library is added to the project, with its effects in the palette", () => {
    const s = ready().send("pluginUse", "stripe");
    expect(s.state.hist.present.plugins.map((p) => p.name)).toEqual(["stripe"]);
    expect(
      s.state.libraryV.bundled.find((r) => r.name === "stripe")!.added,
    ).toBe(true);
    expect(
      paletteOf(s.state.hist.present)
        .find((g) => g.lane === "Plugins")!
        .items.map((i) => i.title),
    ).toContain("stripe.charge");
    expect(s.state.message).toContain("Added the plugin stripe");
    s.send("pluginUse", "nope");
    expect(s.state.hist.present.plugins).toHaveLength(1);
  });

  test("My library keeps a plugin of the project for every project", () => {
    const s = ready().send("pluginUse", "mailer").send("pluginSave", "mailer");
    expect(s.state.mine.map((p) => p.name)).toEqual(["mailer"]);
    const saved = s.last.find((e) => e.plugin === "local" && e.type === "save");
    expect(saved).toMatchObject({ key: "pavlus-flow-plugins" });
    expect(JSON.parse(String((saved as { text?: string }).text))[0].name).toBe(
      "mailer",
    );
    expect(s.state.libraryV.mine.map((r) => r.name)).toEqual(["mailer"]);

    // another project, the same browser: the plugin is in My library
    const other = ready().send("loadDemo", "blank");
    other.send("mineLoaded", {
      text: (saved as unknown as { text: string }).text,
    });
    expect(other.state.mine.map((p) => p.name)).toEqual(["mailer"]);
    other.send("mineUse", "mailer");
    expect(other.state.hist.present.plugins.map((p) => p.name)).toEqual([
      "mailer",
    ]);
  });

  test("a plugin is removed from My library; a broken saved value is ignored", () => {
    const s = ready()
      .send("pluginUse", "sms")
      .send("pluginSave", "sms")
      .send("mineDel", "sms");
    expect(s.state.mine).toEqual([]);
    expect(
      s.last.find((e) => e.plugin === "local" && e.type === "save"),
    ).toBeDefined();
    s.send("mineLoaded", { text: "{nope" });
    expect(s.state.mine).toEqual([]);
    s.send("mineLoaded", { text: null });
    expect(s.state.mine).toEqual([]);
  });
});
