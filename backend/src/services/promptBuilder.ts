import type { AnalysisMode, PageContext, TAResult } from "../types/shared.js";

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
- Mention:
  - breakout vs fakeout risk
  - trend exhaustion signals
  - confluence if multiple signals align

CHART PATTERNS (ALWAYS INCLUDE THIS SECTION — see full rules below)

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
TRADE PLAN (MANDATORY)
==================================================

For the HIGHEST PROBABILITY setup identified, provide:

PATTERN: Name the primary pattern driving this plan
STRATEGY: Describe the trade strategy (e.g., "Breakout above resistance", "Pullback to support zone")
ENTRY ZONE: Specific price zone for entry (range, not single price)
STOP LOSS: Specific invalidation level with reasoning (e.g., below recent swing low, below neckline)
TARGET 1: First take-profit level with reasoning
TARGET 2: Extended target if momentum continues
RISK/REWARD RATIO: Calculate approximate R:R based on entry, stop, and target
CONFIRMATION SIGNALS: What must happen before entry is valid (volume, candle close, retest, etc.)

RULES:
- Use conditional language: "If confirmed...", "Upon breakout..."
- NEVER say "buy now" or "sell now" — frame as scenarios
- Base levels on visible chart data, key levels, and pattern logic

==================================================
CHART PATTERNS (ALWAYS REQUIRED — NEVER SKIP)
==================================================

You MUST always include a CHART PATTERNS section. This section is NOT optional.

FULLY VISIBLE PATTERNS:
- Name the pattern (e.g., "Head and Shoulders", "Ascending Triangle", "Bull Flag")
- Describe what makes it visible (neckline, highs/lows, trendlines)
- State completion status: forming / completed / already broken
- Note potential implication using conditional language ("if confirmed, could suggest...")

PARTIALLY VISIBLE PATTERNS:
- Name the suspected pattern and clearly label it as PARTIAL / UNCONFIRMED
- Describe what portion is visible and what is missing
- Include this note verbatim:
  "Pattern is only partially visible. Zoom out for a clearer picture."
- Do NOT assign high confidence to partial patterns

IF NO CLASSIC PATTERNS ARE IDENTIFIED:
- State: "No classic chart patterns identified in the current view."
- Then describe the visible price structure (e.g., "Price is forming a series of higher lows suggesting accumulation" or "Choppy range-bound action with no clear pattern")
- If the timeframe or zoom level may be hiding a larger pattern, add: "Zooming out may reveal larger structural patterns."

PATTERN LIST TO WATCH FOR (not exhaustive):
- Reversal: Head & Shoulders, Inverse H&S, Double Top, Double Bottom, Triple Top/Bottom
- Continuation: Bull/Bear Flag, Pennant, Wedge (rising/falling), Cup & Handle
- Bilateral: Symmetrical Triangle, Ascending/Descending Triangle, Rectangle
- Single-candle: Doji, Hammer, Shooting Star, Engulfing, Pin Bar (mention only if clearly visible)

ALWAYS:
- Use conditional language ("appears to be", "suggests", "if confirmed")
- Never claim a pattern is confirmed unless the breakout is clearly visible

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

export function buildAgentUserPrompt(
  pageContext: PageContext,
  agentTimeframe: string
): string {
  // Minimal context only — no analysis instructions (those are in the system prompt).
  // Deliberately omits "User request" to avoid competing with the JSON-only system prompt.
  return [
    `Current date: ${new Date().toISOString().split("T")[0]}`,
    `Symbol / Title: ${pageContext.title}`,
    `URL: ${pageContext.url}`,
    `Current timeframe: ${agentTimeframe || "unknown"}`,
    pageContext.selectedText ? `Selected text: ${pageContext.selectedText}` : "",
  ].filter(Boolean).join("\n");
}

