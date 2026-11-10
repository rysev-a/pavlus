// The data table and the forms of the Visual Builder are the ui-kit's (shadcn styles); here is
// what they are configured with: a table's columns (labels, number, pill, date), its check
// boxes and the rows that are checked, the fields of a form (a switch, radio buttons, a date, a
// web address, a phone number, a placeholder, a line of help), and an action that runs only
// when a condition is true.
import type { Effect } from "@pavlus/client";
import { describe, expect, test } from "vitest";
import {
  envOf,
  execute,
  startRun,
} from "../templates/visual-builder/actions.ts";
import { generatedText } from "../templates/visual-builder/codegen.ts";
import { actionFields } from "../templates/visual-builder/inspector.ts";
import { parseProject, projectText } from "../templates/visual-builder/io.ts";
import {
  type Action,
  type El,
  type Model,
  allElements,
  blankField,
  emptyModel,
  makeElement,
} from "../templates/visual-builder/model.ts";
import { addElement } from "../templates/visual-builder/grid.ts";
import { columnsOf, stageOf } from "../templates/visual-builder/stage.ts";
import { validateField } from "../templates/visual-builder/validate.ts";
import { notice, set } from "../templates/visual-builder/build.ts";
import {
  page,
  stateOf,
  type VbState,
} from "../templates/visual-builder/visual-builder.ts";

function apply(state: VbState, effects: Effect[]): VbState {
  let s = state;
  for (const e of effects)
    if (e.plugin === "store" && e.type === "merge")
      s = { ...s, ...(e.value as object) };
  return s;
}

/** a model with one section and the element in it */
function withElement(
  type: El["type"],
  patch: (el: El) => El,
  keys: Model["keys"] = [],
): { m: Model; id: string } {
  let m: Model = { ...emptyModel(), keys };
  const made = makeElement(m, type);
  m = made.model;
  const el = patch(made.el);
  const sec = {
    id: "s1",
    kind: "empty" as const,
    name: "S",
    rows: 8,
    bg: "none",
    pad: "md",
    elements: [] as El[],
  };
  const withEl = addElement(sec, el);
  m = {
    ...m,
    pages: m.pages.map((p, i) => (i === 0 ? { ...p, sections: [withEl] } : p)),
  };
  return { m, id: el.id };
}

const users = [
  { id: 1, name: "Ada", status: "active", joined: "2026-01-03T09:00:00Z" },
  { id: 2, name: "Grace", status: "away", joined: "2026-02-10T09:00:00Z" },
  { id: 3, name: "Alan", status: "active", joined: "2026-03-21T09:00:00Z" },
];

describe("the columns of a table", () => {
  test("a name, a header, a kind", () => {
    expect(
      columnsOf("id|number, name:Full name, status|pill, joined:Joined|date"),
    ).toEqual([
      { key: "id", label: "id", kind: "number" },
      { key: "name", label: "Full name", kind: "text" },
      { key: "status", label: "status", kind: "pill" },
      { key: "joined", label: "Joined", kind: "date" },
    ]);
    expect(columnsOf("")).toEqual([]);
    expect(columnsOf("a|unknown")[0].kind).toBe("text");
  });

  test("they are drawn as the data table of the ui-kit: headers, numbers to the right, pills, dates", () => {
    const { m, id } = withElement("table", (el) => ({
      ...el,
      props: {
        ...el.props,
        source: "state.users",
        columns: "id|number, name:Full name, status|pill, joined|date",
      },
    }));
    const stage = stageOf({
      model: m,
      page: m.pages[0],
      bp: "desktop",
      mode: "preview",
      data: { users },
      ui: {},
      selected: "",
      selectedSection: "",
      dragging: false,
      location: "/",
    });
    const t = stage.sections[0].items.find((i) => i.id === id)!;
    expect(t.columns.map((c) => [c.label, c.right])).toEqual([
      ["id", true],
      ["Full name", false],
      ["status", false],
      ["joined", false],
    ]);
    const row = t.rows[0].cells;
    expect([row[0].right, row[2].pill, row[3].text]).toEqual([
      true,
      true,
      "2026-01-03",
    ]);
    expect(t.total).toBe(3);
  });
});

