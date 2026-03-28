export type AnalysisMode = "auto" | "page" | "chart" | "ui";
export type LLMProvider = "gemini" | "groq" | "openai" | "both";

export interface PageLink {
  text: string;
  href: string;
}

export interface PageContext {
  title: string;
  url: string;
  headings: string[];
  visibleText: string[];
  links: PageLink[];
  selectedText: string;
  metadata: {
    detectedMode: Exclude<AnalysisMode, "auto">;
    isTradingView: boolean;
    timestamp: string;
  };
}

export interface CapturePayload {
  pageContext: PageContext;
  screenshot: string;
}

export interface AnalysisResult {
  text: string;
  meta?: {
    modeUsed: Exclude<AnalysisMode, "auto">;
    provider?: string;
  };
}

export interface HistoryEntry {
  id: string;
  createdAt: string;
  mode: AnalysisMode;
  pageTitle: string;
  url: string;
  prompt: string;
  result: AnalysisResult;
}

// --- TA types (mirrored from backend) ---

export interface CandlestickPattern {
  name: string;
  type: "bullish" | "bearish" | "neutral";
  barIndex: number;
}

export interface ChartPattern {
  name: string;
  type: "bullish" | "bearish" | "neutral";
  status: "forming" | "completed" | "broken";
  confidence: "high" | "medium" | "low";
  description: string;
  keyLevels?: { support?: number; resistance?: number; neckline?: number; target?: number };
}

export interface TAResult {
  symbol: string;
  timeframe: string;
  bars: number;
  latestBar: { time: number; open: number; high: number; low: number; close: number; volume: number };
  indicators: {
    rsi: number | null;
    macdLine: number | null;
    macdSignal: number | null;
    macdHistogram: number | null;
    sma20: number | null;
    sma50: number | null;
    sma150: number | null;
    sma200: number | null;
    ema12: number | null;
    ema26: number | null;
    bollingerUpper: number | null;
    bollingerMiddle: number | null;
    bollingerLower: number | null;
    atr: number | null;
    stochasticK: number | null;
    stochasticD: number | null;
    adx: number | null;
    cci: number | null;
    obv: number | null;
    vwap: number | null;
  };
  candlestickPatterns: CandlestickPattern[];
  chartPatterns: ChartPattern[];
  crossovers: string[];
  summary: string;
}

export interface AgentStepResult {
  action: string;
  value?: string;
  reason?: string;
  text?: string;
  taData?: TAResult;
  stepSummary?: string;
}

