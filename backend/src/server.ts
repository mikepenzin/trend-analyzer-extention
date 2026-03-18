import "dotenv/config";
import express from "express";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createAnalyzeRouter } from "./routes/analyze.js";
import { AIClient } from "./services/aiClient.js";
import { GroqClient } from "./services/groqClient.js";
import { OpenAIClient } from "./services/openaiClient.js";

const port = Number.parseInt(process.env.PORT || "8787", 10);
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const geminiModel = process.env.GEMINI_MODEL || "gemini-3.1-pro-preview";
const groqApiKey = process.env.GROQ_API_KEY;
const groqModel = process.env.GROQ_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";
const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiModel = process.env.OPENAI_MODEL || "gpt-4o";

if (!geminiApiKey) {
  throw new Error("GEMINI_API_KEY (or GOOGLE_API_KEY) is required in backend/.env or the process environment.");
}

const app = express();
const geminiClient = new AIClient(geminiApiKey, geminiModel);
const groqClient = groqApiKey ? new GroqClient(groqApiKey, groqModel) : undefined;
const openaiClient = openaiApiKey ? new OpenAIClient(openaiApiKey, openaiModel) : undefined;

if (!groqApiKey) console.warn("GROQ_API_KEY not set — Groq provider will be unavailable.");
if (!openaiApiKey) console.warn("OPENAI_API_KEY not set — OpenAI provider will be unavailable.");

app.use(express.json({ limit: "20mb" }));

// CORS — required for requests from the Chrome extension sidepanel
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-License-Key");
  if (_req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.get("/", (_req, res) => {
  res.json({ status: "alive", service: "Trend Analyzer Backend" });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const privacyHtml = readFileSync(join(__dirname, "privacy.html"), "utf-8");
app.get("/privacy", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(privacyHtml);
});

const allowedKeys = (process.env.ALLOWED_KEYS ?? "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);

app.use("/analyze", (req, res, next) => {
  if (allowedKeys.length === 0) return next(); // dev mode: no keys configured = open
  const key = req.headers["x-license-key"];
  if (!key || !allowedKeys.includes(key as string)) {
    res.status(401).json({ error: "Invalid or missing access key." });
    return;
  }
  next();
});

app.use("/analyze", createAnalyzeRouter({ gemini: geminiClient, groq: groqClient, openai: openaiClient }));

// Export for Vercel serverless
export default app;

// Only listen locally (Vercel handles listening in production)
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Trend Analyzer backend listening on http://localhost:${port}`);
  });
}