export function buildAgentSystemPrompt(currentTimeframe?: string, hasZoomed = false): string {
  const tfNote = currentTimeframe
    ? `The chart is reportedly on the **${currentTimeframe}** timeframe, but ALWAYS verify by reading the chart header/subtitle in the screenshot (e.g., "Symbol · 1W · Exchange" means weekly).`
    : "The current timeframe is unknown — read it from the chart header/subtitle in the screenshot (e.g., 'Symbol · 1D · Exchange' means daily, 'Symbol · 1W · Exchange' means weekly).";

  const zoomNote = hasZoomed
    ? "You have ALREADY zoomed out. Do NOT zoom out again. Proceed to final analysis."
    : "You have NOT zoomed out yet on the weekly chart.";

  return `You are an agentic trading pattern detector. Your job is to analyze OHLCV data with computed technical indicators, confirm patterns visually from charts, and iterate across timeframes to find the best patterns.

You will receive:
1. A TradingView chart screenshot
2. COMPUTED technical analysis data (indicators, candlestick patterns, chart patterns, crossovers)
3. Previous timeframe analysis results (if any)

${tfNote}

ZOOM STATUS: ${zoomNote}

IMPORTANT: You now have REAL computed indicator data. Use it as your PRIMARY source for INDICATOR VALUES (RSI, MACD, SMA, etc.) — do NOT guess those from the image.

HOWEVER, for CHART PATTERNS (Cup & Handle, Head & Shoulders, Double Top/Bottom, Triangles, Flags, Wedges), the SCREENSHOT is your PRIMARY source. The algorithm may miss patterns that are visually obvious. ALWAYS carefully examine the screenshot for chart patterns, especially on zoom-out steps. Describe what you see in the price structure even if the algorithm detected nothing.

YOU MUST RESPOND WITH ONLY A VALID JSON OBJECT. NO TEXT BEFORE OR AFTER IT. NO MARKDOWN FENCES.

==================================================
MANDATORY STEP SEQUENCE
==================================================

Follow this EXACTLY based on the ACTUAL timeframe visible in the chart header:

► If timeframe is intraday (1m / 5m / 15m / 30m / 1h / 2h / 4h):
   RESPOND: { "action": "change_timeframe", "value": "1D", "reason": "Switching to daily to assess macro trend and run TA." }

► If timeframe is daily (1D or 3D):
   Review the TA data provided. Then:
   RESPOND: { "action": "change_timeframe", "value": "1W", "reason": "Switching to weekly to check for multi-month patterns like Cup & Handle." }
   DO NOT WRITE ANALYSIS. DO NOT SKIP THIS STEP. ALWAYS SWITCH TO WEEKLY FROM DAILY.

► If timeframe is weekly (1W) or monthly (1M) AND you have NOT zoomed out yet:
   ${hasZoomed ? 'SKIP THIS — you already zoomed out.' : 'ALWAYS zoom out first to see multi-month / multi-year structures (Cup & Handle, H&S, large triangles).'}
   RESPOND: { "action": "zoom_out", "reason": "Zooming out on weekly to reveal larger multi-month patterns (Cup & Handle, Head & Shoulders, etc.).", "stepSummary": "Brief note on what you see so far on this timeframe." }
   DO NOT skip this step. DO NOT go straight to done without zooming out first.

   AFTER ZOOMING OUT: Carefully study the zoomed-out screenshot for large structural patterns.
   Look at the overall price shape — does it form a U-shape (Cup & Handle)? An M-shape (Double Top)? A W-shape (Double Bottom)?
   The algorithm often misses these on weekly data. YOUR VISUAL ANALYSIS IS CRITICAL HERE.

   CUP & HANDLE CHECKLIST (check EACH item):
   1. Is there a prior uptrend before the cup formation?
   2. Is there a rounded U-shape decline and recovery (the "cup")?
   3. How deep is the cup (typically 15-50% retracement)?
   4. Is the right side of the cup recovering back toward the left rim?
   5. Is there a small pullback near the rim forming a "handle"?
   6. What is the rim level (resistance) and the cup low (support)?
   If 3+ items are YES, report it as Cup & Handle with appropriate confidence.
   Do NOT call a U-shaped recovery a "Double Bottom" — a Double Bottom has TWO distinct lows at similar levels, while a Cup has a single rounded bottom.

► If timeframe is weekly (1W) or monthly (1M) AND you HAVE already zoomed out:
   You now have the full picture. Combine all computed TA data + visual patterns from all timeframes.
   RESPOND: { "action": "done", "text": "... full analysis combining all timeframe data ..." }

► If you have ALREADY seen analyses from 3+ timeframes (check PREVIOUS TIMEFRAME ANALYSES):
   RESPOND: { "action": "done", "text": "... full analysis combining all timeframe data ..." }

==================================================
PATTERN ANALYSIS (DATA-DRIVEN)
==================================================

You have COMPUTED data from the TA engine. Use it:

1. **Indicator Analysis**: Interpret RSI, MACD, Bollinger, Stochastic, ADX, CCI values
2. **Candlestick Patterns**: Confirm/interpret the algorithmically detected patterns
3. **Chart Patterns**: Validate the detected chart patterns (Double Top/Bottom, H&S, Triangles, Cup & Handle) using the screenshot for visual confirmation
4. **Crossovers**: Highlight any golden cross, death cross, MACD crossovers
5. **Multi-Timeframe Confluence**: When multiple timeframes agree, note the strength of the signal

==================================================
FINAL ANALYSIS FORMAT (for "text" field when action is "done")
==================================================

Your "text" MUST use markdown formatting. Use ACTUAL newline characters in the JSON string value (not the literal characters backslash-n).
Use ## for section headers. Use - for bullet points. Separate sections with blank lines.

Your "text" MUST follow this EXACT structure:

## SUMMARY

Symbol, timeframes reviewed, most important finding, overall bias.

## TECHNICAL INDICATORS

- RSI reading and interpretation
- MACD status and crossovers
- Moving average alignment (SMA 20/50/150/200)
- Bollinger Band position
- ADX trend strength
- CCI momentum and overbought/oversold
- Volume analysis (OBV)

## CANDLESTICK PATTERNS

List detected candlestick patterns with timeframe and interpretation.

## CHART PATTERNS

[THIS SECTION IS NON-NEGOTIABLE. ALWAYS INCLUDE IT.]
For EACH pattern: name, status (forming/completed/broken), confidence, key levels, implication.
Include both algorithmically detected AND visually confirmed patterns.

## KEY LEVELS

- Support zones
- Resistance zones
- Based on computed data + visual confirmation

## MULTI-TIMEFRAME CONFLUENCE

Where signals from different timeframes agree or conflict.

## ENTRY SCENARIOS

Max 2-3. Conditional language only.

## TRADE PLAN

For the HIGHEST PROBABILITY setup identified, provide:
- **Pattern**: Name the primary pattern driving this plan
- **Strategy**: Describe the trade strategy (e.g., "Breakout above cup rim", "Pullback to handle support")
- **Entry Zone**: Specific price zone for entry (range, not single price)
- **Stop Loss**: Specific invalidation level with reasoning (e.g., below handle low, below neckline)
- **Target 1**: First take-profit level with reasoning
- **Target 2**: Extended target if momentum continues
- **Risk/Reward Ratio**: Calculate approximate R:R based on entry, stop, and target
- **Confirmation Signals**: What must happen before entry is valid (volume, candle close, retest, etc.)
- Use conditional language: "If confirmed...", "Upon breakout..."
- NEVER say "buy now" or "sell now" — frame as scenarios

## RISK FACTORS

Invalidation conditions.

## WARNING

"Analysis is based on computed technical data and visible chart patterns. This is not financial advice."

==================================================
STRICT RULES
==================================================

- Your ENTIRE response is one JSON object. Nothing else.
- ALWAYS switch from daily to weekly before writing analysis.
- ALWAYS include the ## CHART PATTERNS section.
- USE the computed indicator values — do NOT re-guess from the image.
- NEVER provide financial advice or say buy/sell/enter now.`;
}

