// @vitest-environment jsdom
import { expect, test } from "vitest";

/** The four special web tools, driven through the real DOM like a visitor. */
const text = (sel: string) => document.querySelector(sel)?.textContent ?? "";
const count = (sel: string) => document.querySelectorAll(sel).length;
const click = (sel: string, nth = 0) =>
  (document.querySelectorAll(sel)[nth] as HTMLElement).click();
const type = (sel: string, value: string) => {
  const el = document.querySelector(sel) as HTMLInputElement;
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

async function visit(path: string): Promise<void> {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  await new Promise((r) => setTimeout(r, 0));
}

test("the special tools respond to clicks", async () => {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  document.body.innerHTML = `<div id="app"></div>`;
  window.history.replaceState(null, "", "/templates/music-training-tool");
  await import("../main.ts");

  // music: a piano key lights up and names the note
  expect(count(".k-piano__white")).toBe(22);
  click(".k-piano__white", 0);
  expect(text(".mtt__big-name")).toBe("C");
  expect(
    document.querySelector(".k-piano__white")?.getAttribute("data-state"),
  ).toBe("active");
  // a fret: string 1 (thin e) fret 1 is F
  click(".k-neck__cell", 1);
  expect(text(".mtt__big-name")).toBe("F");
  expect(text(".mtt__display .ui-card-description")).toContain(
    "Guitar, string 1, fret 1",
  );
  // flats
  click("#mtt-flat");
  click(".k-piano__black", 0);
  expect(text(".mtt__big-name")).toBe("D♭");
  // the quiz: a wrong answer, then a skip
  click(".ui-tabs-trigger", 1);
  expect(text(".mtt__prompt")).toMatch(/^Find /);
  const asked = text(".mtt__prompt").replace("Find ", "");
  const keys = [...document.querySelectorAll(".k-piano__white")];
  // find a white key that is not the answer, and one that is (every octave has them)
  const wrong = keys.findIndex(
    (k) => !(k.getAttribute("aria-label") ?? "").startsWith(asked),
  );
  if (wrong >= 0) {
    (keys[wrong] as HTMLElement).click();
    expect(text(".mtt__verdict")).toContain("Try again");
  }
  click(".mtt__quiz .ui-button-outline");
  expect(text(".mtt__verdict")).toContain("marked");

  // booking: pick a service, a barber, a day, a time, validate and confirm
  await visit("/templates/service-booking-site");
  expect(count(".k-service")).toBe(6);
  click(".k-service", 2);
  expect(text(".sbs__summary")).toContain("Beard trim");
  click(".sbs__nav .ui-button-default");
  click(".k-worker", 0);
  click(".sbs__nav .ui-button-default");
  click(".ui-calendar-day:not(:disabled)", 1);
  expect(count(".k-slots__slot")).toBeGreaterThan(0);
  const free = document.querySelectorAll(".k-slots__slot:not(:disabled)");
  expect(free.length).toBeGreaterThan(0);
  (free[0] as HTMLElement).click();
  expect(text(".sbs__summary")).not.toContain("Not chosen yet\n");
  click(".sbs__nav .ui-button-default");
  click("button[type=submit]");
  expect(count(".ui-field-error")).toBeGreaterThan(0);
  type("#sbs-name", "Ann Lee");
  type("#sbs-phone", "+1 555 0142");
  type("#sbs-email", "ann@example.com");
  click("button[type=submit]");
  expect(text(".sbs__done")).toContain("You are booked in");
  expect(count(".sbs__item")).toBe(2);
  // cancel the new booking
  click(".sbs__item .ui-button-sm", 0);
  expect(count(".sbs__item.is-cancelled")).toBe(1);

  // quiz: start, answer, flag, submit, see the result and retake
  await visit("/templates/quiz-exam-platform");
  expect(count(".qep__card")).toBe(4);
  click(".qep__card .ui-button-default", 0);
  expect(text(".k-timer__clock")).toBe("05:00");
  click(".k-qopt", 1);
  click(".k-question__flag");
  expect(count(".k-qnav__item.is-flagged")).toBe(1);
  expect(count(".k-qnav__item.is-answered")).toBe(1);
  click(".qep__side .ui-button-default");
  expect(text(".ui-alert-title")).toContain("still open");
  click(".ui-alert .ui-button-default");
  expect(text(".qep__ring-inner strong")).toBe("14%");
  expect(count(".qep__review .k-question")).toBe(7);
  click("#qep-wrong");
  expect(count(".qep__review .k-question")).toBe(6);
  click(".qep__score .ui-button-default");
  expect(text(".k-timer__clock")).toBe("05:00");
  // leaving cancels the timer: nothing throws
  await visit("/templates/classifieds-board");

  // classifieds: search, filter, open, favorite, sell, edit, delete
  expect(count(".k-listing")).toBe(14);
  type('input[type="search"]', "road bike");
  expect(count(".k-listing")).toBe(1);
  type('input[type="search"]', "");
  click(".cb__chips .ui-button", 4); // Vehicles
  expect(count(".k-listing")).toBe(2);
  click(".cb__chips .ui-button", 0);
  click(".k-fav", 1); // heart of the 2nd card
  expect(text(".cb__nav .ui-badge")).toBe("3");
  click(".k-listing__title", 0);
  expect(text(".cb__detail-title")).not.toBe("");
  click(".cb__actions .ui-button-default");
  type("#cb-contact", "Is it still available?");
  click(".cb__contact button");
  expect(text(".cb__actions")).toContain("Message sent");
  click(".cb__nav .ui-button-default"); // Sell something
  click("form button[type=submit]");
  expect(count(".ui-field-error")).toBe(4);
  type("#cb-title", "Retro games console");
  type("#cb-price", "90");
  type("#cb-description", "Works great, two controllers included.");
  const select = document.querySelector("#cb-category") as HTMLSelectElement;
  select.value = "Electronics";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  click("form button[type=submit]");
  expect(text(".ui-alert-title")).toContain("is live");
  expect(count(".cb__mine-row")).toBe(3);
  click(".cb__mine-row .ui-button-ghost", 0);
  expect(count(".cb__mine-row")).toBe(2);
  // sign out, then the account pages are the auth block
  click(".cb__me .ui-button-outline");
  expect(count(".cb__account")).toBe(0);
  click(".cb__nav .ui-button-default");
  expect(count(".ui-card-title")).toBeGreaterThan(0);
  expect(text(".cb__signin")).toContain("Create an account");
}, 30_000);
