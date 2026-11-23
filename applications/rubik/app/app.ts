// Rubik: a cube you can turn, drawn three times — in 3D on the canvas3d plugin,
// as the diagram of circles and as the flat net on the plain canvas plugin. The app is pure: it turns the model
// (cube.ts), asks scene.ts for drawings, and returns them as effects.
import { Component, type Message } from "@pavlus/client";
import { canvasEffector as canvas } from "@pavlus/client/plugins/canvas";
import {
  type Camera3,
  canvas3dEffector as canvas3d,
  defaultCamera,
  orbit,
} from "@pavlus/client/plugins/canvas3d";
import { DomPlugin } from "@pavlus/client/plugins/dom";
import { storeEffector as store } from "@pavlus/client/plugins/store";
import { timeEffector as time } from "@pavlus/client/plugins/time";
import {
  apply,
  FACES,
  inverse,
  isSolved,
  parseMove,
  scramble,
  type Sticker,
  solved,
} from "./cube.ts";
import { netOps, ringsOps, sceneOf } from "./scene.ts";
import view from "./app.pavlus";

export const CUBE = { width: 520, height: 420 };
export const RINGS = { width: 440, height: 420 };
export const NET = { width: 432, height: 324 };
/** how long one quarter turn takes, ms (shorter when many are queued) */
export const TURN_MS = 260;

export interface MoveButton {
  name: string;
  label: string;
}

export interface RubikState {
  stickers: Sticker[];
  /** moves waiting their turn */
  queue: string[];
  /** the move in flight and how far it has got */
  turn: { name: string; t: number } | null;
  camera: Camera3;
  seed: number;
  /** where the pointer went down, while dragging */
  drag: { x: number; y: number } | null;
  /** moves applied since the last reset, most recent last */
  log: string[];
  // what the template reads (worked out in code)
  moves: MoveButton[];
  count: number;
  history: string;
  status: string;
  isSolved: boolean;
  isBusy: boolean;
}

const BUTTONS: MoveButton[] = FACES.flatMap((f) => [
  { name: f, label: f },
  { name: `${f}'`, label: `${f}′` },
]);

/** the fields the template shows */
function shown(
  s: Pick<RubikState, "stickers" | "queue" | "turn" | "log">,
): Pick<RubikState, "count" | "history" | "status" | "isSolved" | "isBusy"> {
  const done = isSolved(s.stickers);
  const busy = s.turn !== null || s.queue.length > 0;
  const last = s.log.slice(-18).join(" ");
  return {
    count: s.log.length,
    history: s.log.length > 18 ? `… ${last}` : last,
    isSolved: done,
    isBusy: busy,
    status: busy
      ? `Turning… ${s.queue.length + (s.turn ? 1 : 0)} left`
      : done
        ? "Solved"
        : "Drag the cube to look around, tap a move to turn it",
  };
}

export function initialState(): RubikState {
  const stickers = solved();
  const base = { stickers, queue: [], turn: null, log: [] };
  return {
    ...base,
    camera: defaultCamera,
    seed: 20260101,
    drag: null,
    moves: BUTTONS,
    ...shown(base),
  };
}

/** the drawings of a state: 3D, the circles, the flat net */
export function drawings(s: RubikState) {
  const m = s.turn ? parseMove(s.turn.name) : null;
  const turn = s.turn && m ? { move: m, t: ease(s.turn.t) } : null;
  return [
    canvas3d.render("#cube", sceneOf(s.stickers, turn, s.camera), CUBE),
    canvas.draw("#rings", ringsOps(s.stickers, turn, RINGS)),
    canvas.draw("#net", netOps(s.stickers, NET)),
  ];
}

const ease = (t: number): number => t * t * (3 - 2 * t);

