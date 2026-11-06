/**
 * Keeps the ports open between the devtools panel (and/or the standalone
 * popup window) and the content script of one tab. The port name carries
 * the tab id (`pavlus@<tabId>`); a tab can have several panels at once
 * (devtools + popup), so each tab owns a Set of ports.
 */

// The promise-based APIs live on `browser` in Firefox and on `chrome` in
// Chrome (the Firefox `chrome` namespace is callback-only).
const api = typeof browser !== "undefined" ? browser : chrome;

const ports = new Map(); // tabId -> Set<port>
const popupWins = new Map(); // tabId -> window id of its standalone panel

function portsOf(tabId) {
  let set = ports.get(tabId);
  if (!set) {
    set = new Set();
    ports.set(tabId, set);
  }
  return set;
}

chrome.runtime.onConnect.addListener((port) => {
  const tabId = Number(port.name.split("@")[1]);
  if (!Number.isFinite(tabId)) return;
  const set = portsOf(tabId);
  set.add(port);

  // A standalone panel runs panel.html?tab=<id> (the devtools panel runs
  // the same page without a query). Remember its window so the shortcut
  // can focus it instead of opening a duplicate — the service worker
  // forgets this map whenever it suspends, but the panel reconnects (and
  // re-registers here) right after every wake.
  const query = port.sender?.url?.split("?")[1];
  const ownTab = query ? Number(new URLSearchParams(query).get("tab")) : null;
  const winId = ownTab === tabId ? port.sender?.tab?.windowId : undefined;
  if (winId != null) popupWins.set(tabId, winId);
  port.onDisconnect.addListener(() => {
    set.delete(port);
    if (!set.size) ports.delete(tabId);
    if (winId != null && popupWins.get(tabId) === winId)
      popupWins.delete(tabId);
  });

  // Panel → content script → page. The content script only accepts
  // messages wrapped as { __pavlus, payload }.
  port.onMessage.addListener((msg) => {
    api.tabs.sendMessage(tabId, { __pavlus: true, payload: msg }).catch(() => {
      /* no content script in that tab (e.g. a chrome:// page) */
    });
  });
});

// Content script → every panel of that tab.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.__pavlus && sender.tab) {
    const set = ports.get(sender.tab.id);
    if (set) for (const port of set) port.postMessage(msg.payload);
  }
});

// A document (re)load drops the page-side agent. The devtools panel hears
// about it from chrome.devtools.network.onNavigated; the standalone window
// has no devtools API, so tell every panel of the tab ourselves.
api.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== "loading") return;
  const set = ports.get(tabId);
  if (set) for (const port of set) port.postMessage({ __pavlusNav: true });
});

// Cmd/Ctrl+Shift+V opens (or focuses) the standalone panel window for the
// active tab. Chrome only — the Firefox manifest declares no commands.
chrome.commands?.onCommand.addListener((command) => {
  if (command !== "open-panel") return;
  api.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    if (!tab || tab.id == null) return;
    const open = popupWins.get(tab.id);
    if (open != null) {
      // Already open for this tab — bring it forward.
      api.windows.update(open, { focused: true }).catch(() => {
        popupWins.delete(tab.id);
        openPopup(tab.id);
      });
      return;
    }
    openPopup(tab.id);
  });
});

function openPopup(tabId) {
  const W = 1100;
  const H = 720;
  api.windows
    .create({
      url: `panel.html?tab=${tabId}`,
      type: "popup",
      width: W,
      height: H,
    })
    .then((win) => {
      popupWins.set(tabId, win.id);
      // Chrome ignores the create bounds when the active window is maximized
      // or fullscreen — the popup then opens fullscreen too. Re-applying an
      // explicit normal state and the bounds fixes that.
      api.windows
        .update(win.id, { state: "normal" })
        .then(() => api.windows.update(win.id, { width: W, height: H }))
        .catch(() => {
          /* the window was closed again already */
        });
    });
}
