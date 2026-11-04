/**
 * The Pavlus debug panel UI (DevTools → "Pavlus").
 *
 * Speaks the agent protocol (`debug-panel/agent/pavlus-debug-agent.ts`)
 * over a port to the background worker:
 * - `hello` (panel → page) asks every agent for apps, state, history and a
 *   replay of what it recorded so far;
 * - `batch` events stream in: `step` (message + effects with `dur`),
 *   `state`, `history+` / `history-` (store timeline), `wait` (http round
 *   trip, correlated by effect uid);
 * - `undo` / `redo` / `restoreTo` (panel → page) drive the time travel.
 */

const AGENT = "__pavlus_agent__";
const PANEL = "__pavlus_panel__";
const MAX_ROWS = 3000;

let port = connect();

function connect() {
  const p = chrome.runtime.connect({
    name: "pavlus@" + chrome.devtools.inspectedWindow.tabId,
  });
  p.onMessage.addListener(onAgentMessage);
  // The background service worker suspends after ~30s of idle time, which
  // drops the port. Reconnect instead of requiring a devtools reload; the
  // next hello replays everything the agent has kept.
  p.onDisconnect.addListener(() => {
    $("#dot").className = "off";
    $("#status").textContent = "panel disconnected — reconnecting…";
    sawHello = false;
    setTimeout(() => {
      port = connect();
      sendHello();
    }, 1000);
  });
  return p;
}

const S = {
  apps: new Map(), // id -> {id, name, plugins, hasStore}
  steps: new Map(), // id -> [step event]
  states: new Map(), // id -> latest snapshot
  hist: new Map(), // id -> [timeline entry]
  redo: new Map(), // id -> redoable entries, chronological (null = count only)
  waits: new Map(), // effect uid -> http round trip ms
  filterApp: "all", // "all" | app id
  filterComp: null, // component path within the selected app (Apps tab)
  chip: "all", // "all" | plugin name
  msgFilter: "", // text filter on the Messages tab
  msgChip: "all", // "all" | sender plugin name | "page"
  fxFilter: "", // text filter on the Effects tab
  consoleView: "all", // console tab: all | messages | effects
  consoleChip: "all", // console tab plugin filter: "all" | plugin | "page"
  consoleFilter: "", // text filter on the console tab
  consoleSel: null, // row inspected on the console's right pane: {k:"msg",key} | {k:"fx",uid}
  selectedMsg: null, // message inspected on the right: `${appId}:${seq}`
  selectedFx: null, // effect inspected on the effects tab: uid
  split: {
    console: 0.6,
    messages: 0.55,
    effects: 0.55,
    store: 0.5,
    travel: 0.45,
    apps: 0.6,
  }, // left pane width
  tlFrac: 0.38, // store preview height, fraction of the timeline column
  details: new Set(), // effect rows with the detail JSON open: uid
  tlShow: null, // change previewed under the timeline: {appId, idx, entry, redo}
  travelSel: null, // change selected in the Time travel tab: {appId, idx, entry, redo}
  appsView: "info", // apps detail pane view: info | io | messages | effects | timeline
  tags: new Map(), // app id -> { component path -> display tag }
  io: new Map(), // app id -> Map<path, {input: Map, output: Map}>
  viewerOpen: new Set(), // viewer branches forced open: `${key}@${path}`
  viewerShut: new Set(), // viewer branches forced shut (overriding auto-open)
};

/* ------------------------------------------------------------------ utils */

const $ = (sel) => document.querySelector(sel);

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function fmtTime(t) {
  const d = new Date(t);
  return (
    d.toLocaleTimeString([], { hour12: false }) +
    "." +
    String(d.getMilliseconds()).padStart(3, "0")
  );
}

function shortJson(v, max = 80) {
  try {
    const s = JSON.stringify(v) ?? "undefined";
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  } catch {
    return "(unserializable)";
  }
}

const appIds = () =>
  S.filterApp === "all" ? [...S.apps.keys()] : [S.filterApp];

// console-style text filter: case-insensitive substring over any field
const matchesFilter = (q, ...fields) =>
  !q ||
  fields.some((f) =>
    String(f ?? "")
      .toLowerCase()
      .includes(q),
  );

// the 🚫 button on Messages / Effects: drop the recorded steps (and the io
// counts and http waits derived from them). Store history survives — the
// timeline is time travel, not a log; the next page hello replays anyway.
function clearRecording() {
  S.steps.clear();
  S.io.clear();
  S.waits.clear();
  S.selectedMsg = null;
  S.selectedFx = null;
  S.consoleSel = null;
  S.details.clear();
  refresh();
}

// console-style filter controls, created once so typing into the input
// survives the row re-renders
function filterInput(stateKey, rerender) {
  const input = el("input", "filter-input");
  input.type = "text";
  input.placeholder = "Filter";
  input.spellcheck = false;
  input.value = S[stateKey];
  input.addEventListener("input", () => {
    S[stateKey] = input.value.trim().toLowerCase();
    rerender();
  });
  return input;
}

// the white circle-slash "clear logs" button
function clearButton() {
  const b = el("button", "filter-clear");
  b.title = "clear the recorded messages and effects";
  b.innerHTML =
    '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">' +
    '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
    '<line x1="3.8" y1="3.8" x2="12.2" y2="12.2" stroke="currentColor" stroke-width="1.5"/></svg>';
  b.addEventListener("click", clearRecording);
  return b;
}

// a small icon-only toolbar button (viewer tools, …)
function iconButton(title, svg, click) {
  const b = el("button", "icon-btn");
  b.title = title;
  b.innerHTML = svg;
  b.addEventListener("click", click);
  return b;
}

// chips over the message senders seen in the recording: "all" + every
// plugin that dispatched a message, with `page` for steps whose from is
// unknown (page events / console / SSR / a recording from an older agent)
function senderChips(rerender) {
  const senders = new Set();
  for (const id of appIds())
    for (const s of stepsOf(id)) senders.add(s.from ?? "page");
  const bar = el("div", "chips-list");
  for (const chip of ["all", ...[...senders].sort()]) {
    const b = el(
      "button",
      "chip" + (S.msgChip === chip ? " active" : ""),
      chip,
    );
    b.addEventListener("click", () => {
      S.msgChip = chip;
      rerender();
    });
    bar.append(b);
  }
  return bar;
}

const stepsOf = (id) => S.steps.get(id) ?? [];

// one component's io bucket, created on demand (steps can arrive pre-hello)
function ioBucket(appId, path) {
  let per = S.io.get(appId);
  if (!per) {
    per = new Map();
    S.io.set(appId, per);
  }
  let b = per.get(path);
  if (!b) {
    b = { input: new Map(), output: new Map() };
    per.set(path, b);
  }
  return b;
}

function send(cmd, appId, extra = {}) {
  port.postMessage({ source: PANEL, cmd, appId, ...extra });
}

// one step through the store timeline — the ⟵/⟶ buttons and the ←/→ keys
// share these; the agent answers with history∓ + state, which re-renders
function stepBack(id) {
  const hist = S.hist.get(id) ?? [];
  if (!hist.length) return;
  S.redo.set(id, [hist.at(-1) ?? null, ...(S.redo.get(id) ?? [])]);
  send("undo", id);
}

function stepFwd(id) {
  if (!(S.redo.get(id) ?? []).length) return;
  send("redo", id);
}

// travel to position i over hist + ghosts: undo the steps after it (they
// become redoable ghosts) or redo up to it. history± events keep the
// panel's ghost list in sync with the agent.
function jumpTo(id, i) {
  const hist = S.hist.get(id) ?? [];
  const ghosts = S.redo.get(id) ?? [];
  const act = hist.length - 1;
  if (i === act) return;
  if (i < act) {
    const steps = act - i;
    S.redo.set(id, [...hist.slice(hist.length - steps), ...ghosts]);
    send("undo", id, { steps });
  } else {
    for (let n = i - act; n > 0; n--) send("redo", id);
  }
}

/* --------------------------------------------------------------- protocol */

let sawHello = false;

function sendHello() {
  port.postMessage({ source: PANEL, cmd: "hello" });
}

