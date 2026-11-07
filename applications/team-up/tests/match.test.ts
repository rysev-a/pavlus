// The match is pure (backend/match.ts): the tests feed it literals — no db,
// no server. The bob/orbit numbers here are the same the feed test checks
// end to end (backend.test.ts).
import { describe, expect, it } from "vitest";
import { bestBucket, byMatchDesc, computeMatch } from "../backend/match.ts";

const bob = {
  professions: [{ professionId: 1, bucket: "middle" }],
  skills: [
    { skillId: 101, level: 6 }, // postgres
    { skillId: 111, level: 7 }, // nodejs
  ],
};
const orbitBackend = {
  slotId: 1,
  professionId: 1,
  bucket: "senior",
  skills: [
    { skillId: 112, level: 7 }, // rust — bob has none
    { skillId: 101, level: 6 }, // postgres — bob covers it
  ],
};

describe("computeMatch", () => {
  it("covers half the skills: 50%, with a lower-grade note", () => {
    const m = computeMatch(bob.professions, bob.skills, orbitBackend);
    expect(m).toMatchObject({
      percent: 50,
      gradeOk: false,
      details: ["0/7", "6/6"],
      note: "level is lower",
    });
  });

  it("is a hard filter: no common profession, no match", () => {
    const m = computeMatch(
      [{ professionId: 2, bucket: "senior" }],
      bob.skills,
      orbitBackend,
    );
    expect(m).toBeNull();
  });

  it("covers a slot without skills: null percent, never zero", () => {
    const m = computeMatch(bob.professions, bob.skills, {
      slotId: 2,
      professionId: 1,
      bucket: "junior",
      skills: [],
    });
    expect(m).toMatchObject({ percent: null, gradeOk: true, note: "" });
  });

  it("caps a skill above the requirement at 1 (no over-crediting)", () => {
    const m = computeMatch(
      bob.professions,
      [
        { skillId: 112, level: 10 },
        { skillId: 101, level: 10 },
      ],
      orbitBackend,
    );
    expect(m?.percent).toBe(100);
  });
});

describe("bestBucket", () => {
  it("picks the highest grade of one profession", () => {
    expect(
      bestBucket(
        [
          { professionId: 1, bucket: "junior" },
          { professionId: 1, bucket: "senior" },
        ],
        1,
      ),
    ).toBe("senior");
    expect(bestBucket(bob.professions, 2)).toBeNull();
  });
});

describe("byMatchDesc", () => {
  it("sorts coverage first, nulls last, grade headroom after", () => {
    const feed = [
      { match: null },
      { match: { percent: 50, gradeOk: false, details: [], note: "" } },
      { match: { percent: 100, gradeOk: true, details: [], note: "" } },
      { match: { percent: 50, gradeOk: true, details: [], note: "" } },
    ];
    const sorted = [...feed].sort(byMatchDesc);
    expect(sorted.slice(0, 3).map((f) => f.match?.percent)).toEqual([
      100, 50, 50,
    ]);
    expect(sorted[3]?.match).toBeNull();
  });
});
