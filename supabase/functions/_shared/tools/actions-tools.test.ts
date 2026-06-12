import { describe, it, expect } from "vitest";
import { createPoTool, archivePoTool, proposeCreateFormTool, proposeUpdateFormTool } from "./actions-tools";
import type { ToolContext } from "./types";

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
    const out = await createPoTool(c, { po_number: "86600", buyer: "C&A", style: "S1", planned_ex_factory: "2026-07-10" });
    expect(proposed.length).toBe(1);
    expect(proposed[0].kind).toBe("create_po");
    expect(out.toLowerCase()).toContain("approve");
  });
  it("worker is denied create_po", async () => {
    const { c, proposed } = ctx("worker");
    const out = await createPoTool(c, { po_number: "1", buyer: "B", style: "S", planned_ex_factory: "2026-07-10" });
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