function applyHello(h) {
  sawHello = true;
  // The hello is authoritative: drop the previous page's recording (kept on
  // screen across navigations) before replaying. Viewer expansion survives —
  // its keys are DOM paths, stable across loads.
  S.apps.clear();
  S.steps.clear();
  S.states.clear();
  S.hist.clear();
  S.redo.clear();
  S.waits.clear();
  S.selectedMsg = null;
  S.selectedFx = null;
  S.consoleSel = null;
  S.tlShow = null;
  S.details.clear();
  S.filterComp = null;
  S.tags.clear();
  S.io.clear();
  for (const app of h.apps ?? []) {
    S.apps.set(app.id, app);
    S.steps.set(app.id, []);
    S.hist.set(app.id, []);
    S.redo.set(app.id, Array(h.redo?.[app.id] ?? 0).fill(null));
    if (app.id in (h.state ?? {})) S.states.set(app.id, h.state[app.id]);
    if (app.id in (h.history ?? {})) S.hist.set(app.id, [...h.history[app.id]]);
    S.tags.set(app.id, app.tags ?? {});
    for (const [path, io] of Object.entries(h.io?.[app.id] ?? {})) {
      const b = ioBucket(app.id, path);
      for (const v of io.input ?? []) b.input.set(v.id, { n: v.n, at: v.at });
      for (const v of io.output ?? [])
        b.output.set(v.id, { n: v.n, at: v.at, summary: v.summary });
    }
  }
  for (const e of h.replay ?? []) applyEvent(e);
  refresh();
}

// live-merge a step's component trace into the io maps: every component on
// the receive chain counts the message as input; outputs land on the deepest
// one (the boundary whose subtree produced them) — the next hello re-syncs
// the exact per-boundary split the agent tracks
function mergeIo(appId, comps, e) {
  const list = comps?.length ? comps : [""];
  for (const p of list) {
    const b = ioBucket(appId, p);
    const cur = b.input.get(e.message.id);
    if (cur) {
      cur.n++;
      cur.at = e.time;
    } else b.input.set(e.message.id, { n: 1, at: e.time });
  }
  const b = ioBucket(appId, list[list.length - 1]);
  for (const fx of e.effects ?? []) {
    const key = `${fx.plugin}:${fx.type}`;
    const cur = b.output.get(key);
    if (cur) {
      cur.n++;
      cur.at = fx.time;
      if (fx.summary !== undefined) cur.summary = fx.summary;
    } else b.output.set(key, { n: 1, at: fx.time, summary: fx.summary });
  }
}

function applyEvent(e) {
  switch (e.type) {
    case "step": {
      const list = S.steps.get(e.appId) ?? [];
      list.push(e);
      if (list.length > MAX_ROWS) list.shift();
      S.steps.set(e.appId, list);
      mergeIo(e.appId, e.comps, e);
      break;
    }
    case "state":
      S.states.set(
        e.appId,
        e.truncated ? { "(state)": "too big to display" } : e.state,
      );
      break;
    case "history+": {
      const list = S.hist.get(e.appId) ?? [];
      list.push(...e.entries);
      S.hist.set(e.appId, list);
      // An app-made change invalidates the redo stack; a panel-made redo
      // consumes the ghost entries it predicted.
      const ghosts = S.redo.get(e.appId) ?? [];
      if (e.entries.some((x) => x.msgId !== null)) S.redo.set(e.appId, []);
      else ghosts.splice(0, e.entries.length);
      break;
    }
    case "history-": {
      const list = S.hist.get(e.appId) ?? [];
      list.length = Math.min(list.length, e.length);
      break;
    }
    case "wait":
      S.waits.set(e.uid, e.ms);
      break;
  }
}

function onAgentMessage(payload) {
  if (!payload || payload.source !== AGENT) return;
  if (payload.type === "hello") applyHello(payload);
  else if (Array.isArray(payload.batch)) {
    for (const e of payload.batch) applyEvent(e);
    refresh();
  }
}

// Poll until an agent answers; after that, hellos are only sent on demand
// (rescan button, page navigation). 500 ms so a reloaded document (an SSR
// app reloads on every route change) is picked up within a blink.
setInterval(() => {
  if (!sawHello) sendHello();
}, 500);

// ←/→ step through the store timeline while the Store or Time travel tab
// is open (same code path as the ⟵ back / forward ⟶ buttons)
document.addEventListener("keydown", (ev) => {
  if (active !== "store" && active !== "travel") return;
  if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
  if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
  const t = ev.target;
  if (
    t &&
    (t.tagName === "INPUT" ||
      t.tagName === "TEXTAREA" ||
      t.tagName === "SELECT" ||
      t.isContentEditable)
  )
    return;
  const id = storeAppId();
  if (!id) return;
  if (ev.key === "ArrowLeft") stepBack(id);
  else stepFwd(id);
  ev.preventDefault();
});

chrome.devtools.network.onNavigated.addListener(() => {
  // The document reloaded, which dropped the page-side agent. Don't blank
  // the panel: keep the previous recording on screen (amber status) until
  // the new page's hello replaces it wholesale in applyHello.
  sawHello = false;
  sendHello();
  refresh();
});

$("#rescan").addEventListener("click", () => {
  sawHello = false;
  sendHello();
});

/* ------------------------------------------------------------------- tabs */

let active = "console";

// switch tabs programmatically (the nav buttons and deep links from the
// Apps tab's data views both go through here)
function showTab(name) {
  active = name;
  for (const x of document.querySelectorAll("#tabs button"))
    x.classList.toggle("active", x.dataset.tab === name);
  for (const x of document.querySelectorAll(".tab"))
    x.classList.toggle("active", x.id === "tab-" + name);
  refresh();
}

for (const b of document.querySelectorAll("#tabs button"))
  b.addEventListener("click", () => showTab(b.dataset.tab));

/* -------------------------------------------------------- split resizing */

// The two-pane tabs are split by draggable dividers; the fractions live in
// S.split / S.tlFrac and are re-applied on every render.

function clampFrac(f, lo, hi) {
  return Math.min(hi, Math.max(lo, f));
}

function applyFlex(pane, frac) {
  pane.style.flex = `0 0 ${(frac * 100).toFixed(2)}%`;
}

