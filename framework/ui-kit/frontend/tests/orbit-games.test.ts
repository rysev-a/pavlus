import type { Effect, Message } from "@pavlus/frontend";
import { describe, expect, test } from "vitest";
import type { OrbitState } from "../templates/orbit-social/core.ts";
import type { GamesState } from "../templates/orbit-social/modules/games/index.ts";
import {
  ADAPTERS,
  actionOfKey,
  seedOf,
  TIMER,
  topScores,
} from "../templates/orbit-social/modules/games/index.ts";
import * as tetris from "../templates/orbit-social/modules/games/tetris.ts";
import { MODULES } from "../templates/orbit-social/modules.ts";
import {
  deriveShell,
  initialState,
  page,
} from "../templates/orbit-social/orbit-social.ts";
import { gradient } from "../templates/orbit-social/pictures.ts";
import {
  type Db,
  emptyDb,
  NOW,
  type Score,
} from "../templates/orbit-social/schema.ts";

const user = (id: number, name: string) => ({
  id,
  name,
  email: `${name.toLowerCase()}@example.com`,
  passwordHash: "x",
  role: "user" as const,
  status: "active" as const,
  avatar: gradient(id * 40, id * 40 + 30, name.charAt(0)),
  about: "",
  city: "",
  birthday: "1990-01-01",
  website: "",
  phone: "",
  interests: [],
  createdAt: "2025-01-01T10:00:00",
  lastSeen: NOW,
});
const score = (
  id: number,
  userId: number,
  game: Score["game"],
  s: number,
  at = "2026-11-01T10:00:00",
): Score => ({ id, userId, game, score: s, at });

function dbWith(scores: Score[] = []): Db {
  return {
    ...emptyDb(),
    users: [user(1, "Ann"), user(2, "Ben"), user(3, "Cleo")],
    scores,
  };
}

/** A ready, signed-in state on the games screen. */
function ready(
  scores: Score[] = [],
  screen: OrbitState["screen"] = "games",
): OrbitState {
  let s: OrbitState = {
    ...initialState(),
    db: dbWith(scores),
    me: 1,
    status: "ready",
    screen,
  };
  s = { ...s, ...deriveShell(s) };
  return { ...s, games: MODULES.games.derive(s) };
}

type Fx = Record<string, unknown>;
const of = (effects: Effect[], plugin: string, type?: string): Fx[] =>
  (effects as unknown as Fx[]).filter(
    (e) => e.plugin === plugin && (type === undefined || e.type === type),
  );

/** Runs `games.<id>` through the page and applies its store.set effects, like the store plugin. */
function send(
  state: OrbitState,
  id: string,
  payload?: unknown,
  event?: { key?: string },
): { state: OrbitState; effects: Effect[] } {
  const effects = page.dispatch(
    {
      id: `games.${id}`,
      payload,
      event: event && { type: "keydown", ...event },
    } as Message,
    state,
  );
  const next = { ...state } as unknown as Record<string, unknown>;
  for (const e of of(effects, "store", "set")) next[e.path as string] = e.value;
  return { state: next as unknown as OrbitState, effects };
}

const open = (s: OrbitState, game: string) => send(s, "open", game).state;
const press = (s: OrbitState, key: string) =>
  send(s, "key", undefined, { key });

