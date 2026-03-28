import {
  SMA, EMA, RSI, MACD, BollingerBands, ATR, Stochastic, ADX, OBV, VWAP,
  CrossUp, CrossDown, CCI,
} from "technicalindicators";

// Candlestick pattern functions — available in v3 as lowercase named exports
import {
  doji, abandonedbaby, bearishengulfingpattern, bullishengulfingpattern,
  darkcloudcover, dragonflydoji, eveningdojistar, eveningstar,
  gravestonedoji, hammerpattern, hangingman,
  morningdojistar, morningstar, piercingline,
  shootingstar, threeblackcrows, threewhitesoldiers,
  tweezertop, tweezerbottom,
  bearishharami, bullishharami, bearishharamicross, bullishharamicross,
  bearishmarubozu, bullishmarubozu,
  bearishspinningtop, bullishspinningtop,
  bearishhammerstick, bearishinvertedhammerstick,
  bullishhammerstick, bullishinvertedhammerstick,
} from "technicalindicators";

import type { OHLCVBar, TAResult, CandlestickPattern, ChartPattern } from "../types/shared.js";

// ═══════════════════════════════════════════════════════
// Candlestick pattern registry
// ═══════════════════════════════════════════════════════

interface CandleInput {
  open: number[];
  high: number[];
  low: number[];
  close: number[];
}

const CANDLE_PATTERNS: Array<{
  name: string;
  type: "bullish" | "bearish" | "neutral";
  fn: (input: CandleInput) => boolean;
}> = [
  { name: "Doji", type: "neutral", fn: doji },
  { name: "Abandoned Baby", type: "neutral", fn: abandonedbaby },
  { name: "Bearish Engulfing", type: "bearish", fn: bearishengulfingpattern },
  { name: "Bullish Engulfing", type: "bullish", fn: bullishengulfingpattern },
  { name: "Dark Cloud Cover", type: "bearish", fn: darkcloudcover },
  { name: "Dragonfly Doji", type: "bullish", fn: dragonflydoji },
  { name: "Evening Doji Star", type: "bearish", fn: eveningdojistar },
  { name: "Evening Star", type: "bearish", fn: eveningstar },
  { name: "Gravestone Doji", type: "bearish", fn: gravestonedoji },
  { name: "Hammer", type: "bullish", fn: hammerpattern },
  { name: "Hanging Man", type: "bearish", fn: hangingman },
  { name: "Morning Doji Star", type: "bullish", fn: morningdojistar },
  { name: "Morning Star", type: "bullish", fn: morningstar },
  { name: "Piercing Line", type: "bullish", fn: piercingline },
  { name: "Shooting Star", type: "bearish", fn: shootingstar },
  { name: "Three Black Crows", type: "bearish", fn: threeblackcrows },
  { name: "Three White Soldiers", type: "bullish", fn: threewhitesoldiers },
  { name: "Tweezer Top", type: "bearish", fn: tweezertop },
  { name: "Tweezer Bottom", type: "bullish", fn: tweezerbottom },
  { name: "Bearish Harami", type: "bearish", fn: bearishharami },
  { name: "Bullish Harami", type: "bullish", fn: bullishharami },
  { name: "Bearish Harami Cross", type: "bearish", fn: bearishharamicross },
  { name: "Bullish Harami Cross", type: "bullish", fn: bullishharamicross },
  { name: "Bearish Marubozu", type: "bearish", fn: bearishmarubozu },
  { name: "Bullish Marubozu", type: "bullish", fn: bullishmarubozu },
  { name: "Bearish Spinning Top", type: "bearish", fn: bearishspinningtop },
  { name: "Bullish Spinning Top", type: "bullish", fn: bullishspinningtop },
  { name: "Bearish Hammer", type: "bearish", fn: bearishhammerstick },
  { name: "Bearish Inverted Hammer", type: "bearish", fn: bearishinvertedhammerstick },
  { name: "Bullish Hammer", type: "bullish", fn: bullishhammerstick },
  { name: "Bullish Inverted Hammer", type: "bullish", fn: bullishinvertedhammerstick },
];

// ═══════════════════════════════════════════════════════
// Main TA computation
// ═══════════════════════════════════════════════════════

