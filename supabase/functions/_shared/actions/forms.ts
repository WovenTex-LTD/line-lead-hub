// Pure validators + types for Lina's custom-form write actions (create + update-by-name).
// Shared by the preview tools and execute-action so validation is identical on both sides.
// No Deno/runtime imports.
import type { ProposedAction, ValidationResult } from "./po.ts";
import { extractRefs, isValidFormula } from "./formula.ts";

const VALID_TYPES = ["text", "number", "date", "dropdown", "textarea", "checkbox", "computed", "auto", "po_select", "dynamic_select"];
// Live factory lists a dynamic_select can pull options from. Keep in sync with
// DYNAMIC_SOURCE_KEYS in src/lib/dynamic-sources.ts.
const VALID_DYNAMIC_SOURCES = [
  "lines", "stages", "stage_progress", "milestones",
  "blocker_types", "blocker_owners", "blocker_impacts",
];
// Submission-context values an "auto" field can be filled from. Keep in sync with
// AUTO_SOURCE_KEYS in src/lib/auto-fields.ts.
const VALID_AUTO_SOURCES = [
  "submission_date", "submission_time", "submission_datetime",
  "current_month", "current_year", "user_name", "user_email", "factory_name",
];
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
  formula: string | null;      // computed fields: arithmetic referencing other field keys
  auto_source: string | null;  // auto fields: which submission-context value fills it
  source_key: string | null;   // dynamic_select: which live factory list feeds the options
}

const normLabel = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

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
    // Computed and auto fields are derived, never user-entered, so never required.
    const required = type !== "computed" && type !== "auto" && (f.required === true || f.is_required === true);
    if (section !== lastSection) { sectionOrder++; lastSection = section; }
    // Carry the RAW formula (may reference fields as {Label}); resolved in the 2nd pass.
    const formula = type === "computed" ? (str(f.formula) || null) : null;
    if (type === "computed" && !formula) {
      return { ok: false, error: `Computed field "${label}" needs a formula (e.g. "{Total Minutes Produced} / {Total Minutes Attended} * 100").` };
    }
    let auto_source: string | null = null;
    if (type === "auto") {
      auto_source = str(f.auto_source) || str(f.source) || null;
      if (!auto_source) return { ok: false, error: `Auto field "${label}" needs an auto_source (one of: ${VALID_AUTO_SOURCES.join(", ")}).` };
      if (!VALID_AUTO_SOURCES.includes(auto_source)) {
        return { ok: false, error: `Auto field "${label}" has an unknown source "${auto_source}". Use one of: ${VALID_AUTO_SOURCES.join(", ")}.` };
      }
    }
    let source_key: string | null = null;
    if (type === "dynamic_select") {
      source_key = str(f.source_key) || str(f.source) || null;
      if (!source_key) return { ok: false, error: `Dropdown "${label}" needs a source_key (one of: ${VALID_DYNAMIC_SOURCES.join(", ")}).` };
      if (!VALID_DYNAMIC_SOURCES.includes(source_key)) {
        return { ok: false, error: `Dropdown "${label}" has an unknown source "${source_key}". Use one of: ${VALID_DYNAMIC_SOURCES.join(", ")}.` };
      }
    }
    fields.push({
      key, label, field_type: type, is_required: required,
      options, section_label: section, section_order: Math.max(0, sectionOrder), sort_order: i,
      formula, auto_source, source_key,
    });
  }

  // Second pass: resolve computed-field formulas. References to other fields may be
  // written as {Label} (resolved to that field's key) or as a bare key. Validate that
  // every reference exists, the arithmetic parses, and there are no reference cycles.
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const labelToKey = new Map<string, string>();
  for (const f of fields) if (!labelToKey.has(normLabel(f.label))) labelToKey.set(normLabel(f.label), f.key);

  for (const f of fields) {
    if (f.field_type !== "computed" || !f.formula) continue;
    let resolved = f.formula;
    const unresolved: string[] = [];
    resolved = resolved.replace(/\{([^}]+)\}/g, (_m, inner: string) => {
      const k = labelToKey.get(normLabel(inner));
      if (!k) { unresolved.push(inner.trim()); return "__missing__"; }
      return k;
    });
    if (unresolved.length) {
      return { ok: false, error: `In "${f.label}", I couldn't match ${unresolved.map((u) => `"${u}"`).join(", ")} to a field on this form. Reference fields by their exact label in braces, e.g. {Garment SAM}.` };
    }
    if (!isValidFormula(resolved)) {
      return { ok: false, error: `The formula for "${f.label}" isn't valid arithmetic. Use field references with + - * / and parentheses, e.g. "{A} * {B}".` };
    }
    const refs = extractRefs(resolved);
    for (const r of refs) {
      if (!byKey.has(r)) return { ok: false, error: `The formula for "${f.label}" refers to an unknown field "${r}".` };
      if (r === f.key) return { ok: false, error: `The formula for "${f.label}" can't refer to itself.` };
    }
    f.formula = resolved;
  }

  // Cycle check across computed fields (A depends on B depends on A).
  const deps = new Map<string, string[]>();
  for (const f of fields) {
    if (f.field_type === "computed" && f.formula) {
      deps.set(f.key, extractRefs(f.formula).filter((r) => byKey.get(r)?.field_type === "computed"));
    }
  }
  const state = new Map<string, number>(); // 0=visiting,1=done
  const hasCycle = (k: string): boolean => {
    if (state.get(k) === 1) return false;
    if (state.get(k) === 0) return true;
    state.set(k, 0);
    for (const d of deps.get(k) ?? []) if (hasCycle(d)) return true;
    state.set(k, 1);
    return false;
  };
  for (const k of deps.keys()) {
    if (hasCycle(k)) {
      const bad = byKey.get(k);
      return { ok: false, error: `The computed fields reference each other in a loop (around "${bad?.label ?? k}"). Break the loop so each calculation only depends on earlier values.` };
    }
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
    payload: { name, description: str(input.description) || null, target_role, slot_key, allowed_fill_roles: [], fields: norm.fields, ...(input.production_mapping && typeof input.production_mapping === "object" ? { production_mapping: input.production_mapping } : {}) },
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
    payload: { name, fields: norm.fields, ...(input.production_mapping && typeof input.production_mapping === "object" ? { production_mapping: input.production_mapping } : {}) },
  };
  return { ok: true, action };
}

