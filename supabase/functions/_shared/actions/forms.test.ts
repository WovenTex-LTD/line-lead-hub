import { describe, it, expect } from "vitest";
import { validateCreateCustomForm, validateUpdateCustomForm } from "./forms";

describe("validateCreateCustomForm", () => {
  it("requires a name", () => {
    expect(validateCreateCustomForm({ target_role: "cutting", fields: [{ label: "A", type: "text" }] }).ok).toBe(false);
  });
  it("requires a valid target_role", () => {
    expect(validateCreateCustomForm({ name: "F", fields: [{ label: "A", type: "text" }] }).ok).toBe(false);
    expect(validateCreateCustomForm({ name: "F", target_role: "bogus", fields: [{ label: "A", type: "text" }] }).ok).toBe(false);
  });
  it("requires at least one field", () => {
    expect(validateCreateCustomForm({ name: "Form", target_role: "cutting", fields: [] }).ok).toBe(false);
  });
  it("rejects an invalid field type", () => {
    expect(validateCreateCustomForm({ name: "F", target_role: "cutting", fields: [{ label: "X", type: "bogus" }] }).ok).toBe(false);
  });
  it("requires options on a dropdown field", () => {
    expect(validateCreateCustomForm({ name: "F", target_role: "cutting", fields: [{ label: "Pick", type: "dropdown" }] }).ok).toBe(false);
    const ok = validateCreateCustomForm({ name: "F", target_role: "cutting", fields: [{ label: "Pick", type: "dropdown", options: ["a", "b"] }] });
    expect(ok.ok).toBe(true);
  });
  it("builds a proposal with target_role, unique slug keys and a field count summary", () => {
    const r = validateCreateCustomForm({
      name: "Line QA", target_role: "cutting",
      fields: [
        { label: "Operator Name", type: "text", required: true },
        { label: "Operator Name", type: "text" },
        { label: "Pass?", type: "checkbox" },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.action.kind).toBe("create_custom_form");
      expect(r.action.payload.target_role).toBe("cutting");
      const keys = (r.action.payload.fields as Array<{ key: string }>).map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(r.action.humanSummary).toContain("3");
      expect(r.action.humanSummary.toLowerCase()).toContain("cutting");
    }
  });
});

describe("server-side re-validation round-trip", () => {
  it("preserves is_required and section_label when re-validating a normalized payload (create)", () => {
    const first = validateCreateCustomForm({
      name: "F", target_role: "cutting",
      fields: [{ label: "Op", type: "text", required: true, section: "Header" }],
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const again = validateCreateCustomForm(first.action.payload); // mirrors execute-action revalidate()
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    const fld = (again.action.payload.fields as Array<{ is_required: boolean; section_label: string | null }>)[0];
    expect(fld.is_required).toBe(true);
    expect(fld.section_label).toBe("Header");
  });
  it("preserves is_required when re-validating a normalized payload (update)", () => {
    const first = validateUpdateCustomForm({ name: "F", fields: [{ label: "Op", type: "text", required: true }] });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const again = validateUpdateCustomForm(first.action.payload);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect((again.action.payload.fields as Array<{ is_required: boolean }>)[0].is_required).toBe(true);
  });
});

describe("validateUpdateCustomForm", () => {
  it("requires the form name", () => {
    expect(validateUpdateCustomForm({ fields: [{ label: "A", type: "text" }] }).ok).toBe(false);
  });
  it("requires at least one field", () => {
    expect(validateUpdateCustomForm({ name: "Line QA", fields: [] }).ok).toBe(false);
  });
  it("builds an update proposal naming the form", () => {
    const r = validateUpdateCustomForm({ name: "Line QA", fields: [{ label: "Operator", type: "text", required: true }] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.action.kind).toBe("update_custom_form");
      expect(r.action.payload.name).toBe("Line QA");
      expect(r.action.humanSummary).toContain("Line QA");
    }
  });
});

describe("slot_key (form versions)", () => {
  const fields = [{ label: "Date", type: "date" }];
  it("accepts a valid slot_key and derives the role from it", () => {
    const r = validateCreateCustomForm({ name: "Cutting Targets v2", slot_key: "cutting_morning_targets", fields });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.action.payload.slot_key).toBe("cutting_morning_targets");
      expect(r.action.payload.target_role).toBe("cutting");
      expect(r.action.humanSummary.toLowerCase()).toContain("new version");
    }
  });
  it("slot_key wins over a conflicting target_role", () => {
    const r = validateCreateCustomForm({ name: "X", slot_key: "sewing_end_of_day", target_role: "cutting", fields });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action.payload.target_role).toBe("sewing");
  });
  it("rejects an unknown slot_key", () => {
    const r = validateCreateCustomForm({ name: "X", slot_key: "qc_daily_sheet", fields });
    expect(r.ok).toBe(false);
  });
  it("standalone forms keep slot_key null", () => {
    const r = validateCreateCustomForm({ name: "X", target_role: "cutting", fields });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action.payload.slot_key).toBe(null);
  });
});

describe("computed fields (formulas)", () => {
  const base = (fields: any[]) => ({ name: "Efficiency", target_role: "sewing", fields });
  it("resolves {Label} references to field keys", () => {
    const r = validateCreateCustomForm(base([
      { label: "Total Minutes Produced", type: "number" },
      { label: "Total Minutes Attended", type: "number" },
      { label: "Daily Line Efficiency", type: "computed", formula: "{Total Minutes Produced} / {Total Minutes Attended} * 100" },
    ]));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const eff = (r.action.payload.fields as any[]).find((f) => f.label === "Daily Line Efficiency");
      expect(eff.formula).toBe("total_minutes_produced / total_minutes_attended * 100");
      expect(eff.is_required).toBe(false); // computed is never required
    }
  });
  it("rejects a computed field with no formula", () => {
    const r = validateCreateCustomForm(base([{ label: "X", type: "computed" }]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toContain("formula");
  });
  it("rejects a reference that matches no field", () => {
    const r = validateCreateCustomForm(base([
      { label: "A", type: "number" },
      { label: "Total", type: "computed", formula: "{A} + {Nonexistent}" },
    ]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toContain("nonexistent");
  });
  it("rejects a self-referential formula", () => {
    const r = validateCreateCustomForm(base([
      { label: "A", type: "number" },
      { label: "Loop", type: "computed", formula: "{Loop} + {A}" },
    ]));
    expect(r.ok).toBe(false);
  });
  it("rejects a cycle between two computed fields", () => {
    const r = validateCreateCustomForm(base([
      { label: "P", type: "computed", formula: "{Q} + 1" },
      { label: "Q", type: "computed", formula: "{P} + 1" },
    ]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toContain("loop");
  });
  it("non-computed fields keep formula null", () => {
    const r = validateCreateCustomForm(base([{ label: "Qty", type: "number" }]));
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.action.payload.fields as any[])[0].formula).toBe(null);
  });
});
