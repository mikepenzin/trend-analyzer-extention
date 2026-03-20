import type { AnalysisResult, CapturePayload } from "../types";
import { marked } from "marked";

marked.setOptions({ breaks: true });

// --- DOM refs ---
const pageTitle = document.querySelector<HTMLHeadingElement>("#page-title");
const timeframeBadge = document.querySelector<HTMLElement>("#timeframe-badge");
const analyzeButton = document.querySelector<HTMLButtonElement>("#analyze-button");
const initialState = document.querySelector<HTMLElement>("#initial-state");
const loadingState = document.querySelector<HTMLElement>("#loading-state");
const errorState = document.querySelector<HTMLElement>("#error-state");
const chatView = document.querySelector<HTMLElement>("#chat-view");
const chatThread = document.querySelector<HTMLElement>("#chat-thread");
const followUpInput = document.querySelector<HTMLInputElement>("#follow-up-input");
const sendFollowUpButton = document.querySelector<HTMLButtonElement>("#send-follow-up");
const providerSelect = document.querySelector<HTMLSelectElement>("#provider-select");
const historyPanel = document.querySelector<HTMLElement>("#history-panel");
const historyList = document.querySelector<HTMLElement>("#history-list");
const notTradingViewState = document.querySelector<HTMLElement>("#not-tradingview-state");
const settingsRow = document.querySelector<HTMLElement>(".settings-row");
const licenseGate = document.querySelector<HTMLElement>("#license-gate");
const licenseKeyInput = document.querySelector<HTMLInputElement>("#license-key-input");
const licenseKeySubmit = document.querySelector<HTMLButtonElement>("#license-key-submit");
const licenseKeyError = document.querySelector<HTMLElement>("#license-key-error");

// --- State ---
let currentPayload: CapturePayload | null = null;
const chatHistory: Array<{ role: "user" | "assistant" | "notice"; text: string }> = [];
let currentSymbol = "";
let currentTicker = ""; // just the letters, e.g. "XLRE"
let currentProvider = "openai";
let currentSessionTs = 0; // timestamp of the current analysis session, reused for all follow-up saves

const HISTORY_KEY = "analysisHistory";
const HISTORY_MAX = 20;
const LIC_KEY = "licenseKey";

// --- Messaging ---

