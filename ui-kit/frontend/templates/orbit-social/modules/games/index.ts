// The "games" module of Orbit: SNAKE, TETRIS and PAC-MAN with leaderboards.
// The engines (snake.ts, tetris.ts, pacman.ts) are pure; this file is the glue:
// a tick timer of the time plugin, the keyboard and touch input, the leaderboard.
import { domEffector as dom, timeEffector as time } from "@service-laboratory/pavlus/plugins";
import { nextId, type Handler, type Module, type OrbitState, type Update } from "../../core.ts";
import { GAMES, type GameName } from "../../schema.ts";
import * as pacman from "./pacman.ts";
import { avatarOf, bestScore, rankOf, topScores } from "./scores.ts";
import * as snake from "./snake.ts";
import * as tetris from "./tetris.ts";

export { topScores, bestScore } from "./scores.ts";

/** The id of the one timer of the time plugin this module uses. */
export const TIMER = "orbit-games";

export type Action = "up" | "down" | "left" | "right" | "drop";
type Status = "idle" | "running" | "paused" | "over";
export type Eng = snake.SnakeState | tetris.TetrisState | pacman.PacState;

export interface Stat {
  label: string;
  value: string;
}
export interface Cell {
  id: number;
  k: string;
}
export interface PadKey {
  id: Action;
  label: string;
  name: string;
}
export interface MenuCard {
  id: GameName;
  name: string;
  blurb: string;
  icon: string;
  best: number;
  topName: string;
  topScore: number;
  topAvatar: string;
  topGlyph: string;
}
export interface BoardRow {
  rank: number;
  name: string;
  avatar: string;
  glyph: string;
  score: number;
  mine: boolean;
}

export interface GamesState {
  /** the game on screen, "" for the menu */
  game: "" | GameName;
  status: Status;
  /** games started so far: part of the seed of the next one */
  runs: number;
  eng: Eng | null;
  /** the result line of the last game */
  message: string;
  // derived view props
  menu: MenuCard[];
  title: string;
  blurb: string;
  hint: string;
  stats: Stat[];
  cells: Cell[];
  boardStyle: string;
  wrapStyle: string;
  preview: Cell[];
  previewStyle: string;
  pad: PadKey[];
  top: BoardRow[];
  myBest: number;
  myRank: number;
}

// ---- the games, one adapter each ----

interface Adapter<S> {
  id: GameName;
  name: string;
  blurb: string;
  icon: string;
  controls: string;
  init: (seed: number) => S;
  step: (s: S) => S;
  input: (s: S, a: Action) => S;
  over: (s: S) => boolean;
  score: (s: S) => number;
  stats: (s: S) => Stat[];
  kinds: (s: S) => string[];
  preview?: (s: S) => string[];
  tickMs: (s: S) => number;
  cols: number;
  rows: number;
  /** the widest the board gets, in px */
  width: number;
  pad: PadKey[];
}

const DPAD: PadKey[] = [
  { id: "up", label: "▲", name: "Up" },
  { id: "left", label: "◀", name: "Left" },
  { id: "down", label: "▼", name: "Down" },
  { id: "right", label: "▶", name: "Right" },
];

const snakeGame: Adapter<snake.SnakeState> = {
  id: "snake",
  name: "Snake",
  blurb: "Eat the food, grow longer, never touch a wall or yourself.",
  icon: "🐍",
  controls: "Arrow keys or WASD steer the snake. Space or P pauses.",
  init: snake.initial,
  step: snake.step,
  input: (s, a) => (a === "drop" ? s : snake.turn(s, a)),
  over: (s) => s.over,
  score: (s) => s.score,
  stats: (s) => [
    { label: "Score", value: String(s.score) },
    { label: "Level", value: String(s.level) },
    { label: "Length", value: String(s.body.length) },
  ],
  kinds: snake.cellKinds,
  tickMs: (s) => snake.tickMs(s.level),
  cols: snake.SNAKE_W,
  rows: snake.SNAKE_H,
  width: 440,
  pad: DPAD,
};

const tetrisGame: Adapter<tetris.TetrisState> = {
  id: "tetris",
  name: "Tetris",
  blurb: "Drop the blocks, complete the rows, and keep up as it speeds up.",
  icon: "🧱",
  controls: "Left and right move, up rotates, down drops one row, space drops to the bottom. P pauses.",
  init: tetris.initial,
  step: tetris.step,
  input: (s, a) =>
    a === "left" ? tetris.move(s, -1) : a === "right" ? tetris.move(s, 1) : a === "up" ? tetris.rotate(s, 1) : a === "down" ? tetris.softDrop(s) : tetris.hardDrop(s),
  over: (s) => s.over,
  score: (s) => s.score,
  stats: (s) => [
    { label: "Score", value: String(s.score) },
    { label: "Level", value: String(s.level) },
    { label: "Lines", value: String(s.lines) },
  ],
  kinds: tetris.cellKinds,
  preview: tetris.previewKinds,
  tickMs: (s) => tetris.tickMs(s.level),
  cols: tetris.COLS,
  rows: tetris.ROWS,
  width: 240,
  pad: [
    { id: "up", label: "⟳", name: "Rotate" },
    { id: "drop", label: "⤓", name: "Drop" },
    { id: "left", label: "◀", name: "Left" },
    { id: "down", label: "▼", name: "Down" },
    { id: "right", label: "▶", name: "Right" },
  ],
};

