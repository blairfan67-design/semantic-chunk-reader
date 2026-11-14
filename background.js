// Background service worker: the only part that talks to the backend.
// Side panel  -> background -> content script (extract) -> backend -> content script (paint)

// Change this to your Render/Railway URL once the backend is deployed.
const BACKEND_URL = "http://localhost:8000";

// Clicking the toolbar icon opens the side panel.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

async function callBackend(path, body) {
  const res = await fetch(BACKEND_URL + path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function activeTabId() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) throw new Error("No active tab");
  return tab.id;
}

// Send a message to the page. If the content script isn't there yet (tab was
// open before the extension was (re)loaded), inject it and try again.
async function sendToTab(tabId, msg) {
  try {
    return await chrome.tabs.sendMessage(tabId, msg);
  } catch (e) {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["lib/Readability.js", "shared/roles.js", "highlight.js", "content.js"],
    });
    return await chrome.tabs.sendMessage(tabId, msg);
  }
}

async function analyzeActiveTab() {
  const tabId = await activeTabId();
  const extracted = await sendToTab(tabId, { type: "EXTRACT" });
  const { paragraphs, title } = extracted.data;
  if (!paragraphs.length) throw new Error("Couldn't find an article on this page.");

  const { highlights } = await callBackend("/analyze", { paragraphs });
  const painted = await sendToTab(tabId, { type: "APPLY_HIGHLIGHTS", highlights });
  return { title, paragraphs: paragraphs.length, highlights, ...painted.data };
}

const handlers = {
  HEALTH: () => callBackend("/health"),
  ANALYZE_ACTIVE_TAB: analyzeActiveTab,
  SIMPLIFY: (msg) => callBackend("/simplify", { sentence: msg.sentence }),
  // Forward simple commands straight to the page:
  PING_TAB: async () => sendToTab(await activeTabId(), { type: "PING", from: "side panel" }),
  SET_VISIBLE: async (msg) => sendToTab(await activeTabId(), msg),
  CLEAR: async (msg) => sendToTab(await activeTabId(), msg),
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = handlers[msg.type];
  if (!handler) return false;
  Promise.resolve(handler(msg))
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
  return true; // keep the channel open for the async response
});
