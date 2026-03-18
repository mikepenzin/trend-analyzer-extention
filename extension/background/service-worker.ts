import type { AnalysisMode, CapturePayload, PageContext } from "../types";

// Replace this with your Vercel deployment URL before distributing the extension.
// Leave as localhost for local development.
const DEFAULT_API_BASE_URL = __API_BASE_URL__;

const ICONS_LIGHT = { "16": "icons/icon16.png", "32": "icons/icon32.png", "64": "icons/icon64.png", "128": "icons/icon128.png" };
const ICONS_DARK  = { "16": "icons/icon16-dark.png", "32": "icons/icon32-dark.png", "64": "icons/icon64-dark.png", "128": "icons/icon128-dark.png" };

async function updateIcon(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    });
    const isDark = results?.[0]?.result ?? false;
    await chrome.action.setIcon({ path: isDark ? ICONS_DARK : ICONS_LIGHT });
  } catch { /* ignore — tab may not allow scripting */ }
}

type RuntimeRequest =
  | { type: "GET_ACTIVE_TAB_INFO" }
  | { type: "CAPTURE_PAGE_CONTEXT"; mode: AnalysisMode }
  | { type: "GET_SETTINGS" }
  | { type: "SET_SETTINGS"; apiBaseUrl: string; provider?: string };

// Notify sidepanel when the active tab's title or URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab.active) return;
  void updateIcon();
  if (!changeInfo.title && !changeInfo.url) return;
  chrome.runtime.sendMessage({
    type: "TAB_UPDATED",
    title: tab.title ?? "",
    url: tab.url ?? "",
  }).catch(() => { /* sidepanel may not be open */ });
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  void updateIcon();
  const tab = await chrome.tabs.get(activeInfo.tabId);
  chrome.runtime.sendMessage({
    type: "TAB_UPDATED",
    title: tab.title ?? "",
    url: tab.url ?? "",
  }).catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => {
  void updateIcon();
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
    console.warn("Unable to enable side panel auto-open behavior.");
  });
});

chrome.runtime.onMessage.addListener((message: RuntimeRequest, _sender, sendResponse) => {
  void (async () => {
    try {
      if (message.type === "GET_ACTIVE_TAB_INFO") {
        const tab = await getActiveTab();
        const url = tab.url ?? "";
        const title = tab.title ?? "Untitled page";
        sendResponse({
          title,
          url,
          isTradingView: url.includes("tradingview.com"),
          detectedMode: detectMode(url, title),
        });
        return;
      }

      if (message.type === "GET_SETTINGS") {
        const settings = await chrome.storage.local.get({ apiBaseUrl: DEFAULT_API_BASE_URL, provider: "gemini" });
        sendResponse(settings);
        return;
      }

      if (message.type === "SET_SETTINGS") {
        const data: Record<string, string> = { apiBaseUrl: message.apiBaseUrl.trim() || DEFAULT_API_BASE_URL };
        if (message.provider) data.provider = message.provider;
        await chrome.storage.local.set(data);
        sendResponse({ ok: true });
        return;
      }

      if (message.type === "CAPTURE_PAGE_CONTEXT") {
        const payload = await capturePageContext(message.mode);
        sendResponse(payload);
      }
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Unknown extension error.";
      sendResponse({ error: messageText });
    }
  })();

  return true;
});

async function capturePageContext(mode: AnalysisMode): Promise<CapturePayload> {
  const tab = await getActiveTab();
  if (!tab.id) {
    throw new Error("Active tab is missing an id.");
  }

  const pageContext = await requestPageContext(tab.id, mode);
  const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });

  return { pageContext, screenshot };
}

async function requestPageContext(tabId: number, mode: AnalysisMode): Promise<PageContext> {
  // Try sending to the content script. If it's not running (e.g. the extension
  // was reloaded while the tab stayed open), inject it first and retry.
  let response: (PageContext & { error?: string }) | null = null;

  try {
    response = await chrome.tabs.sendMessage(tabId, { type: "EXTRACT_PAGE_CONTEXT", mode });
  } catch {
    // Orphaned or never-injected content script — inject now and retry once.
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["dist/content/extractor.js"],
    });
    response = await chrome.tabs.sendMessage(tabId, { type: "EXTRACT_PAGE_CONTEXT", mode });
  }

  if (!response) {
    throw new Error("Content script did not return page context.");
  }

  if (response.error) {
    throw new Error(response.error);
  }

  return response as PageContext;
}

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    throw new Error("No active tab found.");
  }
  return tab;
}

function detectMode(url: string, title: string): Exclude<AnalysisMode, "auto"> {
  const value = `${url} ${title}`.toLowerCase();
  if (value.includes("tradingview")) {
    return "chart";
  }
  if (value.includes("dashboard") || value.includes("analytics") || value.includes("metrics")) {
    return "ui";
  }
  return "page";
}