const pacmanGame: Adapter<pacman.PacState> = {
  id: "pacman",
  name: "Pac-Man",
  blurb: "Eat every pellet, grab a power pellet, and chase the ghosts back.",
  icon: "👻",
  controls: "Arrow keys or WASD steer. Eat every pellet, avoid the ghosts. P pauses.",
  init: pacman.initial,
  step: pacman.step,
  input: (s, a) => (a === "drop" ? s : pacman.turn(s, a)),
  over: (s) => s.over,
  score: (s) => s.score,
  stats: (s) => [
    { label: "Score", value: String(s.score) },
    { label: "Level", value: String(s.level) },
    { label: "Lives", value: String(s.lives) },
  ],
  kinds: pacman.cellKinds,
  tickMs: (s) => pacman.tickMs(s.level),
  cols: pacman.W,
  rows: pacman.H,
  width: 420,
  pad: DPAD,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ADAPTERS: Record<GameName, Adapter<any>> = { snake: snakeGame, tetris: tetrisGame, pacman: pacmanGame };
/** The order of the menu. */
const MENU_ORDER: GameName[] = (["snake", "tetris", "pacman"] as GameName[]).filter((g) => GAMES.includes(g));

/** The seed of a game: the number of games started and the player (deterministic, no clock). */
export const seedOf = (runs: number, me: number): number => (runs + 1) * 7919 + me * 104729;

// ---- derive ----

const cellList = (kinds: string[]): Cell[] => kinds.map((k, id) => ({ id, k }));

export function menuCards(s: OrbitState): MenuCard[] {
  return MENU_ORDER.map((id) => {
    const a = ADAPTERS[id];
    const top = topScores(s.db, id, 1)[0];
    const av = top ? avatarOf(top.avatar, top.name) : { style: "", glyph: "" };
    return {
      id,
      name: a.name,
      blurb: a.blurb,
      icon: a.icon,
      best: bestScore(s.db, s.me, id),
      topName: top?.name ?? "",
      topScore: top?.score ?? 0,
      topAvatar: av.style,
      topGlyph: av.glyph,
    };
  });
}

export function derive(s: OrbitState): GamesState {
  const g = s.games;
  const menu = menuCards(s);
  if (!g.game || !g.eng) {
    return { ...g, menu, title: "", blurb: "", hint: "", stats: [], cells: [], boardStyle: "", wrapStyle: "", preview: [], previewStyle: "", pad: [], top: [], myBest: 0, myRank: 0 };
  }
  const a = ADAPTERS[g.game];
  const top: BoardRow[] = topScores(s.db, g.game, 10).map((r) => {
    const av = avatarOf(r.avatar, r.name);
    return { rank: r.rank, name: r.name, avatar: av.style, glyph: av.glyph, score: r.score, mine: r.userId === s.me };
  });
  const hint =
    g.status === "paused" ? "Paused. Press Resume, P or Enter to go on." : g.status === "over" ? g.message : g.status === "idle" ? `Press Start or Enter. ${a.controls}` : a.controls;
  return {
    ...g,
    menu,
    title: a.name,
    blurb: a.blurb,
    hint,
    stats: a.stats(g.eng),
    cells: cellList(a.kinds(g.eng)),
    boardStyle: `grid-template-columns: repeat(${a.cols}, minmax(0, 1fr)); aspect-ratio: ${a.cols} / ${a.rows}`,
    wrapStyle: `max-width: ${a.width}px`,
    preview: a.preview ? cellList(a.preview(g.eng)) : [],
    previewStyle: "grid-template-columns: repeat(4, minmax(0, 1fr)); aspect-ratio: 1 / 1",
    pad: a.pad,
    top,
    myBest: bestScore(s.db, s.me, g.game),
    myRank: rankOf(s.db, s.me, g.game),
  };
}

// ---- handlers ----

const stopTimer = [time.cancel(TIMER)];

/** A key of the keyboard as an action (arrows and WASD). */
export function actionOfKey(key: string): Action | null {
  switch (key) {
    case "ArrowUp":
    case "w":
    case "W":
      return "up";
    case "ArrowDown":
    case "s":
    case "S":
      return "down";
    case "ArrowLeft":
    case "a":
    case "A":
      return "left";
    case "ArrowRight":
    case "d":
    case "D":
      return "right";
    default:
      return null;
  }
}

/** The state of a game after a tick or an input: a game over is saved, a faster level restarts the timer. */
function settle(state: OrbitState, before: Eng, eng: Eng): Update {
  const g = state.games;
  const a = ADAPTERS[g.game as GameName];
  if (!a.over(eng)) {
    const fast = a.tickMs(eng) !== a.tickMs(before);
    return { slice: { eng }, effects: fast ? [time.setInterval(TIMER, a.tickMs(eng), "games.tick")] : undefined };
  }
  const score = a.score(eng);
  const best = bestScore(state.db, state.me, a.id);
  const message = `Game over: ${score} points${score > best ? ". New personal best!" : ""}`;
  return {
    slice: { eng, status: "over", message },
    put: score > 0 ? { scores: [{ id: nextId(state.db.scores), userId: state.me, game: a.id, score, at: state.now }] } : undefined,
    notice: message,
    effects: stopTimer,
  };
}

/** A new game of the one on screen, running. */
function begin(state: OrbitState): Update {
  const g = state.games;
  if (!g.game) return {};
  const a = ADAPTERS[g.game];
  const eng = a.init(seedOf(g.runs, state.me));
  return {
    slice: { eng, status: "running", runs: g.runs + 1, message: "" },
    effects: [time.cancel(TIMER), time.setInterval(TIMER, a.tickMs(eng), "games.tick"), dom.focus("#orbg-keys")],
  };
}

function resume(state: OrbitState): Update {
  const g = state.games;
  if (!g.game || !g.eng || g.status !== "paused") return {};
  return { slice: { status: "running" }, effects: [time.setInterval(TIMER, ADAPTERS[g.game].tickMs(g.eng), "games.tick"), dom.focus("#orbg-keys")] };
}

function pause(state: OrbitState): Update {
  return state.games.status === "running" ? { slice: { status: "paused" }, effects: stopTimer } : {};
}

function input(state: OrbitState, action: Action): Update {
  const g = state.games;
  if (!g.game || !g.eng || g.status !== "running") return {};
  const eng = ADAPTERS[g.game].input(g.eng, action);
  return eng === g.eng ? {} : settle(state, g.eng, eng);
}

const handlers: Record<string, Handler> = {
  /** Opens a game (the payload is its name): the board is ready, not started. */
  open(payload, _e, state) {
    const id = String(payload) as GameName;
    if (!(id in ADAPTERS)) return;
    const a = ADAPTERS[id];
    return { slice: { game: id, status: "idle", eng: a.init(seedOf(state.games.runs, state.me)), message: "" }, effects: stopTimer };
  },
  /** Back to the menu. */
  back: () => ({ slice: { game: "", status: "idle", eng: null, message: "" }, effects: stopTimer }),
  start: (_p, _e, state) => (state.games.status === "paused" ? resume(state) : begin(state)),
  restart: (_p, _e, state) => begin(state),
  pause: (_p, _e, state) => pause(state),
  resume: (_p, _e, state) => resume(state),
  /** The interval of the time plugin. The timer must end with the game, and with the screen. */
  tick(_p, _e, state) {
    const g = state.games;
    if (state.screen !== "games" || g.status !== "running" || !g.game || !g.eng) return { effects: stopTimer };
    return settle(state, g.eng, ADAPTERS[g.game].step(g.eng));
  },
  /** The keyboard (the payload is empty, the key is in the event). */
  key(_p, e, state) {
    const g = state.games;
    if (!g.game) return;
    const key = e?.key ?? "";
    if (key === "Enter") return g.status === "paused" ? resume(state) : g.status === "running" ? undefined : begin(state);
    if (key === "p" || key === "P" || key === "Escape" || (key === " " && g.game !== "tetris")) {
      return g.status === "running" ? pause(state) : g.status === "paused" ? resume(state) : key === " " ? begin(state) : undefined;
    }
    if (key === " ") return input(state, "drop");
    const action = actionOfKey(key);
    return action ? input(state, action) : undefined;
  },
  /** The touch pad (the payload is the action). */
  pad: (payload, _e, state) => input(state, String(payload) as Action),
};

export const gamesModule: Module<GamesState> = {
  key: "games",
  screens: ["games"],
  initial: () => ({
    game: "",
    status: "idle",
    runs: 0,
    eng: null,
    message: "",
    menu: [],
    title: "",
    blurb: "",
    hint: "",
    stats: [],
    cells: [],
    boardStyle: "",
    wrapStyle: "",
    preview: [],
    previewStyle: "",
    pad: [],
    top: [],
    myBest: 0,
    myRank: 0,
  }),
  derive,
  /** Opening the screen shows the menu and makes sure no timer is left running. */
  enter: () => ({ slice: { game: "", status: "idle", eng: null, message: "" }, effects: stopTimer }),
  handlers,
};
