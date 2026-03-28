import Groq from "groq-sdk";
import type { AnalysisResult, ChatMessage } from "../types/shared.js";

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
    chatHistory?: ChatMessage[];
    initialContextPrompt?: string;
    jsonMode?: boolean;
  }): Promise<AnalysisResult> {
    type Message = Groq.Chat.ChatCompletionMessageParam;
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
            { type: "image_url", image_url: { url: params.screenshot } }
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
            { type: "image_url", image_url: { url: params.screenshot } },
          ],
        },
      ];
    }

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      ...(params.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
    });

    const text = response.choices[0]?.message?.content;
    if (!text) throw new Error("Groq returned no output text.");

    return { text };
  }
}
