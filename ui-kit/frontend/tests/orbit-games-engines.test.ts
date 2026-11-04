import { describe, expect, test } from "vitest";
import * as pacman from "../templates/orbit-social/modules/games/pacman.ts";
import {
  nextRand,
  randInt,
} from "../templates/orbit-social/modules/games/rng.ts";
import * as snake from "../templates/orbit-social/modules/games/snake.ts";
import * as tetris from "../templates/orbit-social/modules/games/tetris.ts";

describe("rng", () => {
  test("is deterministic and in [0, 1)", () => {
    expect(nextRand(7)).toEqual(nextRand(7));
    let seed = 1;
    for (let i = 0; i < 200; i++) {
      const r = nextRand(seed);
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(1);
      seed = r.seed;
    }
    expect(randInt(3, 1).value).toBe(0);
    expect(randInt(3, 5).value).toBeLessThan(5);
  });
});

describe("snake", () => {
  const at = (s: snake.SnakeState) => s.body[0];

  test("starts with three cells, food off the snake", () => {
    const s = snake.initial(1);
    expect(s.body).toHaveLength(3);
    expect(s.food).not.toBeNull();
    expect(s.body.some((p) => p.x === s.food!.x && p.y === s.food!.y)).toBe(
      false,
    );
  });

  test("moves one cell a tick in its direction", () => {
    const s = snake.initial(1);
    const n = snake.step(s);
    expect(at(n)).toEqual({ x: at(s).x + 1, y: at(s).y });
    expect(n.body).toHaveLength(3);
  });

  test("eating grows the snake, scores, and puts new food elsewhere", () => {
    let s = snake.initial(1);
    s = { ...s, food: { x: at(s).x + 1, y: at(s).y } };
    const n = snake.step(s);
    expect(n.body).toHaveLength(4);
    expect(n.score).toBe(10);
    expect(n.eaten).toBe(1);
    expect(n.food).not.toEqual({ x: at(s).x + 1, y: at(s).y });
    expect(n.body.some((p) => p.x === n.food!.x && p.y === n.food!.y)).toBe(
      false,
    );
  });

  test("the level rises every five foods and the tick gets shorter", () => {
    expect(snake.levelOf(4)).toBe(1);
    expect(snake.levelOf(5)).toBe(2);
    expect(snake.tickMs(2)).toBeLessThan(snake.tickMs(1));
    expect(snake.tickMs(99)).toBe(60);
  });

  test("hitting a wall ends the game, on every side", () => {
    for (const [dir, body] of [
      [
        "right",
        [
          { x: 19, y: 5 },
          { x: 18, y: 5 },
        ],
      ],
      [
        "left",
        [
          { x: 0, y: 5 },
          { x: 1, y: 5 },
        ],
      ],
      [
        "up",
        [
          { x: 5, y: 0 },
          { x: 5, y: 1 },
        ],
      ],
      [
        "down",
        [
          { x: 5, y: 19 },
          { x: 5, y: 18 },
        ],
      ],
    ] as [snake.Dir, snake.Point[]][]) {
      const s = { ...snake.initial(1), body, dir, food: { x: 10, y: 10 } };
      expect(snake.step(s).over).toBe(true);
    }
  });

  test("hitting itself ends the game", () => {
    // a 2x3 block: the head curls into its own body
    const s: snake.SnakeState = {
      ...snake.initial(1),
      body: [
        { x: 5, y: 5 },
        { x: 5, y: 6 },
        { x: 6, y: 6 },
        { x: 6, y: 5 },
        { x: 6, y: 4 },
      ],
      dir: "up",
      food: { x: 0, y: 0 },
    };
    // turning right puts the head on (6,5), a cell of its own body
    expect(snake.step(snake.turn(s, "right")).over).toBe(true);
  });

  test("the tail's cell is free in the same tick", () => {
    const s: snake.SnakeState = {
      ...snake.initial(1),
      body: [
        { x: 5, y: 5 },
        { x: 6, y: 5 },
        { x: 6, y: 6 },
        { x: 5, y: 6 },
      ],
      dir: "left",
      food: { x: 0, y: 0 },
    };
    // heading down into (5,6): the tail leaves it as the head arrives
    const n = snake.step(snake.turn(s, "down"));
    expect(n.over).toBe(false);
    expect(at(n)).toEqual({ x: 5, y: 6 });
  });

  test("a reverse turn is ignored, a side turn is taken", () => {
    const s = snake.initial(1);
    expect(snake.turn(s, "left")).toBe(s);
    expect(snake.turn(s, "right")).toBe(s);
    const up = snake.turn(s, "up");
    expect(snake.step(up).dir).toBe("up");
    // after "up" queued, "down" is a reverse of the queued direction
    expect(snake.turn(up, "down")).toBe(up);
  });

  test("two quick turns are both applied, in order, and the queue is bounded", () => {
    let s = snake.initial(1);
    s = snake.turn(s, "up");
    s = snake.turn(s, "left");
    s = snake.turn(s, "down");
    expect(s.queue).toEqual(["up", "left"]);
    s = snake.step(s);
    expect(s.dir).toBe("up");
    s = snake.step(s);
    expect(s.dir).toBe("left");
  });

  test("food never lands on the snake, over a long game steered by a bot", () => {
    let s = snake.initial(42);
    const vec = {
      up: [0, -1],
      down: [0, 1],
      left: [-1, 0],
      right: [1, 0],
    } as const;
    for (let i = 0; i < 3000 && !s.over; i++) {
      // a bot: of the safe moves, the one that gets closest to the food
      const h = at(s);
      const f = s.food!;
      const safe = (["up", "left", "down", "right"] as snake.Dir[])
        .filter(
          (d) =>
            !(d === "up" && s.dir === "down") &&
            !(d === "down" && s.dir === "up") &&
            !(d === "left" && s.dir === "right") &&
            !(d === "right" && s.dir === "left"),
        )
        .map((d) => ({ d, x: h.x + vec[d][0], y: h.y + vec[d][1] }))
        .filter(
          (m) =>
            m.x >= 0 &&
            m.y >= 0 &&
            m.x < s.w &&
            m.y < s.h &&
            !s.body.slice(0, -1).some((p) => p.x === m.x && p.y === m.y),
        );
      if (safe.length === 0) break;
      safe.sort(
        (a, b) =>
          Math.abs(a.x - f.x) +
          Math.abs(a.y - f.y) -
          (Math.abs(b.x - f.x) + Math.abs(b.y - f.y)),
      );
      s = snake.step(snake.turn(s, safe[0].d));
      if (s.food)
        expect(s.body.some((p) => p.x === s.food!.x && p.y === s.food!.y)).toBe(
          false,
        );
    }
    expect(s.eaten).toBeGreaterThan(3);
  });

  test("a full board is a win", () => {
    const s: snake.SnakeState = {
      ...snake.initial(1, 3, 2),
      w: 3,
      h: 2,
      body: [
        { x: 1, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
        { x: 2, y: 1 },
      ],
      dir: "right",
      food: { x: 2, y: 0 },
    };
    const n = snake.step(s);
    expect(n.body).toHaveLength(6);
    expect(n.won).toBe(true);
    expect(n.over).toBe(true);
    expect(n.food).toBeNull();
  });

  test("does nothing once over; same seed, same game", () => {
    const over = { ...snake.initial(1), over: true };
    expect(snake.step(over)).toBe(over);
    expect(snake.turn(over, "up")).toBe(over);
    const run = () => {
      let s = snake.initial(9);
      for (let i = 0; i < 30; i++)
        s = snake.step(
          snake.turn(s, i % 7 === 3 ? "up" : i % 7 === 5 ? "left" : "right"),
        );
      return s;
    };
    expect(run()).toEqual(run());
    expect(snake.initial(1).food).not.toEqual(snake.initial(2).food);
  });

  test("cell kinds: head, body, food in a flat list", () => {
    const s = snake.initial(1);
    const k = snake.cellKinds(s);
    expect(k).toHaveLength(400);
    expect(k.filter((c) => c === "h")).toHaveLength(1);
    expect(k.filter((c) => c === "s")).toHaveLength(2);
    expect(k.filter((c) => c === "f")).toHaveLength(1);
  });
});

describe("tetris", () => {
  test("seven pieces of four cells, four rotations each", () => {
    expect(tetris.PIECES).toHaveLength(7);
    for (let kind = 1; kind <= 7; kind++) {
      for (let rot = 0; rot < 4; rot++)
        expect(tetris.cellsOf(kind, rot)).toHaveLength(4);
      // four quarter turns come back
      expect(tetris.cellsOf(kind, 4)).toEqual(tetris.cellsOf(kind, 0));
    }
  });

  test("rotations: I is flat then upright, O never changes, T has four faces", () => {
    const ys = (k: number, r: number) =>
      new Set(tetris.cellsOf(k, r).map((c) => c[1])).size;
    const xs = (k: number, r: number) =>
      new Set(tetris.cellsOf(k, r).map((c) => c[0])).size;
    expect(ys(1, 0)).toBe(1);
    expect(xs(1, 0)).toBe(4);
    expect(xs(1, 1)).toBe(1);
    expect(ys(1, 1)).toBe(4);
    const key = (k: number, r: number) =>
      JSON.stringify([...tetris.cellsOf(k, r)].sort());
    expect(key(2, 0)).toBe(key(2, 1));
    expect(new Set([0, 1, 2, 3].map((r) => key(3, r))).size).toBe(4);
    // S, Z, I have two distinct faces for the shape; J and L four
    expect(new Set([0, 1, 2, 3].map((r) => key(6, r))).size).toBe(4);
    expect(new Set([0, 1, 2, 3].map((r) => key(7, r))).size).toBe(4);
  });

  test("every piece spawns on an empty board, inside it", () => {
    for (let kind = 1; kind <= 7; kind++) {
      const p = tetris.spawn(kind);
      expect(
        tetris.fits(new Array<number>(tetris.COLS * tetris.ROWS).fill(0), p),
      ).toBe(true);
    }
  });

  test("a bag holds each of the seven pieces once", () => {
    const s = tetris.initial(5);
    const first = [s.piece.kind, s.next, ...s.bag];
    expect(first).toHaveLength(7);
    expect(new Set(first).size).toBe(7);
  });

  test("gravity moves the piece down a row; it locks on the floor and the next one comes", () => {
    let s = tetris.initial(3);
    const y0 = s.piece.y;
    s = tetris.step(s);
    expect(s.piece.y).toBe(y0 + 1);
    const next = s.next;
    for (let i = 0; i < 25; i++) s = tetris.step(s);
    expect(s.board.some((c) => c !== 0)).toBe(true);
    expect(s.piece.kind).toBe(next);
  });

  test("move stops at the walls and at blocks", () => {
    let s = tetris.initial(3);
    for (let i = 0; i < 12; i++) s = tetris.move(s, -1);
    const left = Math.min(
      ...tetris
        .cellsOf(s.piece.kind, s.piece.rot)
        .map(([dx]) => s.piece.x + dx),
    );
    expect(left).toBe(0);
    for (let i = 0; i < 20; i++) s = tetris.move(s, 1);
    const right = Math.max(
      ...tetris
        .cellsOf(s.piece.kind, s.piece.rot)
        .map(([dx]) => s.piece.x + dx),
    );
    expect(right).toBe(tetris.COLS - 1);
  });

  test("rotating at a wall kicks the piece in", () => {
    let s = tetris.initial(3);
    s = { ...s, piece: { kind: 1, rot: 1, x: -2, y: 5 } }; // vertical I against the left wall (its column is x + 2)
    const r = tetris.rotate(s);
    expect(r.piece.rot).toBe(2);
    expect(tetris.fits(r.board, r.piece)).toBe(true);
    // the O does not rotate
    const o = { ...s, piece: tetris.spawn(2) };
    expect(tetris.rotate(o)).toBe(o);
  });

  test("a full row clears, scores, and the rows above fall", () => {
    // the bottom row is full but for four cells in the middle; the I lands there
    const board = new Array<number>(tetris.COLS * tetris.ROWS).fill(0);
    for (let x = 0; x < tetris.COLS; x++)
      if (x < 3 || x > 6) board[19 * tetris.COLS + x] = 3;
    board[18 * tetris.COLS + 0] = 5; // a block above, must fall one row
    const s: tetris.TetrisState = {
      ...tetris.initial(1),
      board,
      piece: { kind: 1, rot: 0, x: 3, y: 0 },
    };
    const n = tetris.hardDrop(s);
    expect(n.lines).toBe(1);
    // 100 for the line at level 1 plus 2 per row of the drop
    expect(n.score).toBe(100 + 2 * tetris.dropDistance(s));
    expect(n.board[19 * tetris.COLS + 0]).toBe(5);
    expect(
      n.board.slice(18 * tetris.COLS, 19 * tetris.COLS).every((c) => c === 0),
    ).toBe(true);
  });

  test("four rows at once is a Tetris: 800 times the level", () => {
    const board = new Array<number>(tetris.COLS * tetris.ROWS).fill(0);
    for (let y = 16; y < 20; y++)
      for (let x = 0; x < tetris.COLS - 1; x++) board[y * tetris.COLS + x] = 2;
    const s: tetris.TetrisState = {
      ...tetris.initial(1),
      board,
      piece: { kind: 1, rot: 1, x: 7, y: 0 },
    }; // upright I over column 9
    const d = tetris.dropDistance(s);
    const n = tetris.hardDrop(s);
    expect(n.lines).toBe(4);
    expect(n.score).toBe(800 + 2 * d);
    expect(n.board.every((c) => c === 0)).toBe(true);
    expect(tetris.LINE_POINTS).toEqual([0, 100, 300, 500, 800]);
  });

  test("levels rise every ten lines and speed the gravity", () => {
    expect(tetris.levelOf(9)).toBe(1);
    expect(tetris.levelOf(10)).toBe(2);
    expect(tetris.levelOf(25)).toBe(3);
    expect(tetris.tickMs(3)).toBeLessThan(tetris.tickMs(1));
    expect(tetris.tickMs(50)).toBe(100);
    // clearing a row on line 9 reaches level 2 and the next clear pays double
    const board = new Array<number>(tetris.COLS * tetris.ROWS).fill(0);
    for (let x = 0; x < tetris.COLS - 1; x++) board[19 * tetris.COLS + x] = 2;
    const s: tetris.TetrisState = {
      ...tetris.initial(1),
      board,
      lines: 9,
      piece: { kind: 1, rot: 1, x: 7, y: 0 },
    };
    const n = tetris.hardDrop(s);
    expect(n.lines).toBe(10);
    expect(n.level).toBe(2);
  });

  test("hard drop: lands at the bottom at once, two points a row", () => {
    const s = tetris.initial(4);
    const d = tetris.dropDistance(s);
    const n = tetris.hardDrop(s);
    expect(n.score).toBe(2 * d);
    expect(n.board.filter((c) => c !== 0)).toHaveLength(4);
    expect(n.piece.kind).toBe(s.next);
  });

  test("soft drop: a point a row, nothing at the bottom", () => {
    const s = tetris.initial(4);
    expect(tetris.softDrop(s).score).toBe(1);
    const low = {
      ...s,
      piece: { ...s.piece, y: s.piece.y + tetris.dropDistance(s) },
    };
    expect(tetris.softDrop(low)).toBe(low);
  });

  test("the game is over when the next piece cannot spawn", () => {
    const board = new Array<number>(tetris.COLS * tetris.ROWS).fill(0);
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < tetris.COLS; x++)
        if (x !== 9) board[y * tetris.COLS + x] = 4;
    const s: tetris.TetrisState = {
      ...tetris.initial(1),
      board,
      piece: { kind: 2, rot: 0, x: 0, y: 3 },
    };
    const n = tetris.hardDrop(s);
    expect(n.over).toBe(true);
    // nothing moves once over
    expect(tetris.step(n)).toBe(n);
    expect(tetris.move(n, 1)).toBe(n);
    expect(tetris.rotate(n)).toBe(n);
    expect(tetris.softDrop(n)).toBe(n);
    expect(tetris.hardDrop(n)).toBe(n);
  });

  test("dropping pieces without steering ends the game", () => {
    let s = tetris.initial(11);
    for (let i = 0; i < 60 && !s.over; i++) s = tetris.hardDrop(s);
    expect(s.over).toBe(true);
    expect(s.score).toBeGreaterThan(0);
  });

  test("same seed, same game", () => {
    const run = () => {
      let s = tetris.initial(21);
      for (let i = 0; i < 40; i++)
        s = tetris.step(
          i % 5 === 0 ? tetris.rotate(s) : i % 3 === 0 ? tetris.move(s, 1) : s,
        );
      return s;
    };
    expect(run()).toEqual(run());
  });

  test("cell kinds: a flat board, the falling piece and its ghost; a 4x4 preview", () => {
    expect(tetris.fits(new Array<number>(200).fill(0), tetris.spawn(1))).toBe(
      true,
    );
    const s = tetris.initial(2);
    const k = tetris.cellKinds(s);
    expect(k).toHaveLength(200);
    expect(k.filter((c) => c === `t${s.piece.kind}`)).toHaveLength(4);
    expect(k.filter((c) => c === "gh").length).toBeGreaterThan(0);
    const p = tetris.previewKinds(s);
    expect(p).toHaveLength(16);
    expect(p.filter((c) => c === `t${s.next}`)).toHaveLength(4);
  });
});