export function runTechnicalAnalysis(bars: OHLCVBar[], symbol: string, timeframe: string): TAResult {
  // Filter out bars with invalid OHLCV data
  const validBars = bars.filter(b =>
    b.close != null && Number.isFinite(b.close) &&
    b.high != null && Number.isFinite(b.high) &&
    b.low != null && Number.isFinite(b.low) &&
    b.open != null && Number.isFinite(b.open)
  );
  if (validBars.length < 10) throw new Error(`Insufficient valid bars: ${validBars.length} of ${bars.length}`);

  const closes = validBars.map(b => b.close);
  const highs = validBars.map(b => b.high);
  const lows = validBars.map(b => b.low);
  const opens = validBars.map(b => b.open);
  const volumes = validBars.map(b => b.volume ?? 0);
  const n = validBars.length;
  const latest = validBars[n - 1];

  // --- Indicators ---
  const sma20 = SMA.calculate({ period: 20, values: closes });
  const sma50 = SMA.calculate({ period: 50, values: closes });
  const sma150 = SMA.calculate({ period: 150, values: closes });
  const sma200 = SMA.calculate({ period: 200, values: closes });
  const ema12 = EMA.calculate({ period: 12, values: closes });
  const ema26 = EMA.calculate({ period: 26, values: closes });
  const rsi14 = RSI.calculate({ period: 14, values: closes });

  const macdResult = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });

  const bb = BollingerBands.calculate({
    period: 20,
    values: closes,
    stdDev: 2,
  });

  const atr14 = ATR.calculate({ period: 14, high: highs, low: lows, close: closes });

  const stoch = Stochastic.calculate({
    high: highs,
    low: lows,
    close: closes,
    period: 14,
    signalPeriod: 3,
  });

  const adx14 = ADX.calculate({ period: 14, high: highs, low: lows, close: closes });
  const cci14 = CCI.calculate({ period: 14, high: highs, low: lows, close: closes });
  const obvResult = OBV.calculate({ close: closes, volume: volumes });

  let vwapResult: number[] = [];
  try {
    vwapResult = VWAP.calculate({ high: highs, low: lows, close: closes, volume: volumes });
  } catch { /* VWAP may fail on some inputs */ }

  // --- Last values ---
  const last = <T>(arr: T[]): T | null => (arr.length > 0 ? arr[arr.length - 1] : null);
  /** Return the last numeric value, or null if NaN/undefined */
  const lastNum = (arr: number[]): number | null => {
    const v = last(arr);
    return v != null && Number.isFinite(v) ? v : null;
  };
  const lastMacd = last(macdResult);
  const lastBB = last(bb);
  const lastStoch = last(stoch);

  // --- Crossovers ---
  const crossovers: string[] = [];

  // SMA crossovers (need aligned arrays)
  if (sma50.length >= 2 && sma200.length >= 2) {
    const alignedLen = Math.min(sma50.length, sma200.length);
    const s50 = sma50.slice(-alignedLen);
    const s200 = sma200.slice(-alignedLen);

    const goldenCross = CrossUp.calculate({ lineA: s50, lineB: s200 });
    const deathCross = CrossDown.calculate({ lineA: s50, lineB: s200 });

    if (goldenCross.length > 0 && goldenCross[goldenCross.length - 1]) {
      crossovers.push("Golden Cross (SMA50 crossed above SMA200) — bullish long-term signal");
    }
    if (deathCross.length > 0 && deathCross[deathCross.length - 1]) {
      crossovers.push("Death Cross (SMA50 crossed below SMA200) — bearish long-term signal");
    }
  }

  // SMA 50/150 crossover
  if (sma50.length >= 2 && sma150.length >= 2) {
    const alignedLen = Math.min(sma50.length, sma150.length);
    const s50 = sma50.slice(-alignedLen);
    const s150 = sma150.slice(-alignedLen);

    const bullish = CrossUp.calculate({ lineA: s50, lineB: s150 });
    const bearish = CrossDown.calculate({ lineA: s50, lineB: s150 });

    if (bullish.length > 0 && bullish[bullish.length - 1]) {
      crossovers.push("SMA50 crossed above SMA150 — bullish intermediate signal");
    }
    if (bearish.length > 0 && bearish[bearish.length - 1]) {
      crossovers.push("SMA50 crossed below SMA150 — bearish intermediate signal");
    }
  }

  // MACD crossover
  if (macdResult.length >= 2) {
    const prev = macdResult[macdResult.length - 2];
    const curr = macdResult[macdResult.length - 1];
    if (prev.MACD != null && prev.signal != null && curr.MACD != null && curr.signal != null) {
      if (prev.MACD <= prev.signal && curr.MACD > curr.signal) {
        crossovers.push("MACD bullish crossover (MACD line crossed above signal)");
      }
      if (prev.MACD >= prev.signal && curr.MACD < curr.signal) {
        crossovers.push("MACD bearish crossover (MACD line crossed below signal)");
      }
    }
  }

  // EMA 12/26 crossover
  if (ema12.length >= 2 && ema26.length >= 2) {
    const alignedLen = Math.min(ema12.length, ema26.length);
    const e12 = ema12.slice(-alignedLen);
    const e26 = ema26.slice(-alignedLen);
    const bullish = CrossUp.calculate({ lineA: e12, lineB: e26 });
    const bearish = CrossDown.calculate({ lineA: e12, lineB: e26 });
    if (bullish.length > 0 && bullish[bullish.length - 1]) {
      crossovers.push("EMA 12/26 bullish crossover");
    }
    if (bearish.length > 0 && bearish[bearish.length - 1]) {
      crossovers.push("EMA 12/26 bearish crossover");
    }
  }

  // --- Candlestick patterns (scan last 5 bars) ---
  const candlestickPatterns: CandlestickPattern[] = [];
  const scanWindow = 5;

  for (let offset = 0; offset < Math.min(scanWindow, n - 2); offset++) {
    const endIdx = n - offset;
    const startIdx = Math.max(0, endIdx - 5); // patterns need at most 5 candles of context
    const slice: CandleInput = {
      open: opens.slice(startIdx, endIdx),
      high: highs.slice(startIdx, endIdx),
      low: lows.slice(startIdx, endIdx),
      close: closes.slice(startIdx, endIdx),
    };

    for (const pattern of CANDLE_PATTERNS) {
      try {
        if (pattern.fn(slice)) {
          // Avoid duplicates
          if (!candlestickPatterns.some(p => p.name === pattern.name && p.barIndex === offset)) {
            candlestickPatterns.push({
              name: pattern.name,
              type: pattern.type,
              barIndex: offset,
            });
          }
        }
      } catch { /* some patterns may throw on short input — skip */ }
    }
  }

  // --- Chart patterns (structural analysis using pivot points) ---
  let chartPatterns: ChartPattern[] = [];
  try {
    chartPatterns = detectChartPatterns(closes, highs, lows, n);
  } catch (e) {
    console.warn(`[TA] Chart pattern detection error: ${e instanceof Error ? e.message : e}`);
  }

  // --- Summary ---
  const rsiVal = last(rsi14);
  const summaryParts: string[] = [];

  if (rsiVal != null) {
    if (rsiVal > 70) summaryParts.push(`RSI: ${rsiVal.toFixed(1)} (overbought)`);
    else if (rsiVal < 30) summaryParts.push(`RSI: ${rsiVal.toFixed(1)} (oversold)`);
    else summaryParts.push(`RSI: ${rsiVal.toFixed(1)}`);
  }

  if (lastMacd?.histogram != null) {
    summaryParts.push(`MACD histogram: ${lastMacd.histogram.toFixed(2)} (${lastMacd.histogram > 0 ? "bullish" : "bearish"})`);
  }

  if (crossovers.length > 0) {
    summaryParts.push(...crossovers);
  }

  if (candlestickPatterns.length > 0) {
    const recent = candlestickPatterns.filter(p => p.barIndex <= 1);
    if (recent.length > 0) {
      summaryParts.push(`Candlestick: ${recent.map(p => `${p.name} (${p.type})`).join(", ")}`);
    }
  }

  if (chartPatterns.length > 0) {
    summaryParts.push(`Chart patterns: ${chartPatterns.map(p => `${p.name} (${p.status}, ${p.confidence})`).join(", ")}`);
  }

  // Price vs MAs
  if (sma20.length > 0 && sma50.length > 0) {
    const price = latest.close;
    const above20 = price > sma20[sma20.length - 1];
    const above50 = price > sma50[sma50.length - 1];
    const above150 = sma150.length > 0 ? price > sma150[sma150.length - 1] : null;
    const above200 = sma200.length > 0 ? price > sma200[sma200.length - 1] : null;

    if (above20 && above50 && above150 === true && above200 === true) {
      summaryParts.push("Price above SMA 20/50/150/200 — strong uptrend structure");
    } else if (!above20 && !above50 && above150 === false && above200 === false) {
      summaryParts.push("Price below SMA 20/50/150/200 — strong downtrend structure");
    }
  }

  return {
    symbol,
    timeframe,
    bars: n,
    latestBar: latest,
    indicators: {
      rsi: rsiVal != null && Number.isFinite(rsiVal) ? rsiVal : null,
      macdLine: lastMacd?.MACD != null && Number.isFinite(lastMacd.MACD) ? lastMacd.MACD : null,
      macdSignal: lastMacd?.signal != null && Number.isFinite(lastMacd.signal) ? lastMacd.signal : null,
      macdHistogram: lastMacd?.histogram != null && Number.isFinite(lastMacd.histogram) ? lastMacd.histogram : null,
      sma20: lastNum(sma20),
      sma50: lastNum(sma50),
      sma150: lastNum(sma150),
      sma200: lastNum(sma200),
      ema12: lastNum(ema12),
      ema26: lastNum(ema26),
      bollingerUpper: lastBB?.upper != null && Number.isFinite(lastBB.upper) ? lastBB.upper : null,
      bollingerMiddle: lastBB?.middle != null && Number.isFinite(lastBB.middle) ? lastBB.middle : null,
      bollingerLower: lastBB?.lower != null && Number.isFinite(lastBB.lower) ? lastBB.lower : null,
      atr: lastNum(atr14),
      stochasticK: lastStoch?.k != null && Number.isFinite(lastStoch.k) ? lastStoch.k : null,
      stochasticD: lastStoch?.d != null && Number.isFinite(lastStoch.d) ? lastStoch.d : null,
      adx: (() => { const v = adx14.length > 0 ? (adx14[adx14.length - 1] as unknown as { adx: number })?.adx : null; return v != null && Number.isFinite(v) ? v : null; })(),
      cci: lastNum(cci14),
      obv: lastNum(obvResult),
      vwap: lastNum(vwapResult),
    },
    candlestickPatterns,
    chartPatterns,
    crossovers,
    summary: summaryParts.join(" | "),
  };
}

