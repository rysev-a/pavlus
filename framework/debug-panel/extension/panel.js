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

// In devtools this is the inspected tab; the standalone popup window
// (Cmd/Ctrl+Shift+V) gets the same page with ?tab=<id> in the URL.
const TAB_ID = chrome.devtools
  ? chrome.devtools.inspectedWindow.tabId
  : Number(new URLSearchParams(location.search).get("tab"));

let port = connect();

function connect() {
  const p = chrome.runtime.connect({
    name: "pavlus@" + TAB_ID,
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
  filterComp: null, // component path within the selected app (Application tab)
  consoleView: "all", // console tab: all | messages | effects
  consoleChip: "all", // console tab plugin filter: "all" | plugin | "page"
  consoleFilter: "", // text filter on the console tab
  consoleSel: null, // row inspected on the console's right pane: {k:"msg",key} | {k:"fx",uid}
  consoleSide: true, // console tab: the component sidebar is open
  storeSide: true, // store tab: the component sidebar is open
  split: {
    console: 0.6,
    consoleSide: 0.18,
    storeSide: 0.18,
    store: 0.5,
    travel: 0.45,
    apps: 0.6,
  }, // left pane width
  tlFrac: 0.38, // store preview height, fraction of the timeline column
  tlShow: null, // change previewed under the timeline: {appId, idx, entry, redo}
  travelSel: null, // change selected in the Time travel tab: {appId, idx, entry, redo}
  appsView: "info", // apps detail pane view: info | io | messages | effects | timeline
  appsOpen: new Set(), // apps-tree branches forced open: `${appId}:${path}`
  appsShut: new Set(), // apps-tree branches forced shut (same keys)
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
  fields.some((f) => {
    if (f !== null && typeof f === "object") {
      // dig into nested payload content — a plain String() would only ever
      // see "[object Object]"
      try {
        return jsonOf(f).toLowerCase().includes(q);
      } catch {
        return false; // circular or exotic — nothing text-wise to match on
      }
    }
    return String(f ?? "")
      .toLowerCase()
      .includes(q);
  });

// the 🚫 button on the Console: drop the recorded steps (and the io
// counts and http waits derived from them). Store history survives — the
// timeline is time travel, not a log; the next page hello replays anyway.
function clearRecording() {
  S.steps.clear();
  S.io.clear();
  S.waits.clear();
  S.consoleSel = null;
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
  S.consoleSel = null;
  S.tlShow = null;
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
  // a single app on the page: inspect it right away instead of "all"
  if (S.filterApp === "all" && (h.apps ?? []).length === 1)
    S.filterApp = h.apps[0].id;
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
    case "state": {
      // the agent attaches the live component list when it changed (each
      // children gain and lose instances as their map changes) — replace
      // wholesale: the agent's maps are computed fresh, not diffed
      const app = S.apps.get(e.appId);
      if (app && e.components) {
        app.components = e.components;
        if (e.tags) {
          app.tags = e.tags;
          S.tags.set(e.appId, e.tags);
        }
        if (e.compKeys) app.compKeys = e.compKeys;
        if (e.eachGroups) app.eachGroups = e.eachGroups;
        if (e.cycles) app.cycles = e.cycles;
      }
      S.states.set(
        e.appId,
        e.truncated ? { "(state)": "too big to display" } : e.state,
      );
      break;
    }
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
  if (payload && payload.__pavlusNav) return onNavigated();
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

function onNavigated() {
  // The document reloaded, which dropped the page-side agent. Don't blank
  // the panel: keep the previous recording on screen (amber status) until
  // the new page's hello replaces it wholesale in applyHello.
  sawHello = false;
  sendHello();
  refresh();
}

if (chrome.devtools) {
  // Devtools context: the inspected tab's own navigation events. The
  // standalone window gets the equivalent from the background worker
  // instead ({ __pavlusNav: true } over the port).
  chrome.devtools.network.onNavigated.addListener(onNavigated);
}

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

/* --------------------------------------------------------------- console */

const consoleRows = el("div", "rows");
consoleRows.id = "console-rows";
// the console toolbar is one row: the sidebar toggle, the active component
// chip (if any), clear, reset filters, then the chip groups and the filter
const consoleViewChips = el("div", "chip-group");
const consolePluginChips = el("div", "chip-group");
const consoleBar = el("div", "");
consoleBar.id = "console-bar";
const consoleFilterInput = filterInput("consoleFilter", renderConsole);
// chrome-devtools-style sidebar toggle: shows the component tree on the left,
// one click on a node narrows the stream to its subtree
const consoleSideBtn = iconButton(
  "toggle the component sidebar — click a component to filter the stream to it and its children",
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">' +
    '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
    '<rect x="3" y="4" width="3.4" height="8" rx="0.8" fill="currentColor"/></svg>',
  () => {
    S.consoleSide = !S.consoleSide;
    renderConsole();
  },
);
// the active component filter, shown as a removable chip
const consoleCompChip = el("button", "chip comp");
consoleCompChip.style.display = "none";
consoleCompChip.title = "clear the component filter";
consoleCompChip.addEventListener("click", () => {
  S.filterApp = "all";
  S.filterComp = null;
  refresh();
});
// resets every console filter at once: the view, the plugin chips and the
// search box (dim while everything is already at its default)
const consoleReset = el("button", "filter-clear");
consoleReset.title =
  "reset all filters — show, plugins, the search box and the component sidebar selection";
consoleReset.innerHTML =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">' +
  '<path d="M2.5 3h11l-4 4.5V12l-3 1.5V7.5L2.5 3z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>' +
  '<line x1="3" y1="14" x2="13.5" y2="2.5" stroke="currentColor" stroke-width="1.3"/></svg>';
consoleReset.addEventListener("click", () => {
  S.consoleView = "all";
  S.consoleChip = "all";
  S.consoleFilter = "";
  S.filterApp = "all";
  S.filterComp = null;
  consoleFilterInput.value = "";
  renderConsole();
});
consoleBar.append(
  consoleSideBtn,
  consoleCompChip,
  clearButton(),
  consoleReset,
  consoleViewChips,
  consolePluginChips,
  consoleFilterInput,
);
const consoleDetail = el("div", "detail-pane");
consoleDetail.id = "console-detail";
const consoleDiv = el("div", "divider-v");
const consoleCols = el("div", "");
consoleCols.id = "console-cols";
consoleCols.append(consoleRows, consoleDiv, consoleDetail);
// the component sidebar (like the chrome console's filter sidebar, but with
// the app's component tree)
const consoleSide = el("div", "");
consoleSide.id = "console-side";
const consoleSideBar = el("div", "divider-v");
const consoleWrap = el("div", "");
consoleWrap.id = "console-wrap";
consoleWrap.append(consoleSide, consoleSideBar, consoleCols);
$("#tab-console").append(consoleBar, consoleWrap);
applyFlex(consoleRows, S.split.console);
applyFlex(consoleSide, S.split.consoleSide);
dragDivider(consoleSideBar, (ev) => {
  const r = consoleWrap.getBoundingClientRect();
  S.split.consoleSide = clampFrac((ev.clientX - r.left) / r.width, 0.08, 0.4);
  applyFlex(consoleSide, S.split.consoleSide);
});
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
  // toolbar: clear | reset filters | show group | plugin group (right) | search
  consoleViewChips.title = "what to show";
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
  consolePluginChips.title =
    "filter by plugin (effects) or sender (messages); page = dispatched from the page";
  consolePluginChips.replaceChildren(
    ...["all", ...[...names].sort()].map((c) =>
      chipBtn(c, S.consoleChip === c, () => {
        S.consoleChip = c;
        renderConsole();
      }),
    ),
  );
  consoleReset.classList.toggle(
    "idle",
    S.consoleView === "all" &&
      S.consoleChip === "all" &&
      !S.consoleFilter &&
      !S.filterComp,
  );

  // the sidebar: the shared component tree, clicking a node narrows the
  // stream to its subtree (the selection is shared with the Application tab)
  consoleSideBtn.classList.toggle("active", S.consoleSide);
  consoleSide.style.display = S.consoleSide ? "" : "none";
  consoleSideBar.style.display = S.consoleSide ? "" : "none";
  if (S.consoleSide) fillCompSide(consoleSide);
  // the active component as a removable chip in the toolbar
  if (S.filterComp && S.apps.has(S.filterApp)) {
    consoleCompChip.style.display = "";
    consoleCompChip.replaceChildren(
      el("span", "lbl", displayLabel(S.filterApp, S.filterComp)),
      el("span", "x", "⨯"),
    );
  } else consoleCompChip.style.display = "none";

  // stick to the bottom while live rows stream in, unless scrolled up
  const pinned =
    consoleRows.scrollHeight -
      consoleRows.scrollTop -
      consoleRows.clientHeight <
    40;
  consoleRows.replaceChildren();

  const items = [];
  const q = S.consoleFilter;
  // the component filter (the sidebar's selection): a step matches when its
  // receive chain crossed the selected component — which covers everything
  // under it; effects follow their message's step
  const comp = S.filterComp;
  const inComp = (s) =>
    !comp ||
    (s.comps ?? []).some((c) => c === comp || c.startsWith(`${comp}.`));
  for (const appId of appIds())
    for (const s of stepsOf(appId)) {
      if (!inComp(s)) continue;
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
      if (S.filterApp === "all" && S.apps.size > 1)
        row.append(el("span", "num", appId));
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

// the console's right pane: the message / effect detail renderers
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

// the collapsed-branch summary: instead of a bare "{…}" it shows the first
// few entries inline, chrome-style — `{id: 1, name: "ann", …}` — so the eye
// can find a branch without opening it
const PREVIEW_PAIRS = 3;
const PREVIEW_VAL = 24;

const escPart = (s) => JSON.stringify(s).slice(1, -1);

// one value inside a collapsed preview, capped at a few dozen chars
const shortLeaf = (v, max) => {
  const k = kindOf(v);
  if (k === "string") {
    const s =
      v.length > max
        ? JSON.stringify(v.slice(0, max)) + "…"
        : JSON.stringify(v);
    return s.length > max + 3 ? JSON.stringify(v.slice(0, max - 1)) + "…" : s;
  }
  if (k === "number" || k === "boolean" || k === "null" || k === "undefined")
    return String(v);
  if (k === "date") return v.toISOString();
  if (k === "function") return v.name ? `ƒ ${v.name}()` : "ƒ ()";
  if (k === "array") return "[…]";
  if (k === "map") return "Map(…)";
  if (k === "set") return "Set(…)";
  return "{…}";
};

// the spans of a collapsed branch summary: colored key/value pairs instead
// of the bare ellipsis
function collapsedParts(kind, entries) {
  const p = [];
  const push = (cls, txt) => p.push(el("span", cls, txt));
  push(
    "",
    kind === "array"
      ? "["
      : kind === "map"
        ? "Map("
        : kind === "set"
          ? "Set("
          : "{",
  );
  const shown = entries.slice(0, PREVIEW_PAIRS);
  shown.forEach(([k, v], i) => {
    if (i) push("v-punc", ", ");
    if (kind === "object") {
      push("v-key", k);
      push("v-punc", ": ");
    } else if (kind === "map") {
      push("v-key", JSON.stringify(k));
      push("v-punc", " => ");
    }
    push("v-" + valClass(v), shortLeaf(v, PREVIEW_VAL));
  });
  if (entries.length > shown.length) push("v-punc", ", …");
  push("", kind === "array" ? "]" : kind === "object" ? "}" : ")");
  return p;
}

const URL_RE = /https?:\/\/[^\s"'<>\\]+/g;
// strings longer than this fold with a click-to-expand marker
const LONG_STR = 140;

// fills a value span with a quoted string, wrapping any http(s) URLs it
// contains in clickable links
function fillStringSpan(span, raw) {
  span.replaceChildren();
  span.append(el("span", "", '"'));
  let i = 0;
  for (const m of raw.matchAll(URL_RE)) {
    if (m.index > i)
      span.append(el("span", "", escPart(raw.slice(i, m.index))));
    const a = el("a", "v-url", m[0]);
    a.href = m[0];
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    // the row may have its own click (fold/unfold) — keep the link usable
    a.addEventListener("click", (ev) => ev.stopPropagation());
    span.append(a);
    i = m.index + m[0].length;
  }
  if (i < raw.length) span.append(el("span", "", escPart(raw.slice(i))));
  span.append(el("span", "", '"'));
}

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
  // per-viewer registry of branches, filled as rows are built — [0] is the
  // root (it registers before its children render). Search and the
  // expand/collapse-all buttons drive the tree through it instead of
  // synthesizing clicks
  const ctx = { branches: [] };
  root.append(vRow(null, value, "", key, 0, new Set(), ctx));
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
          const closed = ctx.branches.filter((b) => !b.isOpen());
          if (!closed.length) break;
          for (const b of closed) b.setOpen(true);
        }
      },
    ),
    iconButton(
      "collapse all branches",
      '<svg viewBox="0 0 16 16" width="11" height="11"><path d="M3 6l5-5 5 5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 12l5-5 5 5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
      () => {
        // ctx.branches[0] is the root — keep it open
        for (const b of ctx.branches.slice(1)) b.setOpen(false);
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

function vRow(key, v, path, vkey, depth, seen, ctx) {
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
    const valEl = el("span", "v-" + valClass(v));
    row.append(valEl);
    if (kind === "string") {
      // urls become links; long strings fold — click the row to unfold
      if (v.length > LONG_STR) {
        row.classList.add("longstr");
        let long = false;
        const render = () => {
          fillStringSpan(valEl, long ? v : v.slice(0, LONG_STR));
          if (!long)
            valEl.append(
              el("span", "v-more", ` … +${v.length - LONG_STR} chars`),
            );
        };
        row.addEventListener("click", () => {
          long = !long;
          render();
        });
        render();
      } else fillStringSpan(valEl, v);
      row.title = v;
    } else {
      const preview = vPreview(v);
      valEl.textContent = preview;
      row.title = preview;
    }
    return row;
  }
  const entries = vEntries(v);
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
  // devtools-style braces: collapsed shows the "{id: 1, …}" summary,
  // expanded shows the plain opening brace, the children, and the closer on
  // its own line at the parent's indent
  const openBrace =
    kind === "array"
      ? "["
      : kind === "map"
        ? "Map("
        : kind === "set"
          ? "Set("
          : "{";
  const closeBrace =
    kind === "array" ? "]" : kind === "map" ? ")" : kind === "set" ? ")" : "}";
  const arrow = el("span", "v-arrow", open ? "▾" : "▸");
  const braceEl = el("span", "v-brace");
  const renderBrace = () => {
    braceEl.replaceChildren(
      ...(open ? [el("span", "", openBrace)] : collapsedParts(kind, entries)),
    );
  };
  renderBrace();
  row.append(arrow, braceEl);
  // the count belongs to the collapsed summary — with the entries visible
  // it would just be noise next to the opening brace
  let countEl = null;
  if (kind === "array" || kind === "object") {
    countEl = el("span", "v-count", String(entries.length));
    if (open) countEl.style.display = "none";
    row.append(countEl);
  }
  const closer = el("div", "v-close", closeBrace);
  if (!open) closer.style.display = "none";
  const kids = el("div", "v-kids");
  let built = false;
  const build = () => {
    if (built) return;
    built = true;
    const next = new Set(seen);
    next.add(v);
    for (const [k, v2] of entries)
      kids.append(
        vRow(k, v2, path ? `${path}.${k}` : k, vkey, depth + 1, next, ctx),
      );
  };
  const setOpen = (want) => {
    if (want === open) {
      if (want) build();
      return;
    }
    open = want;
    if (open) {
      S.viewerShut.delete(pk);
      S.viewerOpen.add(pk);
      arrow.textContent = "▾";
      if (countEl) countEl.style.display = "none";
      closer.style.display = "";
      build();
      kids.style.display = "";
    } else {
      S.viewerOpen.delete(pk);
      S.viewerShut.add(pk);
      arrow.textContent = "▸";
      if (countEl) countEl.style.display = "";
      closer.style.display = "none";
      kids.style.display = "none";
    }
    renderBrace();
  };
  row.classList.add("tog");
  row.addEventListener("click", () => setOpen(!open));
  ctx.branches.push({ isOpen: () => open, setOpen, build });
  if (open) build();
  else kids.style.display = "none";
  const wrap = el("div", "v-branch");
  wrap.append(row, kids, closer);
  return wrap;
}

/* ---------------------------------------------------- message detail pane */

function renderMsgDetail(target, key) {
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

/* ----------------------------------------------------- effect detail pane */

function renderEffectDetail(target, uid) {
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
  // a selected app without a store must not silently fall back to another
  // app's store (storeAppId does) — say so instead
  const sel = S.filterApp !== "all" ? S.filterApp : null;
  if (!id || (sel && !S.apps.get(sel)?.hasStore)) {
    tab.append(
      el(
        "div",
        "empty-tab",
        !S.apps.size
          ? "no pavlus agent on this page yet…"
          : sel && S.apps.has(sel)
            ? "the selected app has no store plugin — pick another in the sidebar"
            : "none of the apps has a store plugin",
      ),
    );
    return;
  }

  // the toolbar: the sidebar toggle + the active component as a chip
  const storeBar = el("div", "");
  storeBar.id = "store-bar";
  const storeSideBtn = iconButton(
    "toggle the component sidebar — click a component to narrow the state and the timeline to it and its children",
    '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">' +
      '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
      '<rect x="3" y="4" width="3.4" height="8" rx="0.8" fill="currentColor"/></svg>',
    () => {
      S.storeSide = !S.storeSide;
      renderStore();
    },
  );
  storeSideBtn.classList.toggle("active", S.storeSide);
  storeBar.append(storeSideBtn);
  if (S.filterComp && S.apps.has(S.filterApp)) {
    const chip = el("button", "chip comp");
    chip.title = "clear the component filter";
    chip.append(
      el("span", "lbl", displayLabel(S.filterApp, S.filterComp)),
      el("span", "x", "⨯"),
    );
    chip.addEventListener("click", () => {
      S.filterApp = "all";
      S.filterComp = null;
      refresh();
    });
    storeBar.append(chip);
  }

  // the component sidebar (the console's one), then the two columns
  const storeWrap = el("div", "");
  storeWrap.id = "store-wrap";
  const side = el("div", "");
  side.id = "store-side";
  const sideBar = el("div", "divider-v");
  side.style.display = S.storeSide ? "" : "none";
  sideBar.style.display = S.storeSide ? "" : "none";
  if (S.storeSide) fillCompSide(side);
  applyFlex(side, S.split.storeSide);
  dragDivider(sideBar, (ev) => {
    const r = storeWrap.getBoundingClientRect();
    S.split.storeSide = clampFrac((ev.clientX - r.left) / r.width, 0.08, 0.4);
    applyFlex(side, S.split.storeSide);
  });
  storeWrap.append(side, sideBar);
  tab.append(storeBar, storeWrap);

  // the sidebar's selection (only when it belongs to this app): a keyed
  // component owns `state[key chain]`, a keyless one sees the slice of its
  // nearest keyed ancestor — the same rule as the Application tab
  const app = S.apps.get(id);
  const comp = S.filterApp === id ? S.filterComp : null;
  const kpOf = (p) => {
    const keys = app.compKeys ?? {};
    let at = p;
    while (at) {
      if (keys[at]) return keys[at];
      const dot = at.lastIndexOf(".");
      at = dot > 0 ? at.slice(0, dot) : "";
    }
    return undefined;
  };
  const kp = comp ? kpOf(comp) : undefined;
  // a change under the slice's key path is the component's own change
  const under = (p) => !kp || p === kp || p.startsWith(`${kp}.`);

  const cols = el("div", "cols");
  const vbar = el("div", "divider-v");
  dragDivider(vbar, (ev) => {
    const r = cols.getBoundingClientRect();
    S.split.store = clampFrac((ev.clientX - r.left) / r.width, 0.15, 0.85);
    applyFlex(stateBox, S.split.store);
  });

  const stateBox = el("div", "", "");
  stateBox.id = "store-state";
  stateBox.append(
    el("h3", "", `state — ${comp ? displayLabel(id, comp) : app.name}`),
  );
  if (comp)
    stateBox.append(
      el(
        "div",
        "tl-note",
        kp
          ? `state at ${kp}`
          : "no state key on its chain — this component sees the whole app state",
      ),
    );
  const whole = S.states.get(id) ?? null;
  let slice = whole;
  let vk = `state:${id}`;
  if (kp) {
    slice = kp
      .split(".")
      .reduce((o, k) => (o == null ? undefined : o[k]), whole);
    vk = `state:${id}:${kp}`;
  }
  if (slice === undefined)
    stateBox.append(
      el(
        "div",
        "tl-note",
        "no state at this key yet — it appears once the app writes it",
      ),
    );
  else stateBox.append(viewer(vk, slice));
  applyFlex(stateBox, S.split.store);

  const tlBox = el("div", "", "");
  tlBox.id = "store-timeline";
  const hist = S.hist.get(id) ?? [];
  const ghosts = S.redo.get(id) ?? [];
  const act = hist.length - 1;

  // Jumping to a step = undo the steps after it (they become redoable ghosts)
  // or redo until we land there. Shared with the Time travel tab.
  const jump = (i) => jumpTo(id, i);

  // how many of the changes touch the selected slice (all of them without a
  // component picked)
  const shown = hist.filter((h) => under(h.path)).length;
  const head = el("h3", "", "");
  head.append(
    el(
      "span",
      "",
      kp && shown < hist.length
        ? `timeline — ${shown} of ${hist.length} changes`
        : `timeline — ${hist.length} changes`,
    ),
  );
  const wrap = el("div", "");
  wrap.id = "stepper";
  const track = el("div", "track");
  hist.forEach((h, i) => {
    if (!under(h.path)) return;
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
    if (g && !under(g.path)) return;
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
  const ghostShown = ghosts.filter((g) => !g || under(g.path)).length;
  if (!shown && !ghostShown)
    tlRows.append(
      el(
        "div",
        "tl-note",
        kp
          ? "no changes under this component's state yet"
          : "every set/merge/remove lands here — click one to travel to that state; nothing is removed, you can always redo",
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
    // nothing hovered: pin the latest change under the filter so the pane
    // is never empty
    if (!c && hist.length) {
      let i = act;
      while (i >= 0 && !under(hist[i].path)) i--;
      if (i >= 0) c = { appId: id, idx: i, entry: hist[i], redo: false };
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
    if (!under(h.path)) return;
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
    if (g && !under(g.path)) return;
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
  storeWrap.append(cols);
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

// the tree's label for a component path: an each instance shows as
// `componentName.<key>` (its group's tag), anything else as its tag or last
// segment — one readable name, the raw path lives in the tooltip
function displayLabel(appId, p) {
  const dot = p.lastIndexOf(".");
  const parent = dot < 0 ? "" : p.slice(0, dot);
  const seg = dot < 0 ? p : p.slice(dot + 1);
  const tags = S.tags.get(appId) ?? {};
  if (parent && (S.apps.get(appId)?.eachGroups ?? []).includes(parent))
    return `${tags[parent] ?? parent.slice(parent.lastIndexOf(".") + 1)}.${seg}`;
  return tags[p] ?? seg;
}

/* ------------------------------------------------- component tree (shared) */

// Fills a sidebar column (Console, Store) with the shared component tree —
// one click on a node sets S.filterApp / S.filterComp and every view narrows
// to that component's subtree (an app node = the whole app).
function fillCompSide(box) {
  box.replaceChildren();
  if (!S.apps.size) {
    box.append(el("div", "empty-tab", "no pavlus agent on this page yet…"));
    return;
  }
  box.append(buildCompTree());
}

// The app / component tree, shared by the Application tab and the sidebars:
// one click sets the panel-wide selection (S.filterApp /
// S.filterComp) — every data view then narrows to that component's subtree.
function buildCompTree() {
  const tree = el("div", "a-tree");
  // a node may be open by default (the app, an `each` group holding the
  // rendered instances) unless it was explicitly shut
  const isOpen = (key, dflt) =>
    S.appsOpen.has(key) || (dflt && !S.appsShut.has(key));
  const toggle = (key, dflt) => {
    if (isOpen(key, dflt)) {
      S.appsOpen.delete(key);
      S.appsShut.add(key);
    } else {
      S.appsShut.delete(key);
      S.appsOpen.add(key);
    }
    refresh();
  };

  // react-devtools-style tree: app nodes with nested, collapsible component
  // branches. Components arrive as dotted paths ("users", "users.editor"),
  // so children group under their parent path; a display tag (the agent's
  // `tags`) replaces the last path segment as the label.
  for (const a of [...S.apps.values()]) {
    const appId = a.id;
    const paths = a.components ?? [];
    // path -> its child paths, in the agent's pre-order
    const kidsOf = new Map();
    for (const p of paths) {
      const dot = p.lastIndexOf(".");
      const parent = dot < 0 ? "" : p.slice(0, dot);
      if (!kidsOf.has(parent)) kidsOf.set(parent, []);
      kidsOf.get(parent).push(p);
    }
    // the `each` groups — keyed embeds' instance names, rendered as a node
    // of their own (named by the tag) holding the live instances; a cycle's
    // repeats (a component embedding itself) carry a badge pointing at the
    // root of the cycle — the walk shows one repeat deep, the rest folds
    const groups = new Set(a.eachGroups ?? []);
    const cycles = a.cycles ?? {};
    const cycleRoots = new Set(Object.values(cycles));

    const compRows = (parent, depth) => {
      const out = [];
      for (const p of kidsOf.get(parent) ?? []) out.push(branch(p, depth));
      return out;
    };

    // one tree row with its nested children; the label is the same readable
    // name the detail pane shows (an each instance: `user-row.4`)
    const branch = (p, depth) => {
      const label = displayLabel(appId, p);
      const hasKids = kidsOf.has(p);
      const key = `${appId}:${p}`;
      // a group is open unless shut: its instances are the page's rows,
      // what one opens the tree for
      const dflt = groups.has(p);
      const open = isOpen(key, dflt);
      const row = el(
        "div",
        "a-row" + (S.filterApp === appId && S.filterComp === p ? " sel" : ""),
      );
      const arrow = el("span", "a-arrow", hasKids ? (open ? "▾" : "▸") : "");
      if (hasKids)
        arrow.addEventListener("click", (ev) => {
          ev.stopPropagation();
          toggle(key, dflt);
        });
      row.append(arrow, el("span", "a-label", label));
      // a cycle: this node repeats a component up the chain (the badge jumps
      // to the cycle's root), or it is the root such repeats point back to
      const cyc = cycles[p];
      if (cyc !== undefined) {
        const jump = el("span", "a-badge cycle", "↻");
        jump.title = `cycle: repeats ${cyc || "the root"} — click to select the cycle's root`;
        jump.addEventListener("click", (ev) => {
          ev.stopPropagation();
          S.filterApp = appId;
          S.filterComp = cyc || null;
          refresh();
        });
        row.append(jump);
      } else if (cycleRoots.has(p)) {
        const root = el("span", "a-badge cycle", "↻");
        root.title = "the root of a cycle — this component repeats below";
        row.append(root);
      }
      row.title = `${p} — click to inspect its state, io and messages`;
      row.addEventListener("click", () => {
        S.filterApp = appId;
        S.filterComp = p;
        refresh();
      });
      const wrap = el("div", "a-branch");
      wrap.append(row);
      if (hasKids) {
        const kids = el("div", "a-kids");
        if (!open) kids.style.display = "none";
        kids.append(...compRows(p, depth + 1));
        wrap.append(kids);
      }
      return wrap;
    };

    // the app node: click inspects the app, the arrow folds its tree
    const appKey = `${appId}:`;
    const appOpen = isOpen(appKey, true);
    const appRow = el(
      "div",
      "a-row app" + (S.filterApp === appId && !S.filterComp ? " sel" : ""),
    );
    const appArrow = el(
      "span",
      "a-arrow",
      paths.length ? (appOpen ? "▾" : "▸") : "",
    );
    if (paths.length)
      appArrow.addEventListener("click", (ev) => {
        ev.stopPropagation();
        toggle(appKey, true);
      });
    appRow.append(appArrow, el("span", "a-label", a.name));
    if (a.hasStore) appRow.append(el("span", "a-badge store", "store"));
    appRow.append(el("span", "a-badge", `${stepsOf(appId).length} msg`));
    appRow.title = `${appId} — click to inspect the app`;
    appRow.addEventListener("click", () => {
      S.filterApp = appId;
      S.filterComp = null;
      refresh();
    });
    const appWrap = el("div", "a-branch");
    appWrap.append(appRow);
    if (paths.length) {
      const kids = el("div", "a-kids");
      if (!appOpen) kids.style.display = "none";
      kids.append(...compRows("", 1));
      appWrap.append(kids);
    }
    tree.append(appWrap);
  }
  return tree;
}

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

  appsTree.append(buildCompTree());
  const wired = apps.every((a) => (a.components ?? []).length);
  appsTree.append(
    el(
      "div",
      "tl-note",
      wired
        ? "click a component to see its store slice, input / output and messages on the right"
        : "click an app to inspect it on the right — an app without components was wired without `app` in createPavlusDebug",
    ),
  );
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

  // steps that reached the selected component's subtree: the receive chain
  // includes every ancestor boundary (so an exact match covers the
  // descendants), and an `each` group is not a boundary — its instances are
  // `group.<key>` paths, matched by the prefix
  const inComp = (s) => {
    const p = S.filterComp;
    if (!p) return true;
    return (s.comps ?? []).some((c) => c === p || c.startsWith(`${p}.`));
  };

  if (S.appsView === "io") {
    const comp = S.filterComp ?? "";
    // the subtree's observed io: the component's bucket plus every path
    // under it (a group's io lives in its instances' buckets; the root
    // aggregates everything)
    const ioOf = S.io.get(id);
    const buckets = [];
    if (ioOf) {
      if (comp) {
        for (const [p, b] of ioOf)
          if (p === comp || p.startsWith(`${comp}.`)) buckets.push(b);
      } else buckets.push(...ioOf.values());
    }
    // merge: a message passes every ancestor boundary, so the shallowest
    // bucket already counted the whole subtree — keep the max per id, not a
    // sum; effects land on the deepest boundary only — sum
    const input = new Map();
    const output = new Map();
    for (const b of buckets) {
      for (const [mid, v] of b.input) {
        const cur = input.get(mid);
        if (cur) {
          cur.n = Math.max(cur.n, v.n);
          cur.at = Math.max(cur.at, v.at);
        } else input.set(mid, { ...v });
      }
      for (const [k, v] of b.output) {
        const cur = output.get(k);
        if (cur) {
          cur.n += v.n;
          cur.at = Math.max(cur.at, v.at);
        } else output.set(k, { ...v });
      }
    }
    const head = el("div", "detail-head");
    head.append(
      el("span", "id", comp ? displayLabel(id, comp) : "(root)"),
      el(
        "span",
        "num",
        comp ? "observed input / output — incl. children" : "whole app",
      ),
    );
    appsDetail.append(head);
    if (!input.size && !output.size)
      appsDetail.append(
        el(
          "div",
          "tl-note",
          "nothing observed yet — input messages and output effects appear here as the app runs",
        ),
      );
    if (input.size) {
      appsDetail.append(el("h4", "", "input — messages received"));
      const rows = [...input.entries()].sort(
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
    if (output.size) {
      appsDetail.append(el("h4", "", "output — effects produced"));
      const rows = [...output.entries()].sort(
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
            ? "no messages reached this component or its children yet"
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
      row.title = "click to inspect the message in the Console";
      row.addEventListener("click", () => {
        S.consoleSel = { k: "msg", key };
        showTab("console");
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
      row.title = `message "${s.message.id}" — click to inspect in the Console`;
      row.addEventListener("click", () => {
        S.consoleSel = { k: "fx", uid: e.uid };
        S.consoleChip = "all"; // make sure the row is not hidden by a plugin chip
        showTab("console");
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
    // the same readable name the tree shows (an each instance:
    // `user-row.4`); the raw path stays in the tree's tooltips
    facts.unshift(["component", displayLabel(id, S.filterComp)]);
  }
  for (const [k, v] of facts) {
    const line = el("div", "detail-line", `${k} `);
    line.append(el("span", "id", v));
    appsDetail.append(line);
  }

  // a keyed component owns `state[key chain]`; a keyless one sees the slice
  // of its nearest keyed ancestor (a `key` child up the path), and a fully
  // keyless chain sees the whole app state — nothing narrower to show
  const kpOf = (p) => {
    const keys = app.compKeys ?? {};
    let at = p;
    while (at) {
      if (keys[at]) return keys[at];
      const dot = at.lastIndexOf(".");
      at = dot > 0 ? at.slice(0, dot) : "";
    }
    return undefined;
  };
  const kp = S.filterComp ? kpOf(S.filterComp) : undefined;
  const whole = S.states.get(id) ?? null;
  let slice = whole;
  let vk = `state:${id}`;
  if (kp) {
    slice = kp
      .split(".")
      .reduce((o, k) => (o == null ? undefined : o[k]), whole);
    vk = `state:${id}:${kp}`;
  }
  if (S.filterComp) {
    appsDetail.append(
      el(
        "div",
        "tl-note",
        kp
          ? `state at ${kp}`
          : "no state key on its chain — this component sees the whole app state",
      ),
    );
  }
  appsDetail.append(el("h4", "", "state"));
  if (slice === undefined)
    appsDetail.append(
      el(
        "div",
        "tl-note",
        "no state at this key yet — it appears once the app writes it",
      ),
    );
  else appsDetail.append(viewer(vk, slice));
}

/* ------------------------------------------------------------------- boot */

refresh();
