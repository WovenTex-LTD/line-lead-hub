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
