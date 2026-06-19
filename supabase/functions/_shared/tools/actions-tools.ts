// PO write preview-tools. They validate + role-gate and QUEUE a ProposedAction
// for the user to confirm. They NEVER write — execution happens in execute-action.

import type { ToolContext } from "./types.ts";
import {
  validateCreatePo, validateUpdatePo, validateAssignPoLines,
  validateSetPoStatus, validateSetPoExFactory, validateArchivePo, validateRecordProduction, validateResolveBlocker, validateNotifyUser, validateCreateReminder, validateSetDispatchStatus,
  UUID_RE, type ValidationResult,
} from "../actions/po.ts";
import {
  validateCreateCustomForm, validateUpdateCustomForm,
  applyFormEdits, summarizeFormEdits, resolveProductionMapping, type FormEditOps,
} from "../actions/forms.ts";

/** Resolve + attach a production_mapping to a proposed form action. The action's
 *  payload.fields are already normalized (label + key), and slotKey identifies the
 *  production slot. Returns an error string on failure, or null on success/no-op. */
function attachProductionMapping(
  action: { payload: Record<string, unknown> },
  slotKey: string | null,
  rawMapping: unknown,
): string | null {
  if (!rawMapping || typeof rawMapping !== "object") return null;
  const fields = (action.payload.fields as { label: string; key: string }[]) ?? [];
  const res = resolveProductionMapping(slotKey, rawMapping as Record<string, unknown>, fields);
  if (!res.ok) return res.error;
  action.payload.production_mapping = res.mapping;
  return null;
}

const ADMIN_ROLES = ["admin", "owner", "superadmin"];
const DENY = "You don't have access to make that change. It requires an admin or owner role. Please contact your administrator.";

function gate(ctx: ToolContext): boolean {
  return ADMIN_ROLES.includes(ctx.role);
}

async function propose(ctx: ToolContext, result: ValidationResult): Promise<string> {
  if (!result.ok) return result.error;
  ctx.proposeAction(result.action);
  return `${result.action.humanSummary}.\n\nReview and Approve below to apply it.`;
}

const normalizeLineRef = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Resolve human line references ("Line 2", "2", "line_2", a UUID) to the factory's
 *  real line UUIDs. Unmatched references return an error listing the active lines,
 *  so the model can ask the user instead of guessing. */
async function resolveLineIds(
  ctx: ToolContext,
  raw: string[],
): Promise<{ ids: string[]; names: string[] } | { error: string }> {
  const { data } = await ctx.supabase
    .from("lines").select("id, line_id, name")
    .eq("factory_id", ctx.factoryId).eq("is_active", true);
  const lines = (data ?? []) as { id: string; line_id: string | null; name: string | null }[];
  const ids: string[] = [];
  const names: string[] = [];
  const unmatched: string[] = [];
  for (const r of raw) {
    const n = normalizeLineRef(r);
    const hit = lines.find((l) =>
      (UUID_RE.test(r) && l.id.toLowerCase() === r.toLowerCase()) ||
      (n !== "" && (normalizeLineRef(l.line_id ?? "") === n || normalizeLineRef(l.name ?? "") === n)) ||
      (/^\d+$/.test(n) && (normalizeLineRef(l.line_id ?? "") === `line${n}` || normalizeLineRef(l.name ?? "") === `line${n}`))
    );
    if (!hit) { unmatched.push(r); continue; }
    if (!ids.includes(hit.id)) { ids.push(hit.id); names.push(hit.name || hit.line_id || hit.id); }
  }
  if (unmatched.length) {
    const available = lines.map((l) => l.name || l.line_id || l.id).join(", ");
    return {
      error: `I couldn't match ${unmatched.map((u) => `"${u}"`).join(", ")} to a production line in this factory. ` +
        (available ? `The active lines are: ${available}. Ask the user which to use, then propose again.` : "No active lines were found — the user may need to set up lines first."),
    };
  }
  return { ids, names };
}

