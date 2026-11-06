import { expect, test } from "vitest";
import {
  advanceStay,
  BOOKINGS,
  cleaningAfterCheckout,
  CLEANING,
  draftOf,
  firstFreeRoom,
  saveBooking,
  stepOf,
  validateBooking,
  views,
} from "../templates/hotel-admin-panel/hotel.ts";
import {
  act,
  CONTAINERS,
  nextState,
  reboot,
  resync,
  REPLICAS,
  SERVERS,
  uptimeLabel,
} from "../templates/server-infra-dashboard/infra.ts";
import {
  advanceInvoice,
  advanceProject,
  INVOICES,
  nextProject,
  PROJECTS,
  toggleMilestone,
  totals,
  viewOf,
} from "../templates/studio-crm-panel/crm.ts";
import {
  dayToIso,
  isoToDay,
  validateTask,
} from "../templates/studio-crm-panel/sheets.ts";
import {
  advanceOrder,
  alerts,
  cancelOrder,
  levelOf,
  nextStatus,
  orderTotal,
  ORDERS,
  PRODUCTS,
  restock,
  restockAll,
} from "../templates/store-management-panel/catalog.ts";
import {
  newProductDraft,
  validateProduct,
} from "../templates/store-management-panel/sheets.ts";

test("hotel: stays move forward and back, a checkout leaves a room to clean", () => {
  expect(stepOf("expected", "next")).toBe("in");
  expect(stepOf("in", "next")).toBe("out");
  expect(stepOf("out", "back")).toBe("in");
  expect(stepOf("in", "back")).toBe("expected");
  const moved = advanceStay(BOOKINGS, "b2", "next");
  expect(moved.find((x) => x.id === "b2")?.status).toBe("in");
  expect(BOOKINGS.find((x) => x.id === "b2")?.status).toBe("expected");
  const more = cleaningAfterCheckout(CLEANING, "102");
  expect(more).toHaveLength(CLEANING.length + 1);
  expect(more[more.length - 1]).toMatchObject({
    room: "102",
    kind: "checkout",
    done: false,
  });
  // an open checkout task for the room is not doubled
  expect(cleaningAfterCheckout(more, "102")).toBe(more);
});

test("hotel: the booking form is validated and saved", () => {
  const draft = draftOf(BOOKINGS[0]);
  expect(validateBooking(draft, BOOKINGS, "b1")).toEqual({});
  expect(
    validateBooking({ ...draft, guest: " " }, BOOKINGS, "b1").guest,
  ).toBeTruthy();
  expect(
    validateBooking({ ...draft, nights: "0" }, BOOKINGS, "b1").nights,
  ).toBeTruthy();
  expect(
    validateBooking({ ...draft, nights: "2.5" }, BOOKINGS, "b1").nights,
  ).toBeTruthy();
  // room 101 is taken from day 2 by b2
  expect(
    validateBooking({ ...draft, from: "2", nights: "2" }, BOOKINGS, "b1")
      .nights,
  ).toContain("taken");
  const created = saveBooking(
    BOOKINGS,
    { ...draft, guest: " Zed ", room: "205", from: "9", nights: "2" },
    "",
  );
  expect(created).toHaveLength(BOOKINGS.length + 1);
  expect(created[created.length - 1]).toMatchObject({
    id: "b29",
    guest: "Zed",
  });
  const edited = saveBooking(BOOKINGS, { ...draft, nights: "1" }, "b1");
  expect(edited).toHaveLength(BOOKINGS.length);
  expect(edited[0].nights).toBe(1);
  expect(firstFreeRoom(BOOKINGS, 2)).toBe("203");
  const v = views({
    bookings: BOOKINGS,
    cleaning: CLEANING,
    stayFilter: "in",
    stayQuery: "",
    cleanFilter: "todo",
  });
  expect(v.arrivals).toHaveLength(4);
  expect(v.departures).toHaveLength(2);
  expect(v.stayList.every((r) => r.status === "Checked in")).toBe(true);
  expect(v.cleanList).toHaveLength(6);
});

test("infra: containers change state, servers reboot, uptime is written", () => {
  expect(nextState("exited", "start")).toBe("running");
  expect(nextState("running", "start")).toBe("running");
  expect(nextState("running", "stop")).toBe("exited");
  expect(nextState("running", "restart")).toBe("restarting");
  expect(nextState("restarting", "restarted")).toBe("running");
  expect(nextState("exited", "restart")).toBe("exited");
  const stopped = act(CONTAINERS, "nginx", "stop");
  expect(stopped.find((c) => c.id === "nginx")).toMatchObject({
    state: "exited",
    cpu: 0,
  });
  expect(CONTAINERS.find((c) => c.id === "nginx")?.state).toBe("running");
  expect(act(CONTAINERS, "nginx", "start")).toEqual(CONTAINERS);
  const back = act(act(CONTAINERS, "redis", "restart"), "redis", "restarted");
  expect(back.find((c) => c.id === "redis")?.state).toBe("running");
  expect(uptimeLabel(990)).toBe("41d 6h");
  expect(uptimeLabel(5)).toBe("5h");
  expect(uptimeLabel(0)).toBe("down");
  const rebooted = reboot(SERVERS, "backup-1").find((s) => s.id === "backup-1");
  expect(rebooted).toMatchObject({ status: "online", cpu: 9 });
  expect(resync(REPLICAS, "db-3").find((r) => r.id === "db-3")?.lag).toBe(0.4);
  expect(resync(REPLICAS, "db-1").find((r) => r.id === "db-1")?.lag).toBe(0);
});

