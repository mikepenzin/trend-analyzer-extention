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
  | { type: "SET_SETTINGS"; apiBaseUrl: string; provider?: string }
  | { type: "EXECUTE_TV_ACTION"; action: string; value?: string }
  | { type: "SHOW_OVERLAY" }
  | { type: "UPDATE_OVERLAY"; step: string; status: "running" | "done" | "error" }
  | { type: "HIDE_OVERLAY" }
  | { type: "EXTRACT_SYMBOL" };

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

      if (message.type === "EXECUTE_TV_ACTION") {
        await executeTVAction(message.action, message.value);
        // Wait for TradingView to visually update before the sidepanel re-captures
        // Zoom-out needs more time (20 keypresses × 80ms + render)
        const waitMs = message.action === "zoom_out" ? 5000 : 3000;
        await new Promise(r => setTimeout(r, waitMs));
        sendResponse({ ok: true });
        return;
      }

      if (message.type === "SHOW_OVERLAY" || message.type === "UPDATE_OVERLAY" || message.type === "HIDE_OVERLAY") {
        const tab = await getActiveTab();
        if (!tab.id) { sendResponse({ ok: false }); return; }
        try {
          await chrome.tabs.sendMessage(tab.id, message);
        } catch {
          // Content script not ready — inject then retry
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["dist/content/extractor.js"] });
          await chrome.tabs.sendMessage(tab.id, message);
        }
        sendResponse({ ok: true });
        return;
      }

      if (message.type === "EXTRACT_SYMBOL") {
        const tab = await getActiveTab();
        const title = tab.title ?? "";
        // Parse TradingView title: "AAPL, D — TradingView" or "NASDAQ:AAPL 1D" etc.
        const m = title.match(/^([A-Z0-9]+:[A-Z0-9.]+)/i) || title.match(/^([A-Z0-9.]+)/i);
        const symbol = m ? m[1] : "";
        sendResponse({ symbol });
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

async function executeTVAction(action: string, value?: string): Promise<void> {
  const tab = await getActiveTab();
  if (!tab.id) throw new Error("No active tab id.");

  if (action === "change_timeframe" && value) {
    const tvButtonText: Record<string, string> = {
      "1D": "1D", "D": "1D",
      "1W": "1W", "W": "1W",
      "1M": "1M", "M": "1M",
      "3D": "3D",
      "4H": "4h", "4h": "4h",
      "1H": "1h", "1h": "1h",
      "15m": "15m", "15": "15m",
      "5m": "5m", "5": "5m",
      "1m": "1m", "1": "1m",
    };
    const btnText = tvButtonText[value] ?? value;
    // Also try single-letter variant (TradingView shows "D", "W", "M" as short forms)
    const shortMap: Record<string, string> = { "1D": "D", "1W": "W", "1M": "M" };
    const shortText = shortMap[btnText] ?? null;

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: (targetText: string, altText: string | null) => {
        console.log("[TrendAnalyzer] Switching timeframe to:", targetText, "alt:", altText);

        function clickMatchingElement(root: Element, texts: string[]): boolean {
          // BFS through all visible elements looking for exact text match
          const candidates = root.querySelectorAll('button, div[role="button"], [class*="button"], span, a');
          for (const el of candidates) {
            const htmlEl = el as HTMLElement;
            if (!htmlEl.offsetParent && htmlEl.style.display !== "contents") continue; // hidden
            const t = htmlEl.textContent?.trim();
            if (!t || !texts.includes(t)) continue;
            // Prefer leaf-ish elements
            if (htmlEl.children.length > 3) continue;
            console.log("[TrendAnalyzer] ✓ Clicking:", htmlEl.tagName, JSON.stringify(t));
            htmlEl.click();
            return true;
          }
          return false;
        }

        const texts = altText ? [targetText, altText] : [targetText];

        // Strategy 1: Header toolbar intervals
        const toolbar = document.querySelector('[id*="header-toolbar-intervals"]');
        if (toolbar && clickMatchingElement(toolbar, texts)) return;

        // Strategy 2: Any element in the top section
        const header = document.querySelector('header') ?? document.querySelector('[class*="header"]');
        if (header && clickMatchingElement(header, texts)) return;

        // Strategy 3: Scan all elements above the chart (top 100px)
        const allEls = document.querySelectorAll('button, div[role="button"], span, a');
        for (const el of allEls) {
          const htmlEl = el as HTMLElement;
          const rect = htmlEl.getBoundingClientRect();
          if (rect.top > 50 || rect.height < 5 || rect.height > 40) continue;
          const t = htmlEl.textContent?.trim();
          if (t && texts.includes(t) && htmlEl.children.length <= 2) {
            console.log("[TrendAnalyzer] ✓ Clicking top-area match:", htmlEl.tagName, JSON.stringify(t), "at y=", rect.top);
            htmlEl.click();
            return;
          }
        }

        console.warn("[TrendAnalyzer] ✗ Could not find timeframe button for", texts);
      },
      args: [btnText, shortText],
    });
  } else if (action === "zoom_out") {
    // Zoom out using scroll wheel on the time axis (bottom of chart)
    // This preserves the current timeframe, unlike clicking "All"/"5Y" range buttons
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: () => {
        console.log("[TrendAnalyzer] Zooming out via scroll on time axis...");

        // Find the time axis (bottom scale) — it's a narrow horizontal canvas
        // Scrolling on the time axis zooms horizontally without changing timeframe
        const allCanvases = document.querySelectorAll<HTMLCanvasElement>('canvas');
        let timeAxisCanvas: HTMLCanvasElement | null = null;
        let chartCanvas: HTMLCanvasElement | null = null;

        for (const c of allCanvases) {
          const r = c.getBoundingClientRect();
          // Time axis: wide + short (height < 40px), near bottom
          if (r.width > 400 && r.height > 10 && r.height < 50 && r.top > window.innerHeight * 0.6) {
            timeAxisCanvas = c;
            console.log("[TrendAnalyzer] Found time axis canvas:", r.width, r.height, "at y=", r.top);
          }
          // Main chart: wide + tall
          if (r.width > 400 && r.height > 200) {
            chartCanvas = c;
          }
        }

        const target = timeAxisCanvas ?? chartCanvas ?? document.querySelector<HTMLElement>('[class*="chart-container"]') ?? document.body;
        const rect = target.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        // Fire multiple scroll-out events (negative deltaY = zoom out on time axis)
        let count = 0;
        const total = 30;
        const interval = setInterval(() => {
          target.dispatchEvent(new WheelEvent('wheel', {
            deltaY: 100,
            deltaX: 0,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }));
          count++;
          if (count >= total) {
            clearInterval(interval);
            console.log("[TrendAnalyzer] Zoom-out complete:", total, "scroll events sent");
          }
        }, 60);
      },
    });
    await new Promise(r => setTimeout(r, 3000));
  }

  // After any action, auto-fit the chart so all candles are fully visible
  await autoFitChart(tab.id);
}

