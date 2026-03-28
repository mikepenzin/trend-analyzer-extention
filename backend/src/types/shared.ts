export type AnalysisMode = "auto" | "page" | "chart" | "ui";
export type LLMProvider = "gemini" | "groq" | "openai" | "both";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

export interface AgentStepResult {
  action: "change_timeframe" | "zoom_out" | "fetch_data" | "analyze_patterns" | "done";
  value?: string;   // timeframe value for change_timeframe
  reason?: string;  // why the AI wants this action
  text?: string;    // final analysis markdown when action === "done"
  taData?: TAResult; // technical analysis data computed for this step
  stepSummary?: string; // brief summary of what was found in this step (shown to user)
}

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
    detectedMode: "page" | "chart" | "ui";
    isTradingView: boolean;
    timestamp: string;
  };
}

export interface AnalysisResult {
  text: string;
  meta?: {
    modeUsed: "page" | "chart" | "ui";
    provider?: string;
  };
}

// --- OHLCV & Technical Analysis types ---

export interface OHLCVBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorValues {
  sma20: number[];
  sma50: number[];
  sma200: number[];
  ema12: number[];
  ema26: number[];
  rsi14: number[];
  macd: { MACD: number[]; signal: number[]; histogram: number[] };
  bollingerBands: { upper: number[]; middle: number[]; lower: number[] };
  atr14: number[];
  stochastic: { k: number[]; d: number[] };
  adx14: number[];
  obv: number[];
  vwap: number[];
}

export interface CandlestickPattern {
  name: string;
  type: "bullish" | "bearish" | "neutral";
  barIndex: number; // index from the end (0 = most recent)
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
  bars: number; // number of bars used
  latestBar: OHLCVBar;
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
  crossovers: string[]; // e.g. "Golden Cross (SMA50 above SMA200)", "MACD bullish crossover"
  summary: string; // auto-generated text summary of key findings
}

