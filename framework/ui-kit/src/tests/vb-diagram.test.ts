import { compileToView } from "@pavlus/client/compiler";
import { cleanTree, serializeSvg } from "@pavlus/client/plugins/svg";
import { describe, expect, test } from "vitest";
import { initialData, scopeOf } from "../templates/visual-builder/bind.ts";
import { chartPoints, chartTree } from "../templates/visual-builder/charts.ts";
import {
  generate,
  generatedText,
} from "../templates/visual-builder/codegen.ts";
import {
  counterDemo,
  DEMOS,
  directoryDemo,
  landingDemo,
  salesDemo,
  todoDemo,
} from "../templates/visual-builder/demos.ts";
import {
  addLink,
  buildGraph,
  COL_X,
  countActions,
  diagramTree,
  layoutGraph,
  linkAction,
  litBy,
  removeEdge,
} from "../templates/visual-builder/diagram.ts";
import {
  allElements,
  emptyModel,
  findElement,
} from "../templates/visual-builder/model.ts";

const ui = {
  hover: "",
  selNode: "",
  selEdge: "",
  armed: "",
  collapsed: {},
  prefix: "",
};

describe("graph", () => {
  test("nodes: elements, state keys, http calls; edges of every kind", () => {
    const m = directoryDemo();
    const g = buildGraph(m);
    const kinds = new Set(g.nodes.map((n) => n.kind));
    expect(kinds).toEqual(
      new Set(["page", "section", "element", "chain", "http", "key"]),
    );
    expect(g.nodes.filter((n) => n.kind === "key")).toHaveLength(m.keys.length);
    const kind = (k: string) => g.edges.filter((e) => e.kind === k);
    expect(kind("event").length).toBeGreaterThan(0);
    expect(
      kind("ok").some((e) => e.to === "k:users" && e.label === "onSuccess"),
    ).toBe(true);
    expect(kind("err").some((e) => e.to === "k:error")).toBe(true);
    expect(kind("loading").some((e) => e.to === "k:loading")).toBe(true);
    expect(kind("write").some((e) => e.to === "k:selected")).toBe(true);
    // the table subscribes to users and q; the search input is bound to q
    expect(
      kind("subscribe").some(
        (e) => e.from === "k:users" && e.to.startsWith("e:"),
      ),
    ).toBe(true);
    expect(kind("bind").some((e) => e.from === "k:q")).toBe(true);
  });

  test("then / catch chains and navigation show up", () => {
    const g = buildGraph(landingDemo());
    expect(g.edges.some((e) => e.kind === "navigate")).toBe(true);
    expect(
      g.edges.some((e) => e.kind === "ok" && e.to === "k:lead_result"),
    ).toBe(true);
  });
});

describe("layout", () => {
  test("columns: elements | chains and http | state; nothing overlaps", () => {
    for (const d of DEMOS) {
      const p = layoutGraph(buildGraph(d.make()));
      for (const n of p.nodes) {
        const col =
          n.kind === "key"
            ? 2
            : n.kind === "chain" || n.kind === "http"
              ? 1
              : 0;
        expect(n.x, `${d.id} ${n.id}`).toBeGreaterThanOrEqual(COL_X[col]);
        expect(n.x).toBeLessThan(COL_X[col] + 60);
      }
      for (let i = 0; i < p.nodes.length; i++)
        for (let j = i + 1; j < p.nodes.length; j++) {
          const a = p.nodes[i];
          const b = p.nodes[j];
          const hit =
            a.x < b.x + b.w &&
            b.x < a.x + a.w &&
            a.y < b.y + b.h &&
            b.y < a.y + a.h;
          expect(hit, `${d.id}: ${a.id} / ${b.id}`).toBe(false);
        }
      expect(p.height).toBeGreaterThan(0);
      for (const e of p.edges) expect(e.d.startsWith("M")).toBe(true);
    }
  });

  test("a chain sits near the element it belongs to", () => {
    const p = layoutGraph(buildGraph(todoDemo()));
    const chain = p.nodes.find((n) => n.kind === "chain")!;
    const el = p.nodes.find((n) => n.id === `e:${chain.ref}`)!;
    expect(Math.abs(chain.y - el.y)).toBeLessThan(120);
  });

  test("collapsing a page folds its elements and chains into the page", () => {
    const m = landingDemo();
    const g = buildGraph(m);
    const open = layoutGraph(g);
    const closed = layoutGraph(g, { [m.pages[0].id]: true });
    expect(
      closed.nodes.filter((n) => n.kind === "element").length,
    ).toBeLessThan(open.nodes.filter((n) => n.kind === "element").length);
    expect(closed.nodes.some((n) => n.id === `p:${m.pages[0].id}`)).toBe(true);
    // every edge still ends on a node that is drawn
    const ids = new Set(closed.nodes.map((n) => n.id));
    for (const e of closed.edges) {
      expect(ids.has(e.from)).toBe(true);
      expect(ids.has(e.to)).toBe(true);
    }
    expect(closed.edges.some((e) => e.from === `p:${m.pages[0].id}`)).toBe(
      true,
    );
  });

  test("hovering lights the node's edges", () => {
    const p = layoutGraph(buildGraph(directoryDemo()));
    const lit = litBy(p, "k:users");
    expect(lit.edges.size).toBeGreaterThan(0);
    for (const id of lit.edges) {
      const e = p.edges.find((x) => x.id === id)!;
      expect(e.from === "k:users" || e.to === "k:users").toBe(true);
    }
    expect(litBy(p, "").edges.size).toBe(0);
  });

  test("ports: used events and the primary one", () => {
    const p = layoutGraph(buildGraph(counterDemo()));
    const used = p.ports.filter((x) => x.used);
    expect(used.length).toBeGreaterThan(0);
    expect(p.ports.some((x) => !x.used)).toBe(true);
  });
});

