import { GoogleGenAI } from "@google/genai";
import type { AnalysisResult, ChatMessage } from "../types/shared.js";

export class AIClient {
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(apiKey: string, model = "gemini-3.1-pro-preview") {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  private static parseDataUri(dataUri: string): { base64: string; mimeType: string } {
    const match = dataUri.match(/^data:([^;]+);base64,(.*)$/);
    if (!match) {
      throw new Error("Screenshot must be a base64 data URL (data:<mime>;base64,...)`.");
    }

    const [, mimeType, base64] = match;
    return { base64, mimeType };
  }

  async analyze(params: {
    systemPrompt: string;
    userPrompt: string;
    screenshot: string;
    chatHistory?: ChatMessage[];
    initialContextPrompt?: string;
  }): Promise<AnalysisResult> {
    const { base64, mimeType } = AIClient.parseDataUri(params.screenshot);

    let contents: object[];

    if (params.chatHistory && params.chatHistory.length > 0 && params.initialContextPrompt) {
      // Multi-turn: reconstruct full conversation
      contents = [
        // Synthetic first turn: original chart context + screenshot
        {
          role: "user",
          parts: [
            { text: params.initialContextPrompt },
            { inlineData: { data: base64, mimeType } }
          ]
        },
        // Previous turns from history
        ...params.chatHistory.map((msg) => ({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.text }]
        })),
        // Current question
        { role: "user", parts: [{ text: params.userPrompt }] }
      ];
    } else {
      contents = [
        {
          role: "user",
          parts: [
            { text: params.userPrompt },
            { inlineData: { data: base64, mimeType } }
          ]
        }
      ];
    }

    const response = await this.client.models.generateContent({
      model: this.model,
      contents,
      config: {
        systemInstruction: [{ text: params.systemPrompt }],
        thinkingConfig: { thinkingBudget: -1 },
      }
    });

    const outputText = response.text;
    if (!outputText) {
      throw new Error("Model returned no output text.");
    }

    return { text: outputText };
  }
}

