import { expect, test } from "vitest";
import {
  addDeal,
  addNote,
  DEALS,
  emptyDraft,
  loseDeal,
  moveDeal,
  nextDealId,
  scores,
  setNextStep,
  totals,
  validateDeal,
  weightedByMonth,
  weightedByStage,
  winRate,
} from "../templates/sales-crm-pipeline/sales.ts";
import {
  applyReply,
  clockLabel,
  countdown,
  deskStats,
  historyOf,
  slaOf,
  ticketsShown,
  TICKETS,
  withArticle,
  workload,
} from "../templates/customer-support-desk/desk.ts";
import {
  addViewing,
  advanceListing,
  bestMatches,
  buyersFor,
  commissionTotals,
  commissions,
  emptyViewing,
  LEADS,
  listingsShown,
  matchScore,
  moveLead,
  PROPERTIES,
  validateViewing,
  VIEWINGS,
} from "../templates/real-estate-crm/estate.ts";
import {
  AUDIENCE,
  CAMPAIGNS,
  calendarEvents,
  campaignsShown,
  dayEntries,
  makeAudience,
  metricBars,
  rate,
  ratesOf,
  saveSegment,
  scheduleCampaign,
  spendPct,
  spendTone,
  toggleCampaign,
  totals as mktTotals,
  validateSchedule,
  validateSegmentName,
  DRAFT,
} from "../templates/marketing-campaign-manager/campaigns.ts";

test("sales: moving a deal logs it and changes the forecast", () => {
  const before = totals(DEALS);
  const moved = moveDeal(DEALS, "d2", "right");
  const d2 = moved.find((d) => d.id === "d2");
  expect(d2?.stage).toBe("qualified");
  expect(d2?.activity[0].title).toBe("Moved to Qualified");
  expect(totals(moved).weighted).toBeGreaterThan(before.weighted);
  // the ends do not move and log nothing
  const stuck = moveDeal(DEALS, "d2", "left").find((d) => d.id === "d2");
  expect(stuck?.activity).toHaveLength(2);
  const won = moveDeal(DEALS, "d3", "right").find((d) => d.id === "d3");
  expect(won?.stage).toBe("won");
  expect(won?.activity[0].kind).toBe("won");
});

test("sales: totals, win rate, lost deals and the numbers by stage and month", () => {
  const t = totals(DEALS);
  expect(t.openCount).toBe(13);
  expect(t.wonCount).toBe(5);
  expect(t.rate).toBe(83);
  expect(winRate([])).toBe(0);
  const lost = loseDeal(DEALS, "d1");
  expect(totals(lost).openCount).toBe(12);
  expect(lost.find((d) => d.id === "d1")?.activity[0].kind).toBe("lost");
  const stages = weightedByStage(DEALS);
  expect(stages.map((s) => s.id)).toEqual([
    "lead",
    "qualified",
    "proposal",
    "negotiation",
  ]);
  expect(stages.reduce((s, x) => s + x.value, 0)).toBe(t.weighted);
  const months = weightedByMonth(DEALS);
  expect(months.map((m) => m.id)).toEqual(["2026-11", "2026-12", "2027-01"]);
  expect(months.reduce((s, x) => s + x.value, 0)).toBe(t.weighted);
});

test("sales: notes, next steps and the leaderboard", () => {
  expect(addNote(DEALS, "d1", "   ")).toBe(DEALS);
  const noted = addNote(DEALS, "d1", " Called back ");
  expect(noted[0].activity[0]).toMatchObject({
    kind: "note",
    text: "Called back",
  });
  const same = setNextStep(DEALS, "d1", DEALS[0].next);
  expect(same[0].activity).toHaveLength(DEALS[0].activity.length);
  const changed = setNextStep(DEALS, "d1", "Ring them");
  expect(changed[0].next).toBe("Ring them");
  expect(changed[0].activity).toHaveLength(DEALS[0].activity.length + 1);
  const board = scores(DEALS);
  expect(board.find((b) => b.id === "DA")?.value).toBe(29500);
  expect(board.find((b) => b.id === "LF")?.value).toBe(24800);
});

test("sales: the new deal form is validated and adds a deal", () => {
  const empty = validateDeal(emptyDraft());
  expect(Object.keys(empty).sort()).toEqual(["amount", "company", "title"]);
  const draft = { ...emptyDraft(), title: "T", company: "C", amount: "1000" };
  expect(validateDeal(draft)).toEqual({});
  expect(validateDeal({ ...draft, close: "2026-01-01" }).close).toMatch(/past/);
  expect(validateDeal({ ...draft, close: "nope" }).close).toBeTruthy();
  expect(validateDeal({ ...draft, amount: "-5" }).amount).toBeTruthy();
  expect(nextDealId(DEALS)).toBe("d20");
  const next = addDeal(DEALS, draft);
  expect(next).toHaveLength(DEALS.length + 1);
  expect(next[next.length - 1]).toMatchObject({
    id: "d20",
    amount: 1000,
    stage: "lead",
  });
});

