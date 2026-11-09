// @vitest-environment jsdom
/**
 * The project page (`/app/projects/:slug`): the owner's controls and the
 * shared dialog of an application.
 *
 * The apply button opens the dialog (a child of the page) and the dialog
 * sends the application: the profession and the message travel in the body.
 */
import { createApp, paintOnWrite } from "@pavlus/frontend";
import { createHttpPlugin, createStorePlugin } from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import { describe, expect, test } from "vitest";
import { ProjectPage } from "../app/project/project.ts";
import { type ProjectSlice, initialState } from "../app/state.ts";

/** The requests the page sends (the backend is never asked in this test). */
let requests: { url: string; method: string; body?: unknown }[] = [];

/** The project page in a jsdom page. */
function mount(slice: Partial<ProjectSlice>): { state: () => ProjectSlice } {
  document.body.innerHTML = '<div id="app"></div>';
  requests = [];
  const store = createStorePlugin<ProjectSlice>({
    ...initialState.project,
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
    app: paintOnWrite(new ProjectPage()),
    plugins: [store, dom, http],
    mount: "#app",
  });
  return { state: () => store.getState() };
}

/** A click on `el` (it bubbles, like a real one). */
const click = (el: Element): void => {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
};

/** The slice with one open slot and the texts of the page. */
const withSlot = (): Partial<ProjectSlice> => ({
  slug: "orbit-labs",
  project: {
    id: 1,
    slug: "orbit-labs",
    name: "Orbit Labs",
    tagline: "A rust-flavoured tools studio",
    description: "",
    kind: "startup",
    kindLabel: "Startup",
    tags: [],
    status: "active",
    statusLabel: "Active",
    workMode: "remote",
    workModeLabel: "Remote",
    city: "",
    website: "",
    budget: null,
    budgetCurrency: null,
    budgetLabel: "",
    deadline: null,
    deadlineLabel: "",
    owner: "Anna Founder",
    ownerId: 1,
    ownerSlug: "anna",
    ownerProfession: null,
    ownerBucket: null,
    ownerRole: "",
    isOwner: false,
    isMember: false,
    teamChatId: null,
    openCount: 1,
    lookingLabel: "looking for people · 1",
    founderLabel: "Founder:",
    slots: [
      {
        id: 12,
        profession: "Backend developer",
        professionId: 1,
        professionSlug: "backend",
        bucket: "senior",
        description: "",
        pay: null,
        payFrom: null,
        payTo: null,
        currency: null,
        userId: null,
        userName: null,
        userSlug: null,
        status: "open",
        invitedByName: null,
        invitedBySlug: null,
        invitedMe: false,
        invitedByMe: false,
        myApplication: null,
        skills: [],
        label: "Backend developer · senior",
        payLabel: "",
        statusLabel: "Open",
        skillsLabel: [],
      },
    ],
  },
  strings: {
    apply: "Apply",
    applyTitle: "Apply: {name}",
    send: "Send the application",
    yourProfession: "Your profession",
  },
});

describe("the project page", () => {
  test("the apply button opens the dialog of an application", () => {
    mount(withSlot());
    const apply = document.querySelector('[data-testid="apply"]');
    expect(apply).toBeTruthy();
    click(apply!);
    const modal = document.querySelector('[data-testid="apply-modal"]');
    expect(modal).toBeTruthy();
    expect(
      document.querySelector('[data-testid="apply-title"]')?.textContent,
    ).toContain("Backend developer");
  });

  test("the dialog asks for the professions and sends the application", () => {
    mount(withSlot());
    click(document.querySelector('[data-testid="apply"]')!);
    // the dialog asks the backend for the professions of the member
    expect(requests.some((r) => r.url === "/api/apply/options")).toBe(true);
    // the member has no profession in this test: the button still sends
    click(document.querySelector('[data-testid="apply-send"]')!);
    const sent = requests.find((r) => r.url === "/api/slots/12/apply");
    expect(sent).toBeTruthy();
    expect(sent?.method).toBe("POST");
  });
});
