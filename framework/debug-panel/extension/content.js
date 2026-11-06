/**
 * Relays between the page (the pavlus debug agent) and the extension.
 *
 * The agent speaks `window.postMessage` with `source: "__pavlus_agent__"`;
 * the panel answers through the background worker, which forwards here and
 * ends up as `window.postMessage` with `source: "__pavlus_panel__"`.
 *
 * Content scripts run in an isolated world, but `postMessage` crosses
 * worlds, so no main-world injection is needed.
 */

const AGENT = "__pavlus_agent__";
const PANEL = "__pavlus_panel__";

// The promise-based APIs live on `browser` in Firefox and on `chrome` in
// Chrome (the Firefox `chrome` namespace is callback-only).
const api = typeof browser !== "undefined" ? browser : chrome;

window.addEventListener("message", (ev) => {
  const d = ev.data;
  if (d && d.source === AGENT)
    api.runtime.sendMessage({ __pavlus: true, payload: d }).catch(() => {
      /* the panel is not open; nothing to relay to */
    });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.__pavlus && msg.payload && msg.payload.source === PANEL)
    window.postMessage(msg.payload, "*");
});

// Announce the panel in case an agent already exists (it answers with a
// replay). An agent that registers later is picked up by the panel's
// periodic hello or the "rescan" button.
window.postMessage({ source: PANEL, cmd: "hello" }, "*");
