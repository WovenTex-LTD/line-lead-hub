import { describe, it, expect } from "vitest";
import { validateCreateCustomForm } from "./forms";

describe("validateCreateCustomForm", () => {
  it("requires a name", () => {
    expect(validateCreateCustomForm({ fields: [{ label: "A", type: "text" }] }).ok).toBe(false);
  });
  it("requires at least one field", () => {
    expect(validateCreateCustomForm({ name: "Form", fields: [] }).ok).toBe(false);
  });
  it("rejects an invalid field type", () => {
    expect(validateCreateCustomForm({ name: "F", fields: [{ label: "X", type: "bogus" }] }).ok).toBe(false);
  });
  it("requires options on a dropdown field", () => {
    expect(validateCreateCustomForm({ name: "F", fields: [{ label: "Pick", type: "dropdown" }] }).ok).toBe(false);
    const ok = validateCreateCustomForm({ name: "F", fields: [{ label: "Pick", type: "dropdown", options: ["a", "b"] }] });
    expect(ok.ok).toBe(true);
  });
  it("builds a proposal with unique slug keys and a field count summary", () => {
    const r = validateCreateCustomForm({
      name: "Line QA",
      fields: [
        { label: "Operator Name", type: "text", required: true },
        { label: "Operator Name", type: "text" },
        { label: "Pass?", type: "checkbox" },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.action.kind).toBe("create_custom_form");
      const keys = (r.action.payload.fields as Array<{ key: string }>).map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(r.action.humanSummary).toContain("3");
    }
  });
});