// ═══════════════════════════════════════════════════════
// Chart pattern detection (structural)
// ═══════════════════════════════════════════════════════

function detectChartPatterns(
  closes: number[],
  highs: number[],
  lows: number[],
  n: number
): ChartPattern[] {
  const patterns: ChartPattern[] = [];
  if (n < 30) return patterns; // Need enough data for patterns

  // Find pivot highs and pivot lows (using 5-bar lookback/forward)
  const pivotHighs: Array<{ index: number; value: number }> = [];
  const pivotLows: Array<{ index: number; value: number }> = [];
  const pivotWindow = 5;

  for (let i = pivotWindow; i < n - pivotWindow; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= pivotWindow; j++) {
      if (highs[i] <= highs[i - j] || highs[i] <= highs[i + j]) isHigh = false;
      if (lows[i] >= lows[i - j] || lows[i] >= lows[i + j]) isLow = false;
    }
    if (isHigh) pivotHighs.push({ index: i, value: highs[i] });
    if (isLow) pivotLows.push({ index: i, value: lows[i] });
  }

  // --- Double Top ---
  detectDoubleTop(pivotHighs, closes, n, patterns);

  // --- Double Bottom ---
  detectDoubleBottom(pivotLows, closes, n, patterns);

  // --- Head and Shoulders ---
  detectHeadAndShoulders(pivotHighs, pivotLows, closes, n, patterns);

  // --- Ascending / Descending Triangle ---
  detectTriangles(pivotHighs, pivotLows, closes, n, patterns);

  // --- Cup and Handle ---
  detectCupAndHandle(pivotLows, pivotHighs, closes, highs, lows, n, patterns);

  return patterns;
}

