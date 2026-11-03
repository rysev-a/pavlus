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
  chip: "all", // "all" | plugin name
  selectedMsg: null, // message inspected on the right: `${appId}:${seq}`
  details: new Set(), // effect rows with the detail JSON open: uid
  tlShow: null, // change previewed under the timeline: {appId, idx, entry, redo}
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

const stepsOf = (id) => S.steps.get(id) ?? [];

function send(cmd, appId, extra = {}) {
  port.postMessage({ source: PANEL, cmd, appId, ...extra });
}

/* --------------------------------------------------------------- protocol */

let sawHello = false;

function sendHello() {
  port.postMessage({ source: PANEL, cmd: "hello" });
}

function applyHello(h) {
  sawHello = true;
  for (const app of h.apps ?? []) {
    S.apps.set(app.id, app);
    S.steps.set(app.id, []);
    S.hist.set(app.id, []);
    S.redo.set(app.id, Array(h.redo?.[app.id] ?? 0).fill(null));
    if (app.id in (h.state ?? {})) S.states.set(app.id, h.state[app.id]);
    if (app.id in (h.history ?? {})) S.hist.set(app.id, [...h.history[app.id]]);
  }
  for (const e of h.replay ?? []) applyEvent(e);
  refresh();
}

function applyEvent(e) {
  switch (e.type) {
    case "step": {
      const list = S.steps.get(e.appId) ?? [];
      list.push(e);
      if (list.length > MAX_ROWS) list.shift();
      S.steps.set(e.appId, list);
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
// (rescan button, page navigation).
setInterval(() => {
  if (!sawHello) sendHello();
}, 2000);

chrome.devtools.network.onNavigated.addListener(() => {
  sawHello = false;
  S.apps.clear();
  S.steps.clear();
  S.states.clear();
  S.hist.clear();
  S.redo.clear();
  S.waits.clear();
  S.selectedMsg = null;
  S.tlShow = null;
  S.viewerOpen.clear();
  S.viewerShut.clear();
  S.details.clear();
  refresh();
});

$("#rescan").addEventListener("click", () => {
  sawHello = false;
  sendHello();
});

/* ------------------------------------------------------------------- tabs */

let active = "messages";

for (const b of document.querySelectorAll("#tabs button"))
  b.addEventListener("click", () => {
    active = b.dataset.tab;
    for (const x of document.querySelectorAll("#tabs button"))
      x.classList.toggle("active", x === b);
    for (const x of document.querySelectorAll(".tab"))
      x.classList.toggle("active", x.id === "tab-" + active);
    refresh();
  });

const messagesRows = el("div", "rows");
const msgDetail = el("div", "");
msgDetail.id = "msg-detail";
$("#tab-messages").append(messagesRows, msgDetail);

let refreshQueued = false;
function refresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => {
    refreshQueued = false;
    renderStatus();
    if (active === "messages") renderMessages();
    else if (active === "effects") renderEffects();
    else if (active === "store") renderStore();
    else renderApps();
  });
}

function renderStatus() {
  const apps = [...S.apps.values()];
  const dot = $("#dot");
  dot.className = apps.length ? "on" : sawHello ? "wait" : "off";
  $("#status").textContent = apps.length
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

function viewer(key, value) {
  const root = el("div", "viewer");
  root.append(vRow(null, value, "", key, 0, new Set()));
  return root;
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
    row.append(el("span", "v-" + valClass(v), vPreview(v)));
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
  messagesRows.replaceChildren();
  const all = appIds().flatMap((id) => stepsOf(id).map((s) => [s, id]));
  all.sort((a, b) => a[0].time - b[0].time || a[0].seq - b[0].seq);
  if (!all.length) {
    messagesRows.append(
      el("div", "empty-tab", "no messages yet — dispatch one in the app"),
    );
    renderMsgDetail();
    return;
  }
  for (const [s, appId] of [...all].reverse().slice(0, MAX_ROWS)) {
    const key = `${appId}:${s.seq}`;
    const row = el("div", "row" + (S.selectedMsg === key ? " sel" : ""));
    row.append(
      el("span", "t", fmtTime(s.time)),
      el("span", "id", s.message.id),
      el("span", "sum", shortJson(s.message.payload ?? s.message.event)),
      el("span", "num", `${s.effects.length} eff`),
    );
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

function renderMsgDetail() {
  msgDetail.replaceChildren();
  const key = S.selectedMsg;
  if (!key) {
    msgDetail.append(
      el("div", "empty-tab", "click a message on the left to inspect it here"),
    );
    return;
  }
  const sep = key.lastIndexOf(":");
  const appId = key.slice(0, sep);
  const s = stepsOf(appId).find((x) => String(x.seq) === key.slice(sep + 1));
  if (!s) {
    msgDetail.append(
      el(
        "div",
        "empty-tab",
        "that message is gone from the recording — rescan",
      ),
    );
    return;
  }
  const head = el("div", "detail-head");
  head.append(
    el("span", "id", s.message.id),
    el("span", "t", fmtTime(s.time)),
    el("span", "num", `${s.effects.length} effects`),
  );
  msgDetail.append(head);

  msgDetail.append(el("h4", "", "payload"));
  msgDetail.append(viewer(`msg:${key}`, s.message.payload ?? s.message.event));

  const effects = el("div", "detail-sec");
  effects.append(el("h4", "", `effects — ${s.effects.length}`));
  if (!s.effects.length) effects.append(el("div", "erow", "no effects"));
  for (const e of s.effects) {
    const er = el("div", "erow" + (S.details.has(e.uid) ? " sel" : ""));
    er.append(
      el("span", "plug", `${e.plugin}:${e.type}`),
      el("span", "sum", e.summary),
    );
    if (e.dur !== undefined) er.append(el("span", "num dur", `${e.dur}ms`));
    const wait = S.waits.get(e.uid);
    if (wait !== undefined) er.append(el("span", "num wait", `⧗${wait}ms`));
    er.title = "click for the raw effect object";
    er.addEventListener("click", () => {
      S.details.has(e.uid) ? S.details.delete(e.uid) : S.details.add(e.uid);
      renderMsgDetail();
    });
    effects.append(er);
    if (S.details.has(e.uid)) effects.append(viewer(`fx:${e.uid}`, e.detail));
  }
  msgDetail.append(effects);
}

/* ---------------------------------------------------------------- effects */

function renderEffects() {
  const chips = $("#chips");
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

  const rows = $("#effect-rows");
  rows.replaceChildren();
  const all = appIds().flatMap((id) =>
    stepsOf(id).flatMap((s) => s.effects.map((e) => [e, s, id])),
  );
  const list = all.filter(([e]) => S.chip === "all" || e.plugin === S.chip);
  list.sort((a, b) => b[0].time - a[0].time || b[1].seq - a[1].seq);
  if (!list.length) {
    rows.append(
      el("div", "empty-tab", "no effects yet — dispatch a message in the app"),
    );
    return;
  }
  for (const [e, s, appId] of list.slice(0, MAX_ROWS)) {
    const row = el("div", "row" + (S.details.has(e.uid) ? " sel" : ""));
    row.append(
      el("span", "t", fmtTime(e.time)),
      el("span", "plug", `${e.plugin}:${e.type}`),
      el("span", "sum", e.summary),
    );
    if (e.dur !== undefined) row.append(el("span", "num dur", `${e.dur}ms`));
    const wait = S.waits.get(e.uid);
    if (wait !== undefined) row.append(el("span", "num wait", `⧗${wait}ms`));
    if (S.filterApp === "all") row.append(el("span", "app", appId));
    row.title = `message "${s.message.id}" — click for the effect object`;
    row.addEventListener("click", () => {
      S.details.has(e.uid) ? S.details.delete(e.uid) : S.details.add(e.uid);
      renderEffects();
    });
    rows.append(row);
    if (S.details.has(e.uid)) {
      const sub = el("div", "sub");
      const pre = el("pre", "", JSON.stringify(e.detail, null, 2));
      sub.append(pre);
      rows.append(sub);
    }
  }
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

  const stateBox = el("div", "", "");
  stateBox.id = "store-state";
  stateBox.append(el("h3", "", `state — ${S.apps.get(id).name}`));
  stateBox.append(viewer("state", S.states.get(id) ?? null));

  const tlBox = el("div", "", "");
  tlBox.id = "store-timeline";
  const hist = S.hist.get(id) ?? [];
  const ghosts = S.redo.get(id) ?? [];
  const act = hist.length - 1;

  // Jumping to a step = undo the steps after it (they become redoable ghosts)
  // or redo until we land there. history± events keep the ghosts in sync.
  const jump = (i) => {
    if (i === act) return;
    if (i < act) {
      const steps = act - i;
      S.redo.set(id, [...hist.slice(hist.length - steps), ...ghosts]);
      send("undo", id, { steps });
    } else {
      for (let n = i - act; n > 0; n--) send("redo", id);
    }
  };

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
  back.addEventListener("click", () => {
    S.redo.set(id, [hist.at(-1) ?? null, ...(S.redo.get(id) ?? [])]);
    send("undo", id);
  });
  const fwd = el("button", "", "forward ⟶");
  fwd.disabled = !ghosts.length;
  fwd.addEventListener("click", () => send("redo", id));
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
    if (!c) {
      detail.append(
        el(
          "div",
          "tl-note",
          "hover a change to preview it here — click it to travel to that state",
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
  tlBox.append(tlRows, detail);

  cols.append(stateBox, tlBox);
  tab.append(cols);
  // keep the active step in view (the stepper can overflow on long histories)
  const actBtn = wrap.querySelector(".active");
  if (actBtn)
    wrap.scrollLeft =
      actBtn.offsetLeft - wrap.clientWidth / 2 + actBtn.offsetWidth / 2;
}

/* ------------------------------------------------------------------- apps */

function renderApps() {
  const tab = $("#tab-apps");
  tab.replaceChildren();
  const apps = [...S.apps.values()];
  if (!apps.length) {
    tab.append(el("div", "empty-tab", "no pavlus agent on this page yet…"));
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
  // rows, one step of indent per level under the app.
  const rowsOf = (a) =>
    (a.components ?? []).map((p) => ({
      path: p,
      label: p.slice(p.lastIndexOf(".") + 1),
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

  const rootX = width / 2 - NODE_W / 2;
  const root = node(rootX, 8, NODE_W, NODE_H, "all apps", {
    sel: S.filterApp === "all",
    on: () => {
      S.filterApp = "all";
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
        sel,
        title: r.path,
        on: () => {
          S.filterApp = appId;
          refresh();
        },
      });
      drawn.set(r.path, { x: nx, bottom: y + COMP_H });
      y += COMP_H + V_GAP;
    }
    x += c.w + GAP;
  }

  tab.append(svg);
  const wired = apps.every((a) => (a.components ?? []).length);
  const note = el(
    "div",
    "tl-note",
    wired
      ? "click an app or one of its components to filter messages and effects"
      : "click a node to filter messages and effects — an app without components was wired without `app` in createPavlusDebug",
  );
  tab.append(note);
}

/* ------------------------------------------------------------------- boot */

refresh();
