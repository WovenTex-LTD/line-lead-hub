import { describe, it, expect } from "vitest";
import { createPoTool, archivePoTool, assignPoLinesTool, proposeCreateFormTool, proposeUpdateFormTool } from "./actions-tools";
import type { ToolContext } from "./types";

const LINE2_UUID = "22222222-2222-4222-8222-222222222222";

/** Fake supabase that answers the lines lookup used by resolveLineIds. */
function fakeLinesSupabase(rows: { id: string; line_id: string | null; name: string | null }[]) {
  const result = Promise.resolve({ data: rows });
  const chain: any = { select: () => chain, eq: () => chain, then: result.then.bind(result) };
  return { from: () => chain };
}

function ctx(role: string) {
  const proposed: any[] = [];
  const c = {
    supabase: {} as any, factoryId: "f1", role, timezone: "Asia/Dhaka",
    today: "2026-06-11", language: "en",
    embed: async () => [], escalate: async () => ({ ok: true }),
    requestExport: () => {}, proposeAction: (a: any) => proposed.push(a),
  } as unknown as ToolContext;
  return { c, proposed };
}

describe("PO preview tools", () => {
  it("admin create_po proposes an action (no write)", async () => {
    const { c, proposed } = ctx("admin");
    const out = await createPoTool(c, { po_number: "86600", buyer: "C&A", style: "S1", order_number: "ORD-1", planned_ex_factory: "2026-07-10" });
    expect(proposed.length).toBe(1);
    expect(proposed[0].kind).toBe("create_po");
    expect(out.toLowerCase()).toContain("approve");
  });
  it("worker is denied create_po", async () => {
    const { c, proposed } = ctx("worker");
    const out = await createPoTool(c, { po_number: "1", buyer: "B", style: "S", order_number: "O1", planned_ex_factory: "2026-07-10" });
    expect(proposed.length).toBe(0);
    expect(out.toLowerCase()).toContain("don't have access");
  });
  it("returns the validation error when fields are missing (no proposal)", async () => {
    const { c, proposed } = ctx("admin");
    const out = await createPoTool(c, { buyer: "C&A" });
    expect(proposed.length).toBe(0);
    expect(out.toLowerCase()).toContain("po number");
  });
  it("archive_po proposes for an owner", async () => {
    const { c, proposed } = ctx("owner");
    await archivePoTool(c, { po_number: "86600" });
    expect(proposed[0].kind).toBe("archive_po");
  });
});

describe("assign_po_lines line resolution", () => {
  const lines = [
    { id: "11111111-1111-4111-8111-111111111111", line_id: "line_1", name: "Line 1" },
    { id: LINE2_UUID, line_id: "line_2", name: "Line 2" },
  ];
  function linesCtx(role = "admin") {
    const { c, proposed } = ctx(role);
    (c as any).supabase = fakeLinesSupabase(lines);
    return { c, proposed };
  }
  it('resolves "line_2", "Line 2" and "2" to the line UUID', async () => {
    for (const ref of ["line_2", "Line 2", "2"]) {
      const { c, proposed } = linesCtx();
      await assignPoLinesTool(c, { po_number: "1123", line_ids: [ref] });
      expect(proposed.length).toBe(1);
      expect(proposed[0].payload.line_ids).toEqual([LINE2_UUID]);
      expect(proposed[0].humanSummary).toContain("Line 2");
    }
  });
  it("accepts a raw UUID as-is", async () => {
    const { c, proposed } = linesCtx();
    await assignPoLinesTool(c, { po_number: "1123", line_ids: [LINE2_UUID] });
    expect(proposed[0].payload.line_ids).toEqual([LINE2_UUID]);
  });
  it("returns the available lines when a ref doesn't match (no proposal)", async () => {
    const { c, proposed } = linesCtx();
    const out = await assignPoLinesTool(c, { po_number: "1123", line_ids: ["line 9"] });
    expect(proposed.length).toBe(0);
    expect(out).toContain("Line 1");
    expect(out).toContain("Line 2");
  });
  it("create_po resolves its optional line_ids too", async () => {
    const { c, proposed } = linesCtx();
    await createPoTool(c, { po_number: "9", buyer: "B", style: "S", order_number: "O1", planned_ex_factory: "2026-07-10", line_ids: ["Line 1"] });
    expect(proposed.length).toBe(1);
    expect(proposed[0].payload.line_ids).toEqual(["11111111-1111-4111-8111-111111111111"]);
  });
});

describe("propose_create_form tool", () => {
  it("admin proposes a role-tagged form (no write)", async () => {
    const { c, proposed } = ctx("admin");
    const out = await proposeCreateFormTool(c, { name: "QA", target_role: "cutting", fields: [{ label: "Op", type: "text" }] });
    expect(proposed.length).toBe(1);
    expect(proposed[0].kind).toBe("create_custom_form");
    expect(proposed[0].payload.target_role).toBe("cutting");
    expect(out.toLowerCase()).toContain("approve");
  });
  it("worker is denied", async () => {
    const { c, proposed } = ctx("worker");
    const out = await proposeCreateFormTool(c, { name: "QA", target_role: "cutting", fields: [{ label: "Op", type: "text" }] });
    expect(proposed.length).toBe(0);
    expect(out.toLowerCase()).toContain("don't have access");
  });
});

describe("propose_update_form tool", () => {
  it("admin proposes an update to a named form (no write)", async () => {
    const { c, proposed } = ctx("admin");
    const out = await proposeUpdateFormTool(c, { name: "QA", fields: [{ label: "Op", type: "text" }] });
    expect(proposed.length).toBe(1);
    expect(proposed[0].kind).toBe("update_custom_form");
    expect(out.toLowerCase()).toContain("approve");
  });
  it("worker is denied", async () => {
    const { c, proposed } = ctx("worker");
    const out = await proposeUpdateFormTool(c, { name: "QA", fields: [{ label: "Op", type: "text" }] });
    expect(proposed.length).toBe(0);
    expect(out.toLowerCase()).toContain("don't have access");
  });
});
