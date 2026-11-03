/**
 * Keeps one port per inspected tab open between the devtools panel and the
 * content script. The port name carries the tab id
 * (`pavlus@<tabId>`), so several devtools windows can be open at once.
 */

// The promise-based APIs live on `browser` in Firefox and on `chrome` in
// Chrome (the Firefox `chrome` namespace is callback-only).
const api = typeof browser !== "undefined" ? browser : chrome;

const ports = new Map();

chrome.runtime.onConnect.addListener((port) => {
  const tabId = Number(port.name.split("@")[1]);
  if (!Number.isFinite(tabId)) return;
  ports.set(tabId, port);
  port.onDisconnect.addListener(() => ports.delete(tabId));
  // Panel → content script → page. The content script only accepts
  // messages wrapped as { __pavlus, payload }.
  port.onMessage.addListener((msg) => {
    api.tabs.sendMessage(tabId, { __pavlus: true, payload: msg }).catch(() => {
      /* no content script in that tab (e.g. a chrome:// page) */
    });
  });
});

// Content script → port → panel.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.__pavlus && sender.tab) {
    const port = ports.get(sender.tab.id);
    if (port) port.postMessage(msg.payload);
  }
});
