/**
 * The match (service-doc.md §3): computed, never stored, every number
 * explainable. Pure — no db, no effects: the api module feeds it a profile
 * and a slot, tests feed it literals.
 *
 * 1. profession is a hard filter: no common profession with the slot's → no match;
 * 2. grade is a soft comparison: mine ≥ required gets a check; lower is a note
 *    ("level is lower"), never a block;
 * 3. slot skills are coverage: the average of min(mine/required, 1).
 */

export interface MySkill {
  skillId: number;
  level: number;
}
export interface MyProfession {
  professionId: number;
  bucket: string;
}
export interface SlotSkill {
  skillId: number;
  level: number;
}

export interface MatchSlot {
  slotId: number;
  professionId: number;
  bucket: string;
  skills: SlotSkill[];
}

const GRADES = ["junior", "middle", "senior", "lead"];
const gradeIdx = (b: string): number => {
  const i = GRADES.indexOf(b);
  return i < 0 ? 0 : i;
};

export interface MatchResult {
  /** 0..100 coverage of the slot's skills; null when the slot names none. */
  percent: number | null;
  /** The grade comparison: true = mine ≥ required. */
  gradeOk: boolean;
  /** "Rust 8/7", "Postgres 5/6" — one per required skill, in slot order. */
  details: string[];
  /** A human line for the "lower grade" note, '' when the grade is fine. */
  note: string;
}

/** My professions decide the hard filter; my best bucket is the grade shown. */
export function bestBucket(
  professions: MyProfession[],
  professionId: number,
): string | null {
  let best: string | null = null;
  for (const p of professions)
    if (p.professionId === professionId) {
      if (best === null || gradeIdx(p.bucket) > gradeIdx(best)) best = p.bucket;
    }
  return best;
}

export function computeMatch(
  professions: MyProfession[],
  skills: MySkill[],
  slot: MatchSlot,
): MatchResult | null {
  const bucket = bestBucket(professions, slot.professionId);
  if (bucket === null) return null; // the hard filter

  const mine = new Map(skills.map((s) => [s.skillId, s.level]));
  const details: string[] = [];
  let sum = 0;
  for (const req of slot.skills) {
    const have = mine.get(req.skillId) ?? 0;
    sum += Math.min(have / req.level, 1);
    details.push(`${have}/${req.level}`);
  }
  const gradeOk = gradeIdx(bucket) >= gradeIdx(slot.bucket);
  return {
    percent: slot.skills.length
      ? Math.round((sum / slot.skills.length) * 100)
      : null,
    gradeOk,
    details,
    note: gradeOk ? "" : "level is lower",
  };
}

/** Sorts a feed: coverage first (nulls last), then the grade headroom. */
export function byMatchDesc(
  a: { match: MatchResult | null },
  b: { match: MatchResult | null },
): number {
  const pa = a.match?.percent ?? -1;
  const pb = b.match?.percent ?? -1;
  if (pb !== pa) return pb - pa;
  return (a.match?.gradeOk ? 1 : 0) - (b.match?.gradeOk ? 1 : 0);
}