// The divider drags with the mouse until mouseup; `set` gets every move.
function dragDivider(bar, set) {
  bar.addEventListener("mousedown", (e) => {
    e.preventDefault();
    document.body.style.userSelect = "none";
    const move = (ev) => set(ev);
    const up = () => {
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  });
}

const messagesRows = el("div", "rows");
const msgDetail = el("div", "detail-pane");
msgDetail.id = "msg-detail";
const msgBar = el("div", "divider-v");
const messagesCols = el("div", "");
messagesCols.id = "messages-cols";
// the messages toolbar is one row: clear, sender chips, then the filter
const msgToolbar = el("div", "toolbar");
msgToolbar.id = "msg-chips";
const msgChips = el("div", "chips-list");
msgToolbar.append(
  clearButton(),
  msgChips,
  filterInput("msgFilter", renderMessages),
);
messagesCols.append(messagesRows, msgBar, msgDetail);
$("#tab-messages").append(msgToolbar, messagesCols);
applyFlex(messagesRows, S.split.messages);
dragDivider(msgBar, (ev) => {
  const r = messagesCols.getBoundingClientRect();
  S.split.messages = clampFrac((ev.clientX - r.left) / r.width, 0.15, 0.85);
  applyFlex(messagesRows, S.split.messages);
});

const effectRows = el("div", "rows");
const effectDetail = el("div", "detail-pane");
effectDetail.id = "effect-detail";
const fxBar = el("div", "divider-v");
const effectsCols = el("div", "");
effectsCols.id = "effects-cols";
// the effects toolbar is one row: clear, the plugin chips, then the filter
const fxChips = el("div", "chips-list");
$("#chips").append(
  clearButton(),
  fxChips,
  filterInput("fxFilter", renderEffects),
);
effectsCols.append(effectRows, fxBar, effectDetail);
$("#tab-effects").append(effectsCols);
applyFlex(effectRows, S.split.effects);
dragDivider(fxBar, (ev) => {
  const r = effectsCols.getBoundingClientRect();
  S.split.effects = clampFrac((ev.clientX - r.left) / r.width, 0.15, 0.85);
  applyFlex(effectRows, S.split.effects);
});

/* --------------------------------------------------------------- console */

const consoleRows = el("div", "rows");
consoleRows.id = "console-rows";
const consoleViewChips = el("div", "chips-list");
const consolePluginChips = el("div", "chips-list");
const consoleBar = el("div", "");
consoleBar.id = "console-bar";
consoleBar.append(
  clearButton(),
  consoleViewChips,
  consolePluginChips,
  filterInput("consoleFilter", renderConsole),
);
const consoleDetail = el("div", "detail-pane");
consoleDetail.id = "console-detail";
const consoleDiv = el("div", "divider-v");
const consoleCols = el("div", "");
consoleCols.id = "console-cols";
consoleCols.append(consoleRows, consoleDiv, consoleDetail);
$("#tab-console").append(consoleBar, consoleCols);
applyFlex(consoleRows, S.split.console);
dragDivider(consoleDiv, (ev) => {
  const r = consoleCols.getBoundingClientRect();
  S.split.console = clampFrac((ev.clientX - r.left) / r.width, 0.15, 0.85);
  applyFlex(consoleRows, S.split.console);
});

// one chip button; `active` lights the current one
function chipBtn(label, on, click) {
  const b = el("button", "chip" + (on ? " active" : ""), label);
  b.addEventListener("click", click);
  return b;
}

function renderConsole() {
  // toolbar: clear | all / messages / effects | plugin chips (right)
  consoleViewChips.replaceChildren(
    ...["all", "messages", "effects"].map((v) =>
      chipBtn(v, S.consoleView === v, () => {
        S.consoleView = v;
        renderConsole();
      }),
    ),
  );
  const names = new Set();
  for (const id of appIds()) {
    for (const p of S.apps.get(id)?.plugins ?? []) names.add(p);
    for (const s of stepsOf(id)) {
      names.add(s.from ?? "page");
      for (const e of s.effects) names.add(e.plugin);
    }
  }
  consolePluginChips.replaceChildren(
    ...["all", ...[...names].sort()].map((c) =>
      chipBtn(c, S.consoleChip === c, () => {
        S.consoleChip = c;
        renderConsole();
      }),
    ),
  );

  // stick to the bottom while live rows stream in, unless scrolled up
  const pinned =
    consoleRows.scrollHeight -
      consoleRows.scrollTop -
      consoleRows.clientHeight <
    40;
  consoleRows.replaceChildren();

  const items = [];
  const q = S.consoleFilter;
  for (const appId of appIds())
    for (const s of stepsOf(appId)) {
      const wantMsg =
        S.consoleView !== "effects" &&
        (S.consoleChip === "all" ||
          (s.from ?? "page") === S.consoleChip ||
          s.effects.some((e) => e.plugin === S.consoleChip)) &&
        matchesFilter(
          q,
          s.message.id,
          s.message.payload ?? s.message.event,
          s.from,
        );
      if (wantMsg) items.push({ k: "msg", t: s.time, s, appId });
      if (S.consoleView === "messages") continue;
      for (const e of s.effects)
        if (
          (S.consoleChip === "all" || e.plugin === S.consoleChip) &&
          matchesFilter(q, `${e.plugin}:${e.type}`, e.summary, e.detail)
        )
          items.push({ k: "fx", t: e.time, s, appId, e });
    }
  items.sort(
    (a, b) => a.t - b.t || a.s.seq - b.s.seq || (a.k === "msg" ? -1 : 1),
  );

  if (!items.length) {
    consoleRows.append(
      el(
        "div",
        "empty-tab",
        appIds().some((id) => stepsOf(id).length)
          ? "nothing matches the filters"
          : "nothing recorded yet — dispatch a message in the app",
      ),
    );
    renderConsoleDetail();
    return;
  }
  for (const it of items.slice(-MAX_ROWS)) {
    const { s, appId } = it;
    if (it.k === "msg") {
      const key = `${appId}:${s.seq}`;
      const row = el(
        "div",
        "row c-msg" +
          (S.consoleSel?.k === "msg" && S.consoleSel.key === key ? " sel" : ""),
      );
      row.append(
        el("span", "t", fmtTime(s.time)),
        el("span", "k msg", "»"),
        el("span", "id", s.message.id),
        el("span", "sum", shortJson(s.message.payload ?? s.message.event)),
      );
      if (s.from) row.append(el("span", "app", `← ${s.from}`));
      if (S.filterApp === "all") row.append(el("span", "num", appId));
      row.title = "click to inspect the message and its effects on the right";
      row.addEventListener("click", () => {
        S.consoleSel =
          S.consoleSel?.k === "msg" && S.consoleSel.key === key
            ? null
            : { k: "msg", key };
        renderConsole();
      });
      consoleRows.append(row);
    } else {
      const e = it.e;
      const row = el(
        "div",
        "row c-fx" +
          (S.consoleSel?.k === "fx" && S.consoleSel.uid === e.uid
            ? " sel"
            : ""),
      );
      row.append(
        el("span", "t", fmtTime(e.time)),
        el("span", "plug", `${e.plugin}:${e.type}`),
        el("span", "sum", e.summary),
      );
      if (e.dur !== undefined) row.append(el("span", "num dur", `${e.dur}ms`));
      const wait = S.waits.get(e.uid);
      if (wait !== undefined) row.append(el("span", "num wait", `⧗${wait}ms`));
      row.title = `message "${s.message.id}" — click to inspect on the right`;
      row.addEventListener("click", () => {
        S.consoleSel =
          S.consoleSel?.k === "fx" && S.consoleSel.uid === e.uid
            ? null
            : { k: "fx", uid: e.uid };
        renderConsole();
      });
      consoleRows.append(row);
    }
  }
  if (pinned) consoleRows.scrollTop = consoleRows.scrollHeight;
  renderConsoleDetail();
}

// the console's right pane reuses the Messages / Effects detail renderers
function renderConsoleDetail() {
  if (!S.consoleSel)
    consoleDetail.replaceChildren(
      el("div", "empty-tab", "click a row on the left to inspect it here"),
    );
  else if (S.consoleSel.k === "msg")
    renderMsgDetail(consoleDetail, S.consoleSel.key);
  else renderEffectDetail(consoleDetail, S.consoleSel.uid);
}

const appsTree = el("div", "rows");
appsTree.id = "apps-tree";
const appsDetail = el("div", "detail-pane");
appsDetail.id = "apps-detail";
const appsBar = el("div", "divider-v");
const appsCols = el("div", "");
appsCols.id = "apps-cols";
$("#tab-apps").append(appsCols);
appsCols.append(appsTree, appsBar, appsDetail);
applyFlex(appsTree, S.split.apps);
dragDivider(appsBar, (ev) => {
  const r = appsCols.getBoundingClientRect();
  S.split.apps = clampFrac((ev.clientX - r.left) / r.width, 0.15, 0.85);
  applyFlex(appsTree, S.split.apps);
});

let refreshQueued = false;
function refresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => {
    refreshQueued = false;
    renderStatus();
    // renderers rebuild the DOM wholesale; carry the scroll offsets over so
    // a live update doesn't yank the pane back to the top
    const view = $("#tab-" + active);
    const kept = keepScroll(view);
    if (active === "console") renderConsole();
    else if (active === "messages") renderMessages();
    else if (active === "effects") renderEffects();
    else if (active === "store") renderStore();
    else if (active === "travel") renderTravel();
    else renderApps();
    setScroll(view, kept);
  });
}

// Scrollable descendants in document order → [top, left]; the rebuilt DOM
// has the same structure, so order is the identity (position-based scroll
// restoration also survives long lists without per-node keys). The stepper
// is left out: renderStore re-centers it on the active dot every render.
function scrollables(tab) {
  return [...tab.querySelectorAll("*")].filter(
    (n) =>
      n.id !== "stepper" &&
      // the console pins itself to the bottom instead
      n.id !== "console-rows" &&
      (n.scrollHeight > n.clientHeight || n.scrollWidth > n.clientWidth),
  );
}