/** Double-click the price axis + press Alt+F to auto-scale the chart vertically */
async function autoFitChart(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => {
      console.log("[TrendAnalyzer] Auto-fitting chart...");

      // Find the price axis canvas — it's the narrow canvas on the right side
      // TradingView renders the price axis as a separate canvas inside a price-axis wrapper.
      // Double-clicking the price axis canvas resets auto-scale.
      // IMPORTANT: Do NOT double-click the main chart canvas — that opens an alert dialog!

      // Strategy 1: Find the price axis wrapper and double-click its canvas
      const priceAxisWrappers = document.querySelectorAll<HTMLElement>(
        '[class*="price-axis"], [class*="priceAxis"]'
      );
      let dblClicked = false;
      for (const wrapper of priceAxisWrappers) {
        const canvas = wrapper.querySelector('canvas');
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          if (rect.width > 0 && rect.width < 120) { // price axis is narrow (< 120px)
            console.log("[TrendAnalyzer] Found price axis canvas, double-clicking", rect.width, rect.height);
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            canvas.dispatchEvent(new MouseEvent("dblclick", {
              clientX: x, clientY: y,
              bubbles: true, cancelable: true,
            }));
            dblClicked = true;
            break;
          }
        }
      }

      // Strategy 2: If no price-axis wrapper found, look for narrow canvases on the right side
      if (!dblClicked) {
        const allCanvases = document.querySelectorAll<HTMLCanvasElement>('canvas');
        let bestCanvas: HTMLCanvasElement | null = null;
        let bestX = 0;
        for (const c of allCanvases) {
          const r = c.getBoundingClientRect();
          // Price axis canvas is narrow (30-100px wide), tall, and near the right edge
          if (r.width > 20 && r.width < 120 && r.height > 200 && r.left > bestX) {
            bestCanvas = c;
            bestX = r.left;
          }
        }
        if (bestCanvas) {
          const r = bestCanvas.getBoundingClientRect();
          console.log("[TrendAnalyzer] Found likely price axis canvas (rightmost narrow)", r.width, r.left);
          bestCanvas.dispatchEvent(new MouseEvent("dblclick", {
            clientX: r.left + r.width / 2,
            clientY: r.top + r.height / 2,
            bubbles: true, cancelable: true,
          }));
          dblClicked = true;
        }
      }

      if (!dblClicked) {
        console.log("[TrendAnalyzer] Could not find price axis canvas for auto-fit");
      }
    },
  });
  // Brief wait for the rescale animation
  await new Promise(r => setTimeout(r, 500));
}

