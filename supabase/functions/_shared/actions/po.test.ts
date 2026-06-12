import { describe, it, expect } from "vitest";
import { validateCreatePo, validateUpdatePo } from "./po";
import { validateAssignPoLines, validateSetPoStatus, validateSetPoExFactory, validateArchivePo } from "./po";

describe("validateCreatePo", () => {
  it("accepts a valid PO and builds a human summary + payload", () => {
    const r = validateCreatePo({ po_number: "86600", buyer: "C&A", style: "S1", order_number: "ORD-1", order_qty: 5000, planned_ex_factory: "2026-07-10", line_ids: [] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.action.kind).toBe("create_po");
      expect(r.action.payload.po_number).toBe("86600");
      expect(r.action.humanSummary).toContain("86600");
      expect(r.action.humanSummary).toContain("C&A");
    }
  });
  it("rejects when required fields are missing", () => {
    const r = validateCreatePo({ buyer: "C&A" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toContain("po number");
  });
  it("rejects a bad ex-factory date", () => {
    const r = validateCreatePo({ po_number: "1", buyer: "B", style: "S", order_number: "O1", planned_ex_factory: "10-07-2026", line_ids: [] });
    expect(r.ok).toBe(false);
  });
  it("requires an order number (so Lina asks instead of leaving it null)", () => {
    const r = validateCreatePo({ po_number: "1", buyer: "B", style: "S", planned_ex_factory: "2026-07-10" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toContain("order number");
  });
  it("requires line_ids to be provided (so Lina asks), but an explicit empty list is fine", () => {
    const base = { po_number: "1", buyer: "B", style: "S", order_number: "O1", planned_ex_factory: "2026-07-10" };
    const missing = validateCreatePo(base);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.toLowerCase()).toContain("line");
    expect(validateCreatePo({ ...base, line_ids: [] }).ok).toBe(true);
  });
  it("update_po can change the order number", () => {
    const r = validateUpdatePo({ po_number: "1", order_number: "ORD-9" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action.payload.fields).toEqual({ order_number: "ORD-9" });
  });
});

describe("validateUpdatePo", () => {
  it("requires a target po_number and at least one change", () => {
    expect(validateUpdatePo({ po_number: "86600" }).ok).toBe(false);
    const r = validateUpdatePo({ po_number: "86600", order_qty: 6000 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action.payload.fields).toEqual({ order_qty: 6000 });
  });
  it("rejects an invalid numeric field instead of nulling it", () => {
    const r = validateUpdatePo({ po_number: "X", order_qty: "lots" as unknown as number });
    expect(r.ok).toBe(false);
  });
  it("ignores an empty text field rather than blanking it", () => {
    // buyer:"" should be skipped; with no other change this is 'nothing to change'
    expect(validateUpdatePo({ po_number: "X", buyer: "" }).ok).toBe(false);
    // a real change alongside an empty one keeps only the real change
    const r = validateUpdatePo({ po_number: "X", buyer: "", style: "NewStyle" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action.payload.fields).toEqual({ style: "NewStyle" });
  });
  it("still accepts a valid numeric update", () => {
    const r = validateUpdatePo({ po_number: "X", order_qty: 6000 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action.payload.fields).toEqual({ order_qty: 6000 });
  });
});

describe("other PO validators", () => {
  it("assign_po_lines needs a PO and at least one line", () => {
    expect(validateAssignPoLines({ po_number: "1" }).ok).toBe(false);
    const u1 = "11111111-1111-4111-8111-111111111111";
    const u2 = "22222222-2222-4222-8222-222222222222";
    const r = validateAssignPoLines({ po_number: "1", line_ids: [u1, u2] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action.payload.line_ids).toEqual([u1, u2]);
  });
  it("assign_po_lines rejects non-UUID line refs (resolution happens in the preview tool)", () => {
    expect(validateAssignPoLines({ po_number: "1", line_ids: ["line_2"] }).ok).toBe(false);
  });
  it("set_po_status validates the status enum", () => {
    expect(validateSetPoStatus({ po_number: "1", status: "bogus" }).ok).toBe(false);
    expect(validateSetPoStatus({ po_number: "1", status: "completed" }).ok).toBe(true);
    expect(validateSetPoStatus({ po_number: "1", is_active: false }).ok).toBe(true);
  });
  it("set_po_ex_factory validates dates", () => {
    expect(validateSetPoExFactory({ po_number: "1", planned_ex_factory: "bad" }).ok).toBe(false);
    expect(validateSetPoExFactory({ po_number: "1", planned_ex_factory: "2026-07-10" }).ok).toBe(true);
  });
  it("archive_po needs a po_number", () => {
    expect(validateArchivePo({}).ok).toBe(false);
    const r = validateArchivePo({ po_number: "86600" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action.kind).toBe("archive_po");
  });
});