test("crm: invoices go overdue, get sent and paid; projects advance", () => {
  const sent = INVOICES.find((i) => i.id === "i2");
  expect(sent && viewOf(sent, 8)).toBe("overdue");
  expect(sent && viewOf(sent, 3)).toBe("sent");
  const draft = INVOICES.find((i) => i.id === "i5");
  expect(draft && viewOf(draft)).toBe("draft");
  const a = advanceInvoice(INVOICES, "i5");
  expect(a.find((i) => i.id === "i5")?.status).toBe("sent");
  const b = advanceInvoice(a, "i5");
  expect(b.find((i) => i.id === "i5")?.status).toBe("paid");
  expect(advanceInvoice(b, "i5")).toEqual(b);
  const t = totals(INVOICES);
  expect(t.all).toBe(t.draft + t.sent + t.overdue + t.paid);
  expect(t.open).toBe(t.draft + t.sent + t.overdue);
  expect(t.overdue).toBe(2400 + 3200);
  expect(nextProject(PROJECTS[2])).toMatchObject({
    status: "active",
    progress: 10,
  });
  expect(nextProject(PROJECTS[0])).toMatchObject({
    status: "review",
    progress: 90,
  });
  expect(nextProject({ ...PROJECTS[0], status: "review" })).toMatchObject({
    status: "done",
    progress: 100,
  });
  expect(
    advanceProject(PROJECTS, "p4").find((p) => p.id === "p4")?.status,
  ).toBe("done");
  const toggled = toggleMilestone(PROJECTS, "m2");
  expect(toggled[0].milestones[1].done).toBe(true);
  expect(PROJECTS[0].milestones[1].done).toBe(false);
});

test("crm: dates of the task form", () => {
  expect(isoToDay("2026-10-26")).toBe(0);
  expect(isoToDay("2026-11-03")).toBe(8);
  expect(Number.isNaN(isoToDay("soon"))).toBe(true);
  expect(dayToIso(8)).toBe("2026-11-03");
  expect(dayToIso(isoToDay("2027-01-05"))).toBe("2027-01-05");
  const d = { title: "", project: "p1", who: "AL", column: "todo", due: "" };
  expect(Object.keys(validateTask(d)).sort()).toEqual(["due", "title"]);
  expect(validateTask({ ...d, title: "x", due: "2026-11-10" })).toEqual({});
});

test("store: orders move through the flow and take stock out", () => {
  expect(nextStatus("new")).toBe("packed");
  expect(nextStatus("shipped")).toBe("delivered");
  expect(nextStatus("delivered")).toBe("delivered");
  expect(nextStatus("cancelled")).toBe("cancelled");
  const linen = PRODUCTS.find((x) => x.id === "p1")?.stock ?? 0;
  const moved = advanceOrder(ORDERS, PRODUCTS, "o1052");
  expect(moved.short).toEqual([]);
  expect(moved.orders.find((o) => o.id === "o1052")?.status).toBe("packed");
  expect(moved.products.find((x) => x.id === "p1")?.stock).toBe(linen - 2);
  // shipping does not touch the stock
  const shipped = advanceOrder(moved.orders, moved.products, "o1052");
  expect(shipped.products).toBe(moved.products);
  // a product that is out of stock stops the packing
  const blocked = advanceOrder(
    [
      {
        id: "x",
        number: "#1",
        customer: "A",
        placed: "",
        lines: [{ product: "p4", qty: 1 }],
        status: "new",
      },
    ],
    PRODUCTS,
    "x",
  );
  expect(blocked.short).toEqual([{ name: "Leather belt", short: 1 }]);
  expect(blocked.orders[0].status).toBe("new");
  expect(orderTotal(ORDERS[0], PRODUCTS)).toBe(2 * 48 + 28);
  expect(cancelOrder(ORDERS, "o1052")[0].status).toBe("cancelled");
  expect(
    cancelOrder(ORDERS, "o1049").find((o) => o.id === "o1049")?.status,
  ).toBe("packed");
});

test("store: stock levels, alerts and restocks; the product form", () => {
  expect(levelOf(PRODUCTS[3])).toBe("out");
  expect(levelOf(PRODUCTS[1])).toBe("low");
  expect(levelOf(PRODUCTS[0])).toBe("ok");
  expect(
    alerts(PRODUCTS)
      .map((x) => x.id)
      .sort(),
  ).toEqual(["p11", "p2", "p4", "p8"]);
  expect(restock(PRODUCTS, "p4").find((x) => x.id === "p4")?.stock).toBe(24);
  expect(alerts(restockAll(PRODUCTS))).toEqual([]);
  const d = newProductDraft();
  expect(Object.keys(validateProduct(d, PRODUCTS, "")).sort()).toEqual([
    "name",
    "price",
    "sku",
  ]);
  const ok = { ...d, name: "Cap", sku: "cp-1", price: "12" };
  expect(validateProduct(ok, PRODUCTS, "")).toEqual({});
  expect(
    validateProduct({ ...ok, sku: "ls-0042" }, PRODUCTS, "").sku,
  ).toBeTruthy();
  expect(validateProduct({ ...ok, sku: "ls-0042" }, PRODUCTS, "p1")).toEqual(
    {},
  );
  expect(
    validateProduct({ ...ok, stock: "-1" }, PRODUCTS, "").stock,
  ).toBeTruthy();
  expect(
    validateProduct({ ...ok, reorder: "1.5" }, PRODUCTS, "").reorder,
  ).toBeTruthy();
});
