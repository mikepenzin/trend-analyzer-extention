import OpenAI from "openai";
import type { AnalysisResult, ChatMessage } from "../types/shared.js";

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
    chatHistory?: ChatMessage[];
    initialContextPrompt?: string;
  }): Promise<AnalysisResult> {
    type Message = OpenAI.Chat.ChatCompletionMessageParam;
    let messages: Message[];

    if (params.chatHistory && params.chatHistory.length > 0 && params.initialContextPrompt) {
      // Multi-turn: reconstruct full conversation
      messages = [
        { role: "system", content: params.systemPrompt },
        // Synthetic first turn: original chart context + screenshot
        {
          role: "user",
          content: [
            { type: "text", text: params.initialContextPrompt },
            { type: "image_url", image_url: { url: params.screenshot, detail: "high" } }
          ]
        },
        // Previous turns from history
        ...params.chatHistory.map((msg): Message => ({
          role: msg.role === "assistant" ? "assistant" : "user",
          content: msg.text
        })),
        // Current question
        { role: "user", content: params.userPrompt }
      ];
    } else {
      messages = [
        { role: "system", content: params.systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: params.userPrompt },
            { type: "image_url", image_url: { url: params.screenshot, detail: "high" } },
          ],
        },
      ];
    }

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
    });

    const text = response.choices[0]?.message?.content;
    if (!text) throw new Error("OpenAI returned no output text.");

    return { text };
  }
}
