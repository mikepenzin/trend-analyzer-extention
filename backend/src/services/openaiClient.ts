import OpenAI from "openai";
import type { AnalysisResult } from "../types/shared.js";

export class OpenAIClient {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model = "gpt-4o") {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async analyze(params: {
    systemPrompt: string;
    userPrompt: string;
    screenshot: string;
  }): Promise<AnalysisResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: params.systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: params.userPrompt },
            { type: "image_url", image_url: { url: params.screenshot, detail: "high" } },
          ],
        },
      ],
    });

    const text = response.choices[0]?.message?.content;
    if (!text) throw new Error("OpenAI returned no output text.");

    return { text };
  }
}