describe("the svg tree is valid for the svg plugin", () => {
  test("every demo draws", () => {
    for (const d of DEMOS) {
      const tree = diagramTree(layoutGraph(buildGraph(d.make())), {
        ...ui,
        prefix: "a.b.",
      });
      const svg = serializeSvg(cleanTree(tree));
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain("vb-dg__edge");
    }
  });
  test("charts draw bars, lines and pies, empty and full", () => {
    const m = salesDemo();
    const charts = allElements(m).filter((e) => e.type === "chart");
    const scope = scopeOf(initialData(m.keys));
    for (const c of charts) {
      const pts = chartPoints(c, scope);
      expect(pts.length).toBeGreaterThan(0);
      expect(serializeSvg(cleanTree(chartTree(c.props.kind, pts)))).toContain(
        "<svg",
      );
    }
    for (const k of ["bar", "line", "pie"])
      expect(serializeSvg(cleanTree(chartTree(k, [])))).toContain("No data");
    expect(
      serializeSvg(cleanTree(chartTree("pie", [{ label: "a", value: 1 }]))),
    ).toContain("<path");
  });
});

describe("editing through the diagram", () => {
  test("a new link appends an action fitting the key and the event", () => {
    const m = todoDemo();
    const input = allElements(m).find((e) => e.type === "input")!;
    expect(linkAction(m, input.id, "input", "draft")).toMatchObject({
      t: "set",
      key: "draft",
      value: "event.value",
    });
    expect(linkAction(m, input.id, "input", "todos")).toMatchObject({
      t: "push",
    });
    expect(linkAction(m, input.id, "input", "loading")).toMatchObject({
      t: "toggle",
    });
    const counter = counterDemo();
    const btn = allElements(counter).find((e) => e.type === "button")!;
    expect(linkAction(counter, btn.id, "click", "count")).toMatchObject({
      t: "set",
      value: "state.count + 1",
    });
    const out = addLink(m, input.id, "change", "draft");
    expect(findElement(out, input.id)!.el.events.change).toHaveLength(1);
    expect(countActions(out)).toBe(countActions(m) + 1);
  });

  test("removing an edge removes the action, and an empty chain disappears", () => {
    const m = counterDemo();
    const reset = allElements(m).find((e) => e.props.text === "Reset")!;
    const g = buildGraph(m);
    const e = g.edges.find((x) => x.ref.el === reset.id && x.to === "k:count")!;
    const out = removeEdge(m, e)!;
    expect(findElement(out, reset.id)!.el.events.click).toHaveLength(1);
    const only = addLink(emptyModelWithKey(), "e1", "click", "k");
    const g2 = buildGraph(only);
    const e2 = g2.edges.find((x) => x.kind === "write")!;
    expect(
      findElement(removeEdge(only, e2)!, "e1")!.el.events.click,
    ).toBeUndefined();
    const bound = g.edges.find((x) => x.kind === "bind")!;
    expect(findElement(removeEdge(m, bound)!, bound.ref.el)!.el.bind).toBe("");
    const sub = g.edges.find((x) => x.kind === "subscribe")!;
    expect(removeEdge(m, sub)).toBeNull();
  });
});

function emptyModelWithKey() {
  const m = emptyModel();
  return {
    ...m,
    keys: [{ key: "k", type: "number" as const, initial: "0" }],
    pages: [
      {
        ...m.pages[0],
        sections: [
          {
            id: "s1",
            kind: "empty" as const,
            name: "S",
            rows: 2,
            bg: "none",
            pad: "md",
            elements: [
              {
                id: "e1",
                type: "button" as const,
                pos: { desktop: { x: 0, y: 0, w: 2, h: 1 } },
                hide: {},
                props: { text: "x" },
                visible: "",
                bind: "",
                style: {},
                fields: [],
                events: {},
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("code generation", () => {
  test("every demo generates templates that compile and render", () => {
    for (const d of DEMOS) {
      const m = d.make();
      const files = generate(m);
      expect(files.at(-1)!.name).toBe("app.ts");
      const state = initialData(m.keys);
      for (const f of files.filter((x) => x.name.endsWith(".pavlus"))) {
        let view;
        try {
          view = compileToView(f.text);
        } catch (e) {
          throw new Error(
            `${d.id}/${f.name}: ${(e as Error).message}\n${f.text}`,
          );
        }
        const out = view.render({ ...state, notice: "" });
        expect(out.length, `${d.id}/${f.name}`).toBeGreaterThan(0);
      }
    }
  });

  test("the skeleton has the state, a method per event and the http effects", () => {
    const text = generatedText(directoryDemo());
    expect(text).toContain("export const initial");
    expect(text).toContain("http.request({");
    expect(text).toContain('onSuccess: "');
    expect(text).toContain("store.set(");
    const todo = generatedText(todoDemo());
    expect(todo).toMatch(/e\d+_enter\(msg: Message/);
    expect(todo).toContain("export const page = new App();");
  });

  test("state references drop the `state.` prefix in templates", () => {
    const t = generate(counterDemo())[0].text;
    expect(t).toContain("{count}");
    expect(t).not.toContain("state.");
  });
});
