// The leaderboards: pure helpers over `db.scores`.
import { byId } from "../../core.ts";
import { glyphOf, initialsOf, pictureStyle } from "../../pictures.ts";
import type { Db, GameName, Score } from "../../schema.ts";

export interface ScoreRow {
  rank: number;
  userId: number;
  name: string;
  /** the avatar picture string */
  avatar: string;
  score: number;
  /** when the best score was made */
  at: string;
}

interface Best {
  userId: number;
  score: number;
  at: string;
}

interface Table {
  /** the best score of every player, the best first */
  list: Best[];
  byUser: Map<number, Best>;
}

const cache = new WeakMap<Score[], Map<GameName, Table>>();

/** Every player's best score in a game (cached for as long as the scores array lives). */
function tableOf(scores: Score[], game: GameName): Table {
  let games = cache.get(scores);
  if (!games) cache.set(scores, (games = new Map()));
  let t = games.get(game);
  if (!t) {
    const byUser = new Map<number, Best>();
    for (const s of scores) {
      if (s.game !== game) continue;
      const cur = byUser.get(s.userId);
      // a higher score wins; the same score stays with who made it first
      if (!cur || s.score > cur.score || (s.score === cur.score && s.at < cur.at)) byUser.set(s.userId, { userId: s.userId, score: s.score, at: s.at });
    }
    const list = [...byUser.values()].sort((a, b) => b.score - a.score || (a.at < b.at ? -1 : a.at > b.at ? 1 : 0) || a.userId - b.userId);
    t = { list, byUser };
    games.set(game, t);
  }
  return t;
}

/** The top `n` players of a game, one row per player (their best score); players that no longer exist are skipped. */
export function topScores(db: Db, game: GameName, n: number): ScoreRow[] {
  const users = byId(db.users);
  const out: ScoreRow[] = [];
  for (const b of tableOf(db.scores, game).list) {
    if (out.length >= n) break;
    const u = users.get(b.userId);
    if (!u) continue;
    out.push({ rank: out.length + 1, userId: b.userId, name: u.name, avatar: u.avatar, score: b.score, at: b.at });
  }
  return out;
}

/** The best score of a user in a game (0 when never played). */
export function bestScore(db: Db, userId: number, game: GameName): number {
  return tableOf(db.scores, game).byUser.get(userId)?.score ?? 0;
}

/** The place of a user on the leaderboard of a game (0 when not on it). */
export function rankOf(db: Db, userId: number, game: GameName): number {
  const i = tableOf(db.scores, game).list.findIndex((b) => b.userId === userId);
  return i + 1;
}

/** What a leaderboard row needs to draw an avatar. */
export function avatarOf(avatar: string, name: string): { style: string; glyph: string } {
  return { style: pictureStyle(avatar), glyph: glyphOf(avatar) || initialsOf(name) };
}
