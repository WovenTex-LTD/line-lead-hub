// Manual Claude tool-calling loop. Pure: callModel and executeTool are injected.
// This is the insertion point for future confirmation-gated write actions.

export interface ToolUseRequest {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ModelTurn {
  stopReason: string;            // "tool_use" | "end_turn" | ...
  text: string;                  // concatenated text blocks for this turn
  toolUses: ToolUseRequest[];
  assistantContent: unknown[];   // raw content array to append to messages verbatim
  usage: { inputTokens: number; outputTokens: number };
}

export type ModelCaller = (messages: unknown[]) => Promise<ModelTurn>;
export type ToolExecutor = (name: string, input: Record<string, unknown>) => Promise<string>;

export interface AgentResult {
  finalText: string;
  toolsUsed: { name: string; input: Record<string, unknown> }[];
  turns: number;
  totalUsage: { inputTokens: number; outputTokens: number };
}

export const DEFAULT_MAX_TURNS = 6;

export async function runAgentLoop(opts: {
  initialMessages: unknown[];
  callModel: ModelCaller;
  executeTool: ToolExecutor;
  maxTurns?: number;
}): Promise<AgentResult> {
  const maxTurns = opts.maxTurns ?? DEFAULT_MAX_TURNS;
  const messages: unknown[] = [...opts.initialMessages];
  const toolsUsed: { name: string; input: Record<string, unknown> }[] = [];
  const totalUsage = { inputTokens: 0, outputTokens: 0 };
  let finalText = "";
  let turns = 0;

  while (turns < maxTurns) {
    turns += 1;
    const turn = await opts.callModel(messages);
    totalUsage.inputTokens += turn.usage.inputTokens;
    totalUsage.outputTokens += turn.usage.outputTokens;
    if (turn.text) finalText = turn.text;

    if (turn.stopReason !== "tool_use" || turn.toolUses.length === 0) {
      return { finalText, toolsUsed, turns, totalUsage };
    }

    // Append the assistant turn (carries the tool_use blocks) verbatim.
    messages.push({ role: "assistant", content: turn.assistantContent });

    // Execute each requested tool, collect tool_result blocks.
    const resultBlocks: unknown[] = [];
    for (const tu of turn.toolUses) {
      toolsUsed.push({ name: tu.name, input: tu.input });
      let content: string;
      let isError = false;
      try {
        content = await opts.executeTool(tu.name, tu.input);
      } catch (err) {
        content = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
        isError = true;
      }
      resultBlocks.push({ type: "tool_result", tool_use_id: tu.id, content, is_error: isError });
    }
    messages.push({ role: "user", content: resultBlocks });
  }

  // Hit the turn cap — return the best text so far with a gentle note.
  return {
    finalText: finalText || "I gathered some data but couldn't fully finish — could you narrow the question?",
    toolsUsed,
    turns,
    totalUsage,
  };
}