export async function createPoTool(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!gate(ctx)) return DENY;
  let patched = input;
  const raw = Array.isArray(input.line_ids) ? (input.line_ids as unknown[]).map(String).filter(Boolean) : [];
  if (raw.length > 0) {
    const resolved = await resolveLineIds(ctx, raw);
    if ("error" in resolved) return resolved.error;
    patched = { ...input, line_ids: resolved.ids };
  }
  return propose(ctx, validateCreatePo(patched));
}
export async function updatePoTool(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!gate(ctx)) return DENY;
  return propose(ctx, validateUpdatePo(input));
}
export async function assignPoLinesTool(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!gate(ctx)) return DENY;
  const raw = Array.isArray(input.line_ids) ? (input.line_ids as unknown[]).map(String).filter(Boolean) : [];
  if (raw.length === 0) return propose(ctx, validateAssignPoLines(input));
  const resolved = await resolveLineIds(ctx, raw);
  if ("error" in resolved) return resolved.error;
  const result = validateAssignPoLines({ ...input, line_ids: resolved.ids });
  if (result.ok) {
    result.action.humanSummary = `Assign PO ${String(input.po_number ?? "").trim()} to ${resolved.names.join(", ")}`;
  }
  return propose(ctx, result);
}
export async function setPoStatusTool(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!gate(ctx)) return DENY;
  return propose(ctx, validateSetPoStatus(input));
}
export async function setPoExFactoryTool(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!gate(ctx)) return DENY;
  return propose(ctx, validateSetPoExFactory(input));
}
export async function archivePoTool(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!gate(ctx)) return DENY;
  return propose(ctx, validateArchivePo(input));
}
export async function recordProductionTool(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!gate(ctx)) return DENY;
  return propose(ctx, validateRecordProduction(input));
}
export async function resolveBlockerTool(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!gate(ctx)) return DENY;
  return propose(ctx, validateResolveBlocker(input));
}
export async function notifyUserTool(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!gate(ctx)) return DENY;
  return propose(ctx, validateNotifyUser(input));
}
// Personal reminders are self-targeted and harmless — any role may set one.
export async function createReminderTool(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  return propose(ctx, validateCreateReminder(input));
}
export async function setDispatchStatusTool(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!gate(ctx)) return DENY;
  return propose(ctx, validateSetDispatchStatus(input));
}

export async function proposeCreateFormTool(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!gate(ctx)) return DENY;
  const result = validateCreateCustomForm(input);
  if (result.ok && input.production_mapping) {
    const err = attachProductionMapping(result.action, (input.slot_key as string) ?? null, input.production_mapping);
    if (err) return err;
  }
  return propose(ctx, result);
}
export async function proposeUpdateFormTool(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!gate(ctx)) return DENY;
  return propose(ctx, validateUpdateCustomForm(input));
}

const FIELD_TYPE_DESC: Record<string, (f: Record<string, unknown>) => string> = {
  computed: (f) => `computed: ${f.formula ?? "?"}`,
  auto: (f) => `auto-filled (${f.auto_source ?? "?"})`,
  dynamic_select: (f) => `dropdown from ${f.source_key ?? "?"}`,
  po_select: () => "PO picker",
  dropdown: (f) => `dropdown (${(Array.isArray(f.options) ? f.options.length : 0)} options)`,
};

/** Read a form's current fields so the (model and the) edit tool work from truth. */
async function loadFormFields(ctx: ToolContext, name: string): Promise<
  | { ok: true; templateName: string; role: string | null; slotKey: string | null; rows: Record<string, unknown>[] }
  | { ok: false; error: string }
> {
  const { data: tpl } = await ctx.supabase
    .from("custom_form_templates").select("id, name, target_role, slot_key")
    .eq("factory_id", ctx.factoryId).eq("name", name).eq("status", "active")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!tpl) return { ok: false, error: `I couldn't find an active form named "${name}".` };
  const t = tpl as Record<string, unknown>;
  const { data: rows } = await ctx.supabase
    .from("custom_form_fields").select("*")
    .eq("template_id", t.id)
    .order("section_order", { ascending: true }).order("sort_order", { ascending: true });
  return { ok: true, templateName: t.name as string, role: t.target_role as string | null, slotKey: (t.slot_key as string | null) ?? null, rows: (rows as Record<string, unknown>[]) ?? [] };
}

// DB row -> the raw field shape applyFormEdits / validateUpdateCustomForm consume.
function rowToRaw(r: Record<string, unknown>): Record<string, unknown> {
  const raw: Record<string, unknown> = { label: r.label, type: r.field_type, required: r.is_required === true, section: r.section_label ?? null };
  if (r.options) raw.options = r.options;
  if (r.formula) raw.formula = r.formula;
  if (r.auto_source) raw.auto_source = r.auto_source;
  if (r.source_key) raw.source_key = r.source_key;
  if (r.metric_role) raw.metric_role = r.metric_role;
  return raw;
}

/** READ tool: show a form's current fields (so Lina edits the right ones). */
export async function getCustomFormTool(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!gate(ctx)) return DENY;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return "Which form? Tell me its name.";
  const loaded = await loadFormFields(ctx, name);
  if (!loaded.ok) return loaded.error;
  if (loaded.rows.length === 0) return `Form "${loaded.templateName}" has no fields yet.`;
  const lines = loaded.rows.map((r, i) => {
    const t = String(r.field_type);
    const desc = FIELD_TYPE_DESC[t] ? FIELD_TYPE_DESC[t](r) : t;
    const req = r.is_required === true ? ", required" : "";
    const sec = r.section_label ? ` [${r.section_label}]` : "";
    return `${i + 1}. ${r.label} — ${desc}${req}${sec}`;
  });
  return `Form "${loaded.templateName}" (role: ${loaded.role ?? "—"}), ${loaded.rows.length} fields:\n${lines.join("\n")}`;
}

