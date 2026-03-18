import { GoogleGenAI } from "@google/genai";
import type { AnalysisResult } from "../types/shared.js";

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
  }): Promise<AnalysisResult> {
    const { base64, mimeType } = AIClient.parseDataUri(params.screenshot);

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [
        {
          role: "user",
          parts: [
            { text: params.userPrompt },
            {
              inlineData: {
                data: base64,
                mimeType,
              },
            }
          ]
        }
      ],
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

