// Claude LLM Helper — agentic loop helpers
// Single-shot chat path removed; all responses go through the agent loop.

import type { ModelTurn, MessageParam } from "./agent-loop.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Detect language from text (simple heuristic)
 */
export function detectLanguage(text: string): "en" | "bn" | "zh" {
  // Bengali Unicode range: ঀ-৿
  const bengaliRegex = /[ঀ-৿]/;
  const bengaliMatches = text.match(new RegExp(bengaliRegex, "g")) || [];

  // If more than 10% of characters are Bengali, consider it Bengali
  if (bengaliMatches.length > text.length * 0.1) {
    return "bn";
  }

  // Chinese Unicode ranges: CJK Unified Ideographs 一-鿿
  const chineseRegex = /[一-鿿]/;
  const chineseMatches = text.match(new RegExp(chineseRegex, "g")) || [];

  if (chineseMatches.length > text.length * 0.1) {
    return "zh";
  }

  return "en";
}

/** Split Lina's reply into the visible answer and the suggested-questions list. */
export function parseSuggestedQuestions(raw: string): { content: string; suggestedQuestions: string[] } {
  const separator = "---SUGGESTED_QUESTIONS---";
  const idx = raw.indexOf(separator);
  if (idx === -1) return { content: raw, suggestedQuestions: [] };
  const content = raw.substring(0, idx).trimEnd();
  const suggestedQuestions = raw
    .substring(idx + separator.length)
    .trim()
    .split("\n")
    .map((q) => q.trim())
    .filter((q) => q.length > 0 && q.length < 120);
  return { content, suggestedQuestions };
}

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** Build a ModelCaller bound to this request's system prompt + tools.
 *  The returned function takes the running messages array and returns one
 *  parsed assistant turn. System + tools are stable across the loop, so they
 *  are cached (cache_control on the last system block). */
export function createAnthropicCaller(
  systemPrompt: string,
  tools: AnthropicTool[],
): (messages: MessageParam[]) => Promise<ModelTurn> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  return async (messages: MessageParam[]): Promise<ModelTurn> => {
    const body = {
      model: MODEL,
      max_tokens: 2048,
      thinking: { type: "adaptive" as const },
      system: [
        { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
      ],
      tools,
      messages,
    };

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const content: any[] = data.content ?? [];

    const textParts: string[] = [];
    const toolUses: { id: string; name: string; input: Record<string, unknown> }[] = [];
    for (const block of content) {
      if (block.type === "text") textParts.push(block.text);
      else if (block.type === "tool_use") {
        toolUses.push({ id: block.id, name: block.name, input: block.input ?? {} });
      }
    }

    return {
      stopReason: data.stop_reason ?? "end_turn",
      text: textParts.join("\n").trim(),
      toolUses,
      assistantContent: content,
      usage: {
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
      },
    };
  };
}