function keepScroll(tab) {
  return scrollables(tab).map((n) => [n.scrollTop, n.scrollLeft]);
}

function setScroll(tab, kept) {
  const nodes = scrollables(tab);
  for (let i = 0; i < Math.min(nodes.length, kept.length); i++) {
    nodes[i].scrollTop = kept[i][0];
    nodes[i].scrollLeft = kept[i][1];
  }
}

function renderStatus() {
  const apps = [...S.apps.values()];
  const dot = $("#dot");
  dot.className = sawHello
    ? apps.length
      ? "on"
      : "wait"
    : apps.length
      ? "wait"
      : "off";
  $("#status").textContent =
    !sawHello && apps.length
      ? "page changed — waiting for the pavlus agent…"
      : apps.length
        ? apps.map((a) => a.name).join(", ") +
          ` — ${[...S.steps.values()].reduce((n, l) => n + l.length, 0)} messages`
        : sawHello
          ? "no pavlus agent answered (wire one up, then rescan)"
          : "no pavlus agent on this page yet…";
}

/* ----------------------------------------------------------- json viewer */

// A tiny expand/collapse tree for state, payloads, effect objects and change
// values. The first two levels start open; every branch remembers whether it
// was toggled (S.viewerOpen / S.viewerShut, keyed per viewer) across the
// re-renders that stream in with every event.

const kindOf = (v) =>
  v === null
    ? "null"
    : Array.isArray(v)
      ? "array"
      : v instanceof Map
        ? "map"
        : v instanceof Set
          ? "set"
          : v instanceof Date
            ? "date"
            : typeof v;

const valClass = (v) => {
  const k = kindOf(v);
  if (k === "string" || k === "date") return "str";
  if (k === "number") return "num";
  if (k === "boolean") return "bool";
  if (k === "null" || k === "undefined") return "none";
  if (k === "function") return "fn";
  return "obj";
};

const vEntries = (v) =>
  Array.isArray(v) || v instanceof Set
    ? [...v].map((x, i) => [String(i), x])
    : v instanceof Map
      ? [...v].map(([k, x]) => [String(k), x])
      : Object.entries(v);

const vPreview = (v) => {
  const k = kindOf(v);
  if (k === "array") return `[…] ${v.length}`;
  if (k === "object") return `{…} ${Object.keys(v).length}`;
  if (k === "map") return `Map(${v.size})`;
  if (k === "set") return `Set(${v.size})`;
  if (k === "string") return JSON.stringify(v);
  if (k === "date") return v.toISOString();
  if (k === "function") return v.name ? `ƒ ${v.name}()` : "ƒ ()";
  return String(v);
};

// full JSON of a viewer value, with the exotic kinds made printable
const jsonOf = (v) =>
  JSON.stringify(
    v,
    (k, x) => {
      if (x instanceof Map) return Object.fromEntries(x);
      if (x instanceof Set) return [...x];
      if (x instanceof Date) return x.toISOString();
      if (typeof x === "function")
        return x.name ? `[Function ${x.name}]` : "[Function]";
      return x;
    },
    2,
  ) ?? "undefined";

function copyText(text) {
  if (navigator.clipboard?.writeText)
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  else fallbackCopy(text);
}

function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.append(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } catch {
    /* clipboard unavailable */
  }
  ta.remove();
}

function viewer(key, value) {
  const wrap = el("div", "v-wrap");
  const root = el("div", "viewer");
  root.append(vRow(null, value, "", key, 0, new Set()));
  // the branch rows of the built tree (children appear lazily as branches
  // open, which is why expanding keeps clicking until a pass finds nothing)
  const branchRows = () => [...root.querySelectorAll(".v-branch > .v-row.tog")];
  const tools = el("div", "v-tools");
  const flash = (b) => {
    b.classList.add("copied");
    setTimeout(() => b.classList.remove("copied"), 700);
  };
  tools.append(
    iconButton(
      "expand all branches",
      '<svg viewBox="0 0 16 16" width="11" height="11"><path d="M3 3l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 9l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
      () => {
        for (let pass = 0; pass < 1000; pass++) {
          const closed = branchRows().filter(
            (r) => r.nextElementSibling.style.display === "none",
          );
          if (!closed.length) break;
          for (const r of closed) r.click();
        }
      },
    ),
    iconButton(
      "collapse all branches",
      '<svg viewBox="0 0 16 16" width="11" height="11"><path d="M3 6l5-5 5 5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 12l5-5 5 5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
      () => {
        const rows = branchRows(); // rows[0] is the root — keep it open
        for (let i = 1; i < rows.length; i++)
          if (rows[i].nextElementSibling.style.display !== "none")
            rows[i].click();
      },
    ),
    (() => {
      const b = iconButton(
        "copy as JSON",
        '<svg viewBox="0 0 16 16" width="11" height="11"><rect x="5" y="5" width="9" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
        () => {
          copyText(jsonOf(value));
          flash(b);
        },
      );
      return b;
    })(),
  );
  wrap.append(tools, root);
  return wrap;
}

function vRow(key, v, path, vkey, depth, seen) {
  const row = el("div", "v-row");
  if (v !== null && typeof v === "object" && seen.has(v)) {
    if (key !== null)
      row.append(el("span", "v-key", key), el("span", "v-punc", ": "));
    row.append(el("span", "v-none", "⟲ circular"));
    return row;
  }
  const kind = kindOf(v);
  const branch =
    kind === "object" || kind === "array" || kind === "map" || kind === "set";
  if (key !== null)
    row.append(el("span", "v-key", key), el("span", "v-punc", ": "));
  if (!branch) {
    const preview = vPreview(v);
    row.append(el("span", "v-" + valClass(v), preview));
    // the row clips with an ellipsis — the full value goes to the tooltip
    row.title = preview;
    return row;
  }
  const entries = vEntries(v);
  const brace =
    kind === "array"
      ? "[…]"
      : kind === "map"
        ? "Map(…)"
        : kind === "set"
          ? "Set(…)"
          : "{…}";
  if (!entries.length) {
    row.append(
      el(
        "span",
        "v-brace",
        kind === "array"
          ? "[]"
          : kind === "map"
            ? "Map(0)"
            : kind === "set"
              ? "Set(0)"
              : "{}",
      ),
    );
    return row;
  }
  const pk = `${vkey}@${path}`;
  let open = S.viewerOpen.has(pk) || (depth < 2 && !S.viewerShut.has(pk));
  const arrow = el("span", "v-arrow", open ? "▾" : "▸");
  row.append(arrow, el("span", "v-brace", brace));
  if (kind === "array" || kind === "object")
    row.append(el("span", "v-count", String(entries.length)));
  const kids = el("div", "v-kids");
  let built = false;
  const build = () => {
    if (built) return;
    built = true;
    const next = new Set(seen);
    next.add(v);
    for (const [k, v2] of entries)
      kids.append(
        vRow(k, v2, path ? `${path}.${k}` : k, vkey, depth + 1, next),
      );
  };
  row.classList.add("tog");
  row.addEventListener("click", () => {
    open = !open;
    if (open) {
      S.viewerShut.delete(pk);
      S.viewerOpen.add(pk);
      arrow.textContent = "▾";
      build();
      kids.style.display = "";
    } else {
      S.viewerOpen.delete(pk);
      S.viewerShut.add(pk);
      arrow.textContent = "▸";
      kids.style.display = "none";
    }
  });
  if (open) build();
  else kids.style.display = "none";
  const wrap = el("div", "v-branch");
  wrap.append(row, kids);
  return wrap;
}

/* -------------------------------------------------------------- messages */