function detectDoubleTop(
  pivotHighs: Array<{ index: number; value: number }>,
  closes: number[],
  n: number,
  patterns: ChartPattern[]
): void {
  if (pivotHighs.length < 2) return;

  for (let i = pivotHighs.length - 1; i >= 1; i--) {
    const p2 = pivotHighs[i];
    const p1 = pivotHighs[i - 1];
    const tolerance = p1.value * 0.02; // within 2%

    if (Math.abs(p1.value - p2.value) <= tolerance && p2.index - p1.index >= 10) {
      const currentPrice = closes[n - 1];
      const isBelow = currentPrice < Math.min(p1.value, p2.value);
      patterns.push({
        name: "Double Top",
        type: "bearish",
        status: isBelow ? "completed" : "forming",
        confidence: isBelow ? "high" : "medium",
        description: `Two peaks near ${p1.value.toFixed(2)} with ${p2.index - p1.index} bars apart`,
        keyLevels: { resistance: (p1.value + p2.value) / 2 },
      });
      return;
    }
  }
}

function detectDoubleBottom(
  pivotLows: Array<{ index: number; value: number }>,
  closes: number[],
  n: number,
  patterns: ChartPattern[]
): void {
  if (pivotLows.length < 2) return;

  for (let i = pivotLows.length - 1; i >= 1; i--) {
    const p2 = pivotLows[i];
    const p1 = pivotLows[i - 1];
    const tolerance = p1.value * 0.02;

    if (Math.abs(p1.value - p2.value) <= tolerance && p2.index - p1.index >= 10) {
      const currentPrice = closes[n - 1];
      const isAbove = currentPrice > Math.max(p1.value, p2.value);
      patterns.push({
        name: "Double Bottom",
        type: "bullish",
        status: isAbove ? "completed" : "forming",
        confidence: isAbove ? "high" : "medium",
        description: `Two troughs near ${p1.value.toFixed(2)} with ${p2.index - p1.index} bars apart`,
        keyLevels: { support: (p1.value + p2.value) / 2 },
      });
      return;
    }
  }
}

