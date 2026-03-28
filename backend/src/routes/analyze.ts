import { Router } from "express";
import { z } from "zod";
import { AIClient } from "../services/aiClient.js";
import { GroqClient } from "../services/groqClient.js";
import { OpenAIClient } from "../services/openaiClient.js";
import { buildSystemPrompt, buildFollowUpSystemPrompt, buildAgentSystemPrompt, buildAgentUserPrompt, buildPatternDetectionPrompt, buildUserPrompt, resolveMode } from "../services/promptBuilder.js";
import { fetchOHLCV, extractSymbolFromTitle } from "../services/tradingviewData.js";
import { runTechnicalAnalysis } from "../services/technicalAnalysis.js";
import type { ChatMessage, AgentStepResult, TAResult } from "../types/shared.js";

const linkSchema = z.object({
  text: z.string(),
  href: z.string().min(1)
});

const pageContextSchema = z.object({
  title: z.string(),
  url: z.string().min(1),
  headings: z.array(z.string()),
  visibleText: z.array(z.string()),
  links: z.array(linkSchema),
  selectedText: z.string(),
  metadata: z.object({
    detectedMode: z.enum(["page", "chart", "ui"]),
    isTradingView: z.boolean(),
    timestamp: z.string()
  })
});

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "notice", "step", "ta-data", "summary"]),
  text: z.string()
});

const analyzeRequestSchema = z.object({
  mode: z.enum(["auto", "page", "chart", "ui"]).default("auto"),
  provider: z.enum(["gemini", "groq", "openai", "both"]).default("gemini"),
  isFollowUp: z.boolean().default(false),
  isAgentic: z.boolean().default(false),
  agentTimeframe: z.string().default(""),
  symbol: z.string().default(""),
  userPrompt: z.string().default(""),
  chatHistory: z.array(chatMessageSchema).default([]),
  screenshot: z.string().min(1),
  pageContext: pageContextSchema,
  // Accumulated TA results from previous agent steps (sent by extension)
  previousTAResults: z.array(z.any()).default([]),
  // Whether the agent has already zoomed out on weekly
  hasZoomed: z.boolean().default(false),
});

function parseAgentResponse(raw: string): AgentStepResult {
  // 1. Try to find a JSON object anywhere in the response (handles preamble/postamble text)
  // 2. Fallback: strip code fences and try the whole string
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const candidate = jsonMatch ? jsonMatch[0] : raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    const action = (parsed.action as string) ?? "done";
    if (action === "done") {
      return { action: "done", text: formatAnalysisText((parsed.text as string) || ""), stepSummary: parsed.stepSummary as string | undefined };
    }
    if (action === "change_timeframe" || action === "zoom_out") {
      return {
        action,
        value: parsed.value as string | undefined,
        reason: parsed.reason as string | undefined,
        stepSummary: parsed.stepSummary as string | undefined,
      };
    }
    return { action: "done", text: formatAnalysisText(raw) };
  } catch {
    // JSON parse failed — treat raw text as the final analysis
    return { action: "done", text: formatAnalysisText(raw) };
  }
}

/** Ensure section headers are properly formatted as markdown */
function formatAnalysisText(text: string): string {
  let result = text;

  // Replace literal \n sequences (the AI sometimes outputs the characters \ and n instead of newlines)
  result = result.replace(/\\n/g, "\n");

  // If the text already has proper line breaks and markdown, clean up and return
  if (result.includes("\n## ")) {
    result = result.replace(/\n{3,}/g, "\n\n").trim();
    return result;
  }

  const sectionHeaders = [
    "SUMMARY",
    "OBSERVATIONS",
    "CHART PATTERNS",
    "INTERPRETATION",
    "KEY LEVELS",
    "ENTRY SCENARIOS",
    "POTENTIAL ENTRY SCENARIOS",
    "RISK FACTORS",
    "RISK / WARNINGS",
    "TRADING INSIGHTS",
    "WARNING",
  ];

  // Insert line breaks before section headers
  for (const header of sectionHeaders) {
    // Match the header as a standalone word (not already preceded by ##)
    const regex = new RegExp(`(?<!#)\\b(${header}(?:\\s*\\([^)]*\\))?)\\s`, "g");
    result = result.replace(regex, `\n\n## $1\n`);
  }

  // Fix sub-headers like "BREAKOUT SCENARIO", "PULLBACK SCENARIO"
  result = result.replace(/(?<!\n)\b([A-Z][A-Z &/]+SCENARIO(?:\s*\([^)]*\))?)\s/g, "\n\n### $1\n");

  // Ensure bullet-like patterns get line breaks (e.g., "Condition:" "Risk:" "Support" "Resistance")
  result = result.replace(/\.\s+((?:Condition|Risk|Interpretation|Support|Resistance|If (?:the|price)))/g, ".\n- $1");

  // Clean up excessive line breaks
  result = result.replace(/\n{3,}/g, "\n\n").trim();

  return result;
}