describe("topScores", () => {
  test("one row per player (their best), best first, with name and avatar", () => {
    const db = dbWith([
      score(1, 1, "snake", 50),
      score(2, 1, "snake", 120),
      score(3, 2, "snake", 90),
      score(4, 3, "snake", 10),
      score(5, 2, "tetris", 5000),
    ]);
    const top = topScores(db, "snake", 10);
    expect(top.map((r) => [r.rank, r.name, r.score])).toEqual([
      [1, "Ann", 120],
      [2, "Ben", 90],
      [3, "Cleo", 10],
    ]);
    expect(top[0].avatar).toBe(db.users[0].avatar);
    expect(topScores(db, "snake", 2)).toHaveLength(2);
    expect(topScores(db, "pacman", 5)).toEqual([]);
    expect(topScores(db, "tetris", 5)[0].name).toBe("Ben");
  });

  test("ties go to who got there first; players that are gone are skipped; n is a limit", () => {
    const db = dbWith([
      score(1, 2, "snake", 70, "2026-11-02T10:00:00"),
      score(2, 1, "snake", 70, "2026-11-01T10:00:00"),
      score(3, 99, "snake", 500),
    ]);
    expect(topScores(db, "snake", 10).map((r) => r.name)).toEqual([
      "Ann",
      "Ben",
    ]);
    expect(topScores(db, "snake", 1)).toHaveLength(1);
    expect(topScores(db, "snake", 0)).toEqual([]);
  });

  test("a thousand scores are handled", () => {
    const rows = Array.from({ length: 1000 }, (_, i) =>
      score(i + 1, (i % 3) + 1, "tetris", (i * 37) % 997),
    );
    const top = topScores(dbWith(rows), "tetris", 10);
    expect(top).toHaveLength(3);
    expect(top[0].score).toBeGreaterThanOrEqual(top[1].score);
  });
});