describe("check boxes on the rows", () => {
  const setup = () => {
    const { m, id } = withElement(
      "table",
      (el) => ({
        ...el,
        bind: "picked",
        props: {
          ...el.props,
          source: "state.users",
          select: "yes",
          pageSize: "2",
        },
      }),
      [
        { key: "users", type: "json", initial: JSON.stringify(users) },
        { key: "picked", type: "json", initial: "[]" },
      ],
    );
    const s = { ...stateOf(m), ready: true };
    const send = (st: VbState, msgId: string, payload: unknown) =>
      apply(st, page.dispatch({ id: msgId, payload }, st));
    const view = (st: VbState) =>
      st.stage.sections[0].items.find((i) => i.id === id)!;
    return { m, id, s: send(s, "setTab", "preview"), send, view };
  };

  test("a row is checked and unchecked; the rows checked are counted and kept in the bound key", () => {
    const { id, s, send, view } = setup();
    expect(view(s).selectable).toBe(true);
    expect(view(s).checkedCount).toBe(0);
    let t = send(s, "e.onSelect", [id, 1]);
    expect(view(t).rows.map((r) => r.checked)).toEqual([false, true]);
    expect(view(t).checkedCount).toBe(1);
    expect(t.run.data.picked).toEqual([users[1]]);
    t = send(t, "e.onSelect", [id, 0]);
    expect(t.run.data.picked).toEqual([users[0], users[1]]);
    t = send(t, "e.onSelect", [id, 1]);
    expect(t.run.data.picked).toEqual([users[0]]);
  });

  test("the box of the header checks the rows that are shown, and unchecks them", () => {
    const { id, s, send, view } = setup();
    let t = send(s, "e.onSelectAll", id);
    // two rows to a page
    expect(view(t).allChecked).toBe(true);
    expect(t.run.data.picked).toEqual([users[0], users[1]]);
    t = send(t, "e.onSelectAll", id);
    expect(view(t).allChecked).toBe(false);
    expect(t.run.data.picked).toEqual([]);
  });

  test("a table without check boxes has none", () => {
    const { m, id } = withElement("table", (el) => el);
    const s = stateOf(m);
    expect(s.stage.sections[0].items.find((i) => i.id === id)!.selectable).toBe(
      false,
    );
  });
});

