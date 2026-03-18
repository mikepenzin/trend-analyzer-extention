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

