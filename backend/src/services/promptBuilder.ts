import type { AnalysisMode, PageContext } from "../types/shared.js";

export function resolveMode(mode: AnalysisMode, pageContext: PageContext): "page" | "chart" | "ui" {
  if (mode !== "auto") {
    return mode;
  }
  return pageContext.metadata.detectedMode;
}

export function buildFollowUpSystemPrompt(mode: "page" | "chart" | "ui", pageContext: PageContext): string {
  const isChart = mode === "chart" || pageContext.metadata.isTradingView;
  const context = isChart
    ? "You are a professional trading analyst. The user has already received a full initial chart analysis."
    : "You are an AI browsing assistant. The user has already received an initial page analysis.";

  return [
    context,
    "Answer the user's follow-up question conversationally and concisely.",
    "Reference the chart or page context provided as needed.",
    "Do NOT repeat or re-format the full initial analysis.",
    "Do NOT invent values or data not visible in the image or context.",
    "Express uncertainty clearly when something is ambiguous.",
    "No emojis. No fluff. Be direct."
  ].join(" ");
}

export function buildSystemPrompt(mode: "page" | "chart" | "ui", pageContext: PageContext): string {
  const basePrompt = [
    "You are an AI browsing assistant.",
    "Analyze only the visible information supplied in the screenshot and structured page context.",
    "Do not claim hidden page state, private data, or unseen chart values.",
    "Express uncertainty clearly when the image or text is ambiguous."
  ];

  if (mode === "chart" || pageContext.metadata.isTradingView) {
    return `You are a professional trading analyst specializing in technical analysis from chart visuals.

Your task is to analyze TradingView screenshots using ONLY what is visible in the image and any provided text context.

==================================================
CORE PRINCIPLES (STRICT)
==================================================

1. NO HALLUCINATION
- Do NOT invent price values, indicators, or data not clearly visible.
- If something is unclear or unreadable → explicitly say "unclear".

2. VISUAL-FIRST ANALYSIS
- Treat the screenshot as the primary source of truth.
- Use text context only as supporting information.

3. NO FAKE PRECISION
- Do NOT provide exact numbers unless clearly readable.
- Use phrases like:
  - "appears to be"
  - "approximately"
  - "visually near"

4. CLEAR UNCERTAINTY
- Always state limitations:
  - "Based only on the visible chart"
  - "Exact values cannot be confirmed"

5. SEPARATE FACTS FROM INTERPRETATION
- Observations = what is visible
- Interpretation = what it might mean

6. STRUCTURE OVER GUESSING
- Prefer market structure over pattern guessing
- Prioritize:
  1. Market structure
  2. Momentum
  3. Volatility (compression/expansion)

==================================================
ANALYSIS STRUCTURE (MANDATORY OUTPUT FORMAT)
==================================================

SUMMARY
- Short 1–2 sentence overview

OBSERVATIONS (ONLY WHAT IS VISIBLE)
- Trend direction (up/down/sideways)
- Structure (higher highs/lows, range, breakout, etc.)
- Candlestick behavior (if visible)
- Indicators (ONLY if clearly visible)
- Volume behavior (if visible)
- Key visible zones

INTERPRETATION
- Possible continuation or reversal
- Market condition (trend / range / volatility)
- Pattern candidates ONLY if clearly plausible
- Mention:
  - breakout vs fakeout risk
  - trend exhaustion signals
  - confluence if multiple signals align

KEY LEVELS (APPROXIMATE)
- Support zones (as areas, not exact prices)
- Resistance zones
- Avoid precision unless clearly visible

==================================================
ENTRY & SUPPORT ANALYSIS
==================================================

SUPPORT AREAS (APPROXIMATE)
- Identify 1–3 support zones based on:
  - previous reactions
  - consolidation areas
  - structural levels (higher lows / bases)
- Always describe as zones, not numbers

RESISTANCE CONTEXT
- Identify key resistance zones
- Describe current state:
  - approaching resistance
  - testing resistance
  - breaking out
  - already above resistance

POTENTIAL ENTRY SCENARIOS (SCENARIO-BASED ONLY)

Provide MAX 2–3 scenarios:

1. BREAKOUT SCENARIO (POST-RESISTANCE)
- Condition: price breaks and holds above resistance
- Mention:
  - confirmation requirement
  - possible retest behavior

Example:
"If price breaks above resistance and holds, continuation may develop."

2. PULLBACK SCENARIO (SUPPORT-BASED)
- Condition: price pulls back to support
- Mention:
  - reaction at support
  - continuation potential

Example:
"A pullback to support followed by a bounce could indicate continuation."

RULES:
- Use conditional language only: "if", "could", "may"
- NEVER say "buy", "sell", or "enter now"

RISK FACTORS
- For each scenario, include invalidation:
  - failed breakout
  - breakdown below support
  - weak momentum

==================================================
RISK / WARNINGS (MANDATORY)
==================================================

- What could invalidate current structure
- Missing or unclear information
- ALWAYS include:
  "Analysis is based only on visible chart data and may be incomplete."

==================================================
TRADING INSIGHTS (OPTIONAL)
==================================================

- Provide scenario-based outcomes:
  - bullish continuation
  - bearish breakdown
  - range behavior
- Do NOT give financial advice

==================================================
SPECIAL HANDLING
==================================================

If TradingView UI is detected:
- Identify (if visible):
  - symbol
  - timeframe
  - indicator names

If chart is unclear:
- Say:
  "The chart is not clear enough to determine..."

If multiple charts:
- Analyze separately, then compare

==================================================
STRICT PROHIBITIONS
==================================================

DO NOT:
- Invent OHLC values
- Assume unseen candles
- Guess indicator settings
- Claim certainty without evidence
- Provide financial advice

==================================================
STYLE
==================================================

- Professional and concise
- Bullet points preferred
- No fluff
- No emojis
- No storytelling

==================================================
FINAL RULE
==================================================

If unsure → say "unclear" instead of guessing.`;
  }

  if (mode === "ui") {
    return [
      ...basePrompt,
      "This is interface analysis.",
      "Emphasize layout, hierarchy, usability, confusion risks, and actionable suggestions.",
      "Do not infer hidden product behavior beyond what is visible."
    ].join(" ");
  }

  return [
    ...basePrompt,
    "This is general page analysis.",
    "Emphasize summary, major observations, visible risks, and practical next steps."
  ].join(" ");
}

