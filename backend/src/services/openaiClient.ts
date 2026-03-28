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
    jsonMode?: boolean;
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

    // Retry once if OpenAI returns empty (can happen with large prompts + json mode)
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        ...(params.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
      });

      const choice = response.choices[0];
      const text = choice?.message?.content;
      const finishReason = choice?.finish_reason;

      if (text) return { text };

      // If finish_reason indicates a problem, don't retry
      if (finishReason === "content_filter") {
        throw new Error("OpenAI content filter blocked the response. Try rephrasing or using a different provider.");
      }
      if (finishReason === "length") {
        throw new Error("OpenAI response was truncated due to token limits. Try a shorter prompt or different provider.");
      }

      // Log and retry once on empty
      console.warn(`[OpenAI] Empty response on attempt ${attempt + 1}, finish_reason=${finishReason}. ${attempt === 0 ? "Retrying..." : ""}`);
    }

    throw new Error("OpenAI returned no output text after 2 attempts. Try using a different provider.");
  }
}
