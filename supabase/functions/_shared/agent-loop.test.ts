import { describe, it, expect, vi } from "vitest";
import { runAgentLoop, type ModelTurn } from "./agent-loop";

function turn(partial: Partial<ModelTurn>): ModelTurn {
  return {
    stopReason: "end_turn",
    text: "",
    toolUses: [],
    assistantContent: [],
    usage: { inputTokens: 0, outputTokens: 0 },
    ...partial,
  };
}

describe("runAgentLoop", () => {
  it("returns immediately when the model ends the turn with no tools", async () => {
    const callModel = vi.fn(async () => turn({ stopReason: "end_turn", text: "Hello!" }));
    const executeTool = vi.fn(async () => "unused");
    const res = await runAgentLoop({ initialMessages: [], callModel, executeTool });
    expect(res.finalText).toBe("Hello!");
    expect(res.turns).toBe(1);
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("executes a requested tool then finishes on the next turn", async () => {
    const calls: ModelTurn[] = [
      turn({ stopReason: "tool_use", text: "", toolUses: [{ id: "tu1", name: "get_blockers", input: {} }], assistantContent: [{ type: "tool_use", id: "tu1", name: "get_blockers", input: {} }] }),
      turn({ stopReason: "end_turn", text: "There are 2 blockers." }),
    ];
    let i = 0;
    const callModel = vi.fn(async () => calls[i++]);
    const executeTool = vi.fn(async (name: string) => `result for ${name}`);
    const res = await runAgentLoop({ initialMessages: [{ role: "user", content: "blockers?" }], callModel, executeTool });
    expect(executeTool).toHaveBeenCalledWith("get_blockers", {});
    expect(res.finalText).toBe("There are 2 blockers.");
    expect(res.toolsUsed).toEqual([{ name: "get_blockers", input: {} }]);
    expect(res.turns).toBe(2);
  });

  it("handles multiple tool_uses in one turn", async () => {
    const calls: ModelTurn[] = [
      turn({ stopReason: "tool_use", toolUses: [
        { id: "a", name: "get_lines", input: {} },
        { id: "b", name: "get_blockers", input: {} },
      ], assistantContent: [] }),
      turn({ stopReason: "end_turn", text: "done" }),
    ];
    let i = 0;
    const callModel = vi.fn(async () => calls[i++]);
    const executeTool = vi.fn(async (name: string) => `r:${name}`);
    const res = await runAgentLoop({ initialMessages: [], callModel, executeTool });
    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(res.toolsUsed.map((t) => t.name)).toEqual(["get_lines", "get_blockers"]);
  });

  it("stops at MAX_TURNS even if the model keeps requesting tools", async () => {
    const callModel = vi.fn(async () => turn({ stopReason: "tool_use", text: "still working", toolUses: [{ id: "x", name: "get_lines", input: {} }] }));
    const executeTool = vi.fn(async () => "r");
    const res = await runAgentLoop({ initialMessages: [], callModel, executeTool, maxTurns: 3 });
    expect(callModel).toHaveBeenCalledTimes(3);
    expect(res.turns).toBe(3);
    expect(res.finalText).toContain("still working");
  });

  it("feeds a failed tool result back as an error block without crashing", async () => {
    const calls: ModelTurn[] = [
      turn({ stopReason: "tool_use", toolUses: [{ id: "z", name: "boom", input: {} }] }),
      turn({ stopReason: "end_turn", text: "recovered" }),
    ];
    let i = 0;
    const callModel = vi.fn(async () => calls[i++]);
    const executeTool = vi.fn(async () => { throw new Error("kaboom"); });
    const res = await runAgentLoop({ initialMessages: [], callModel, executeTool });
    expect(res.finalText).toBe("recovered");
  });
});