test("desk: the SLA clock counts down, turns red, then shows how late", () => {
  expect(countdown(65)).toBe("1:05");
  expect(countdown(3725)).toBe("1:02:05");
  expect(countdown(-4)).toBe("0:00");
  const t = TICKETS.find((x) => x.id === "T-1048")!; // 260 seconds left
  expect(slaOf(t, 0)).toMatchObject({
    text: "4:20",
    tone: "destructive",
    running: true,
  });
  expect(slaOf(t, 200).text).toBe("1:00");
  expect(slaOf(t, 300)).toMatchObject({
    text: "Late 0:40",
    tone: "destructive",
  });
  const calm = TICKETS.find((x) => x.id === "T-1044")!;
  expect(slaOf(calm, 0).tone).toBe("success");
  expect(slaOf(TICKETS.find((x) => x.id === "T-1050")!, 0).tone).toBe(
    "warning",
  );
  expect(slaOf(TICKETS.find((x) => x.id === "T-1047")!, 0).text).toBe(
    "Replied",
  );
  expect(slaOf(TICKETS.find((x) => x.id === "T-1043")!, 0).text).toBe("Solved");
});

test("desk: a reply stops the clock, a note does not, filters combine", () => {
  const answered = applyReply(
    TICKETS,
    "T-1049",
    { text: "Sure!", internal: false, status: "pending" },
    "Today, 10:06",
  );
  const t = answered.find((x) => x.id === "T-1049")!;
  expect(t.responded).toBe(true);
  expect(t.status).toBe("pending");
  expect(t.assignee).toBe("JW");
  expect(t.messages[t.messages.length - 1]).toMatchObject({
    side: "agent",
    when: "Today, 10:06",
  });
  const noted = applyReply(
    TICKETS,
    "T-1049",
    { text: "Look at billing", internal: true, status: "solved" },
    "x",
  );
  const n = noted.find((x) => x.id === "T-1049")!;
  expect(n.responded).toBe(false);
  expect(n.status).toBe("open");
  expect(n.messages[n.messages.length - 1].side).toBe("note");
  const f = { status: "open", priority: "urgent", assignee: "all", query: "" };
  expect(ticketsShown(TICKETS, f).map((x) => x.id)).toEqual([
    "T-1051",
    "T-1048",
  ]);
  expect(
    ticketsShown(TICKETS, { ...f, priority: "all", assignee: "none" }).every(
      (x) => x.assignee === "",
    ),
  ).toBe(true);
  expect(
    ticketsShown(TICKETS, {
      ...f,
      status: "all",
      priority: "all",
      query: "marquez",
    }),
  ).toHaveLength(2);
});

test("desk: stats, workload, history, clock and article text", () => {
  const s = deskStats(TICKETS, 0);
  expect(s.open + s.pending + s.solved).toBe(TICKETS.length);
  expect(s.late).toBe(0);
  expect(deskStats(TICKETS, 400).late).toBe(1);
  expect(s.atRisk).toBe(3); // T-1051 (9:00), T-1048 (4:20) and T-1050 (25:00)
  expect(workload(TICKETS).reduce((n, w) => n + w.count, 0)).toBe(
    TICKETS.filter((t) => t.assignee && t.status !== "solved").length,
  );
  expect(historyOf(TICKETS, "u1", "T-1051").map((a) => a.id)).toEqual([
    "T-1040",
  ]);
  expect(clockLabel(0)).toBe("Today, 10:05");
  expect(clockLabel(125)).toBe("Today, 10:07");
  const article = { id: "k", title: "T", snippet: "S", tag: "", keywords: "" };
  expect(withArticle("", article)).toBe("This article should help. T: S");
  expect(withArticle("Hi ", article)).toBe("Hi\n\nT: S");
});

test("estate: the match score adds budget, bedrooms, type and town", () => {
  const dana = LEADS[0];
  const garden = PROPERTIES[0];
  expect(matchScore(dana, garden)).toBe(100);
  // price slightly over the budget (within 10%), one bedroom fewer, same town
  const house = { ...garden, price: 860000, beds: 3, kind: "cottage" as const };
  expect(matchScore(dana, house)).toBe(25 + 10 + 0 + 20);
  // far over the budget, many more bedrooms
  const huge = { ...garden, price: 2000000, beds: 6 };
  expect(matchScore(dana, huge)).toBe(0 + 18 + 15 + 20);
});

test("estate: best matches skip sold and draft homes; buyers skip closed deals", () => {
  const best = bestMatches(LEADS[0], PROPERTIES, 3);
  expect(best[0].property.id).toBe("p1");
  expect(
    best.every(
      (m) => m.property.status === "active" || m.property.status === "pending",
    ),
  ).toBe(true);
  expect(best[0].score).toBeGreaterThanOrEqual(best[1].score);
  const buyers = buyersFor(PROPERTIES[0], LEADS, 9);
  expect(buyers.find((b) => b.lead.stage === "closed")).toBeUndefined();
  expect(buyers[0].lead.id).toBe("l1");
});

