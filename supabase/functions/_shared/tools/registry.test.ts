import { describe, it, expect } from "vitest";
import { ALL_TOOLS, getToolsForRole, toAnthropicTools, dispatchTool } from "./registry";
import type { ToolContext } from "./types";

function ctx(role: string): ToolContext {
  return {
    supabase: {} as any,
    factoryId: "fac-1",
    role,
    timezone: "Asia/Dhaka",
    today: "2026-06-08",
    language: "en",
    embed: async () => [],
    escalate: async () => ({ ok: true }),
    requestExport: () => {},
  };
}

describe("registry", () => {
  it("includes all Phase-1 tools", () => {
    const names = ALL_TOOLS.map((t) => t.name).sort();
    expect(names).toEqual([
      "compare_periods", "find_anomalies", "generate_report", "get_blockers",
      "get_financials", "get_lines", "get_production_data", "get_work_orders",
      "raise_support_ticket", "search_knowledge",
    ].sort());
  });

  it("hides get_financials from a worker but shows it to an owner", () => {
    expect(getToolsForRole("worker").map((t) => t.name)).not.toContain("get_financials");
    expect(getToolsForRole("owner").map((t) => t.name)).toContain("get_financials");
  });

  it("emits Anthropic tool schema with name/description/input_schema only", () => {
    const schema = toAnthropicTools(getToolsForRole("admin"));
    for (const t of schema) {
      expect(Object.keys(t).sort()).toEqual(["description", "input_schema", "name"]);
    }
  });

  it("dispatchTool returns an access-denied string for an unknown tool", async () => {
    const out = await dispatchTool("not_a_tool", {}, ctx("admin"));
    expect(out.toLowerCase()).toContain("unknown tool");
  });

  it("dispatchTool refuses a tool the role may not use", async () => {
    const out = await dispatchTool("get_financials", {}, ctx("worker"));
    expect(out.toLowerCase()).toContain("don't have access");
  });
});
