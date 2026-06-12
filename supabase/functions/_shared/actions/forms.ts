// Pure validator + types for Lina's custom-form write action. Shared by the preview
// tool and execute-action so validation is identical on both sides. No Deno/runtime imports.
import type { ProposedAction, ValidationResult } from "./po.ts";

const VALID_TYPES = ["text", "number", "date", "dropdown", "textarea", "checkbox"];
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "field";
}

interface NormalizedField {
  key: string; label: string; field_type: string; is_required: boolean;
  options: { value: string; label: string }[] | null;
  section_label: string | null; section_order: number; sort_order: number;
}

export function validateCreateCustomForm(input: Record<string, unknown>): ValidationResult {
  const name = str(input.name);
  if (!name) return { ok: false, error: "What should the form be called?" };
  const rawFields = Array.isArray(input.fields) ? (input.fields as Record<string, unknown>[]) : [];
  if (rawFields.length === 0) return { ok: false, error: `What fields should "${name}" have?` };

  const usedKeys = new Set<string>();
  const fields: NormalizedField[] = [];
  let sectionOrder = -1;
  let lastSection: string | null = " ";

  for (let i = 0; i < rawFields.length; i++) {
    const f = rawFields[i];
    const label = str(f.label);
    if (!label) return { ok: false, error: `Field ${i + 1} needs a label.` };
    const type = str(f.type) || str(f.field_type);
    if (!VALID_TYPES.includes(type)) {
      return { ok: false, error: `Field "${label}" has an unsupported type. Use one of: ${VALID_TYPES.join(", ")}.` };
    }
    let options: { value: string; label: string }[] | null = null;
    if (type === "dropdown") {
      const rawOpts = Array.isArray(f.options) ? (f.options as unknown[]) : [];
      const norm = rawOpts.map((o) => {
        if (typeof o === "string") return { value: o, label: o };
        const ov = o as Record<string, unknown>;
        const val = str(ov.value) || str(ov.label);
        return val ? { value: val, label: str(ov.label) || val } : null;
      }).filter(Boolean) as { value: string; label: string }[];
      if (norm.length === 0) return { ok: false, error: `Dropdown "${label}" needs at least one option.` };
      options = norm;
    }
    let key = slug(label); let n = 2;
    while (usedKeys.has(key)) key = `${slug(label)}_${n++}`;
    usedKeys.add(key);
    const section = str(f.section) || null;
    if (section !== lastSection) { sectionOrder++; lastSection = section; }
    fields.push({
      key, label, field_type: type, is_required: f.required === true,
      options, section_label: section, section_order: Math.max(0, sectionOrder), sort_order: i,
    });
  }

  const action: ProposedAction = {
    kind: "create_custom_form",
    humanSummary: `Create form "${name}" with ${fields.length} field${fields.length === 1 ? "" : "s"}`,
    payload: { name, description: str(input.description) || null, allowed_fill_roles: [], fields },
  };
  return { ok: true, action };
}