describe("pacman", () => {
  const free = (s: pacman.PacState): pacman.PacState => ({ ...s, ready: 0 });
  const tile = (x: number, y: number) => pacman.MAZE[y][x];

  test("the maze: a rectangle with walls, four power pellets, pellets, one Pac-Man and a ghost house", () => {
    expect(pacman.MAZE.every((r) => r.length === pacman.W)).toBe(true);
    expect(pacman.W).toBe(19);
    expect(pacman.H).toBeGreaterThanOrEqual(19);
    const all = pacman.MAZE.join("");
    expect([...all].filter((c) => c === "o")).toHaveLength(4);
    expect([...all].filter((c) => c === "P")).toHaveLength(1);
    expect([...all].filter((c) => c === "G")).toHaveLength(3);
    expect([...all].filter((c) => c === "=")).toHaveLength(1);
    expect([...all].filter((c) => c === ".").length).toBeGreaterThan(100);
    expect(pacman.MAZE[0]).toBe("#".repeat(pacman.W));
    expect(pacman.MAZE[pacman.H - 1]).toBe("#".repeat(pacman.W));
  });

  test("every pellet can be reached from the start, through the tunnel", () => {
    const seen = new Set<string>();
    const queue = [{ x: 9, y: 13 }];
    seen.add("9,13");
    while (queue.length > 0) {
      const p = queue.shift()!;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const x = (p.x + dx + pacman.W) % pacman.W;
        const y = p.y + dy;
        if (
          y < 0 ||
          y >= pacman.H ||
          "#=".includes(tile(x, y)) ||
          seen.has(`${x},${y}`)
        )
          continue;
        seen.add(`${x},${y}`);
        queue.push({ x, y });
      }
    }
    for (let y = 0; y < pacman.H; y++)
      for (let x = 0; x < pacman.W; x++)
        if (".o".includes(tile(x, y))) expect(seen.has(`${x},${y}`)).toBe(true);
  });

  test("starts with three lives, four ghosts and every pellet", () => {
    const s = pacman.initial(1);
    expect(s.lives).toBe(3);
    expect(s.ghosts).toHaveLength(4);
    expect(s.left).toBe(s.food.filter((f) => f > 0).length);
    expect(s.food.filter((f) => f === 2)).toHaveLength(4);
    expect(tile(s.x, s.y)).toBe("P");
  });

  test("the first ticks are a short wait", () => {
    const s = pacman.initial(1);
    const n = pacman.step(s);
    expect(n.ready).toBe(s.ready - 1);
    expect(n.x).toBe(s.x);
  });

  test("Pac-Man eats pellets for ten points and walls stop him", () => {
    let s = free(pacman.initial(1));
    s = { ...s, ghosts: [] };
    const before = s.left;
    s = pacman.step(s); // left from (9,13) to (8,13)
    expect(s.x).toBe(8);
    expect(s.score).toBe(10);
    expect(s.left).toBe(before - 1);
    // down from (8,13) is a wall: he keeps going left
    s = pacman.step(pacman.turn(s, "down"));
    expect(s.x).toBe(7);
    // a wall right ahead: he stays
    const w = free({
      ...pacman.initial(1),
      ghosts: [],
      x: 4,
      y: 13,
      dir: "left",
      want: "left",
    });
    // (3,13) is a wall
    const stay = pacman.step(w);
    expect(stay.x).toBe(4);
    expect(stay.y).toBe(13);
  });

  test("a wanted turn waits for the way to open, then is taken", () => {
    let s = free({ ...pacman.initial(1), ghosts: [] });
    s = pacman.turn(s, "up"); // (9,12) is a wall
    s = pacman.step(s);
    expect(s.dir).toBe("left");
    expect(s.x).toBe(8);
    s = pacman.step(s);
    s = pacman.step(s);
    s = pacman.step(s);
    s = pacman.step(s); // at x=4: (4,12) is a pellet cell, the way up opens
    expect(s.dir).toBe("up");
  });

  test("the tunnel wraps from one side to the other", () => {
    let s = free({
      ...pacman.initial(1),
      ghosts: [],
      x: 0,
      y: 9,
      dir: "left",
      want: "left",
    });
    s = pacman.step(s);
    expect(s.x).toBe(pacman.W - 1);
    s = pacman.turn(s, "right");
    s = pacman.step(s);
    expect(s.x).toBe(0);
  });

  test("a power pellet frightens the ghosts; eating them pays 200, 400...", () => {
    let s = free(pacman.initial(1));
    // Pac-Man next to the power pellet at (1,13)
    s = {
      ...s,
      x: 2,
      y: 13,
      dir: "left",
      want: "left",
      ghosts: [
        {
          id: 0,
          x: 8,
          y: 1,
          dir: "left",
          mode: "normal",
          frightened: false,
          release: 0,
        },
        {
          id: 1,
          x: 9,
          y: 1,
          dir: "left",
          mode: "normal",
          frightened: false,
          release: 0,
        },
      ],
    };
    s = pacman.step(s);
    expect(s.score).toBe(50);
    expect(s.fright).toBeGreaterThan(0);
    expect(s.ghosts.every((g) => g.frightened)).toBe(true);
    // a frightened ghost on the next cell is eaten
    const eat = (st: pacman.PacState, gx: number): pacman.PacState =>
      pacman.step({
        ...st,
        x: 4,
        y: 13,
        dir: "left",
        want: "left",
        ghosts: st.ghosts.map((g, i) =>
          i === 0
            ? { ...g, x: gx, y: 13, mode: "normal", frightened: true }
            : g,
        ),
      });
    let e = eat({ ...s, score: 0, combo: 0 }, 3);
    expect(e.ghosts[0].mode).toBe("eyes");
    expect(e.score).toBeGreaterThanOrEqual(200);
    e = { ...e, score: 0 };
    e = pacman.step({
      ...e,
      x: 6,
      y: 13,
      dir: "left",
      want: "left",
      ghosts: e.ghosts.map((g, i) =>
        i === 1 ? { ...g, x: 5, y: 13, mode: "normal", frightened: true } : g,
      ),
    });
    expect(e.ghosts[1].mode).toBe("eyes");
    expect(e.score).toBeGreaterThanOrEqual(400);
  });

  test("the frightened time runs out", () => {
    let s = free({
      ...pacman.initial(1),
      ghosts: pacman.initial(1).ghosts.slice(0, 1),
      x: 2,
      y: 13,
      dir: "left",
      want: "left",
    });
    s = pacman.step(s);
    let guard = 0;
    while (s.fright > 0 && guard++ < 100)
      s = pacman.step(pacman.turn(s, "right"));
    expect(s.fright).toBe(0);
    expect(s.ghosts.every((g) => !g.frightened)).toBe(true);
  });

  test("meeting a ghost costs a life and puts everyone back; no lives is game over", () => {
    let s = free(pacman.initial(1));
    const ghost = {
      id: 0,
      x: 8,
      y: 13,
      dir: "right" as const,
      mode: "normal" as const,
      frightened: false,
      release: 0,
    };
    s = pacman.step({ ...s, ghosts: [ghost] });
    expect(s.lives).toBe(2);
    expect(s.x).toBe(9);
    expect(s.y).toBe(13);
    expect(s.ready).toBeGreaterThan(0);
    expect(s.ghosts).toHaveLength(4);
    const last = pacman.step({
      ...free(pacman.initial(1)),
      lives: 1,
      ghosts: [ghost],
    });
    expect(last.lives).toBe(0);
    expect(last.over).toBe(true);
    expect(pacman.step(last)).toBe(last);
  });

  test("ghosts leave the house one by one and always stay on the paths", () => {
    let s = free(pacman.initial(1));
    s = { ...s, lives: 99 };
    const out = new Set<number>();
    for (let i = 0; i < 400 && !s.over; i++) {
      s = pacman.step(s);
      for (const g of s.ghosts) {
        expect(pacman.MAZE[g.y][g.x]).not.toBe("#");
        if (g.y <= 7) out.add(g.id);
      }
    }
    expect([...out].sort()).toEqual([0, 1, 2, 3]);
  });

  test("a ghost never reverses on its own and keeps moving", () => {
    let s = free({ ...pacman.initial(1), lives: 99 });
    const trail: string[] = [];
    for (let i = 0; i < 60; i++) {
      s = pacman.step(s);
      trail.push(`${s.ghosts[0].x},${s.ghosts[0].y}`);
    }
    expect(new Set(trail).size).toBeGreaterThan(10);
  });

  test("clearing the last pellet is a level up: a new maze, more speed, a bonus", () => {
    const base = free({ ...pacman.initial(1), ghosts: [] });
    const food = new Array<number>(pacman.W * pacman.H).fill(0);
    food[13 * pacman.W + 8] = 1; // the cell to his left
    const s = pacman.step({ ...base, food, left: 1 });
    expect(s.level).toBe(2);
    expect(s.score).toBe(10 + 500);
    expect(s.left).toBeGreaterThan(100);
    expect(s.food.filter((f) => f === 2)).toHaveLength(4);
    expect(s.x).toBe(9);
    expect(s.ghosts).toHaveLength(4);
    expect(pacman.tickMs(2)).toBeLessThan(pacman.tickMs(1));
  });

  test("a long game with a wandering Pac-Man is deterministic, with ghosts of the seed", () => {
    const dirs: pacman.Dir[] = ["left", "up", "right", "down"];
    const run = () => {
      let s = pacman.initial(77);
      for (let i = 0; i < 500 && !s.over; i++)
        s = pacman.step(pacman.turn(s, dirs[(i >> 2) % 4]));
      return s;
    };
    const a = run();
    expect(a).toEqual(run());
    expect(a.tick).toBeGreaterThan(50);
  });

  test("cell kinds: a flat maze with the pac and the ghosts", () => {
    const s = pacman.initial(1);
    const k = pacman.cellKinds(s);
    expect(k).toHaveLength(pacman.W * pacman.H);
    expect(k.length).toBeLessThanOrEqual(450);
    expect(k.filter((c) => c === "P")).toHaveLength(1);
    expect(k.filter((c) => /^g\d$/.test(c))).toHaveLength(4);
    expect(k.filter((c) => c === "o")).toHaveLength(4);
    expect(k.filter((c) => c === "d")).toHaveLength(1);
  });
});
