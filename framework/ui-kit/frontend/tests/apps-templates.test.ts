import { expect, test } from "vitest";
import {
  addTask,
  progressOf,
  removeTask,
  taskMockState,
  toggleTask,
  visibleTasks,
} from "../blocks/task-mock/task-mock.ts";
import {
  filterProjects,
  initial as studio,
} from "../templates/dev-studio-website/dev-studio-website.ts";
import {
  derive,
  PEOPLE,
  PROJECTS,
  projectFit,
  rankPeople,
  sentList,
} from "../templates/team-matcher-service/team-matcher-service.ts";

test("addTask trims, tags with #word and ignores blanks", () => {
  expect(addTask([], "   ", 1)).toEqual([]);
  expect(addTask([], "#home", 1)).toEqual([]);
  expect(addTask([], "Call mum #family now", 7)).toEqual([
    { id: 7, title: "Call mum now", done: false, tag: "Family" },
  ]);
});

test("toggle, remove, filter and progress of tasks", () => {
  const s = taskMockState();
  const toggled = toggleTask(s.tasks, 2);
  expect(toggled.find((t) => t.id === 2)?.done).toBe(true);
  expect(s.tasks.find((t) => t.id === 2)?.done).toBe(false);
  expect(removeTask(s.tasks, 1)).toHaveLength(s.tasks.length - 1);
  expect(visibleTasks(toggled, "done").map((t) => t.id)).toEqual([1, 2]);
  expect(visibleTasks(toggled, "open").every((t) => !t.done)).toBe(true);
  // in "all" the open ones come first
  expect(
    visibleTasks(toggled, "all")
      .slice(-2)
      .map((t) => t.id),
  ).toEqual([1, 2]);
  expect(progressOf([])).toEqual({ done: 0, total: 0, percent: 0 });
  expect(progressOf(toggled)).toEqual({ done: 2, total: 4, percent: 50 });
  expect(s.nextId).toBe(5);
});

test("filterProjects by category", () => {
  expect(filterProjects(studio.projects, "all")).toHaveLength(
    studio.projects.length,
  );
  expect(
    filterProjects(studio.projects, "mobile").every(
      (p) => p.category === "mobile",
    ),
  ).toBe(true);
  expect(filterProjects(studio.projects, "none")).toEqual([]);
});

test("projectFit: how much of the project's needs the selection covers", () => {
  expect(projectFit(["ts", "react"], [])).toBeNull();
  expect(projectFit(["ts", "react"], ["ts"])).toBe(50);
  expect(projectFit(["ts"], ["ts", "go"])).toBe(100);
  expect(projectFit(["go", "rust", "ts"], ["python"])).toBe(0);
});

test("rankPeople sorts by score, then availability, and filters", () => {
  const ranked = rankPeople(PEOPLE, ["rust", "go"], false, "");
  expect(ranked[0].id).toBe("p6");
  const open = rankPeople(PEOPLE, [], true, "");
  expect(open.every((p) => p.availability !== "busy")).toBe(true);
  // with no selection, the free people come first, then by name
  expect(rankPeople(PEOPLE, [], false, "")[0].availability).toBe("open");
  expect(rankPeople(PEOPLE, [], false, "designer").map((p) => p.id)).toEqual([
    "p5",
  ]);
});

test("sentList joins invites and requests, skipping unknown ids", () => {
  const list = sentList(PEOPLE, PROJECTS, ["p1", "zz"], ["j2"]);
  expect(list.map((i) => i.key)).toEqual(["invite-p1", "request-j2"]);
});

test("derive keeps cards, chips and sent list in step", () => {
  const d = derive({
    selected: ["go"],
    onlyOpen: false,
    query: "",
    invitedIds: ["p2"],
    interestedIds: [],
  });
  expect(d.chips.find((c) => c.id === "go")?.on).toBe(true);
  expect(d.cards.find((c) => c.id === "p2")?.invited).toBe(true);
  expect(d.sent).toHaveLength(1);
});
