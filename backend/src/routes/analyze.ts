import { Router } from "express";
import { z } from "zod";
import { AIClient } from "../services/aiClient.js";
import { GroqClient } from "../services/groqClient.js";
import { OpenAIClient } from "../services/openaiClient.js";
import { buildSystemPrompt, buildFollowUpSystemPrompt, buildUserPrompt, resolveMode } from "../services/promptBuilder.js";

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

const analyzeRequestSchema = z.object({
  mode: z.enum(["auto", "page", "chart", "ui"]).default("auto"),
  provider: z.enum(["gemini", "groq", "openai", "both"]).default("gemini"),
  isFollowUp: z.boolean().default(false),
  userPrompt: z.string().default(""),
  screenshot: z.string().min(1),
  pageContext: pageContextSchema
});

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
      const { mode, provider, isFollowUp, userPrompt, screenshot, pageContext } = parsed.data;
      const resolvedMode = resolveMode(mode, pageContext);
      const systemPrompt = isFollowUp
        ? buildFollowUpSystemPrompt(resolvedMode, pageContext)
        : buildSystemPrompt(resolvedMode, pageContext);
      const analyzeParams = {
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
