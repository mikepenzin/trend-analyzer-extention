import type { AnalysisMode, PageContext, PageLink } from "../types";

type ExtractRequest =
  | { type: "EXTRACT_PAGE_CONTEXT"; mode: AnalysisMode }
  | { type: "SHOW_OVERLAY" }
  | { type: "UPDATE_OVERLAY"; step: string; status: "running" | "done" | "error" }
  | { type: "HIDE_OVERLAY" };

const TEXT_SELECTORS = "p, li, article, section, main, div, span";
const HEADING_SELECTORS = "h1, h2, h3";
const MAX_TEXT_BLOCKS = 40;
const MAX_LINKS = 25;
const MAX_TEXT_LENGTH = 320;

const OVERLAY_ID = "ta-analysis-overlay";

function getOverlay(): HTMLElement | null {
  return document.getElementById(OVERLAY_ID);
}

function showAnalysisOverlay(): void {
  if (getOverlay()) return;
  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.innerHTML = `
    <style>
      #${OVERLAY_ID} {
        position: fixed; inset: 0; z-index: 2147483647;
        background: rgba(0,0,0,0.55); backdrop-filter: blur(4px);
        display: flex; align-items: center; justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        pointer-events: auto;
      }
      #${OVERLAY_ID} .ta-card {
        background: #1e1e2e; color: #cdd6f4; border-radius: 16px;
        padding: 24px 28px; min-width: 320px; max-width: 400px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      }
      #${OVERLAY_ID} .ta-title {
        font-size: 14px; font-weight: 700; letter-spacing: 0.06em;
        text-transform: uppercase; color: #a6adc8; margin: 0 0 16px;
        display: flex; align-items: center; gap: 8px;
      }
      #${OVERLAY_ID} .ta-spinner {
        width: 14px; height: 14px; border: 2px solid rgba(166,173,200,0.3);
        border-top-color: #89b4fa; border-radius: 50%;
        animation: ta-spin 0.7s linear infinite;
      }
      @keyframes ta-spin { to { transform: rotate(360deg); } }
      #${OVERLAY_ID} .ta-steps { list-style: none; margin: 0; padding: 0; }
      #${OVERLAY_ID} .ta-step {
        font-size: 13px; padding: 6px 0; display: flex; align-items: center; gap: 8px;
        color: #6c7086; transition: color 0.2s;
      }
      #${OVERLAY_ID} .ta-step.running { color: #89b4fa; }
      #${OVERLAY_ID} .ta-step.done { color: #a6e3a1; }
      #${OVERLAY_ID} .ta-step.error { color: #f38ba8; }
      #${OVERLAY_ID} .ta-step-icon { flex-shrink: 0; width: 16px; text-align: center; }
    </style>
    <div class="ta-card">
      <div class="ta-title"><div class="ta-spinner"></div> Analyzing chart</div>
      <ul class="ta-steps"></ul>
    </div>`;
  document.body.appendChild(overlay);
}

function updateOverlayStep(step: string, status: "running" | "done" | "error"): void {
  const overlay = getOverlay();
  if (!overlay) return;
  const stepsList = overlay.querySelector<HTMLUListElement>(".ta-steps");
  if (!stepsList) return;

  // Check if this step text already exists (update in place)
  const existing = Array.from(stepsList.querySelectorAll<HTMLLIElement>(".ta-step"));
  for (const li of existing) {
    const textEl = li.querySelector(".ta-step-label");
    if (textEl && textEl.textContent === step) {
      li.className = `ta-step ${status}`;
      const iconEl = li.querySelector(".ta-step-icon");
      if (iconEl) iconEl.textContent = status === "done" ? "✓" : status === "error" ? "✗" : "›";
      return;
    }
  }

  // Mark any previously "running" step as done
  for (const li of existing) {
    if (li.classList.contains("running")) {
      li.classList.remove("running");
      li.classList.add("done");
      const iconEl = li.querySelector(".ta-step-icon");
      if (iconEl) iconEl.textContent = "✓";
    }
  }

  const li = document.createElement("li");
  li.className = `ta-step ${status}`;
  li.innerHTML = `<span class="ta-step-icon">${status === "done" ? "✓" : status === "error" ? "✗" : "›"}</span><span class="ta-step-label">${step}</span>`;
  stepsList.appendChild(li);
}

