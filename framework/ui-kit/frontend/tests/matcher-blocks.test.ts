import { expect, test } from "vitest";
import {
  cardOf,
  initialsOf,
  matchScore,
  type Profile,
} from "../blocks/profile-card/profile-card.ts";
import {
  highlight,
  searchItems,
  searchView,
  snippetOf,
  termsOf,
} from "../blocks/search-box/search-box.ts";
import {
  chipsOf,
  SKILLS,
  toggleSkill,
} from "../blocks/skill-filter/skill-filter.ts";

test("toggleSkill adds, removes and keeps the order", () => {
  expect(toggleSkill([], "ts")).toEqual(["ts"]);
  expect(toggleSkill(["ts", "go"], "react")).toEqual(["ts", "go", "react"]);
  expect(toggleSkill(["ts", "go"], "ts")).toEqual(["go"]);
});

test("chipsOf marks the selected skills and carries the counts", () => {
  const chips = chipsOf(SKILLS, ["go"], { go: 3 });
  expect(chips.find((c) => c.id === "go")).toMatchObject({
    on: true,
    count: 3,
  });
  expect(chips.find((c) => c.id === "ts")).toMatchObject({
    on: false,
    count: 0,
  });
  expect(chips).toHaveLength(SKILLS.length);
});

test("matchScore: the share of the selected skills a person has", () => {
  expect(matchScore(["ts", "react"], [])).toBeNull();
  expect(matchScore(["ts", "react", "go"], ["ts", "react"])).toBe(100);
  expect(matchScore(["ts"], ["ts", "react"])).toBe(50);
  expect(matchScore(["go"], ["ts", "react", "node"])).toBe(0);
  expect(matchScore(["ts", "node"], ["ts", "react", "node"])).toBe(67);
  // a repeated skill counts once
  expect(matchScore(["ts"], ["ts", "ts"])).toBe(100);
});

test("initialsOf and cardOf", () => {
  expect(initialsOf("Ann Lee")).toBe("AL");
  expect(initialsOf("Cher")).toBe("C");
  expect(initialsOf("Mary Jane Watson")).toBe("MW");
  const p: Profile = {
    id: "p",
    name: "Ann Lee",
    role: "Dev",
    location: "Oslo",
    bio: "",
    skills: ["ts", "go"],
    availability: "busy",
    tone: 1,
  };
  const card = cardOf(p, { ts: "TypeScript", go: "Go" }, ["ts"], true);
  expect(card.skills).toEqual([
    { label: "TypeScript", hit: true },
    { label: "Go", hit: false },
  ]);
  expect(card).toMatchObject({
    score: 100,
    scoreLevel: "high",
    invited: true,
    actionLabel: "Invited",
    availabilityLabel: "Not available",
  });
  expect(cardOf(p, {}, [], false).score).toBeNull();
  expect(cardOf(p, {}, ["x", "y", "z"], false).scoreLevel).toBe("low");
});

test("termsOf lowers, splits and drops duplicates", () => {
  expect(termsOf("  Foo  bar FOO ")).toEqual(["foo", "bar"]);
  expect(termsOf("   ")).toEqual([]);
});

test("highlight cuts the text around every match, ignoring case", () => {
  expect(highlight("Parsing and errors", ["error"])).toEqual([
    { t: "Parsing and ", hit: false },
    { t: "error", hit: true },
    { t: "s", hit: false },
  ]);
  expect(highlight("abc", [])).toEqual([{ t: "abc", hit: false }]);
  expect(
    highlight("a.b a+b", ["a.b", "a+b"]).filter((s) => s.hit),
  ).toHaveLength(2);
  expect(highlight("", ["x"])).toEqual([]);
});

test("snippetOf shows the text around the first match", () => {
  const body = `${"word ".repeat(40)}needle ${"tail ".repeat(40)}`;
  const s = snippetOf(body, ["needle"], 20);
  expect(s.startsWith("…")).toBe(true);
  expect(s.endsWith("…")).toBe(true);
  expect(s).toContain("needle");
  expect(snippetOf("short text", ["zzz"])).toBe("short text");
});

const docs = [
  {
    id: "a",
    title: "Schemas",
    group: "Guides",
    body: "Describe the shape of a value.",
  },
  {
    id: "b",
    title: "Parsing and errors",
    group: "Guides",
    body: "A schema can parse input. Schema schema.",
  },
  { id: "c", title: "Install", group: "Start", body: "npm install fennel" },
];

test("searchItems needs every word, ranks titles first, and highlights", () => {
  const r = searchItems(docs, "schema");
  expect(r.map((x) => x.id)).toEqual(["a", "b"]);
  expect(r[0].titleSegs[0]).toEqual({ t: "Schema", hit: true });
  expect(searchItems(docs, "schema parse").map((x) => x.id)).toEqual(["b"]);
  expect(searchItems(docs, "zzz")).toEqual([]);
  expect(searchItems(docs, "")).toEqual([]);
  expect(searchItems(docs, "a", 1)).toHaveLength(1);
});

test("searchView opens the panel only for a real query", () => {
  expect(searchView(docs, "").open).toBe(false);
  const v = searchView(docs, "schema", 1);
  expect(v.open).toBe(true);
  expect(v.results).toHaveLength(1);
  expect(v.total).toBe(2);
});