async function sendMessage<T>(message: unknown, retries = 5): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return (await chrome.runtime.sendMessage(message)) as T;
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      if (text.includes("Receiving end does not exist") && i < retries - 1) {
        await new Promise((r) => setTimeout(r, 150 * (i + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Could not reach the extension service worker. Try reloading the extension.");
}

// --- State helpers ---

function showInitialState(): void {
  initialState?.classList.remove("hidden");
  loadingState?.classList.add("hidden");
  chatView?.classList.add("hidden");
}

function showLoadingState(): void {
  initialState?.classList.add("hidden");
  loadingState?.classList.remove("hidden");
  chatView?.classList.add("hidden");
}

function showChatView(): void {
  initialState?.classList.add("hidden");
  loadingState?.classList.add("hidden");
  chatView?.classList.remove("hidden");
}

const headerCard = document.querySelector<HTMLElement>(".header-card");

const reanalyzeButton = document.querySelector<HTMLButtonElement>("#reanalyze-button");

function setNotTradingView(isTV: boolean): void {
  if (isTV) {
    notTradingViewState?.classList.add("hidden");
    headerCard?.classList.remove("hidden");
    settingsRow?.classList.remove("hidden");
    // Show analyze button only if chat is not currently open or loading
    const chatIsActive = chatHistory.length > 0 || !chatView?.classList.contains("hidden");
    if (!chatIsActive) {
      initialState?.classList.remove("hidden");
    }
  } else {
    notTradingViewState?.classList.remove("hidden");
    headerCard?.classList.add("hidden");
    settingsRow?.classList.add("hidden");
    initialState?.classList.add("hidden");
    loadingState?.classList.add("hidden");
    chatView?.classList.add("hidden");
    if (historyPanel) historyPanel.classList.add("hidden");
  }
}

function setError(message: string): void {
  if (!errorState) return;
  errorState.textContent = message;
  errorState.classList.remove("hidden");
}

function clearError(): void {
  if (!errorState) return;
  errorState.textContent = "";
  errorState.classList.add("hidden");
}

// --- Tab info / timeframe badge ---

function extractTimeframe(title: string): string {
  const match = title.match(/\b(1|3|5|10|15|30|45)\s*m(?:in)?\b|\b([1-4]H|[1-9]\d*H)\b|\b(1D|3D|1W|1M|D|W|M)\b/i);
  return match ? match[0].toUpperCase() : "";
}

async function refreshTabInfo(): Promise<boolean> {
  const tabInfo = await sendMessage<{ title: string; url: string; isTradingView?: boolean }>({ type: "GET_ACTIVE_TAB_INFO" });
  const rawTitle = tabInfo.title ?? "Untitled page";
  const isTV = tabInfo.isTradingView ?? tabInfo.url?.includes("tradingview.com") ?? false;

  setNotTradingView(isTV);

  if (isTV) {
    const newSymbol = rawTitle.split("%")[0] + "%";
    const newTicker = rawTitle.split(" ")[0]; // e.g. "XLRE"

    // Ticker changed while chat is open → add notice, switch button to Analyze
    if (currentTicker && newTicker !== currentTicker && chatHistory.length > 0) {
      currentPayload = null;
      const noticeText = `Ticker changed from ${currentTicker} to ${newTicker}`;
      chatHistory.push({ role: "notice", text: noticeText });
      if (chatThread) {
        const notice = document.createElement("div");
        notice.className = "bubble-notice";
        notice.textContent = noticeText;
        chatThread.appendChild(notice);
        notice.scrollIntoView({ behavior: "smooth", block: "end" });
      }
      if (reanalyzeButton) reanalyzeButton.textContent = "Analyze";
    }

    currentSymbol = newSymbol;
    currentTicker = newTicker;
    if (pageTitle) pageTitle.textContent = currentSymbol;

    const tf = extractTimeframe(rawTitle);
    if (timeframeBadge) {
      if (tf) {
        timeframeBadge.textContent = tf;
        timeframeBadge.classList.remove("hidden");
      } else {
        timeframeBadge.classList.add("hidden");
      }
    }
  } else {
    if (pageTitle) pageTitle.textContent = rawTitle;
    if (timeframeBadge) timeframeBadge.classList.add("hidden");
  }

  return isTV;
}

// --- Chat rendering ---

const COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

function resultToHtml(result: AnalysisResult): string {
  const html = marked.parse(result.text) as string;
  return `<div class="result-text">${html}</div>`;
}

function appendUserBubble(text: string): void {
  if (!chatThread) return;
  const el = document.createElement("div");
  el.className = "bubble bubble-user";
  el.textContent = text;
  el.dataset.ts = Date.now().toString();
  chatThread.appendChild(el);
  el.scrollIntoView({ behavior: "smooth", block: "end" });
}

function appendAssistantBubble(result: AnalysisResult): void {
  if (!chatThread) return;
  const el = document.createElement("div");
  el.className = "bubble bubble-assistant";
  el.dataset.ts = Date.now().toString();
  el.innerHTML = resultToHtml(result);

  // Model badge
  if (result.meta?.provider) {
    const badge = document.createElement("span");
    badge.className = "model-badge";
    badge.textContent = result.meta.provider;
    el.appendChild(badge);
  }

  // Copy button
  const copyBtn = document.createElement("button");
  copyBtn.className = "bubble-copy-btn";
  copyBtn.title = "Copy";
  copyBtn.innerHTML = COPY_ICON;
  copyBtn.addEventListener("click", () => {
    void navigator.clipboard.writeText(el.innerText).then(() => {
      copyBtn.innerHTML = CHECK_ICON;
      setTimeout(() => { copyBtn.innerHTML = COPY_ICON; }, 1500);
    });
  });
  el.appendChild(copyBtn);

  chatThread.appendChild(el);
  el.scrollIntoView({ behavior: "smooth", block: "end" });
}

function appendThinkingBubble(): HTMLElement {
  const el = document.createElement("div");
  el.className = "bubble-thinking";
  el.innerHTML = `<span class="loading-dots"><span></span><span></span><span></span></span> Thinking`;
  chatThread?.appendChild(el);
  el.scrollIntoView({ behavior: "smooth", block: "end" });
  return el;
}

// --- Timestamps ---

function formatRelativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function startTimestampUpdater(): void {
  setInterval(() => {
    document.querySelectorAll<HTMLElement>(".bubble[data-ts]").forEach((el) => {
      el.dataset.timeLabel = formatRelativeTime(Number(el.dataset.ts));
    });
  }, 30_000);
}

// --- History ---

interface HistoryEntry {
  symbol: string;
  provider: string;
  ts: number;
  text: string; // kept for backwards compat with old entries
  messages?: Array<{ role: "user" | "assistant" | "notice"; text: string }>;
}

async function loadHistory(): Promise<HistoryEntry[]> {
  const data = await chrome.storage.local.get({ [HISTORY_KEY]: [] });
  const entries = data[HISTORY_KEY] as HistoryEntry[];
  // Filter out any malformed entries from older versions
  return entries.filter((e) => e && typeof e.text === "string");
}

async function saveToHistory(entry: HistoryEntry): Promise<void> {
  const existing = await loadHistory();
  // If the most recent entry is for the same symbol+session (same ts), update it in place
  if (existing.length > 0 && existing[0].ts === entry.ts) {
    existing[0] = entry;
    await chrome.storage.local.set({ [HISTORY_KEY]: existing });
  } else {
    const updated = [entry, ...existing].slice(0, HISTORY_MAX);
    await chrome.storage.local.set({ [HISTORY_KEY]: updated });
  }
}

function restoreConversation(entry: HistoryEntry): void {
  // Save on-screen ticker before overwriting state
  const onScreenTicker = currentTicker;
  const entryTicker = entry.symbol.split(" ")[0];

  // Reset state
  chatHistory.length = 0;
  currentPayload = null;
  currentSessionTs = entry.ts;
  currentSymbol = entry.symbol;
  currentProvider = entry.provider;
  if (pageTitle) pageTitle.textContent = entry.symbol;
  if (providerSelect) providerSelect.value = entry.provider;
  if (chatThread) chatThread.innerHTML = "";

  // Replay messages into chat
  const messages = entry.messages ?? [{ role: "assistant" as const, text: entry.text }];
  for (const msg of messages) {
    chatHistory.push(msg);
    if (msg.role === "user") {
      appendUserBubble(msg.text);
    } else if (msg.role === "notice") {
      const noticeEl = document.createElement("div");
      noticeEl.className = "bubble-notice";
      noticeEl.textContent = msg.text;
      chatThread?.appendChild(noticeEl);
    } else {
      appendAssistantBubble({ text: msg.text, meta: { modeUsed: "chart", provider: entry.provider } });
    }
  }

  // Close history panel and show chat
  if (historyPanel) historyPanel.classList.add("hidden");
  settingsRow?.classList.remove("hidden");
  showChatView();

  // Add notice that this is a restored conversation without the original screenshot
  if (chatThread) {
    const notice = document.createElement("div");
    notice.className = "bubble-notice";
    notice.textContent = "Restored from history — next message will capture a fresh chart screenshot.";
    chatThread.appendChild(notice);

    // Warn if on-screen ticker differs from the restored conversation's ticker
    if (onScreenTicker && onScreenTicker !== entryTicker) {
      const tickerNoticeText = `Chart changed: you're now viewing ${onScreenTicker}, but this conversation is about ${entryTicker}.`;
      chatHistory.push({ role: "notice", text: tickerNoticeText });
      const tickerNotice = document.createElement("div");
      tickerNotice.className = "bubble-notice";
      tickerNotice.textContent = tickerNoticeText;
      chatThread.appendChild(tickerNotice);
    }

    chatThread.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "end" });
  }

  followUpInput?.focus();
}

function renderHistory(): void {
  void (async () => {
    if (!historyList) return;
    const entries = await loadHistory();
    if (entries.length === 0) {
      historyList.innerHTML = `<p class="history-empty">No analyses saved yet.</p>`;
      return;
    }
    historyList.innerHTML = "";
    for (const entry of entries) {
      const item = document.createElement("div");
      item.className = "history-item";
      const date = new Date(entry.ts);
      const msgCount = entry.messages ? entry.messages.length : 1;
      item.innerHTML = `
        <div class="history-meta">
          <span class="history-symbol">${entry.symbol}</span>
          <span class="model-badge">${entry.provider}</span>
          <span class="history-time">${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          <span class="history-msg-count">${msgCount} msg${msgCount > 1 ? "s" : ""}</span>
          <button class="action-button history-export-btn" title="Export as Markdown">Export</button>
        </div>
        <p class="history-preview">${(entry.text ?? "").slice(0, 140)}…</p>
      `;

      // Click anywhere on the item (except Export button) to resume conversation
      item.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest(".history-export-btn")) return;
        restoreConversation(entry);
      });
      item.querySelector<HTMLButtonElement>(".history-export-btn")?.addEventListener("click", () => {
        const lines = [
          `# ${entry.symbol} — Analysis`,
          `Provider: ${entry.provider}`,
          `Date: ${new Date(entry.ts).toLocaleString()}`,
          "\n---\n",
        ];
        const messages = entry.messages ?? [{ role: "assistant" as const, text: entry.text }];
        for (const msg of messages) {
          lines.push(msg.role === "user" ? `**You:** ${msg.text}\n` : `**Assistant:**\n\n${msg.text}\n`);
          lines.push("---\n");
        }
        const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${entry.symbol.replace(/[^a-z0-9]/gi, "_")}_${entry.ts}.md`;
        a.click();
        URL.revokeObjectURL(url);
      });
      historyList.appendChild(item);
    }
  })();
}

// --- Export ---

function exportChat(): void {
  if (chatHistory.length === 0) return;
  const lines: string[] = [
    `# ${currentSymbol} — Analysis`,
    `Provider: ${currentProvider}`,
    `Date: ${new Date().toLocaleString()}`,
    "\n---\n",
  ];
  for (const msg of chatHistory) {
    if (msg.role === "notice") {
      lines.push(`> *${msg.text}*\n`);
    } else {
      lines.push(msg.role === "user" ? `**You:** ${msg.text}\n` : `**Assistant:**\n\n${msg.text}\n`);
    }
    lines.push("---\n");
  }
  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${currentSymbol.replace(/[^a-z0-9]/gi, "_")}_${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- API ---

async function getApiBaseUrl(): Promise<string> {
  const response = await sendMessage<{ apiBaseUrl?: string }>({ type: "GET_SETTINGS" });
  return response?.apiBaseUrl ?? __API_BASE_URL__;
}

async function getLicenseKey(): Promise<string> {
  const data = await chrome.storage.local.get({ [LIC_KEY]: "" });
  return (data[LIC_KEY] as string) ?? "";
}

function showLicenseGate(showError = false): void {
  licenseGate?.classList.remove("hidden");
  if (showError) {
    licenseKeyError?.classList.remove("hidden");
  } else {
    licenseKeyError?.classList.add("hidden");
  }
  licenseKeyInput?.focus();
}

function hideLicenseGate(): void {
  licenseGate?.classList.add("hidden");
}

async function callAnalyze(payload: object, isFollowUp = false): Promise<AnalysisResult> {
  const apiBaseUrl = await getApiBaseUrl();
  const provider = providerSelect?.value ?? "gemini";
  currentProvider = provider;
  const licenseKey = await getLicenseKey();

  const response = await fetch(`${apiBaseUrl}/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(licenseKey ? { "X-License-Key": licenseKey } : {}),
    },
    body: JSON.stringify({ ...payload, provider, isFollowUp }),
  });

  if (response.status === 401) {
    // Key was revoked or missing — show gate again
    await chrome.storage.local.remove(LIC_KEY);
    showLicenseGate(true);
    throw new Error("Access denied. Please enter a valid access key.");
  }

  if (!response.ok) {
    let msg = `Server error: ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }

  return (await response.json()) as AnalysisResult;
}

async function runAnalysis(appendToExisting = false): Promise<void> {
  clearError();

  if (!appendToExisting) {
    await refreshTabInfo();
    chatHistory.length = 0;
    currentSessionTs = 0;
    if (chatThread) chatThread.innerHTML = "";
    // Immediately switch to chat view with a thinking bubble
    showChatView();
  }

  try {
    const payload = await sendMessage<CapturePayload & { error?: string }>({
      type: "CAPTURE_PAGE_CONTEXT",
      mode: "auto",
    });

    if (payload.error) throw new Error(payload.error);

    currentPayload = payload;

    const thinking = appendThinkingBubble();
    if (sendFollowUpButton) sendFollowUpButton.disabled = true;
    if (followUpInput) followUpInput.disabled = true;

    if (appendToExisting) {
      appendUserBubble("Re-analyze");
    }

    const result = await callAnalyze(payload);
    chatHistory.push({ role: "assistant", text: result.text });

    thinking.remove();
    appendAssistantBubble(result);
    showChatView();
    if (followUpInput) followUpInput.disabled = false;
    followUpInput?.focus();
    if (sendFollowUpButton) sendFollowUpButton.disabled = false;

    currentSessionTs = Date.now();
    void saveToHistory({ symbol: currentSymbol, provider: currentProvider, ts: currentSessionTs, text: result.text, messages: [...chatHistory] });
  } catch (error) {
    showInitialState();
    if (followUpInput) followUpInput.disabled = false;
    if (sendFollowUpButton) sendFollowUpButton.disabled = false;
    setError(error instanceof Error ? error.message : "An unknown error occurred.");
  }
}

async function sendFollowUp(): Promise<void> {
  const question = followUpInput?.value.trim();
  if (!question) return;
  clearError();

  if (followUpInput) followUpInput.value = "";
  if (followUpInput) followUpInput.disabled = true;
  if (sendFollowUpButton) sendFollowUpButton.disabled = true;

  appendUserBubble(question);
  const thinking = appendThinkingBubble();

  const freshScreenshotToggle = document.querySelector<HTMLInputElement>("#fresh-screenshot-toggle");
  const wantFreshScreenshot = freshScreenshotToggle?.checked || !currentPayload;

  // Capture a fresh screenshot if toggled on or if there's no existing payload
  if (wantFreshScreenshot) {
    try {
      const freshPayload = await sendMessage<CapturePayload & { error?: string }>({
        type: "CAPTURE_PAGE_CONTEXT",
        mode: "auto",
      });
      if (!freshPayload.error) {
        currentPayload = freshPayload;
      }
    } catch { /* proceed with existing payload */ }
    if (freshScreenshotToggle) freshScreenshotToggle.checked = false;
  }

  // Send the full chat history + current question to the backend for proper multi-turn context
  // Filter out notice entries — they are UI-only and not meaningful to the AI
  const historySnapshot = chatHistory.filter((m) => m.role !== "notice");
  chatHistory.push({ role: "user", text: question });

  try {
    const result = await callAnalyze({ ...currentPayload, userPrompt: question, chatHistory: historySnapshot }, true);
    chatHistory.push({ role: "assistant", text: result.text });
    thinking.remove();
    appendAssistantBubble(result);
    // Update the existing history entry with the full conversation
    if (currentSessionTs) {
      void saveToHistory({ symbol: currentSymbol, provider: currentProvider, ts: currentSessionTs, text: chatHistory[0]?.text ?? "", messages: [...chatHistory] });
    }
  } catch (error) {
    thinking.remove();
    setError(error instanceof Error ? error.message : "An unknown error occurred.");
    chatHistory.pop();
  } finally {
    if (followUpInput) followUpInput.disabled = false;
    if (sendFollowUpButton) sendFollowUpButton.disabled = false;
    followUpInput?.focus();
  }
}

// --- Init ---

async function init(): Promise<void> {
  const storedKey = await getLicenseKey();
  if (!storedKey) {
    showLicenseGate();
    return;
  }

  const isTV = await refreshTabInfo();
  const settings = await sendMessage<{ apiBaseUrl: string; provider?: string }>({ type: "GET_SETTINGS" });
  if (providerSelect && settings.provider) providerSelect.value = settings.provider;
  if (isTV) showInitialState();
  startTimestampUpdater();
}

// --- License gate submit ---

async function handleLicenseSubmit(): Promise<void> {
  const key = licenseKeyInput?.value.trim() ?? "";
  if (!key) return;
  // Optimistically save the key and proceed to init
  await chrome.storage.local.set({ [LIC_KEY]: key });
  hideLicenseGate();
  await init();
}

licenseKeySubmit?.addEventListener("click", () => void handleLicenseSubmit());
licenseKeyInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") void handleLicenseSubmit();
});

// --- Events ---

analyzeButton?.addEventListener("click", () => void runAnalysis());
sendFollowUpButton?.addEventListener("click", () => void sendFollowUp());

reanalyzeButton?.addEventListener("click", () => {
  if (reanalyzeButton?.textContent === "Analyze") {
    // New ticker — do a fresh analysis but keep chat thread
    void runAnalysis(true);
    reanalyzeButton.textContent = "Re-analyze";
  } else {
    void runAnalysis(true);
  }
});

document.querySelector<HTMLButtonElement>("#export-chat")?.addEventListener("click", exportChat);

document.querySelector<HTMLButtonElement>("#new-analysis")?.addEventListener("click", () => {
  currentPayload = null;
  chatHistory.length = 0;
  if (chatThread) chatThread.innerHTML = "";
  if (timeframeBadge) timeframeBadge.classList.add("hidden");
  showInitialState();
});

document.querySelector<HTMLButtonElement>("#history-toggle")?.addEventListener("click", () => {
  if (!historyPanel) return;
  const isHidden = historyPanel.classList.toggle("hidden");
  if (!isHidden) {
    // History open — hide everything else
    settingsRow?.classList.add("hidden");
    initialState?.classList.add("hidden");
    chatView?.classList.add("hidden");
    loadingState?.classList.add("hidden");
    renderHistory();
  } else {
    // History closed — restore normal view
    settingsRow?.classList.remove("hidden");
    if (chatHistory.length > 0) {
      chatView?.classList.remove("hidden");
    } else {
      initialState?.classList.remove("hidden");
    }
  }
});

followUpInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    e.stopPropagation();
    void sendFollowUp();
  }
});

providerSelect?.addEventListener("change", () => {
  void (async () => {
    const { apiBaseUrl } = await sendMessage<{ apiBaseUrl: string }>({ type: "GET_SETTINGS" });
    void sendMessage({ type: "SET_SETTINGS", apiBaseUrl, provider: providerSelect!.value });
  })();
});

// Listen for tab navigation / title changes from the service worker
chrome.runtime.onMessage.addListener((message: { type: string }) => {
  if (message.type === "TAB_UPDATED") {
    void refreshTabInfo().then((isTV) => {
      // Ensure the analyze button is visible when switching to a TradingView tab
      if (isTV && chatHistory.length === 0) {
        showInitialState();
      }
    });
  }
});

void init();