// ── Diff-based editing ──────────────────────────────────────────────────────
// applyFormEdits takes a form's CURRENT fields (as raw field objects) plus a set
// of targeted operations and returns the resulting raw field list. The caller
// (the propose tool) reads the current fields from the DB, applies the diff here,
// then runs validateUpdateCustomForm on the result — so only the named fields
// change and nothing is ever dropped by omission.

export interface FormEditOps {
  add?: Record<string, unknown>[];                 // new field specs (+ optional `after` label)
  remove?: string[];                               // labels to delete
  rename?: { from: string; to: string }[];         // label changes
  set?: Record<string, unknown>[];                 // { field: label, required?, section?, type?, options?, formula?, auto_source?, source_key? }
}

const _norm = (s: unknown) => (typeof s === "string" ? s.trim().replace(/\s+/g, " ").toLowerCase() : "");
const _findIdx = (list: Record<string, unknown>[], label: string) =>
  list.findIndex((f) => _norm(f.label) === _norm(label));

// Rewrite a key reference inside a computed formula when its field is renamed.
function _rekeyFormula(formula: unknown, oldKey: string, newKey: string): unknown {
  if (typeof formula !== "string" || !oldKey || oldKey === newKey) return formula;
  return formula.replace(new RegExp(`(?<![\\w])${oldKey}(?![\\w])`, "g"), newKey);
}

export function applyFormEdits(
  current: Record<string, unknown>[],
  ops: FormEditOps,
): { ok: true; fields: Record<string, unknown>[] } | { ok: false; error: string } {
  // Work on a shallow copy of plain field specs.
  const list: Record<string, unknown>[] = current.map((f) => ({ ...f }));

  // 1) remove
  for (const label of ops.remove ?? []) {
    const idx = _findIdx(list, label);
    if (idx === -1) return { ok: false, error: `There's no field called "${label}" on this form, so I can't remove it.` };
    list.splice(idx, 1);
  }

  // 2) rename (also fixes computed formulas that referenced the old key)
  for (const r of ops.rename ?? []) {
    const idx = _findIdx(list, r.from);
    if (idx === -1) return { ok: false, error: `There's no field called "${r.from}" on this form, so I can't rename it.` };
    const to = typeof r.to === "string" ? r.to.trim() : "";
    if (!to) return { ok: false, error: `Rename for "${r.from}" needs a new name.` };
    const oldKey = slug(String(list[idx].label ?? ""));
    const newKey = slug(to);
    list[idx].label = to;
    for (const f of list) if (f.formula) f.formula = _rekeyFormula(f.formula, oldKey, newKey);
  }

  // 3) set (modify attributes / convert type of an existing field)
  for (const s of ops.set ?? []) {
    const label = String(s.field ?? "");
    const idx = _findIdx(list, label);
    if (idx === -1) return { ok: false, error: `There's no field called "${label}" on this form, so I can't change it.` };
    const f = list[idx];
    if (s.required !== undefined) f.required = s.required === true;
    if (s.section !== undefined) f.section = s.section;
    if (s.type !== undefined) {
      // Changing type clears type-specific extras unless re-supplied below.
      f.type = s.type;
      delete f.formula; delete f.auto_source; delete f.source_key;
    }
    if (s.options !== undefined) f.options = s.options;
    if (s.formula !== undefined) f.formula = s.formula;
    if (s.auto_source !== undefined) f.auto_source = s.auto_source;
    if (s.source_key !== undefined) f.source_key = s.source_key;
  }

  // 4) add (append, or insert after a named field)
  for (const a of ops.add ?? []) {
    const spec: Record<string, unknown> = { ...a };
    const after = typeof a.after === "string" ? a.after : null;
    delete spec.after;
    if (after) {
      const idx = _findIdx(list, after);
      if (idx === -1) return { ok: false, error: `I can't place a field after "${after}" because there's no such field.` };
      list.splice(idx + 1, 0, spec);
    } else {
      list.push(spec);
    }
  }

  if (list.length === 0) return { ok: false, error: "That would remove every field. A form needs at least one field." };
  return { ok: true, fields: list };
}

