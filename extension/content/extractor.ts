import type { AnalysisMode, PageContext, PageLink } from "../types";

type ExtractRequest = {
  type: "EXTRACT_PAGE_CONTEXT";
  mode: AnalysisMode;
};

const TEXT_SELECTORS = "p, li, article, section, main, div, span";
const HEADING_SELECTORS = "h1, h2, h3";
const MAX_TEXT_BLOCKS = 40;
const MAX_LINKS = 25;
const MAX_TEXT_LENGTH = 320;

chrome.runtime.onMessage.addListener((message: ExtractRequest, _sender, sendResponse) => {
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