describe("the fields of a form", () => {
  test("a switch, a checkbox and a radio group are known by the view, with their ids", () => {
    const { m, id } = withElement("form", (el) => ({
      ...el,
      fields: [
        blankField("notify", "Notify me", "switch"),
        blankField("plan", "Plan", "radio"),
        {
          ...blankField("site", "Site", "url"),
          placeholder: "https://",
          description: "Where you are",
        },
      ].map((f, i) => (i === 1 ? { ...f, options: "free, pro, team" } : f)),
    }));
    const f = stateOf(m).stage.sections[0].items.find(
      (i) => i.id === id,
    )!.fields;
    expect(f[0]).toMatchObject({
      isSwitch: true,
      isText: false,
      fid: `${id}-notify`,
    });
    expect(f[1]).toMatchObject({ isRadio: true, isText: false });
    expect(f[1].options.map((o) => o.label)).toEqual(["free", "pro", "team"]);
    expect(f[2]).toMatchObject({
      isText: true,
      inputType: "url",
      placeholder: "https://",
      description: "Where you are",
    });
  });

  test("they are checked: a switch, a web address, a phone number, a date", () => {
    const req = (type: Parameters<typeof blankField>[2]) =>
      blankField("f", "F", type, "yes");
    expect(validateField(req("switch"), false)).toBe("F is required");
    expect(validateField(req("switch"), true)).toBe("");
    expect(validateField(req("url"), "example.com")).toMatch(/web address/);
    expect(validateField(req("url"), "https://example.com")).toBe("");
    expect(validateField(req("url"), "javascript:alert(1)")).toMatch(
      /web address/,
    );
    expect(validateField(req("tel"), "abc")).toMatch(/phone/);
    expect(validateField(req("tel"), "+1 (555) 010-0101")).toBe("");
    expect(validateField(req("date"), "03/01/2026")).toMatch(/yyyy-mm-dd/);
    expect(validateField(req("date"), "2026-01-03")).toBe("");
  });

  test("a project that has them is saved and read back, and one that does not is read as before", () => {
    const { m } = withElement("form", (el) => ({
      ...el,
      fields: [
        {
          ...blankField("when", "When", "date"),
          placeholder: "yyyy-mm-dd",
          description: "The day",
        },
      ],
    }));
    const back = parseProject(projectText(m));
    if (typeof back === "string") throw new Error(back);
    expect(allElements(back)[0].fields[0]).toMatchObject({
      type: "date",
      placeholder: "yyyy-mm-dd",
      description: "The day",
    });
    const old = JSON.parse(projectText(m));
    delete old.pages[0].sections[0].elements[0].fields[0].placeholder;
    const read = parseProject(JSON.stringify(old));
    if (typeof read === "string") throw new Error(read);
    expect(allElements(read)[0].fields[0].type).toBe("date");
  });
});

describe("an action that runs only when a condition is true", () => {
  const env = envOf(emptyModel());
  const run = (actions: Action[], extras: Record<string, unknown> = {}) =>
    execute(actions, startRun(emptyModel()), extras, env).run;

  test("it runs when the condition is true, and is left out when it is not", () => {
    const actions: Action[] = [
      { ...set("a", '"yes"'), when: 'action == "Edit"' },
      { ...set("b", '"yes"'), when: 'action == "Delete"' },
      set("c", '"always"'),
    ];
    const r = run(actions, { action: "Edit" });
    expect(r.data.a).toBe("yes");
    expect(r.data.b).toBeUndefined();
    expect(r.data.c).toBe("always");
    expect(r.log.some((l) => l.includes("skipped"))).toBe(true);
    const d = run(actions, { action: "Delete" });
    expect([d.data.a, d.data.b]).toEqual([undefined, "yes"]);
  });

  test("a condition that cannot be read leaves the action out, and says why", () => {
    const r = run([{ ...notice("x"), when: "state.(" }]);
    expect(r.notice ?? "").toBe("");
    expect(r.log.join("\n")).toMatch(/when/);
  });

  test("an empty condition is no condition", () => {
    expect(run([{ ...set("a", "1"), when: "  " }]).data.a).toBe(1);
  });

  test("the editor has a field for it on every kind of action, first", () => {
    for (const t of [
      "set",
      "toggle",
      "push",
      "remove",
      "http",
      "navigate",
      "notice",
    ] as const) {
      const fields = actionFields("ctx", { t, when: "x" });
      expect(fields[0]).toMatchObject({
        name: "when",
        label: "Only when (expression)",
      });
    }
  });

  test("it is saved with the project", () => {
    const { m } = withElement("button", (el) => ({
      ...el,
      events: { click: [{ ...set("a", "1"), when: "state.ok" }] },
    }));
    const back = parseProject(projectText(m));
    if (typeof back === "string") throw new Error(back);
    expect(allElements(back)[0].events.click?.[0].when).toBe("state.ok");
  });

  test("the code of the page has the condition: the effect is in the list only then", () => {
    const { m } = withElement("button", (el) => ({
      ...el,
      events: { click: [{ ...set("a", "1"), when: "state.ok" }] },
    }));
    const text = generatedText(m);
    expect(text).toMatch(/\.\.\.\(.*state.*\? \[/);
    expect(text).toContain("] : []),");
  });
});