function detectHeadAndShoulders(
  pivotHighs: Array<{ index: number; value: number }>,
  _pivotLows: Array<{ index: number; value: number }>,
  closes: number[],
  n: number,
  patterns: ChartPattern[]
): void {
  if (pivotHighs.length < 3) return;

  for (let i = pivotHighs.length - 1; i >= 2; i--) {
    const right = pivotHighs[i];
    const head = pivotHighs[i - 1];
    const left = pivotHighs[i - 2];
    const shoulderTol = Math.max(left.value, right.value) * 0.03;

    // Head must be the highest, shoulders approximately equal
    if (head.value > left.value && head.value > right.value &&
      Math.abs(left.value - right.value) <= shoulderTol) {
      const neckline = Math.min(left.value, right.value) * 0.97;
      const currentPrice = closes[n - 1];
      const broken = currentPrice < neckline;
      patterns.push({
        name: "Head and Shoulders",
        type: "bearish",
        status: broken ? "broken" : "forming",
        confidence: broken ? "high" : "medium",
        description: `Left shoulder ~${left.value.toFixed(2)}, head ~${head.value.toFixed(2)}, right shoulder ~${right.value.toFixed(2)}`,
        keyLevels: { neckline, resistance: head.value },
      });
      return;
    }
  }

  // Inverse H&S (using pivot lows would be proper but this is a simplified check)
  const pivotLows = _pivotLows;
  if (pivotLows.length >= 3) {
    for (let i = pivotLows.length - 1; i >= 2; i--) {
      const right = pivotLows[i];
      const head = pivotLows[i - 1];
      const left = pivotLows[i - 2];
      const shoulderTol = Math.max(left.value, right.value) * 0.03;

      if (head.value < left.value && head.value < right.value &&
        Math.abs(left.value - right.value) <= shoulderTol) {
        const neckline = Math.max(left.value, right.value) * 1.03;
        const currentPrice = closes[n - 1];
        const broken = currentPrice > neckline;
        patterns.push({
          name: "Inverse Head and Shoulders",
          type: "bullish",
          status: broken ? "broken" : "forming",
          confidence: broken ? "high" : "medium",
          description: `Left shoulder ~${left.value.toFixed(2)}, head ~${head.value.toFixed(2)}, right shoulder ~${right.value.toFixed(2)}`,
          keyLevels: { neckline, support: head.value },
        });
        return;
      }
    }
  }
}