export function summarizeFormEdits(name: string, ops: FormEditOps): string {
  const parts: string[] = [];
  if (ops.add?.length) parts.push(`add ${ops.add.map((a) => `"${a.label}"`).join(", ")}`);
  if (ops.remove?.length) parts.push(`remove ${ops.remove.map((r) => `"${r}"`).join(", ")}`);
  if (ops.rename?.length) parts.push(`rename ${ops.rename.map((r) => `"${r.from}" → "${r.to}"`).join(", ")}`);
  if (ops.set?.length) parts.push(`update ${ops.set.map((s) => `"${s.field}"`).join(", ")}`);
  return `Edit form "${name}": ${parts.join("; ") || "no changes"}`;
}

// ── Production mapping ──────────────────────────────────────────────────────
// Friendly target keys a custom slot-form can map its fields onto (mirror of
// SLOT_PRODUCTION in src/lib/production-slots.ts). Line and PO are auto-detected
// from the form's picker fields, so they're not listed here.
export const PRODUCTION_SLOT_TARGETS: Record<string, string[]> = {
  sewing_morning_targets: ["per_hour_target", "manpower", "hours", "ot_hours"],
  sewing_end_of_day: ["good_output", "reject", "rework", "manpower", "hours", "ot_hours"],
  cutting_morning_targets: ["manpower", "marker_capacity", "lay_capacity", "cutting_capacity", "day_cutting", "day_input", "hours"],
  cutting_end_of_day: ["day_cutting", "day_input", "manpower", "marker_capacity", "lay_capacity", "cutting_capacity", "hours"],
  finishing_daily_target: ["per_hour_target", "manpower", "hours", "ot_hours"],
  finishing_daily_output: ["qc_pass", "poly", "carton", "manpower", "hours", "ot_hours"],
};

/** Resolve a production_mapping ({ friendlyKey: fieldLabel }) against a slot and the
 *  form's (normalized) fields, returning { friendlyKey: fieldKey }. Validates the
 *  target keys and that each referenced field exists. */
export function resolveProductionMapping(
  slotKey: string | null | undefined,
  rawMapping: Record<string, unknown>,
  fields: { label: string; key: string }[],
): { ok: true; mapping: Record<string, string> } | { ok: false; error: string } {
  if (!slotKey || !PRODUCTION_SLOT_TARGETS[slotKey]) {
    return { ok: false, error: "Production mapping only applies to a form that's a version of a default production form (set its slot first)." };
  }
  const targets = PRODUCTION_SLOT_TARGETS[slotKey];
  const labelToKey = new Map(fields.map((f) => [normLabel(f.label), f.key]));
  const out: Record<string, string> = {};
  for (const [friendlyKey, lbl] of Object.entries(rawMapping)) {
    if (!targets.includes(friendlyKey)) {
      return { ok: false, error: `"${friendlyKey}" isn't a production value for this form. Use one of: ${targets.join(", ")}.` };
    }
    const key = labelToKey.get(normLabel(String(lbl)));
    if (!key) return { ok: false, error: `The field "${lbl}" (mapped to ${friendlyKey}) isn't on this form.` };
    out[friendlyKey] = key;
  }
  return { ok: true, mapping: out };
}