/** EDIT tool: apply a targeted diff to a form's current fields (nothing else changes). */
export async function proposeEditFormTool(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!gate(ctx)) return DENY;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return "Which form should I edit? Tell me its name.";
  const ops: FormEditOps = {
    add: Array.isArray(input.add) ? (input.add as Record<string, unknown>[]) : undefined,
    remove: Array.isArray(input.remove) ? (input.remove as unknown[]).map(String) : undefined,
    rename: Array.isArray(input.rename) ? (input.rename as { from: string; to: string }[]) : undefined,
    set: Array.isArray(input.set) ? (input.set as Record<string, unknown>[]) : undefined,
  };
  const anyOp = (ops.add?.length || ops.remove?.length || ops.rename?.length || ops.set?.length || input.production_mapping);
  if (!anyOp) return `What change should I make to "${name}"? (add, remove, rename, update fields, or set the production mapping)`;

  const loaded = await loadFormFields(ctx, name);
  if (!loaded.ok) return loaded.error;

  const edited = applyFormEdits(loaded.rows.map(rowToRaw), ops);
  if (!edited.ok) return edited.error;

  // Validate the RESULT and propose it through the existing update path.
  const res = validateUpdateCustomForm({ name: loaded.templateName, fields: edited.fields });
  if (!res.ok) return res.error;
  // Optionally (re)set the production mapping so this slot form feeds the dashboards.
  if (input.production_mapping) {
    const err = attachProductionMapping(res.action, loaded.slotKey, input.production_mapping);
    if (err) return err;
  }
  res.action.humanSummary = summarizeFormEdits(loaded.templateName, ops) +
    (input.production_mapping ? "; link its values to the production dashboards" : "");
  return propose(ctx, res);
}

/** READ tool: the SUBMISSIONS (filled data) of a custom form, so Lina can answer
 *  questions, compare forms, and compute things (efficiency, target-vs-actual). */
export async function getCustomSubmissionsTool(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!gate(ctx)) return DENY;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return "Which form's submissions do you want? Tell me its name.";
  const { data: tpl } = await ctx.supabase
    .from("custom_form_templates").select("id, name")
    .eq("factory_id", ctx.factoryId).eq("name", name).eq("status", "active")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!tpl) return `I couldn't find an active form named "${name}".`;
  const t = tpl as Record<string, unknown>;

  let q = ctx.supabase
    .from("custom_form_submissions").select("id, created_at, values, fields_snapshot")
    .eq("template_id", t.id).order("created_at", { ascending: false });
  const scope = (typeof input.scope === "string" ? input.scope : "").toLowerCase();
  if (scope === "today") {
    q = q.gte("created_at", ctx.today);
  } else if (scope === "week" || scope === "this_week") {
    const d = new Date(); d.setDate(d.getDate() - 7);
    q = q.gte("created_at", d.toISOString());
  }
  const limit = typeof input.limit === "number" ? Math.min(Math.max(1, input.limit), 50) : 20;
  q = q.limit(limit);
  const { data } = await q;
  const rows = (data as Record<string, unknown>[]) || [];

  const lineFilter = typeof input.line === "string" ? input.line.trim().toLowerCase() : "";
  const poFilter = typeof input.po === "string" ? input.po.trim().toLowerCase() : "";
  const filtered = rows.filter((s) => {
    if (!lineFilter && !poFilter) return true;
    const fields = (s.fields_snapshot as { key: string; field_type: string; source_key?: string }[]) || [];
    const vals = s.values as Record<string, unknown>;
    const lineField = fields.find((f) => f.field_type === "dynamic_select" && f.source_key === "lines");
    const poField = fields.find((f) => f.field_type === "po_select");
    const lineVal = lineField ? String(vals[lineField.key] ?? "").toLowerCase() : "";
    const poVal = poField ? String(vals[poField.key] ?? "").toLowerCase() : "";
    if (lineFilter && !lineVal.includes(lineFilter)) return false;
    if (poFilter && !poVal.includes(poFilter)) return false;
    return true;
  });
  if (!filtered.length) {
    return `No submissions found for "${t.name}"${scope ? ` (${scope})` : ""}${(lineFilter || poFilter) ? " matching that line/PO" : ""}.`;
  }
  const lines = filtered.map((s, i) => {
    const fields = (s.fields_snapshot as { key: string; label: string; field_type: string }[]) || [];
    const vals = s.values as Record<string, unknown>;
    const parts = fields.map((f) => {
      const v = vals[f.key];
      if (v === undefined || v === null || v === "") return null;
      const disp = f.field_type === "checkbox" ? (v ? "Yes" : "No") : String(v);
      return `${f.label}: ${disp}`;
    }).filter(Boolean);
    const day = String(s.created_at).slice(0, 10);
    return `${i + 1}. [${day}] ${parts.join(" | ")}`;
  });
  return `Submissions for "${t.name}" (showing ${filtered.length}):\n${lines.join("\n")}`;
}
