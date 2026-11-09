// @vitest-environment jsdom
/**
 * The skill tree: the branches of the directory's skills and the ten-segment
 * meter that rates a leaf (the original's `skills_tree.rs`).
 *
 * The tree is a child of the page: it owns the ratings and tells the page
 * (`tree.changed`), which saves them.
 */
import { createApp, paintOnWrite } from "@pavlus/frontend";
import { createHttpPlugin, createStorePlugin } from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import { describe, expect, test } from "vitest";
import { ProfessionsPage } from "../app/professions/professions.ts";
import { segmentsOf } from "../app/skill-tree/tree.ts";
import { type ProfessionsSlice, initialState } from "../app/state.ts";

/** The requests the page sends (the backend is never asked in this test). */
let requests: { url: string; method: string; body?: unknown }[] = [];

/** The page in a jsdom page, with the given slice. */
function mount(slice: Partial<ProfessionsSlice>): {
  state: () => ProfessionsSlice;
} {
  document.body.innerHTML = '<div id="app"></div>';
  requests = [];
  const store = createStorePlugin<ProfessionsSlice>({
    ...initialState.professions,
    ...slice,
  });
  const dom = new DomPlugin();
  const http = createHttpPlugin({
    fetch: (url: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        url: String(url),
        method: init?.method ?? "GET",
        body: init?.body,
      });
      return new Promise(() => {});
    },
  });
  createApp({
    app: paintOnWrite(new ProfessionsPage()),
    plugins: [store, dom, http],
    mount: "#app",
  });
  return { state: () => store.getState() };
}

/** A click on `el` (it bubbles, like a real one). */
const click = (el: Element): void => {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
};

/** The slice with one open profession and a tree of one branch and one leaf. */
const withTree = (): Partial<ProfessionsSlice> => ({
  open: "frontend",
  mine: [
    {
      professionId: 1,
      slug: "frontend",
      name: "Frontend developer",
      bucket: "middle",
    },
  ],
  tree: {
    roots: [
      {
        id: 10,
        slug: "frontend",
        name: "Frontend",
        open: true,
        level: null,
        zone: "",
        levelLabel: "—",
        aria: "Level: frontend",
        children: [
          {
            id: 11,
            slug: "react",
            name: "React",
            children: [],
            open: true,
            level: null,
            zone: "",
            levelLabel: "—",
            aria: "Level: react",
          },
        ],
      },
    ],
    segments: segmentsOf(),
    hover: { skillId: 0, level: 0 },
    levels: [],
    zones: {
      junior: "Junior",
      middle: "Middle",
      senior: "Senior",
      lead: "Lead",
    },
    strings: { clearRating: "Clear the rating", levelAria: "Level: {skill}" },
  },
});

describe("the skill tree", () => {
  test("the branch and the leaf with the ten segments are drawn", () => {
    mount(withTree());
    expect(document.querySelectorAll(".pf__branch").length).toBe(1);
    expect(document.querySelector('[data-testid="skill-react"]')).toBeTruthy();
    const segments = document.querySelectorAll(
      '[data-testid="skill-react"] .pf__seg',
    );
    expect(segments.length).toBe(10);
    expect(
      document.querySelector('[data-testid="level-react"]')?.textContent,
    ).toBe("—");
  });

  test("a segment sets the rating and the page saves the skills", async () => {
    const { state } = mount(withTree());
    const segment = document.querySelector(
      '[data-testid="seg-react-7"]',
    ) as HTMLElement;
    expect(segment).toBeTruthy();
    click(segment);
    // the tree remembers the rating
    expect(state().tree.levels).toEqual([{ skillId: 11, level: 7 }]);
    // the page was told: the skills are saved (the answer of the write)
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("/api/profile/skills");
    expect(requests[0].method).toBe("PUT");
    expect(JSON.parse(String(requests[0].body))).toEqual({
      skills: [{ skillId: 11, level: 7 }],
    });
  });

  test("the pointer previews the rating", () => {
    mount(withTree());
    const segment = document.querySelector(
      '[data-testid="seg-react-5"]',
    ) as HTMLElement;
    segment.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    const lit = document.querySelectorAll(
      '[data-testid="skill-react"] .pf__seg.is-on',
    );
    expect(lit.length).toBe(5);
  });
});