export function createAnalyzeRouter(clients: { gemini: AIClient; groq?: GroqClient; openai?: OpenAIClient }): Router {
  const router = Router();

  router.post("/", async (req, res) => {
    const parsed = analyzeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid analyze request.",
        details: parsed.error.flatten()
      });
      return;
    }

    try {
      const { mode, provider, isFollowUp, isAgentic, agentTimeframe, symbol, userPrompt, chatHistory, screenshot, pageContext, previousTAResults, hasZoomed } = parsed.data;
      const resolvedMode = resolveMode(mode, pageContext);

      // ── Agentic mode: fetch data → run TA → AI interprets with structured data ──
      if (isAgentic) {
        console.log(`[Agent] Agentic request: provider=${provider}, agentTimeframe="${agentTimeframe}", symbol="${symbol}"`);

        // Resolve the TradingView symbol
        const tvSymbol = symbol || extractSymbolFromTitle(pageContext.title);
        const tf = agentTimeframe || "1D";

        // Step 1: Fetch OHLCV data from TradingView
        let taResult: TAResult | undefined;
        let dataError: string | undefined;
        try {
          console.log(`[Agent] Fetching OHLCV data for ${tvSymbol} ${tf}...`);
          const bars = await fetchOHLCV(tvSymbol, tf, 300);
          console.log(`[Agent] Got ${bars.length} bars for ${tvSymbol} ${tf}`);

          // Step 2: Run technical analysis
          taResult = runTechnicalAnalysis(bars, tvSymbol, tf);
          console.log(`[Agent] TA complete: ${taResult.candlestickPatterns.length} candle patterns, ${taResult.chartPatterns.length} chart patterns, ${taResult.crossovers.length} crossovers`);
        } catch (err) {
          dataError = err instanceof Error ? err.message : "Failed to fetch market data";
          console.warn(`[Agent] Data fetch failed: ${dataError}`);
          if (err instanceof Error && err.stack) console.warn(`[Agent] Stack trace:`, err.stack);
        }

        // Step 3: Build prompt with TA data for AI interpretation
        const allTAResults = [...(previousTAResults as TAResult[]), ...(taResult ? [taResult] : [])];
        const agentParams = {
          systemPrompt: buildAgentSystemPrompt(tf, hasZoomed),
          userPrompt: buildPatternDetectionPrompt(taResult, tf, pageContext, allTAResults, dataError),
          screenshot,
          jsonMode: true,
        };
        console.log("[Agent] User prompt (first 500 chars):", agentParams.userPrompt.slice(0, 500));

        let rawText: string;
        const providerOrder = provider === "groq" ? ["groq", "openai", "gemini"] as const
          : provider === "openai" ? ["openai", "gemini", "groq"] as const
          : ["gemini", "openai", "groq"] as const;

        for (const p of providerOrder) {
          try {
            if (p === "groq" && clients.groq) {
              rawText = (await clients.groq.analyze(agentParams)).text;
            } else if (p === "openai" && clients.openai) {
              rawText = (await clients.openai.analyze(agentParams)).text;
            } else if (p === "gemini") {
              rawText = (await clients.gemini.analyze(agentParams)).text;
            } else {
              continue;
            }
            if (rawText) {
              if (p !== provider) console.log(`[Agent] Fell back from ${provider} to ${p}`);
              break;
            }
          } catch (err) {
            console.warn(`[Agent] Provider ${p} failed: ${err instanceof Error ? err.message : err}`);
          }
        }
        rawText ??= "";
        if (!rawText) {
          res.status(502).json({ error: "All AI providers failed. Please try again." });
          return;
        }
        console.log("[Agent] Raw model response (first 500 chars):", rawText.slice(0, 500));

        const agentResult = parseAgentResponse(rawText);
        // Attach TA data to the response so the extension can display it
        if (taResult) {
          agentResult.taData = taResult;
          agentResult.stepSummary = taResult.summary;
        }
        console.log("[Agent] Parsed action:", agentResult.action, "value:", agentResult.value);
        res.json(agentResult);
        return;
      }

      const systemPrompt = isFollowUp
        ? buildFollowUpSystemPrompt(resolvedMode, pageContext)
        : buildSystemPrompt(resolvedMode, pageContext);

      const useMultiTurn = isFollowUp && chatHistory.length > 0;
      const analyzeParams = useMultiTurn
        ? {
            systemPrompt,
            userPrompt,                                               // current question only
            screenshot,
            chatHistory: chatHistory as ChatMessage[],
            initialContextPrompt: buildUserPrompt(resolvedMode, pageContext, "")
          }
        : {
            systemPrompt,
            userPrompt: buildUserPrompt(resolvedMode, pageContext, userPrompt),
            screenshot
          };

      let text: string;

      if (provider === "both") {
        const tasks: Promise<{ label: string; text: string }>[] = [
          clients.gemini.analyze(analyzeParams).then(r => ({ label: "Gemini", text: r.text }))
        ];
        if (clients.groq) tasks.push(clients.groq.analyze(analyzeParams).then(r => ({ label: "Groq", text: r.text })));
        if (clients.openai) tasks.push(clients.openai.analyze(analyzeParams).then(r => ({ label: "OpenAI", text: r.text })));
        const results = await Promise.all(tasks);
        text = results.map(r => `## ${r.label}\n\n${r.text}`).join("\n\n---\n\n");
      } else if (provider === "groq" && clients.groq) {
        const result = await clients.groq.analyze(analyzeParams);
        text = result.text;
      } else if (provider === "openai" && clients.openai) {
        const result = await clients.openai.analyze(analyzeParams);
        text = result.text;
      } else {
        const result = await clients.gemini.analyze(analyzeParams);
        text = result.text;
      }

      res.json({
        text,
        meta: { modeUsed: resolvedMode, provider }
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Analysis failed."
      });
    }
  });

  return router;
}