/** the next state after `ms` of animation: starts the next move, advances it, lands it */
export function step(s: RubikState, ms: number): RubikState | null {
  if (!s.turn && s.queue.length === 0) return null;
  let { stickers, queue, turn, log } = s;
  if (!turn) {
    turn = { name: queue[0], t: 0 };
    queue = queue.slice(1);
  }
  // a long queue turns faster so a scramble does not take half a minute
  const speed = 1 + Math.min(queue.length, 20) / 5;
  const t = turn.t + (ms * speed) / TURN_MS;
  if (t >= 1) {
    stickers = apply(stickers, turn.name);
    log = [...log, turn.name];
    turn = null;
  } else turn = { name: turn.name, t };
  const next = { stickers, queue, turn, log };
  return { ...s, ...next, ...shown(next) };
}

class Rubik extends Component<RubikState> {
  view = view;

  /** every store write answers with the states before and after: the view diffs them */
  paint(msg: Message) {
    const { prev, next } = msg.payload as {
      prev: RubikState;
      next: RubikState;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  mounted(_msg: Message, s: RubikState) {
    return [
      canvas.size("#cube", CUBE.width, CUBE.height),
      canvas.size("#rings", RINGS.width, RINGS.height),
      canvas.size("#net", NET.width, NET.height),
      canvas.pointer("mouse", "#cube", "mouse"),
      canvas.frames("loop", "tick"),
      time.now("seeded"),
      ...drawings(s),
    ];
  }

  /** the clock decides how the next scramble goes */
  seeded(msg: Message) {
    return [store.set("seed", msg.payload as number)];
  }

  /** a move button */
  turn(msg: Message, s: RubikState) {
    const name = msg.payload as string;
    if (!parseMove(name)) return [];
    const queue = [...s.queue, name];
    return [store.merge({ queue, ...shown({ ...s, queue }) })];
  }

  scramble(_msg: Message, s: RubikState) {
    const [moves, seed] = scramble(s.seed);
    const queue = [...s.queue, ...moves];
    return [store.merge({ queue, seed, ...shown({ ...s, queue }) })];
  }

  /** back to the solved cube, instantly */
  reset(_msg: Message, s: RubikState) {
    const next = { ...s, ...initialStateFor(s) };
    return [store.merge(next), ...drawings(next)];
  }

  /** undo: queue the inverse of the last move */
  undo(_msg: Message, s: RubikState) {
    const last = s.log[s.log.length - 1];
    if (!last || s.turn || s.queue.length) return [];
    // the inverse goes on the queue, and takes the original off the log once it lands
    const queue = [inverse(last)];
    return [
      store.merge({
        queue,
        log: s.log.slice(0, -1),
        ...shown({ ...s, queue, log: s.log.slice(0, -1) }),
      }),
    ];
  }

  tick(msg: Message, s: RubikState) {
    const dt = Math.min((msg.payload as { dt: number }).dt, 50);
    const next = step(s, dt);
    if (!next) return [];
    return [
      store.merge({
        stickers: next.stickers,
        queue: next.queue,
        turn: next.turn,
        log: next.log,
        count: next.count,
        history: next.history,
        status: next.status,
        isSolved: next.isSolved,
        isBusy: next.isBusy,
      }),
      ...drawings(next),
    ];
  }

  /** drag to orbit: the camera follows the pointer while a button is down */
  mouse(msg: Message, s: RubikState) {
    const p = msg.payload as {
      type: string;
      x: number;
      y: number;
      down: boolean;
    };
    if (p.type === "pointerdown")
      return [store.set("drag", { x: p.x, y: p.y })];
    if (p.type === "pointermove" && s.drag && p.down) {
      const camera = orbit(s.camera, p.x - s.drag.x, p.y - s.drag.y);
      const next = { ...s, camera, drag: { x: p.x, y: p.y } };
      return [store.merge({ camera, drag: next.drag }), ...drawings(next)];
    }
    if (s.drag && p.type !== "pointermove") return [store.set("drag", null)];
    return [];
  }
}

/** what a reset puts back */
function initialStateFor(s: RubikState): RubikState {
  return { ...initialState(), camera: s.camera, seed: s.seed };
}

export const rubik = new Rubik();