function renderMessages() {
  msgChips.replaceChildren(...senderChips(renderMessages).childNodes);
  messagesRows.replaceChildren();
  const all = appIds().flatMap((id) => stepsOf(id).map((s) => [s, id]));
  all.sort((a, b) => a[0].time - b[0].time || a[0].seq - b[0].seq);
  const q = S.msgFilter;
  const list = all.filter(
    ([s]) =>
      (S.msgChip === "all" || (s.from ?? "page") === S.msgChip) &&
      matchesFilter(
        q,
        s.message.id,
        s.message.payload ?? s.message.event,
        ...s.effects.flatMap((e) => [`${e.plugin}:${e.type}`, e.summary]),
      ),
  );
  if (!list.length) {
    messagesRows.append(
      el(
        "div",
        "empty-tab",
        all.length
          ? "no messages match the filter"
          : "no messages yet — dispatch one in the app",
      ),
    );
    renderMsgDetail();
    return;
  }
  for (const [s, appId] of [...list].reverse().slice(0, MAX_ROWS)) {
    const key = `${appId}:${s.seq}`;
    const row = el("div", "row" + (S.selectedMsg === key ? " sel" : ""));
    row.append(
      el("span", "t", fmtTime(s.time)),
      el("span", "id", s.message.id),
      el("span", "sum", shortJson(s.message.payload ?? s.message.event)),
      el("span", "num", `${s.effects.length} eff`),
    );
    if (s.from) row.append(el("span", "app", `← ${s.from}`));
    if (S.filterApp === "all") row.append(el("span", "app", appId));
    row.title = "click to inspect the message and its effects on the right";
    row.addEventListener("click", () => {
      S.selectedMsg = S.selectedMsg === key ? null : key;
      renderMessages();
    });
    messagesRows.append(row);
  }
  renderMsgDetail();
}

/* ---------------------------------------------------- message detail pane */

function renderMsgDetail(target = msgDetail, key = S.selectedMsg) {
  target.replaceChildren();
  if (!key) {
    target.append(
      el("div", "empty-tab", "click a message on the left to inspect it here"),
    );
    return;
  }
  const sep = key.lastIndexOf(":");
  const appId = key.slice(0, sep);
  const s = stepsOf(appId).find((x) => String(x.seq) === key.slice(sep + 1));
  if (!s) {
    target.append(
      el(
        "div",
        "empty-tab",
        "that message is gone from the recording — rescan",
      ),
    );
    return;
  }
  // mirrors the effect detail: head = content (as much as fits) + time,
  // then the name line — switching between rows should read identically
  const head = el("div", "detail-head");
  head.append(
    // no JS-side truncation: like the effect summary, CSS clips it with an
    // ellipsis at the pane width (the cap is only a pathological-payload guard)
    el("span", "sum", shortJson(s.message.payload ?? s.message.event, 1e4)),
    el("span", "t", fmtTime(s.time)),
  );
  target.append(head);

  const line = el("div", "detail-line", "message: ");
  line.append(el("span", "id", s.message.id));
  target.append(line);

  target.append(el("h4", "", "payload"));
  target.append(viewer(`msg:${key}`, s.message.payload ?? s.message.event));

  const effects = el("div", "detail-sec");
  effects.append(el("h4", "", `effects — ${s.effects.length}`));
  if (!s.effects.length) effects.append(el("div", "erow", "no effects"));
  else effects.append(viewer(`msg-fx:${key}`, s.effects));
  target.append(effects);
}

/* ---------------------------------------------------------------- effects */

function renderEffects() {
  const chips = fxChips;
  chips.replaceChildren();
  const plugins = new Set();
  for (const id of appIds())
    for (const p of S.apps.get(id)?.plugins ?? []) plugins.add(p);
  for (const chip of ["all", ...plugins]) {
    const b = el("button", "chip" + (S.chip === chip ? " active" : ""), chip);
    b.addEventListener("click", () => {
      S.chip = chip;
      renderEffects();
    });
    chips.append(b);
  }

  effectRows.replaceChildren();
  const all = appIds().flatMap((id) =>
    stepsOf(id).flatMap((s) => s.effects.map((e) => [e, s, id])),
  );
  const q = S.fxFilter;
  const list = all.filter(
    ([e, s]) =>
      (S.chip === "all" || e.plugin === S.chip) &&
      matchesFilter(
        q,
        `${e.plugin}:${e.type}`,
        e.summary,
        e.detail,
        s.message.id,
      ),
  );
  list.sort((a, b) => b[0].time - a[0].time || b[1].seq - a[1].seq);
  if (!list.length) {
    effectRows.append(
      el(
        "div",
        "empty-tab",
        all.length
          ? "no effects match the filter"
          : "no effects yet — dispatch a message in the app",
      ),
    );
    renderEffectDetail();
    return;
  }
  for (const [e, s, appId] of list.slice(0, MAX_ROWS)) {
    const row = el("div", "row" + (S.selectedFx === e.uid ? " sel" : ""));
    row.append(
      el("span", "t", fmtTime(e.time)),
      el("span", "plug", `${e.plugin}:${e.type}`),
      el("span", "sum", e.summary),
    );
    if (e.dur !== undefined) row.append(el("span", "num dur", `${e.dur}ms`));
    const wait = S.waits.get(e.uid);
    if (wait !== undefined) row.append(el("span", "num wait", `⧗${wait}ms`));
    if (S.filterApp === "all") row.append(el("span", "app", appId));
    row.title = `message "${s.message.id}" — click to inspect on the right`;
    row.addEventListener("click", () => {
      S.selectedFx = S.selectedFx === e.uid ? null : e.uid;
      renderEffects();
    });
    effectRows.append(row);
  }
  renderEffectDetail();
}

/* ----------------------------------------------------- effect detail pane */

function renderEffectDetail(target = effectDetail, uid = S.selectedFx) {
  target.replaceChildren();
  if (!uid) {
    target.append(
      el("div", "empty-tab", "click an effect on the left to inspect it here"),
    );
    return;
  }
  let found = null;
  for (const id of appIds())
    for (const s of stepsOf(id)) {
      const e = s.effects.find((x) => x.uid === uid);
      if (e) {
        found = [e, s];
        break;
      }
    }
  if (!found) {
    target.append(
      el("div", "empty-tab", "that effect is gone from the recording — rescan"),
    );
    return;
  }
  const [e, s] = found;
  const head = el("div", "detail-head");
  head.append(
    el("span", "plug", `${e.plugin}:${e.type}`),
    el("span", "sum", e.summary),
  );
  const wait = S.waits.get(e.uid);
  const parts = [fmtTime(e.time)];
  if (e.dur !== undefined) parts.push(`${e.dur}ms`);
  if (wait !== undefined) parts.push(`⧗${wait}ms`);
  head.append(el("span", "t", parts.join(" · ")));
  target.append(head);

  const line = el("div", "detail-line", "message ");
  line.append(el("span", "id", s.message.id));
  target.append(line);

  target.append(el("h4", "", "effect object"));
  target.append(viewer(`fx:${e.uid}`, e.detail));
}

/* ------------------------------------------------------------------ store */

function storeAppId() {
  const ids = appIds().filter((id) => S.apps.get(id)?.hasStore);
  if (S.filterApp !== "all" && ids.includes(S.filterApp)) return S.filterApp;
  return ids[0];
}

