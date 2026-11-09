// @vitest-environment jsdom
/**
 * The "Recommended" tab of the cabinet: the filters of the feed and the
 * button that opens the dialog of an application.
 *
 * The feed is the original's `MatchPanel`: the projects to join, their open
 * slots and the filters (a text, a profession, a grade) that go to the
 * backend as the query of the request.
 */
import { createApp, paintOnWrite } from "@pavlus/frontend";
import { createHttpPlugin, createStorePlugin } from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import { describe, expect, test } from "vitest";
import { type HubSlice, ProjectsHubPage } from "../app/projects-hub/hub.ts";
import { initialState } from "../app/state.ts";

/** The requests the page sends (the backend is never asked in this test). */
let requests: { url: string; method: string; body?: unknown }[] = [];

/** The tab in a jsdom page, with the given slice. */
function mount(slice: Partial<HubSlice>): { state: () => HubSlice } {
  document.body.innerHTML = '<div id="app"></div>';
  requests = [];
  const store = createStorePlugin<HubSlice>({
    ...initialState.hub,
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
    app: paintOnWrite(new ProjectsHubPage("match")),
    plugins: [store, dom, http],
    mount: "#app",
  });
  return { state: () => store.getState() };
}

/** A click on `el` (it bubbles, like a real one). */
const click = (el: Element): void => {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
};

/** The slice of the tab with one project and two openings. */
const withFeed = (): Partial<HubSlice> => ({
  tab: "match",
  feed: {
    items: [
      {
        slug: "orbit-labs",
        name: "Orbit Labs",
        tagline: "A rust-flavoured tools studio",
        tags: ["rust"],
        kind: "startup",
        kindLabel: "Startup",
        city: "Berlin",
        budget: null,
        budgetCurrency: "",
        budgetLabel: "",
        deadline: "",
        deadlineLabel: "",
        ownerName: "Anna Founder",
        ownerLabel: "Founder: Anna Founder",
        openSlots: 2,
        bestPercent: 100,
        allApplied: false,
        slots: [
          {
            id: 12,
            professionId: 1,
            profession: "frontend",
            professionName: "Frontend developer",
            bucket: "middle",
            title: "Frontend developer · middle",
            description: "The site",
            payLabel: "",
            applied: false,
            skills: [],
            match: {
              percent: 100,
              gradeOk: true,
              details: [],
              note: "",
            },
            why: ["grade ✓"],
          },
          {
            id: 13,
            professionId: 1,
            profession: "frontend",
            professionName: "Frontend developer",
            bucket: "middle",
            title: "Frontend developer · middle",
            description: "",
            payLabel: "",
            applied: false,
            skills: [],
            match: null,
            why: [],
          },
          {
            id: 14,
            professionId: 1,
            profession: "frontend",
            professionName: "Frontend developer",
            bucket: "middle",
            title: "Frontend developer · middle",
            description: "",
            payLabel: "",
            applied: true,
            skills: [],
            match: null,
            why: [],
          },
        ],
      },
    ],
    status: "idle",
    total: 1,
    canMatch: true,
    more: "",
    strings: {
      query: "Name, tag…",
      profession: "Profession",
      grade: "Grade",
      allProfessions: "All professions",
      anyGrade: "Any grade",
      search: "Search",
      loading: "Loading…",
      empty: "No matching projects yet.",
      noProfession: "Add a profession to your profile.",
      apply: "Apply",
      applied: "Application sent",
      viewApplication: "View the application",
      applyTitle: "Apply: {name}",
    },
    filters: { q: "", role: "", grade: "" },
    options: {
      professions: [{ slug: "frontend", name: "Frontend developer" }],
      buckets: [{ value: "middle", label: "Middle" }],
    },
  },
});

describe("the recommended tab", () => {
  test("the filters of the feed are shown", () => {
    mount(withFeed());
    expect(document.querySelector('[data-testid="match-q"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="match-role"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="match-grade"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="match-search"]')).toBeTruthy();
    expect(
      document.querySelectorAll('[data-testid="match-card"]'),
    ).toHaveLength(1);
  });

  test("the search sends the filters to the backend", () => {
    const feed = withFeed().feed!;
    mount({
      ...withFeed(),
      feed: {
        ...feed,
        filters: { q: "rust", role: "frontend", grade: "middle" },
      },
    });
    const search = document.querySelector('[data-testid="match-search"]');
    click(search!);
    const url = requests.at(-1)?.url ?? "";
    expect(url).toContain("/api/match/startups?");
    expect(url).toContain("q=rust");
    expect(url).toContain("role=frontend");
    expect(url).toContain("grade=middle");
  });

  test("the apply button opens the dialog with the free openings", () => {
    mount(withFeed());
    const join = document.querySelector('[data-testid="join-orbit-labs"]');
    expect(join).toBeTruthy();
    click(join!);
    const modal = document.querySelector('[data-testid="apply-modal"]');
    expect(modal).toBeTruthy();
    // the opening that already has an application is not offered
    const options = document.querySelectorAll(
      '[data-testid="apply-slot"] option',
    );
    expect(options).toHaveLength(2);
    expect(options[0].getAttribute("value")).toBe("12");
    expect(options[1].getAttribute("value")).toBe("13");
  });
});