function hideAnalysisOverlay(): void {
  getOverlay()?.remove();
}

chrome.runtime.onMessage.addListener((message: ExtractRequest, _sender, sendResponse) => {
  if (message.type === "SHOW_OVERLAY") {
    showAnalysisOverlay();
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === "UPDATE_OVERLAY") {
    updateOverlayStep(message.step, message.status);
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === "HIDE_OVERLAY") {
    hideAnalysisOverlay();
    sendResponse({ ok: true });
    return false;
  }
  if (message.type !== "EXTRACT_PAGE_CONTEXT") {
    return false;
  }

  try {
    const pageContext = extractPageContext(message.mode);
    sendResponse(pageContext);
  } catch (error) {
    sendResponse({
      error: error instanceof Error ? error.message : "Failed to extract page context."
    });
  }

  return false;
});

function extractPageContext(mode: AnalysisMode): PageContext {
  const url = window.location.href;
  const title = document.title || "Untitled page";
  const autoDetectedMode = detectMode(url, mode);

  return {
    title,
    url,
    headings: extractTextCollection(HEADING_SELECTORS, 12),
    visibleText: extractVisibleTextBlocks(),
    links: extractLinks(),
    selectedText: cleanText(window.getSelection()?.toString() ?? ""),
    metadata: {
      detectedMode: autoDetectedMode,
      isTradingView: url.toLowerCase().includes("tradingview"),
      timestamp: new Date().toISOString()
    }
  };
}

function extractTextCollection(selector: string, limit: number): string[] {
  const values = new Set<string>();

  for (const node of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
    if (!isVisible(node)) {
      continue;
    }

    const text = cleanText(node.innerText || node.textContent || "");
    if (!text || text.length < 3) {
      continue;
    }

    values.add(text.slice(0, MAX_TEXT_LENGTH));
    if (values.size >= limit) {
      break;
    }
  }

  return Array.from(values);
}

function extractVisibleTextBlocks(): string[] {
  const values = new Set<string>();

  for (const node of Array.from(document.querySelectorAll<HTMLElement>(TEXT_SELECTORS))) {
    if (!isVisible(node)) {
      continue;
    }

    const text = cleanText(node.innerText || node.textContent || "");
    if (text.length < 40) {
      continue;
    }

    values.add(text.slice(0, MAX_TEXT_LENGTH));
    if (values.size >= MAX_TEXT_BLOCKS) {
      break;
    }
  }

  return Array.from(values);
}

function extractLinks(): PageLink[] {
  const links: PageLink[] = [];
  const seen = new Set<string>();

  for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    if (!isVisible(anchor)) {
      continue;
    }

    const href = anchor.href;
    const text = cleanText(anchor.innerText || anchor.textContent || "");

    if (!href || href.startsWith("javascript:")) {
      continue;
    }

    const key = `${text}|${href}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    links.push({
      text: text || href,
      href
    });

    if (links.length >= MAX_LINKS) {
      break;
    }
  }

  return links;
}

function isVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  return !(
    style.display === "none" ||
    style.visibility === "hidden" ||
    Number.parseFloat(style.opacity || "1") === 0 ||
    rect.width === 0 ||
    rect.height === 0
  );
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function detectMode(url: string, mode: AnalysisMode): PageContext["metadata"]["detectedMode"] {
  if (mode !== "auto") {
    return mode;
  }

  const value = url.toLowerCase();
  if (value.includes("tradingview")) {
    return "chart";
  }
  if (value.includes("dashboard") || value.includes("analytics") || value.includes("metrics")) {
    return "ui";
  }
  return "page";
}