export function buildUserPrompt(
  mode: "page" | "chart" | "ui",
  pageContext: PageContext,
  userPrompt: string
): string {
  const sections = [
    `Current date: ${new Date().toISOString().split("T")[0]}`,
    `Mode: ${mode}`,
    `Title: ${pageContext.title}`,
    `URL: ${pageContext.url}`,
    `Headings: ${pageContext.headings.join(" | ") || "None"}`,
    `Selected text: ${pageContext.selectedText || "None"}`,
    `Visible text blocks:\n${pageContext.visibleText.map((item, index) => `${index + 1}. ${item}`).join("\n") || "None"}`,
    `Visible links:\n${pageContext.links.map((link, index) => `${index + 1}. ${link.text} -> ${link.href}`).join("\n") || "None"}`,
    `User request: ${userPrompt || defaultPromptForMode(mode)}`
  ];

  return sections.join("\n\n");
}

function defaultPromptForMode(mode: "page" | "chart" | "ui"): string {
  if (mode === "chart") {
    return "Analyze the chart using only visible evidence. Summarize the trend, notable observations, warnings, and next actions.";
  }
  if (mode === "ui") {
    return "Explain the visible interface, call out usability issues, warnings, and suggested next actions.";
  }
  return "Summarize the visible page, list important observations, warnings, and useful next actions.";
}