function renderStore() {
  const tab = $("#tab-store");
  tab.replaceChildren();
  const id = storeAppId();
  if (!id) {
    tab.append(
      el(
        "div",
        "empty-tab",
        S.apps.size
          ? "none of the selected apps has a store plugin"
          : "no pavlus agent on this page yet…",
      ),
    );
    return;
  }
  const cols = el("div", "cols");
  const vbar = el("div", "divider-v");
  dragDivider(vbar, (ev) => {
    const r = cols.getBoundingClientRect();
    S.split.store = clampFrac((ev.clientX - r.left) / r.width, 0.15, 0.85);
    applyFlex(stateBox, S.split.store);
  });

  const stateBox = el("div", "", "");
  stateBox.id = "store-state";
  stateBox.append(el("h3", "", `state — ${S.apps.get(id).name}`));
  stateBox.append(viewer("state", S.states.get(id) ?? null));
  applyFlex(stateBox, S.split.store);

  const tlBox = el("div", "", "");
  tlBox.id = "store-timeline";
  const hist = S.hist.get(id) ?? [];
  const ghosts = S.redo.get(id) ?? [];
  const act = hist.length - 1;

  // Jumping to a step = undo the steps after it (they become redoable ghosts)
  // or redo until we land there. Shared with the Time travel tab.
  const jump = (i) => jumpTo(id, i);

  const head = el("h3", "", "");
  head.append(el("span", "", `timeline — ${hist.length} changes`));
  const wrap = el("div", "");
  wrap.id = "stepper";
  const track = el("div", "track");
  hist.forEach((h, i) => {
    const d = el(
      "button",
      "step-dot" + (i === act ? " active" : i < act ? " applied" : ""),
    );
    d.title =
      `step ${i + 1} — state after ${h.type} ${h.path}` +
      ` (${h.msgId === null ? "· panel" : `← ${h.msgId}`})`;
    d.addEventListener("click", () => jump(i));
    track.append(d);
  });
  ghosts.forEach((g, k) => {
    const d = el("button", "step-dot ghost");
    d.title = `redo step ${hist.length + k + 1}${g ? ` — ${g.type} ${g.path}` : ""}`;
    d.addEventListener("click", () => jump(act + 1 + k));
    track.append(d);
  });
  wrap.append(track);
  head.append(wrap);
  const back = el("button", "", "⟵ back");
  back.disabled = !hist.length;
  back.addEventListener("click", () => stepBack(id));
  const fwd = el("button", "", "forward ⟶");
  fwd.disabled = !ghosts.length;
  fwd.addEventListener("click", () => stepFwd(id));
  head.append(back, fwd);
  tlBox.append(head);

  const tlRows = el("div", "rows");
  const rowEls = [];
  if (!hist.length && !ghosts.length)
    tlRows.append(
      el(
        "div",
        "tl-note",
        "every set/merge/remove lands here — click one to travel to that state; nothing is removed, you can always redo",
      ),
    );

  // the change preview at the bottom: hovering a row fills it, hovering the
  // preview lights the row up in the list (identity-validated, so it follows
  // the list as changes and ghosts shift around)
  const detail = el("div", "", "");
  detail.id = "tl-detail";
  detail.style.height = `${(S.tlFrac * 100).toFixed(2)}%`;
  const renderTlDetail = () => {
    detail.replaceChildren();
    let c = S.tlShow;
    if (c && c.appId === id && c.entry) {
      const hi = hist.indexOf(c.entry);
      const gi = hi < 0 ? (S.redo.get(id) ?? []).indexOf(c.entry) : -1;
      if (hi >= 0) c = { appId: id, idx: hi, entry: c.entry, redo: false };
      else if (gi >= 0)
        c = { appId: id, idx: hist.length + gi, entry: c.entry, redo: true };
      else c = null;
    } else c = null;
    // nothing hovered: pin the current change so the pane is never empty
    if (!c && hist.length) {
      const cur = hist[act];
      if (cur) c = { appId: id, idx: act, entry: cur, redo: false };
    }
    if (!c) {
      detail.append(
        el(
          "div",
          "tl-note",
          "store changes show up here — hover one to pin it, click it to travel to that state",
        ),
      );
      return;
    }
    const card = el("div", "tl-card");
    const line = el("div", "tl-card-head");
    line.append(
      el(
        "span",
        "chg",
        `${c.redo ? "↷ redo — " : ""}${c.entry.type} ${c.entry.path}`,
      ),
      el(
        "span",
        "num",
        c.entry.msgId === null ? "· panel" : `← ${c.entry.msgId}`,
      ),
      el("span", "t", c.entry.time ? fmtTime(c.entry.time) : ""),
    );
    card.append(line);
    if (c.entry.value === undefined)
      card.append(
        el(
          "div",
          "tl-note",
          c.entry.type === "remove"
            ? "remove — the value is gone"
            : "no value recorded for this change",
        ),
      );
    else {
      card.append(el("h4", "", "value"));
      card.append(viewer(`chg:${c.idx}`, c.entry.value));
    }
    card.addEventListener("mouseenter", () =>
      rowEls[c.idx]?.classList.add("hint"),
    );
    card.addEventListener("mouseleave", () =>
      rowEls[c.idx]?.classList.remove("hint"),
    );
    detail.append(card);
  };

  const showTl = (idx, entry, redo) => {
    S.tlShow = { appId: id, idx, entry, redo };
    renderTlDetail();
  };

  hist.forEach((h, i) => {
    const row = el(
      "div",
      "tl-row" +
        (i === hist.length - 1 ? " cur" : "") +
        (h.msgId === null ? " panel" : ""),
    );
    row.append(
      el("span", "idx", String(i + 1)),
      el("span", "chg", `${h.type} ${h.path}`),
      el("span", "num", h.msgId === null ? "· panel" : `← ${h.msgId}`),
      el("span", "t", fmtTime(h.time)),
    );
    row.title =
      "click to travel to this state — hover to preview the change below";
    row.addEventListener("click", () => jump(i));
    row.addEventListener("mouseenter", () => showTl(i, h, false));
    tlRows.append(row);
    rowEls[i] = row;
  });
  ghosts.forEach((g, k) => {
    const i = act + 1 + k;
    const row = el("div", "tl-row ghost");
    row.append(
      el("span", "idx", String(i + 1)),
      el("span", "chg", g ? `${g.type} ${g.path}` : "redo — unknown change"),
      el("span", "num", "↷ redo"),
      el("span", "t", g && g.time ? fmtTime(g.time) : ""),
    );
    row.title = "click to redo up to this change";
    row.addEventListener("click", () => jump(i));
    row.addEventListener("mouseenter", () => showTl(i, g, true));
    tlRows.append(row);
    rowEls[i] = row;
  });
  renderTlDetail();
  const hbar = el("div", "divider-h");
  dragDivider(hbar, (ev) => {
    const r = tlBox.getBoundingClientRect();
    S.tlFrac = clampFrac((r.bottom - ev.clientY) / r.height, 0.1, 0.75);
    detail.style.height = `${(S.tlFrac * 100).toFixed(2)}%`;
  });
  tlBox.append(tlRows, hbar, detail);

  cols.append(stateBox, vbar, tlBox);
  tab.append(cols);
  // keep the active step in view (the stepper can overflow on long histories)
  const actBtn = wrap.querySelector(".active");
  if (actBtn)
    wrap.scrollLeft =
      actBtn.offsetLeft - wrap.clientWidth / 2 + actBtn.offsetWidth / 2;
}

/* ------------------------------------------------------------ time travel */