test("estate: listings, pipeline, commissions and viewings", () => {
  expect(listingsShown(PROPERTIES, "active", "")).toHaveLength(4);
  expect(listingsShown(PROPERTIES, "all", "riverside")).toHaveLength(3);
  expect(advanceListing(PROPERTIES, "p8")[7].status).toBe("active");
  expect(advanceListing(PROPERTIES, "p6")[5].status).toBe("sold");
  expect(moveLead(LEADS, "l4", "right")[3].stage).toBe("viewing");
  expect(moveLead(LEADS, "l4", "left")[3].stage).toBe("inquiry");
  expect(moveLead(LEADS, "l6", "right")[5].stage).toBe("closed");
  const coms = commissions(LEADS, PROPERTIES);
  expect(coms.map((c) => c.id)).toEqual(["l1", "l2", "l6", "l7"]);
  expect(coms[0].fee).toBe(Math.round(735000 * 0.03));
  expect(coms[0].share).toBe(Math.round(coms[0].fee * 0.6));
  expect(commissionTotals(coms).earned).toBe(Math.round(238000 * 0.03));
  const ok = emptyViewing("p1", "l1");
  expect(validateViewing(ok, VIEWINGS, PROPERTIES)).toEqual({});
  expect(
    validateViewing({ ...ok, time: "9am" }, VIEWINGS, PROPERTIES).time,
  ).toBeTruthy();
  expect(
    validateViewing({ ...ok, date: "2026-10-01" }, VIEWINGS, PROPERTIES).date,
  ).toMatch(/passed/);
  const taken = { ...ok, property: "p2", date: "2026-11-03", time: "15:00" };
  expect(validateViewing(taken, VIEWINGS, PROPERTIES).time).toMatch(/already/);
  const added = addViewing(VIEWINGS, ok, PROPERTIES, LEADS);
  expect(added).toHaveLength(VIEWINGS.length + 1);
  expect(added[added.length - 1].title).toBe("14 Alder Lane");
});

test("marketing: rates, spend meters and totals", () => {
  expect(rate(1, 3)).toBe(33.3);
  expect(rate(1, 0)).toBe(0);
  const first = CAMPAIGNS[0];
  expect(ratesOf(first)).toMatchObject({ open: 45, click: 10.8 });
  expect(ratesOf(CAMPAIGNS[5]).cpa).toBe(0);
  expect(spendPct(first)).toBe(90);
  expect(spendTone(90)).toBe("warning");
  expect(spendTone(100)).toBe("destructive");
  expect(spendTone(10)).toBe("success");
  expect(mktTotals(CAMPAIGNS).budget).toBe(
    CAMPAIGNS.reduce((s, c) => s + c.budget, 0),
  );
  expect(campaignsShown(CAMPAIGNS, "sms")).toHaveLength(1);
  expect(campaignsShown(CAMPAIGNS, "all")).toHaveLength(CAMPAIGNS.length);
});

test("marketing: pause, resume, unschedule and the charts' bars", () => {
  const paused = toggleCampaign(CAMPAIGNS, "c3");
  expect(paused[2].status).toBe("paused");
  expect(toggleCampaign(paused, "c3")[2].status).toBe("running");
  expect(toggleCampaign(CAMPAIGNS, "c6")[5].status).toBe("draft");
  expect(toggleCampaign(CAMPAIGNS, "c1")[0].status).toBe("done");
  expect(
    metricBars(CAMPAIGNS, "open").every((b) =>
      ["c1", "c2", "c10"].includes(b.id),
    ),
  ).toBe(true);
  expect(metricBars(CAMPAIGNS, "click").some((b) => b.id === "c6")).toBe(false);
});

test("marketing: the audience is the same every time; segments and sends are validated", () => {
  expect(makeAudience(80)).toEqual(AUDIENCE);
  expect(AUDIENCE).toHaveLength(80);
  expect(new Set(AUDIENCE.map((p) => p.plan)).size).toBe(3);
  expect(validateSegmentName(" ", [])).not.toBe("");
  expect(
    validateSegmentName("big", [{ id: "s1", name: "Big", count: 1 }]),
  ).toMatch(/exists/);
  expect(validateSegmentName("New", [])).toBe("");
  expect(saveSegment([{ id: "s1", name: "A", count: 1 }], " B ", 5)[1]).toEqual(
    { id: "s2", name: "B", count: 5 },
  );
  expect(validateSchedule({ date: "2026-11-10", time: "09:00" })).toEqual({});
  expect(validateSchedule({ date: "2026-11-01", time: "25:00" })).toEqual({
    date: "That day has passed.",
    time: "Use a time like 09:30.",
  });
});

test("marketing: scheduled sends reach the calendar", () => {
  const next = scheduleCampaign(
    CAMPAIGNS,
    DRAFT,
    "2026-11-12",
    "All subscribers",
  );
  expect(next).toHaveLength(CAMPAIGNS.length + 1);
  expect(next[next.length - 1]).toMatchObject({
    id: "c11",
    status: "scheduled",
    start: "2026-11-12",
  });
  expect(calendarEvents(next).some((e) => e.id === "c11")).toBe(true);
  expect(calendarEvents(CAMPAIGNS).some((e) => e.id === "c9")).toBe(false); // a draft has no day
  expect(dayEntries(next, "2026-11-12").map((e) => e.id)).toEqual([
    "c6",
    "c11",
  ]);
});
