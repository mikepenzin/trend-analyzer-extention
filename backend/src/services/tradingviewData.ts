import TradingView from "@mathieuc/tradingview";
import type { OHLCVBar } from "../types/shared.js";

const TV_SESSION = () => process.env.TV_SESSION ?? "";
const TV_SIGNATURE = () => process.env.TV_SIGNATURE ?? "";

/** Map user-facing timeframe codes to TradingView chart timeframe strings */
const TIMEFRAME_MAP: Record<string, string> = {
  "1m": "1", "5m": "5", "15m": "15", "30m": "30",
  "1h": "60", "1H": "60", "2h": "120", "2H": "120",
  "4h": "240", "4H": "240",
  "1D": "D", "D": "D", "3D": "3D",
  "1W": "W", "W": "W",
  "1M": "M", "M": "M",
};

/**
 * Fetch OHLCV candle data for a symbol from TradingView's WebSocket API.
 *
 * @param symbol  TradingView symbol (e.g. "NASDAQ:AAPL" or "BINANCE:BTCUSDT")
 * @param timeframe  Timeframe code (e.g. "1D", "1W", "4H")
 * @param count  Number of candles to fetch (default 300)
 * @returns Array of OHLCV bars, oldest first
 */
export async function fetchOHLCV(
  symbol: string,
  timeframe: string,
  count = 300
): Promise<OHLCVBar[]> {
  const session = TV_SESSION();
  const signature = TV_SIGNATURE();

  const clientOptions: Record<string, string> = {};
  if (session && signature) {
    clientOptions.token = session;
    clientOptions.signature = signature;
  }

  const client = new TradingView.Client(clientOptions);
  const chart = new client.Session.Chart();

  const tvTimeframe = TIMEFRAME_MAP[timeframe] ?? timeframe;

  return new Promise<OHLCVBar[]>((resolve, reject) => {
    const timeout = setTimeout(() => {
      try { client.end(); } catch { /* ignore */ }
      reject(new Error(`TradingView data fetch timed out for ${symbol} ${timeframe}`));
    }, 30_000);

    chart.setMarket(symbol, {
      timeframe: tvTimeframe,
      range: count,
    });

    chart.onError((...err: unknown[]) => {
      clearTimeout(timeout);
      try { client.end(); } catch { /* ignore */ }
      reject(new Error(`TradingView chart error: ${err.join(", ")}`));
    });

    chart.onUpdate(() => {
      if (!chart.periods || chart.periods.length === 0) return;

      clearTimeout(timeout);

      // Debug: log the first raw period to see actual property names
      const firstPeriod = chart.periods[0];
      console.log("[TV Data] Raw period keys:", Object.keys(firstPeriod));
      console.log("[TV Data] First raw period:", JSON.stringify(firstPeriod).slice(0, 500));

      const bars: OHLCVBar[] = chart.periods
        .filter((p: Record<string, unknown>) => p.time != null)
        .map((p: Record<string, unknown>) => ({
          time: p.time as number,
          open: p.open as number,
          high: (p.max ?? p.high) as number,
          low: (p.min ?? p.low) as number,
          close: p.close as number,
          volume: (p.volume as number) ?? 0,
        }))
        .sort((a: OHLCVBar, b: OHLCVBar) => a.time - b.time); // oldest first

      // Debug: log first mapped bar to check if values are valid
      if (bars.length > 0) {
        console.log("[TV Data] First mapped bar:", JSON.stringify(bars[0]));
        console.log("[TV Data] Last mapped bar:", JSON.stringify(bars[bars.length - 1]));
      }

      try {
        chart.delete();
        client.end();
      } catch { /* ignore */ }

      resolve(bars);
    });
  });
}

/**
 * Extract the TradingView-compatible symbol from a page title.
 * e.g. "AAPL, D — TradingView" → "NASDAQ:AAPL" (best effort)
 * e.g. "SEDG · 1W · NASDAQ — TradingView" → "NASDAQ:SEDG"
 */
export function extractSymbolFromTitle(title: string): string {
  // Try pattern: "SYMBOL · TF · EXCHANGE" or "SYMBOL, TF, EXCHANGE"
  const match1 = title.match(/^([A-Z0-9.]+)\s*[·,]\s*\S+\s*[·,]\s*(\w+)/);
  if (match1) {
    return `${match1[2]}:${match1[1]}`;
  }

  // Try pattern: "EXCHANGE:SYMBOL" already in the title
  const match2 = title.match(/\b([A-Z]+):([A-Z0-9.]+)\b/);
  if (match2) {
    return `${match2[1]}:${match2[2]}`;
  }

  // Fallback: first word is the ticker, guess common exchanges
  const ticker = title.split(/[\s,·—-]/)[0].trim();
  if (ticker) {
    return ticker; // Let TradingView resolve it
  }

  return "";
}