// All store changes as a vertical rail of circles on a line (left) and a
// detail pane (right). Clicking a circle travels to that state — the same
// jumpTo path as the Store tab — and shows the change on the right.
function renderTravel() {
  const tab = $("#tab-travel");
  tab.replaceChildren();
  const id = storeAppId();
  if (!id) {
    tab.append(
      el(
        "div",
        "empty-tab",
        S.apps.size
          ? "none of the selected apps has a store plugin"
          : "no pavlus agent on this page yet…",
      ),
    );
    return;
  }

  const hist = S.hist.get(id) ?? [];
  const ghosts = S.redo.get(id) ?? [];
  const act = hist.length - 1;

  const railBox = el("div", "", "");
  railBox.id = "travel-rail";
  const head = el("h3", "", `time travel — ${hist.length} changes`);
  const back = el("button", "", "⟵ back");
  back.disabled = !hist.length;
  back.addEventListener("click", () => stepBack(id));
  const fwd = el("button", "", "forward ⟶");
  fwd.disabled = !ghosts.length;
  fwd.addEventListener("click", () => stepFwd(id));
  head.append(back, fwd);
  railBox.append(head);

  const detail = el("div", "detail-pane");
  detail.id = "travel-detail";

  // the right pane: the selected change, identity-validated like the store
  // preview so it follows the entry as ghosts shift around; nothing selected
  // pins the current change
  const renderDetail = () => {
    detail.replaceChildren();
    let c = S.travelSel;
    if (c && c.appId === id && c.entry) {
      const hi = hist.indexOf(c.entry);
      const gi = hi < 0 ? ghosts.indexOf(c.entry) : -1;
      if (hi >= 0) c = { appId: id, idx: hi, entry: c.entry, redo: false };
      else if (gi >= 0)
        c = { appId: id, idx: hist.length + gi, entry: c.entry, redo: true };
      else c = null;
    } else c = null;
    if (!c && hist.length) {
      const cur = hist[act];
      if (cur) c = { appId: id, idx: act, entry: cur, redo: false };
    }
    if (!c) {
      detail.append(
        el("div", "tl-note", "click a circle to travel to that state"),
      );
      return;
    }
    const card = el("div", "tl-card");
    const line = el("div", "tl-card-head");
    line.append(
      el(
        "span",
        "chg",
        `${c.redo ? "↷ redo — " : ""}${c.entry.type} ${c.entry.path}`,
      ),
      el(
        "span",
        "num",
        c.entry.msgId === null ? "· panel" : `← ${c.entry.msgId}`,
      ),
      el("span", "t", c.entry.time ? fmtTime(c.entry.time) : ""),
    );
    card.append(line);
    if (c.entry.value === undefined)
      card.append(
        el(
          "div",
          "tl-note",
          c.entry.type === "remove"
            ? "remove — the value is gone"
            : "no value recorded for this change",
        ),
      );
    else {
      card.append(el("h4", "", "value"));
      card.append(viewer(`tt:${c.idx}`, c.entry.value));
    }
    detail.append(card);
  };

  const rail = el("div", "rows");
  rail.id = "travel-steps";
  if (!hist.length && !ghosts.length)
    rail.append(
      el(
        "div",
        "tl-note",
        "every set/merge/remove lands here — click a circle to travel to that state",
      ),
    );

  const addStep = (i, entry, redo) => {
    const step = el(
      "div",
      "tl-row tr-step" +
        (i === act ? " cur" : "") +
        (redo ? " ghost" : "") +
        (!redo && entry.msgId === null ? " panel" : ""),
    );
    const dot = el(
      "button",
      "step-dot" + (redo ? " ghost" : i === act ? " active" : " applied"),
    );
    dot.title = redo
      ? `redo step ${i + 1}${entry ? ` — ${entry.type} ${entry.path}` : ""}`
      : `step ${i + 1} — state after ${entry.type} ${entry.path}`;
    step.append(
      dot,
      el("span", "idx", String(i + 1)),
      el(
        "span",
        "chg",
        entry ? `${entry.type} ${entry.path}` : "redo — unknown change",
      ),
      el("span", "t", entry && entry.time ? fmtTime(entry.time) : ""),
    );
    step.title = "click to travel to this state";
    step.addEventListener("click", () => {
      S.travelSel = { appId: id, idx: i, entry, redo };
      renderDetail();
      jumpTo(id, i);
    });
    rail.append(step);
  };
  hist.forEach((h, i) => addStep(i, h, false));
  ghosts.forEach((g, k) => addStep(act + 1 + k, g, true));
  renderDetail();

  const vbar = el("div", "divider-v");
  const cols = el("div", "cols");
  cols.id = "travel-cols";
  cols.append(railBox, vbar, detail);
  railBox.append(rail);
  applyFlex(railBox, S.split.travel);
  dragDivider(vbar, (ev) => {
    const r = cols.getBoundingClientRect();
    S.split.travel = clampFrac((ev.clientX - r.left) / r.width, 0.15, 0.85);
    applyFlex(railBox, S.split.travel);
  });
  tab.append(cols);
  // keep the active circle in view (long histories overflow the rail)
  const cur = rail.querySelector(".tr-step.cur");
  if (cur)
    rail.scrollTop =
      cur.offsetTop - rail.clientHeight / 2 + cur.offsetHeight / 2;
}

/* ------------------------------------------------------------------- apps */

function renderApps() {
  appsTree.replaceChildren();
  const apps = [...S.apps.values()];
  if (!apps.length) {
    appsTree.append(
      el("div", "empty-tab", "no pavlus agent on this page yet…"),
    );
    renderAppsDetail();
    return;
  }

  const NODE_W = 150;
  const NODE_H = 30;
  const COMP_W = 130;
  const COMP_H = 26;
  const INDENT = 26;
  const V_GAP = 8;
  const GAP = 24;
  const rowApp = 64;

  // Components arrive as dotted paths ("users", "users.editor"): pre-order
  // rows, one step of indent per level under the app. A display tag (the
  // agent's `tags`) replaces the last path segment as the label.
  const rowsOf = (a) =>
    (a.components ?? []).map((p) => ({
      path: p,
      label: S.tags.get(a.id)?.[p] ?? p.slice(p.lastIndexOf(".") + 1),
      depth: p.split(".").length - 1,
    }));

  const cols = apps.map((a) => {
    const rows = rowsOf(a);
    const maxDepth = rows.reduce((m, r) => Math.max(m, r.depth), 0);
    const w = Math.max(NODE_W, 18 + maxDepth * INDENT + COMP_W);
    return {
      app: a,
      rows,
      w,
      h: rowApp + NODE_H + rows.length * (COMP_H + V_GAP) + 10,
    };
  });
  const width = GAP + cols.reduce((n, c) => n + c.w + GAP, 0);
  const height = Math.max(rowApp + NODE_H + 24, ...cols.map((c) => c.h));

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const node = (
    x,
    y,
    w,
    h,
    label,
    { sel = false, store = false, on, title },
  ) => {
    const g = document.createElementNS(svgNS, "g");
    g.setAttribute("class", `node${sel ? " sel" : ""}${store ? " store" : ""}`);
    const rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("x", x);
    rect.setAttribute("y", y);
    rect.setAttribute("width", w);
    rect.setAttribute("height", h);
    const text = document.createElementNS(svgNS, "text");
    text.setAttribute("x", x + w / 2);
    text.setAttribute("y", y + h / 2 + 4);
    text.setAttribute("text-anchor", "middle");
    text.textContent = label.length > 24 ? `${label.slice(0, 23)}…` : label;
    g.append(rect, text);
    if (title) {
      const t = document.createElementNS(svgNS, "title");
      t.textContent = title;
      g.append(t);
    }
    g.addEventListener("click", on);
    svg.append(g);
    return { cx: x + w / 2, bottom: y + h, top: y };
  };

  // left-aligned: the root sits at the left edge, app columns follow below it
  const rootX = GAP;
  const root = node(rootX, 8, NODE_W, NODE_H, "all apps", {
    sel: S.filterApp === "all",
    on: () => {
      S.filterApp = "all";
      S.filterComp = null;
      refresh();
    },
  });

  let x = GAP;
  for (const c of cols) {
    const appId = c.app.id;
    const sel = S.filterApp === appId;
    const a = node(x, rowApp, c.w, NODE_H, c.app.name, {
      sel,
      store: c.app.hasStore,
      title: c.app.name,
      on: () => {
        S.filterApp = appId;
        S.filterComp = null;
        refresh();
      },
    });
    // root → app
    const mid = (root.bottom + rowApp) / 2;
    const p = document.createElementNS(svgNS, "path");
    p.setAttribute(
      "d",
      `M ${root.cx} ${root.bottom} V ${mid} H ${a.cx} V ${a.top}`,
    );
    p.setAttribute("class", "edge");
    svg.append(p);

    // the app's components: one row per dotted path, an edge per parent → child
    const drawn = new Map(); // path -> {x, bottom}
    let y = a.bottom + V_GAP;
    for (const r of c.rows) {
      const nx = x + 18 + r.depth * INDENT;
      const dot = r.path.lastIndexOf(".");
      const parent =
        dot < 0 ? { x, bottom: a.bottom } : drawn.get(r.path.slice(0, dot));
      const e = document.createElementNS(svgNS, "path");
      e.setAttribute(
        "d",
        `M ${parent.x + 12} ${parent.bottom} V ${y + COMP_H / 2} H ${nx}`,
      );
      e.setAttribute("class", "edge");
      svg.append(e);
      node(nx, y, COMP_W, COMP_H, r.label, {
        sel: sel && S.filterComp === r.path,
        title: `${r.path} — click to inspect its input / output`,
        on: () => {
          S.filterApp = appId;
          S.filterComp = r.path;
          refresh();
        },
      });
      drawn.set(r.path, { x: nx, bottom: y + COMP_H });
      y += COMP_H + V_GAP;
    }
    x += c.w + GAP;
  }

  appsTree.append(svg);
  const wired = apps.every((a) => (a.components ?? []).length);
  const note = el(
    "div",
    "tl-note",
    wired
      ? "click a component to see its input / output — messages in, effects out"
      : "click a node to inspect the app on the right — an app without components was wired without `app` in createPavlusDebug",
  );
  appsTree.append(note);
  renderAppsDetail();
}

