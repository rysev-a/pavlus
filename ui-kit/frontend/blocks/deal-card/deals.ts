import { money, type Tone } from "../admin-shell/shell.ts";

export interface StageDef {
  id: string;
  title: string;
  /** Chance of winning at this stage, in percent (won is 100, lost is 0). */
  prob: number;
  tone: Tone;
}

/** What the board needs to know about a deal. */
export interface DealLite {
  id: string;
  title: string;
  company: string;
  amount: number;
  stage: string;
  /** Initials of the owner. */
  owner: string;
  /** ISO day the deal should close. */
  close: string;
}

export interface DealCardView {
  id: string;
  title: string;
  company: string;
  amount: string;
  prob: number;
  owner: string;
  close: string;
  late: boolean;
  canLeft: boolean;
  canRight: boolean;
}

export interface DealColumn {
  id: string;
  title: string;
  tone: Tone;
  count: number;
  /** The sum of the deals, worded: `$84,000`. */
  total: string;
  /** The sum weighted by the stage's chance: `$42,000 weighted`. */
  weighted: string;
  deals: DealCardView[];
}

export const usd = (n: number): string => money(Math.round(n), "$", 0);

/** `48200` becomes `$48k`, `1250000` becomes `$1.3M`. */
export function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${Math.round(n / 100_000) / 10}M`;
  if (abs >= 1000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n)}`;
}

/** Pure: the chance of a stage (0 when the stage is unknown). */
export function probOf(stages: StageDef[], id: string): number {
  return stages.find((s) => s.id === id)?.prob ?? 0;
}

/** Pure: is the deal still being worked (not won, not lost)? */
export function isOpen(stages: StageDef[], id: string): boolean {
  const p = probOf(stages, id);
  return p > 0 && p < 100;
}

/** Pure: the sum of the amounts. */
export const totalOf = (deals: DealLite[]): number =>
  deals.reduce((sum, d) => sum + d.amount, 0);

/** Pure: the amounts times the chance of their stage (a forecast). */
export function weightedOf(deals: DealLite[], stages: StageDef[]): number {
  return deals.reduce(
    (sum, d) => sum + (d.amount * probOf(stages, d.stage)) / 100,
    0,
  );
}

/** Pure: the stage one step left or right, or the same one at the ends. */
export function nextStage(
  stages: StageDef[],
  current: string,
  dir: "left" | "right",
): string {
  const i = stages.findIndex((s) => s.id === current);
  if (i < 0) return current;
  const j = dir === "left" ? i - 1 : i + 1;
  return j < 0 || j >= stages.length ? current : stages[j].id;
}

/** Pure: the deals with one moved to a neighbouring stage. */
export function moveStage<T extends DealLite>(
  deals: T[],
  stages: StageDef[],
  id: string,
  dir: "left" | "right",
): T[] {
  return deals.map((d) =>
    d.id === id ? { ...d, stage: nextStage(stages, d.stage, dir) } : d,
  );
}

/** Pure: the board. A deal is late when it is open and its day has passed. */
export function dealBoard(
  stages: StageDef[],
  deals: DealLite[],
  today: string,
  dayText: (iso: string) => string,
): DealColumn[] {
  return stages.map((stage, i) => {
    const mine = deals.filter((d) => d.stage === stage.id);
    return {
      id: stage.id,
      title: stage.title,
      tone: stage.tone,
      count: mine.length,
      total: usd(totalOf(mine)),
      weighted:
        stage.prob > 0 && stage.prob < 100
          ? `${usd(weightedOf(mine, stages))} weighted`
          : `${stage.prob}%`,
      deals: mine.map(
        (d): DealCardView => ({
          id: d.id,
          title: d.title,
          company: d.company,
          amount: usd(d.amount),
          prob: stage.prob,
          owner: d.owner,
          close: dayText(d.close),
          late: isOpen(stages, d.stage) && d.close < today,
          canLeft: i > 0,
          canRight: i < stages.length - 1,
        }),
      ),
    };
  });
}