function detectTriangles(
  pivotHighs: Array<{ index: number; value: number }>,
  pivotLows: Array<{ index: number; value: number }>,
  _closes: number[],
  _n: number,
  patterns: ChartPattern[]
): void {
  if (pivotHighs.length < 3 || pivotLows.length < 3) return;

  // Take the last 3 pivot highs and lows
  const recentHighs = pivotHighs.slice(-3);
  const recentLows = pivotLows.slice(-3);

  const highsDescending = recentHighs[0].value > recentHighs[1].value && recentHighs[1].value > recentHighs[2].value;
  const highsFlat = Math.abs(recentHighs[0].value - recentHighs[2].value) / recentHighs[0].value < 0.02;
  const lowsAscending = recentLows[0].value < recentLows[1].value && recentLows[1].value < recentLows[2].value;
  const lowsFlat = Math.abs(recentLows[0].value - recentLows[2].value) / recentLows[0].value < 0.02;

  if (highsFlat && lowsAscending) {
    patterns.push({
      name: "Ascending Triangle",
      type: "bullish",
      status: "forming",
      confidence: "medium",
      description: "Flat resistance with rising support — typically bullish breakout pattern",
      keyLevels: { resistance: recentHighs[2].value, support: recentLows[2].value },
    });
  } else if (lowsFlat && highsDescending) {
    patterns.push({
      name: "Descending Triangle",
      type: "bearish",
      status: "forming",
      confidence: "medium",
      description: "Flat support with declining resistance — typically bearish breakdown pattern",
      keyLevels: { support: recentLows[2].value, resistance: recentHighs[2].value },
    });
  } else if (highsDescending && lowsAscending) {
    patterns.push({
      name: "Symmetrical Triangle",
      type: "neutral",
      status: "forming",
      confidence: "medium",
      description: "Converging trendlines — breakout direction uncertain",
    });
  }
}