/* ------------------------------------------------------ apps detail pane */

function renderAppsDetail() {
  appsDetail.replaceChildren();
  const id = S.filterApp;
  if (id === "all") {
    appsDetail.append(
      el("div", "empty-tab", "click an app on the left to inspect it here"),
    );
    return;
  }
  const app = S.apps.get(id);
  if (!app) {
    appsDetail.append(
      el("div", "empty-tab", "that app is gone from the page — rescan"),
    );
    return;
  }
  const head = el("div", "detail-head");
  head.append(
    el("span", "id", app.name),
    el("span", "num", `${stepsOf(id).length} messages`),
  );
  appsDetail.append(head);

  // the data views: the app's own io, messages, effects and store timeline,
  // filtered to the selected component (or the whole app)
  const views = ["info", "io", "messages", "effects", "timeline"];
  if (!views.includes(S.appsView)) S.appsView = "info";
  const bar = el("div", "apps-views");
  for (const v of views) {
    const b = el("button", "chip" + (S.appsView === v ? " active" : ""), v);
    b.addEventListener("click", () => {
      S.appsView = v;
      renderAppsDetail();
    });
    bar.append(b);
  }
  appsDetail.append(bar);

  // steps that reached the selected component (its receive chain includes
  // every ancestor boundary, so an exact match is the whole subtree)
  const inComp = (s) => !S.filterComp || (s.comps ?? []).includes(S.filterComp);

  if (S.appsView === "io") {
    const comp = S.filterComp ?? "";
    const b = S.io.get(id)?.get(comp);
    const head = el("div", "detail-head");
    head.append(
      el("span", "id", comp || "(root)"),
      el("span", "num", comp ? "observed input / output" : "whole app"),
    );
    appsDetail.append(head);
    if (!b || (!b.input.size && !b.output.size))
      appsDetail.append(
        el(
          "div",
          "tl-note",
          "nothing observed yet — input messages and output effects appear here as the app runs",
        ),
      );
    if (b?.input.size) {
      appsDetail.append(el("h4", "", "input — messages received"));
      const rows = [...b.input.entries()].sort(
        (x, y) => y[1].n - x[1].n || x[0].localeCompare(y[0]),
      );
      for (const [mid, v] of rows.slice(0, MAX_ROWS)) {
        const row = el("div", "row");
        row.append(
          el("span", "id", mid),
          el("span", "num", `×${v.n}`),
          el("span", "t", fmtTime(v.at)),
        );
        appsDetail.append(row);
      }
    }
    if (b?.output.size) {
      appsDetail.append(el("h4", "", "output — effects produced"));
      const rows = [...b.output.entries()].sort(
        (x, y) => y[1].n - x[1].n || x[0].localeCompare(y[0]),
      );
      for (const [key, v] of rows.slice(0, MAX_ROWS)) {
        const row = el("div", "row");
        row.append(
          el("span", "plug", key),
          el("span", "sum", v.summary ?? ""),
          el("span", "num", `×${v.n}`),
          el("span", "t", fmtTime(v.at)),
        );
        appsDetail.append(row);
      }
    }
    return;
  }

  if (S.appsView === "messages") {
    const steps = [...stepsOf(id)].filter(inComp).reverse().slice(0, MAX_ROWS);
    if (!steps.length)
      appsDetail.append(
        el(
          "div",
          "tl-note",
          S.filterComp
            ? "no messages reached this component yet"
            : "no messages yet — dispatch one in the app",
        ),
      );
    for (const s of steps) {
      const key = `${id}:${s.seq}`;
      const row = el("div", "row");
      row.append(
        el("span", "t", fmtTime(s.time)),
        el("span", "id", s.message.id),
        el("span", "sum", shortJson(s.message.payload ?? s.message.event)),
        el("span", "num", `${s.effects.length} eff`),
      );
      row.title = "click to inspect the message in the Messages tab";
      row.addEventListener("click", () => {
        S.selectedMsg = key;
        showTab("messages");
      });
      appsDetail.append(row);
    }
    return;
  }

  if (S.appsView === "effects") {
    const all = stepsOf(id)
      .filter(inComp)
      .flatMap((s) => s.effects.map((e) => [e, s]));
    all.sort((a, b) => b[0].time - a[0].time || b[1].seq - a[1].seq);
    if (!all.length)
      appsDetail.append(
        el("div", "tl-note", "no effects yet — dispatch a message in the app"),
      );
    for (const [e, s] of all.slice(0, MAX_ROWS)) {
      const row = el("div", "row");
      row.append(
        el("span", "t", fmtTime(e.time)),
        el("span", "plug", `${e.plugin}:${e.type}`),
        el("span", "sum", e.summary),
      );
      if (e.dur !== undefined) row.append(el("span", "num dur", `${e.dur}ms`));
      const wait = S.waits.get(e.uid);
      if (wait !== undefined) row.append(el("span", "num wait", `⧗${wait}ms`));
      row.title = `message "${s.message.id}" — click to inspect in the Effects tab`;
      row.addEventListener("click", () => {
        S.selectedFx = e.uid;
        S.chip = "all"; // make sure the effect is not hidden by a plugin chip
        showTab("effects");
      });
      appsDetail.append(row);
    }
    return;
  }

  if (S.appsView === "timeline") {
    const hist = S.hist.get(id) ?? [];
    const ghosts = S.redo.get(id) ?? [];
    const act = hist.length - 1;
    if (!hist.length && !ghosts.length)
      appsDetail.append(
        el(
          "div",
          "tl-note",
          "no store changes yet — the timeline fills as the app sets state",
        ),
      );
    hist.forEach((h, i) => {
      const row = el(
        "div",
        "tl-row" +
          (i === act ? " cur" : "") +
          (h.msgId === null ? " panel" : ""),
      );
      row.append(
        el("span", "idx", String(i + 1)),
        el("span", "chg", `${h.type} ${h.path}`),
        el("span", "num", h.msgId === null ? "· panel" : `← ${h.msgId}`),
        el("span", "t", fmtTime(h.time)),
      );
      row.title = "click to travel to this state";
      row.addEventListener("click", () => jumpTo(id, i));
      appsDetail.append(row);
    });
    ghosts.forEach((g, k) => {
      const i = act + 1 + k;
      const row = el("div", "tl-row ghost");
      row.append(
        el("span", "idx", String(i + 1)),
        el("span", "chg", g ? `${g.type} ${g.path}` : "redo — unknown change"),
        el("span", "num", "↷ redo"),
        el("span", "t", g && g.time ? fmtTime(g.time) : ""),
      );
      row.title = "click to redo up to this change";
      row.addEventListener("click", () => jumpTo(id, i));
      appsDetail.append(row);
    });
    return;
  }

  // info view: facts + state
  const facts = [
    ["plugins", (app.plugins ?? []).join(", ") || "none"],
    ["components", String((app.components ?? []).length)],
    ["effects", String(stepsOf(id).reduce((n, s) => n + s.effects.length, 0))],
    ["timeline", `${(S.hist.get(id) ?? []).length} changes`],
  ];
  if (S.filterComp) {
    facts.unshift(
      ["component", S.filterComp],
      ["tag", S.tags.get(id)?.[S.filterComp] ?? "—"],
    );
  }
  for (const [k, v] of facts) {
    const line = el("div", "detail-line", `${k} `);
    line.append(el("span", "id", v));
    appsDetail.append(line);
  }

  appsDetail.append(el("h4", "", "state"));
  appsDetail.append(viewer("state", S.states.get(id) ?? null));
}

/* ------------------------------------------------------------------- boot */

refresh();
