// @vitest-environment jsdom
/**
 * The cabinet (`/app/projects`) and the clicks that carry arguments.
 *
 * The template hands the arguments of a click to the handler as the payload:
 * one argument is the value itself, two are an array. The handlers read them
 * accordingly — a wrong reading makes every button of the app silent, so the
 * clicks below are the regression test of that contract.
 */
import { createApp, paintOnWrite } from "@pavlus/frontend";
import { createHttpPlugin, createStorePlugin } from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import { describe, expect, test } from "vitest";
import { type HubSlice, ProjectsHubPage } from "../app/projects-hub/hub.ts";
import { initialState } from "../app/state.ts";

/** The requests the page sends (the backend is never asked in this test). */
let requests: { url: string; method: string; body?: unknown }[] = [];

/** The cabinet in a jsdom page, with the given slice. */
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
    app: paintOnWrite(new ProjectsHubPage("activity")),
    plugins: [store, dom, http],
    mount: "#app",
  });
  return { state: () => store.getState() };
}

/** A click on `el` (it bubbles, like a real one). */
const click = (el: Element): void => {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
};

/** The slice of the cabinet with one invitation. */
const withInvite = (): Partial<HubSlice> => ({
  tab: "activity",
  invites: [
    {
      slotId: 7,
      projectSlug: "orbit-labs",
      projectName: "Orbit Labs",
      professionName: "Frontend developer",
      bucket: "middle",
      slotLabel: "Frontend developer · middle",
      invitedByName: "Anna Founder",
      invitedBySlug: "anna",
      invitedByLabel: "Invited by:",
    },
  ],
  strings: { accept: "Accept", decline: "Decline" },
});

describe("the cabinet", () => {
  test("the tab bar shows the three tabs and the badge of the invitations", () => {
    mount(withInvite());
    const tabs = document.querySelectorAll(".st__tab");
    expect(tabs.length).toBe(3);
    expect(
      document.querySelector('[data-testid="invites-badge"]')?.textContent,
    ).toBe("1");
  });

  test("the answer to an invitation goes to the backend", () => {
    mount(withInvite());
    const accept = document.querySelector(
      '[data-testid="activity-accept-invite"]',
    );
    expect(accept).toBeTruthy();
    click(accept!);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("/api/invites/7/accept");
    expect(requests[0].method).toBe("POST");
  });

  test("the refusal to an invitation goes to the backend too", () => {
    mount(withInvite());
    const decline = document.querySelector(
      '[data-testid="activity-decline-invite"]',
    );
    click(decline!);
    expect(requests[0].url).toBe("/api/invites/7/decline");
  });
});