function detectCupAndHandle(
  pivotLows: Array<{ index: number; value: number }>,
  _pivotHighs: Array<{ index: number; value: number }>,
  closes: number[],
  highs: number[],
  lows: number[],
  n: number,
  patterns: ChartPattern[]
): void {
  if (n < 30) return;

  const currentPrice = closes[n - 1];
  console.log(`[CupDetect] n=${n}, currentPrice=${currentPrice.toFixed(2)}`);

  let bestPattern: ChartPattern | null = null;
  let bestScore = 0;
  let candidatesChecked = 0;
  let rimMatchCount = 0;

  // Scan each historical bar as a potential left rim
  for (let i = 0; i < n - 15; i++) {
    const leftRimValue = highs[i];

    // Left rim must be near current price (within 25%)
    const rimDiff = Math.abs(leftRimValue - currentPrice) / leftRimValue;
    if (rimDiff > 0.25) continue;
    if (currentPrice < leftRimValue * 0.70) continue;

    rimMatchCount++;
    const cupWidth = (n - 1) - i;
    if (cupWidth < 12) continue;

    // Find the deepest low between left rim and now
    let minVal = Infinity;
    let minIdx = i;
    for (let j = i + 1; j < n - 1; j++) {
      if (lows[j] < minVal) {
        minVal = lows[j];
        minIdx = j;
      }
    }

    // Cup must dip at least 15% below the left rim
    const depth = (leftRimValue - minVal) / leftRimValue;
    if (depth < 0.15 || depth > 0.93) {
      if (candidatesChecked < 5) console.log(`[CupDetect] i=${i} rim=${leftRimValue.toFixed(2)} rejected: depth=${(depth * 100).toFixed(0)}%`);
      candidatesChecked++;
      continue;
    }

    // Low should not be at the very edges
    const lowPosition = (minIdx - i) / cupWidth;
    if (lowPosition < 0.08 || lowPosition > 0.92) {
      if (candidatesChecked < 5) console.log(`[CupDetect] i=${i} rim=${leftRimValue.toFixed(2)} rejected: lowPos=${lowPosition.toFixed(2)}`);
      candidatesChecked++;
      continue;
    }

    // U-shape verification: average of first third and last third must be
    // above the average of the middle third
    const third = Math.floor(cupWidth / 3);
    let leftAvg = 0, midAvg = 0, rightAvg = 0;
    let lc = 0, mc = 0, rc = 0;
    for (let j = i + 1; j < n; j++) {
      const pos = j - i;
      if (pos <= third) { leftAvg += closes[j]; lc++; }
      else if (pos <= third * 2) { midAvg += closes[j]; mc++; }
      else { rightAvg += closes[j]; rc++; }
    }
    if (lc === 0 || mc === 0 || rc === 0) continue;
    leftAvg /= lc;
    midAvg /= mc;
    rightAvg /= rc;

    // Both edges must be higher than the middle (U-shape)
    if (leftAvg <= midAvg || rightAvg <= midAvg) {
      if (candidatesChecked < 5) console.log(`[CupDetect] i=${i} rim=${leftRimValue.toFixed(2)} rejected: U-shape fail leftAvg=${leftAvg.toFixed(2)} midAvg=${midAvg.toFixed(2)} rightAvg=${rightAvg.toFixed(2)}`);
      candidatesChecked++;
      continue;
    }

    // Additional: the right edge average should be recovering (not still declining)
    const last20Start = i + Math.floor(cupWidth * 0.80);
    if (last20Start < n - 2) {
      const late = closes.slice(last20Start, n);
      if (late.length >= 3 && late[late.length - 1] < late[Math.floor(late.length / 2)]) {
        if (candidatesChecked < 5) console.log(`[CupDetect] i=${i} rim=${leftRimValue.toFixed(2)} rejected: late decline`);
        candidatesChecked++;
        continue;
      }
    }

    // Score: prefer wider, deeper, more symmetric, better rim match
    const symmetry = 1 - Math.abs(lowPosition - 0.5);
    const widthScore = Math.min(cupWidth / 40, 1);
    const rimMatchScore = 1 - rimDiff / 0.25;
    const score = (symmetry * 2 + widthScore + rimMatchScore + depth) / 5;

    console.log(`[CupDetect] CANDIDATE i=${i} rim=${leftRimValue.toFixed(2)} min=${minVal.toFixed(2)} depth=${(depth * 100).toFixed(0)}% lowPos=${lowPosition.toFixed(2)} score=${score.toFixed(3)}`);

    if (score <= bestScore) continue;

    // Also check for local highs as better-defined left rims near this bar (±3 bars)
    let bestRimValue = leftRimValue;
    for (let k = Math.max(0, i - 3); k <= Math.min(n - 1, i + 3); k++) {
      if (highs[k] > bestRimValue) bestRimValue = highs[k];
    }

    const isNearRim = currentPrice >= bestRimValue * 0.88;
    const isBreakout = currentPrice > bestRimValue * 1.02;

    bestScore = score;
    bestPattern = {
      name: "Cup and Handle",
      type: "bullish",
      status: isBreakout ? "completed" : "forming",
      confidence: isBreakout ? "high" : isNearRim ? "high" : depth > 0.25 ? "medium" : "low",
      description: `U-shaped base from ~${minVal.toFixed(2)} to rim near ~${bestRimValue.toFixed(2)}, depth ${(depth * 100).toFixed(0)}%, width ${cupWidth} bars`,
      keyLevels: {
        support: minVal,
        resistance: bestRimValue,
        target: bestRimValue + (bestRimValue - minVal),
      },
    };
  }

  console.log(`[CupDetect] rimMatchCount=${rimMatchCount}, candidatesChecked=${candidatesChecked}, found=${!!bestPattern}`);

  if (bestPattern) {
    patterns.push(bestPattern);
  }
}