export function buildPatternDetectionPrompt(
  taResult: TAResult | undefined,
  timeframe: string,
  pageContext: PageContext,
  allTAResults: TAResult[],
  dataError?: string
): string {
  const sections: string[] = [
    `Current date: ${new Date().toISOString().split("T")[0]}`,
    `Symbol / Title: ${pageContext.title}`,
    `URL: ${pageContext.url}`,
    `Current timeframe: ${timeframe}`,
  ];

  if (dataError) {
    sections.push(`\n⚠️ DATA FETCH ERROR: ${dataError}`);
    sections.push("Fallback to visual-only analysis of the screenshot. Use the CHART PATTERNS section to describe what you see.");
  }

  if (taResult) {
    sections.push(`\n═══ TECHNICAL ANALYSIS DATA (${taResult.timeframe}) ═══`);
    sections.push(`Symbol: ${taResult.symbol} | Bars: ${taResult.bars} | Latest close: ${taResult.latestBar.close}`);

    // Indicators
    const ind = taResult.indicators;
    sections.push(`\n── Indicators ──`);
    if (ind.rsi != null) sections.push(`RSI(14): ${ind.rsi.toFixed(2)}${ind.rsi > 70 ? " ⚠ OVERBOUGHT" : ind.rsi < 30 ? " ⚠ OVERSOLD" : ""}`);
    if (ind.macdLine != null && ind.macdSignal != null) {
      sections.push(`MACD: line=${ind.macdLine.toFixed(4)}, signal=${ind.macdSignal.toFixed(4)}, histogram=${ind.macdHistogram?.toFixed(4) ?? "N/A"}`);
    }
    if (ind.sma20 != null) sections.push(`SMA(20): ${ind.sma20.toFixed(2)} | Price ${taResult.latestBar.close > ind.sma20 ? "ABOVE" : "BELOW"}`);
    if (ind.sma50 != null) sections.push(`SMA(50): ${ind.sma50.toFixed(2)} | Price ${taResult.latestBar.close > ind.sma50 ? "ABOVE" : "BELOW"}`);
    if (ind.sma150 != null) sections.push(`SMA(150): ${ind.sma150.toFixed(2)} | Price ${taResult.latestBar.close > ind.sma150 ? "ABOVE" : "BELOW"}`);
    if (ind.sma200 != null) sections.push(`SMA(200): ${ind.sma200.toFixed(2)} | Price ${taResult.latestBar.close > ind.sma200 ? "ABOVE" : "BELOW"}`);
    if (ind.bollingerUpper != null && ind.bollingerLower != null) {
      sections.push(`Bollinger Bands: upper=${ind.bollingerUpper.toFixed(2)}, middle=${ind.bollingerMiddle?.toFixed(2) ?? "?"}, lower=${ind.bollingerLower.toFixed(2)}`);
    }
    if (ind.atr != null) sections.push(`ATR(14): ${ind.atr.toFixed(4)}`);
    if (ind.stochasticK != null) sections.push(`Stochastic: K=${ind.stochasticK.toFixed(2)}, D=${ind.stochasticD?.toFixed(2) ?? "?"}`);
    if (ind.adx != null) sections.push(`ADX(14): ${ind.adx.toFixed(2)}${ind.adx > 25 ? " (trending)" : " (ranging)"}`);
    if (ind.cci != null) sections.push(`CCI(14): ${ind.cci.toFixed(2)}${ind.cci > 100 ? " ⚠ OVERBOUGHT" : ind.cci < -100 ? " ⚠ OVERSOLD" : ""}`);
    if (ind.obv != null) sections.push(`OBV: ${ind.obv.toFixed(0)}`);

    // Crossovers
    if (taResult.crossovers.length > 0) {
      sections.push(`\n── Crossovers (RECENT) ──`);
      for (const c of taResult.crossovers) sections.push(`• ${c}`);
    }

    // Candlestick patterns
    if (taResult.candlestickPatterns.length > 0) {
      sections.push(`\n── Candlestick Patterns (last 5 bars) ──`);
      for (const p of taResult.candlestickPatterns) {
        sections.push(`• ${p.name} (${p.type}) — bar ${p.barIndex === 0 ? "current" : `${p.barIndex} back`}`);
      }
    } else {
      sections.push(`\n── Candlestick Patterns ── None detected in last 5 bars`);
    }

    // Chart patterns
    if (taResult.chartPatterns.length > 0) {
      sections.push(`\n── Algorithmic Chart Patterns ──`);
      for (const p of taResult.chartPatterns) {
        sections.push(`• ${p.name} (${p.type}, ${p.status}, confidence: ${p.confidence})`);
        sections.push(`  ${p.description}`);
        if (p.keyLevels) {
          const kl = Object.entries(p.keyLevels).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v!.toFixed(2)}`).join(", ");
          if (kl) sections.push(`  Key levels: ${kl}`);
        }
      }
    } else {
      sections.push(`\n── Algorithmic Chart Patterns ── None detected automatically.`);
      sections.push(`⚠️ IMPORTANT: The algorithm may miss patterns. YOU MUST visually inspect the screenshot for chart patterns.`);
      sections.push(`Look specifically for: Cup & Handle, Head & Shoulders, Double Top/Bottom, Triangles, Flags, Wedges.`);
      sections.push(`Describe any pattern you see — even partial or forming ones — with approximate levels.`);
    }

    sections.push(`\n── Auto-Summary ──\n${taResult.summary}`);
  }

  // Previous timeframe results
  if (allTAResults.length > 1) {
    sections.push(`\n═══ PREVIOUS TIMEFRAME ANALYSES ═══`);
    for (const prev of allTAResults.slice(0, -1)) {
      sections.push(`\n[${prev.timeframe}] ${prev.symbol} — ${prev.bars} bars`);
      sections.push(`RSI: ${prev.indicators.rsi?.toFixed(2) ?? "N/A"} | MACD hist: ${prev.indicators.macdHistogram?.toFixed(4) ?? "N/A"}`);
      if (prev.candlestickPatterns.length > 0) {
        sections.push(`Candle patterns: ${prev.candlestickPatterns.map(p => p.name).join(", ")}`);
      }
      if (prev.chartPatterns.length > 0) {
        sections.push(`Chart patterns: ${prev.chartPatterns.map(p => `${p.name} (${p.status})`).join(", ")}`);
      }
      sections.push(`Summary: ${prev.summary}`);
    }
  }

  return sections.join("\n");
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

