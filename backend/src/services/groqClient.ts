import Groq from "groq-sdk";
import type { AnalysisResult } from "../types/shared.js";

export class GroqClient {
  private readonly client: Groq;
  private readonly model: string;

  constructor(apiKey: string, model = "meta-llama/llama-4-scout-17b-16e-instruct") {
    this.client = new Groq({ apiKey });
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
            { type: "image_url", image_url: { url: params.screenshot } },
          ],
        },
      ],
    });

    const text = response.choices[0]?.message?.content;
    if (!text) throw new Error("Groq returned no output text.");

    return { text };
  }
}
