// Pure validators + types for Lina's custom-form write actions (create + update-by-name).
// Shared by the preview tools and execute-action so validation is identical on both sides.
// No Deno/runtime imports.
import type { ProposedAction, ValidationResult } from "./po.ts";

const VALID_TYPES = ["text", "number", "date", "dropdown", "textarea", "checkbox"];
// Roles a custom form can be tagged to (it shows in that role's catalogue).
const VALID_FORM_ROLES = ["sewing", "cutting", "finishing", "qc", "storage", "worker"];
// Default production form slots a custom form can be a VERSION of. The slot key
// implies the role. Must match FORM_SLOTS in src/lib/form-slots.ts.
export const FORM_SLOT_ROLES: Record<string, string> = {
  sewing_morning_targets: "sewing",
  sewing_end_of_day: "sewing",
  cutting_morning_targets: "cutting",
  cutting_end_of_day: "cutting",
  finishing_daily_target: "finishing",
  finishing_daily_output: "finishing",
};
const SLOT_LABEL = (k: string) => k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "field";
}

interface NormalizedField {
  key: string; label: string; field_type: string; is_required: boolean;
  options: { value: string; label: string }[] | null;
  section_label: string | null; section_order: number; sort_order: number;
}

// Validate + normalize the field list (shared by create and update). Does NOT check emptiness;
// callers do that so the message can name the form.
function normalizeFields(input: unknown): { ok: true; fields: NormalizedField[] } | { ok: false; error: string } {
  const rawFields = Array.isArray(input) ? (input as Record<string, unknown>[]) : [];
  const usedKeys = new Set<string>();
  const fields: NormalizedField[] = [];
  let sectionOrder = -1;
  let lastSection: string | null = " "; // sentinel so the first section bumps the order

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
    // Accept BOTH the model's raw shape (section/required) and our own normalized output
    // (section_label/is_required), so execute-action's server-side re-validation of an
    // already-normalized payload preserves these instead of dropping them.
    const section = str(f.section) || str(f.section_label) || null;
    const required = f.required === true || f.is_required === true;
    if (section !== lastSection) { sectionOrder++; lastSection = section; }
    fields.push({
      key, label, field_type: type, is_required: required,
      options, section_label: section, section_order: Math.max(0, sectionOrder), sort_order: i,
    });
  }
  return { ok: true, fields };
}

export function validateCreateCustomForm(input: Record<string, unknown>): ValidationResult {
  const name = str(input.name);
  if (!name) return { ok: false, error: "What should the form be called?" };

  // Optional: this form is a new VERSION of a default production form (slot).
  // The slot implies the role, so it wins over a conflicting target_role.
  const slot_key = str(input.slot_key) || null;
  if (slot_key && !(slot_key in FORM_SLOT_ROLES)) {
    return { ok: false, error: `"${slot_key}" isn't a default form I know. Use one of: ${Object.keys(FORM_SLOT_ROLES).join(", ")} — or omit slot_key for a standalone form.` };
  }

  const target_role = slot_key ? FORM_SLOT_ROLES[slot_key] : str(input.target_role);
  if (!target_role) return { ok: false, error: `Which role is "${name}" for? (one of: ${VALID_FORM_ROLES.join(", ")})` };
  if (!VALID_FORM_ROLES.includes(target_role)) {
    return { ok: false, error: `"${target_role}" isn't a role I can assign a form to. Use one of: ${VALID_FORM_ROLES.join(", ")}.` };
  }
  const rawFields = Array.isArray(input.fields) ? (input.fields as unknown[]) : [];
  if (rawFields.length === 0) return { ok: false, error: `What fields should "${name}" have?` };
  const norm = normalizeFields(input.fields);
  if (!norm.ok) return norm;

  const action: ProposedAction = {
    kind: "create_custom_form",
    humanSummary: slot_key
      ? `Create "${name}" as a new version of ${SLOT_LABEL(slot_key)} (${norm.fields.length} field${norm.fields.length === 1 ? "" : "s"})`
      : `Create ${target_role} form "${name}" with ${norm.fields.length} field${norm.fields.length === 1 ? "" : "s"}`,
    payload: { name, description: str(input.description) || null, target_role, slot_key, allowed_fill_roles: [], fields: norm.fields },
  };
  return { ok: true, action };
}

export function validateUpdateCustomForm(input: Record<string, unknown>): ValidationResult {
  const name = str(input.name);
  if (!name) return { ok: false, error: "Which form should I update? Tell me its name." };
  const rawFields = Array.isArray(input.fields) ? (input.fields as unknown[]) : [];
  if (rawFields.length === 0) return { ok: false, error: `What should "${name}" contain now? List the fields it should have.` };
  const norm = normalizeFields(input.fields);
  if (!norm.ok) return norm;

  const action: ProposedAction = {
    kind: "update_custom_form",
    humanSummary: `Update form "${name}" to ${norm.fields.length} field${norm.fields.length === 1 ? "" : "s"}`,
    payload: { name, fields: norm.fields },
  };
  return { ok: true, action };
}
