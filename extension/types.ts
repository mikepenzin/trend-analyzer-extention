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

