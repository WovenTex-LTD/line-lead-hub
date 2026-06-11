import { describe, it, expect } from "vitest";
import { validateCreatePo, validateUpdatePo } from "./po";

describe("validateCreatePo", () => {
  it("accepts a valid PO and builds a human summary + payload", () => {
    const r = validateCreatePo({ po_number: "86600", buyer: "C&A", style: "S1", order_qty: 5000, planned_ex_factory: "2026-07-10" });
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
    const r = validateCreatePo({ po_number: "1", buyer: "B", style: "S", planned_ex_factory: "10-07-2026" });
    expect(r.ok).toBe(false);
  });
});

describe("validateUpdatePo", () => {
  it("requires a target po_number and at least one change", () => {
    expect(validateUpdatePo({ po_number: "86600" }).ok).toBe(false);
    const r = validateUpdatePo({ po_number: "86600", order_qty: 6000 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action.payload.fields).toEqual({ order_qty: 6000 });
  });
});