describe("the menu", () => {
  test("three cards with my best and the top player", () => {
    const s = ready([
      score(1, 1, "snake", 40),
      score(2, 2, "snake", 90),
      score(3, 1, "pacman", 300),
    ]);
    const menu = s.games.menu;
    expect(menu.map((m) => m.id)).toEqual(["snake", "tetris", "pacman"]);
    const snake = menu[0];
    expect(snake.best).toBe(40);
    expect(snake.topName).toBe("Ben");
    expect(snake.topScore).toBe(90);
    expect(menu[1].best).toBe(0);
    expect(menu[1].topName).toBe("");
    expect(menu[2].topName).toBe("Ann");
    expect(s.games.game).toBe("");
  });

  test("opening a game readies the board, without a timer; back returns to the menu", () => {
    let r = send(ready(), "open", "tetris");
    expect(r.state.games.game).toBe("tetris");
    expect(r.state.games.status).toBe("idle");
    expect(r.state.games.cells).toHaveLength(200);
    expect(r.state.games.preview).toHaveLength(16);
    expect(r.state.games.stats.map((x) => x.label)).toEqual([
      "Score",
      "Level",
      "Lines",
    ]);
    expect(of(r.effects, "time", "setInterval")).toHaveLength(0);
    r = send(r.state, "back");
    expect(r.state.games.game).toBe("");
    expect(r.state.games.cells).toHaveLength(0);
    expect(of(r.effects, "time", "cancel")[0].id).toBe(TIMER);
    // an unknown game does nothing
    expect(send(ready(), "open", "chess").state.games.game).toBe("");
  });

  test("every game fits the flat cell list of at most 450 cells", () => {
    for (const g of ["snake", "tetris", "pacman"]) {
      const s = open(ready(), g);
      expect(s.games.cells.length).toBeGreaterThan(100);
      expect(s.games.cells.length).toBeLessThanOrEqual(450);
      expect(new Set(s.games.cells.map((c) => c.id)).size).toBe(
        s.games.cells.length,
      );
      expect(s.games.pad.length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("playing", () => {
  test("start runs a timer (cancelling the old one first) and focuses the board", () => {
    const r = send(open(ready(), "snake"), "start");
    expect(r.state.games.status).toBe("running");
    const t = of(r.effects, "time");
    expect(t[0]).toMatchObject({ type: "cancel", id: TIMER });
    expect(t[1]).toMatchObject({
      type: "setInterval",
      id: TIMER,
      replyTo: "games.tick",
    });
    expect(t[1].ms).toBe(ADAPTERS.snake.tickMs(r.state.games.eng));
    expect(of(r.effects, "dom", "focus")[0].target).toBe("#orbg-keys");
  });

  test("a tick moves the snake", () => {
    const started = send(open(ready(), "snake"), "start").state;
    const before = (started.games.eng as { body: { x: number }[] }).body[0].x;
    const r = send(started, "tick");
    expect((r.state.games.eng as { body: { x: number }[] }).body[0].x).toBe(
      before + 1,
    );
    expect(r.state.games.status).toBe("running");
  });

  test("the keyboard steers: arrows and WASD, reverse ignored", () => {
    let s = send(open(ready(), "snake"), "start").state;
    s = press(s, "ArrowUp").state;
    s = send(s, "tick").state;
    expect((s.games.eng as { dir: string }).dir).toBe("up");
    s = press(s, "ArrowDown").state; // reverse
    s = send(s, "tick").state;
    expect((s.games.eng as { dir: string }).dir).toBe("up");
    s = press(s, "a").state;
    s = send(s, "tick").state;
    expect((s.games.eng as { dir: string }).dir).toBe("left");
    expect(actionOfKey("D")).toBe("right");
    expect(actionOfKey("x")).toBeNull();
  });

  test("the touch pad does the same as the keys", () => {
    let s = send(open(ready(), "snake"), "start").state;
    s = send(s, "pad", "up").state;
    s = send(s, "tick").state;
    expect((s.games.eng as { dir: string }).dir).toBe("up");
  });

  test("tetris keys: move, rotate, soft drop, space is the hard drop", () => {
    let s = send(open(ready(), "tetris"), "start").state;
    const e0 = s.games.eng as tetris.TetrisState;
    s = press(s, "ArrowLeft").state;
    expect((s.games.eng as tetris.TetrisState).piece.x).toBe(e0.piece.x - 1);
    s = press(s, "ArrowUp").state;
    expect((s.games.eng as tetris.TetrisState).piece.rot).toBe(
      e0.piece.kind === 2 ? 0 : 1,
    );
    const y = (s.games.eng as tetris.TetrisState).piece.y;
    s = press(s, "ArrowDown").state;
    expect((s.games.eng as tetris.TetrisState).piece.y).toBe(y + 1);
    s = press(s, " ").state;
    expect(s.games.status).toBe("running"); // space dropped, did not pause
    expect((s.games.eng as tetris.TetrisState).board.some((c) => c !== 0)).toBe(
      true,
    );
    expect(s.games.stats[0].value).not.toBe("0");
  });

  test("input is ignored unless the game runs", () => {
    const idle = open(ready(), "snake");
    expect(press(idle, "ArrowUp").state.games.eng).toBe(idle.games.eng);
    expect(send(idle, "pad", "up").state.games.eng).toBe(idle.games.eng);
    expect(send(idle, "tick").state.games.eng).toBe(idle.games.eng);
  });

  test("pause stops the timer, resume starts it again, P and Space toggle", () => {
    let r = send(send(open(ready(), "pacman"), "start").state, "pause");
    expect(r.state.games.status).toBe("paused");
    expect(of(r.effects, "time", "cancel")[0].id).toBe(TIMER);
    // a tick that still arrives while paused ends the timer and changes nothing
    const tick = send(r.state, "tick");
    expect(tick.state.games.eng).toBe(r.state.games.eng);
    expect(of(tick.effects, "time", "cancel")).toHaveLength(1);
    r = send(r.state, "resume");
    expect(r.state.games.status).toBe("running");
    expect(of(r.effects, "time", "setInterval")).toHaveLength(1);
    r = press(r.state, "p");
    expect(r.state.games.status).toBe("paused");
    r = press(r.state, " ");
    expect(r.state.games.status).toBe("running");
    r = press(r.state, "Escape");
    expect(r.state.games.status).toBe("paused");
    r = press(r.state, "Enter");
    expect(r.state.games.status).toBe("running");
  });

  test("Enter starts from the idle board; Start on a paused game resumes it", () => {
    const r = press(open(ready(), "snake"), "Enter");
    expect(r.state.games.status).toBe("running");
    const eng = r.state.games.eng;
    const p = send(send(r.state, "tick").state, "pause").state;
    const again = send(p, "start");
    expect(again.state.games.status).toBe("running");
    expect(again.state.games.eng).toBe(p.games.eng);
    expect(eng).not.toBe(p.games.eng);
  });

  test("restart is a fresh game with a new seed", () => {
    let s = send(open(ready(), "tetris"), "start").state;
    s = press(s, " ").state;
    const first = s.games.eng;
    const r = send(s, "restart");
    expect(r.state.games.status).toBe("running");
    expect((r.state.games.eng as tetris.TetrisState).score).toBe(0);
    expect(
      (r.state.games.eng as tetris.TetrisState).board.every((c) => c === 0),
    ).toBe(true);
    expect(r.state.games.eng).not.toEqual(first);
    expect(seedOf(1, 1)).not.toBe(seedOf(2, 1));
  });

  test("the level rises with the lines and the timer speeds up", () => {
    let s = send(open(ready(), "tetris"), "start").state;
    const e = s.games.eng as tetris.TetrisState;
    const board = new Array<number>(200).fill(0);
    for (let x = 0; x < 9; x++) board[19 * 10 + x] = 2;
    s = {
      ...s,
      games: {
        ...s.games,
        eng: { ...e, board, lines: 9, piece: { kind: 1, rot: 1, x: 7, y: 0 } },
      },
    };
    const r = press(s, " ");
    const eng = r.state.games.eng as tetris.TetrisState;
    expect(eng.level).toBe(2);
    const iv = of(r.effects, "time", "setInterval");
    expect(iv).toHaveLength(1);
    expect(iv[0].ms).toBe(tetris.tickMs(2));
    expect(r.state.games.stats[1].value).toBe("2");
  });
});

describe("game over", () => {
  /** A tetris game one drop from its end. */
  function almostOver(scores: Score[] = []): OrbitState {
    let s = send(open(ready(scores), "tetris"), "start").state;
    const e = s.games.eng as tetris.TetrisState;
    const board = new Array<number>(200).fill(0);
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 9; x++) board[y * 10 + x] = 4;
    s = {
      ...s,
      games: {
        ...s.games,
        eng: {
          ...e,
          board,
          score: 120,
          piece: { kind: 2, rot: 0, x: 0, y: 3 },
        },
      },
    };
    return s;
  }

  test("writes the score, stops the timer and says so", () => {
    const r = press(almostOver(), " ");
    const g = r.state.games;
    expect(g.status).toBe("over");
    const put = of(r.effects, "idb", "put").filter((e) => e.table === "scores");
    expect(put).toHaveLength(1);
    const row = (put[0].rows as Score[])[0];
    expect(row).toMatchObject({ userId: 1, game: "tetris", at: NOW });
    expect(row.score).toBeGreaterThanOrEqual(120);
    expect(row.id).toBe(1);
    expect(of(r.effects, "time", "cancel")[0].id).toBe(TIMER);
    expect(g.message).toMatch(new RegExp(`^Game over: ${row.score} points`));
    expect(g.message).toMatch(/New personal best!/);
    expect(r.state.notice).toBe(g.message);
    expect(g.hint).toBe(g.message);
  });

  test("the score reaches the database and the leaderboard", () => {
    const s = press(almostOver([score(7, 2, "tetris", 50)]), " ").state;
    expect(s.db.scores).toHaveLength(2);
    expect(s.db.scores[1]).toMatchObject({ id: 8, userId: 1, game: "tetris" });
    expect(s.games.top[0]).toMatchObject({ name: "Ann", mine: true });
    expect(s.games.myBest).toBe(s.db.scores[1].score);
    expect(s.games.myRank).toBe(1);
  });

  test("no personal best message when my best is higher; no row for a score of zero", () => {
    const r = press(almostOver([score(7, 1, "tetris", 999999)]), " ");
    expect(r.state.games.message).not.toMatch(/personal best/);
    expect(r.state.games.status).toBe("over");
    // a zero score is not saved
    let s = send(open(ready(), "snake"), "start").state;
    s = {
      ...s,
      games: {
        ...s.games,
        eng: {
          ...(s.games.eng as object),
          body: [
            { x: 19, y: 5 },
            { x: 18, y: 5 },
          ],
          dir: "right",
        } as never,
      },
    };
    const z = send(s, "tick");
    expect(z.state.games.status).toBe("over");
    expect(z.state.games.message).toBe("Game over: 0 points");
    expect(
      of(z.effects, "idb", "put").filter((e) => e.table === "scores"),
    ).toHaveLength(0);
  });

  test("Restart works after a game over, and ticks after the end do nothing but stop the timer", () => {
    const over = press(almostOver(), " ").state;
    const late = send(over, "tick");
    expect(late.state.games.eng).toBe(over.games.eng);
    expect(of(late.effects, "time", "cancel")).toHaveLength(1);
    const r = send(over, "restart");
    expect(r.state.games.status).toBe("running");
    expect((r.state.games.eng as tetris.TetrisState).over).toBe(false);
    expect(of(r.effects, "time", "setInterval")).toHaveLength(1);
    expect(r.state.games.message).toBe("");
  });

  test("snake runs into the wall by itself: a game over from ticks alone", () => {
    let s = send(open(ready(), "snake"), "start").state;
    for (let i = 0; i < 40 && s.games.status === "running"; i++)
      s = send(s, "tick").state;
    expect(s.games.status).toBe("over");
    expect(s.games.message).toMatch(/^Game over: \d+ points/);
  });

  test("pac-man: running out of lives ends the game and saves the score", () => {
    let s = send(open(ready(), "pacman"), "start").state;
    const e = s.games.eng as ReturnType<typeof ADAPTERS.pacman.init>;
    const ghost = {
      id: 0,
      x: 8,
      y: 13,
      dir: "right",
      mode: "normal",
      frightened: false,
      release: 0,
    };
    s = {
      ...s,
      games: {
        ...s.games,
        eng: { ...e, ready: 0, lives: 1, score: 250, ghosts: [ghost] },
      },
    };
    const r = send(s, "tick");
    expect(r.state.games.status).toBe("over");
    const put = of(r.effects, "idb", "put").filter((x) => x.table === "scores");
    expect((put[0].rows as Score[])[0]).toMatchObject({ game: "pacman" });
    expect((put[0].rows as Score[])[0].score).toBeGreaterThanOrEqual(250);
  });
});

describe("the timer ends with the screen", () => {
  test("a tick after leaving the screen cancels the timer and does not play on", () => {
    const started = send(open(ready(), "snake"), "start").state;
    const away = { ...started, screen: "wall" as const };
    const r = send(away, "tick");
    expect(of(r.effects, "time", "cancel")[0].id).toBe(TIMER);
    expect(of(r.effects, "time", "setInterval")).toHaveLength(0);
    expect(r.state.games.eng).toBe(started.games.eng);
  });

  test("opening the screen again shows the menu and cancels any timer", () => {
    const started = send(open(ready(), "snake"), "start").state;
    const r = page.dispatch(
      { id: "nav.go", payload: "wall" } as Message,
      started,
    );
    expect(r.length).toBeGreaterThan(0);
    const back = page.dispatch({ id: "nav.go", payload: "games" } as Message, {
      ...started,
      screen: "wall",
    });
    const fx = of(back, "time", "cancel");
    expect(fx.map((e) => e.id)).toContain(TIMER);
    const slice = of(back, "store", "set").find((e) => e.path === "games")!
      .value as GamesState;
    expect(slice.game).toBe("");
    expect(slice.status).toBe("idle");
  });
});

describe("the leaderboard on the game screen", () => {
  test("top 10 with names and avatars, and my best and place", () => {
    const scores = [
      score(1, 1, "snake", 40),
      score(2, 2, "snake", 90),
      score(3, 3, "snake", 70),
    ];
    const s = open(ready(scores), "snake");
    const g = s.games;
    expect(g.top.map((r) => r.name)).toEqual(["Ben", "Cleo", "Ann"]);
    expect(g.top[2].mine).toBe(true);
    expect(g.top[0].avatar).toMatch(/linear-gradient/);
    expect(g.top[0].glyph).toBe("B");
    expect(g.myBest).toBe(40);
    expect(g.myRank).toBe(3);
  });

  test("shows at most ten", () => {
    const db = dbWith();
    db.users = Array.from({ length: 30 }, (_, i) =>
      user(i + 1, `User${i + 1}`),
    );
    db.scores = db.users.map((u, i) =>
      score(i + 1, u.id, "snake", i * 10 + 10),
    );
    let s: OrbitState = {
      ...initialState(),
      db,
      me: 1,
      status: "ready",
      screen: "games",
    };
    s = { ...s, ...deriveShell(s) };
    s = { ...s, games: MODULES.games.derive(s) };
    s = open(s, "snake");
    expect(s.games.top).toHaveLength(10);
    expect(s.games.top[0].score).toBe(300);
  });
});
