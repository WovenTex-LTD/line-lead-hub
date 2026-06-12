// Pure validators + types for Lina's PO write actions. Shared by the preview
// tools and the execute-action function so validation is identical on both sides.
// Pure: no Deno/runtime imports, no Deno.env.

export type PoActionKind =
  | "create_po" | "update_po" | "assign_po_lines"
  | "set_po_status" | "set_po_ex_factory" | "archive_po"
  | "create_custom_form" | "update_custom_form";

export interface ProposedAction {
  kind: PoActionKind;
  humanSummary: string;
  payload: Record<string, unknown>;
}

export type ValidationResult =
  | { ok: true; action: ProposedAction }
  | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const VALID_PO_STATUS = ["not_started", "in_progress", "completed", "on_hold"];

// Lines are referenced by their database UUID in action payloads. The preview tools
// resolve human references ("Line 2") to UUIDs before validating, so anything else
// here means a malformed/forged payload — reject with a friendly re-propose hint.
const LINE_IDS_ERROR = "I couldn't identify those production lines. Please name the line(s) again so I can re-propose the change.";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (typeof v === "number" && !Number.isNaN(v) ? v : undefined);

export function validateCreatePo(input: Record<string, unknown>): ValidationResult {
  const po_number = str(input.po_number);
  const buyer = str(input.buyer);
  const style = str(input.style);
  const order_number = str(input.order_number);
  const planned_ex_factory = str(input.planned_ex_factory);
  if (!po_number) return { ok: false, error: "A PO number is required to create a PO." };
  if (!buyer) return { ok: false, error: "A buyer is required to create a PO." };
  if (!style) return { ok: false, error: "A style is required to create a PO." };
  if (!order_number) {
    return { ok: false, error: "An order number is required — ask the user which order this PO belongs to (POs sharing an order number are grouped in the Orders view). Never invent one." };
  }
  if (!planned_ex_factory || !DATE_RE.test(planned_ex_factory)) {
    return { ok: false, error: "A valid planned ex-factory date (YYYY-MM-DD) is required." };
  }
  const order_qty = num(input.order_qty) ?? 0;
  const status = VALID_PO_STATUS.includes(str(input.status)) ? str(input.status) : "not_started";
  const lineIds = Array.isArray(input.line_ids) ? (input.line_ids as unknown[]).map(String).filter(Boolean) : [];
  if (lineIds.some((id) => !UUID_RE.test(id))) return { ok: false, error: LINE_IDS_ERROR };
  const payload: Record<string, unknown> = {
    po_number, buyer, style, order_number, order_qty, planned_ex_factory, status,
    item: str(input.item) || null,
    color: str(input.color) || null,
    smv: num(input.smv) ?? null,
    cm_per_dozen: num(input.cm_per_dozen) ?? null,
    target_per_hour: num(input.target_per_hour) ?? null,
    target_per_day: num(input.target_per_day) ?? null,
    line_ids: lineIds,
  };
  const summary = `Create PO ${po_number} — ${buyer}, style ${style}, ${order_qty.toLocaleString()} pcs, due ${planned_ex_factory}${lineIds.length ? `, ${lineIds.length} line(s)` : ""}`;
  return { ok: true, action: { kind: "create_po", humanSummary: summary, payload } };
}

export function validateUpdatePo(input: Record<string, unknown>): ValidationResult {
  const po_number = str(input.po_number);
  if (!po_number) return { ok: false, error: "Which PO should I update? I need its PO number." };
  const NUMERIC_FIELDS = ["order_qty", "smv", "cm_per_dozen", "target_per_hour", "target_per_day"] as const;
  const TEXT_FIELDS = ["buyer", "style", "item", "color", "order_number"] as const;
  const allowed = [...NUMERIC_FIELDS, ...TEXT_FIELDS] as const;
  const fields: Record<string, unknown> = {};
  for (const k of allowed) {
    if (input[k] === undefined) continue;
    if ((NUMERIC_FIELDS as readonly string[]).includes(k)) {
      const n = num(input[k]);
      if (n === undefined) {
        return { ok: false, error: `${k} must be a number.` };
      }
      fields[k] = n;
    } else {
      const s = str(input[k]);
      if (s !== "") fields[k] = s;
    }
  }
  if (Object.keys(fields).length === 0) {
    return { ok: false, error: `What should I change on PO ${po_number}?` };
  }
  const summary = `Update PO ${po_number}: ${Object.entries(fields).map(([k, v]) => `${k} → ${v}`).join(", ")}`;
  return { ok: true, action: { kind: "update_po", humanSummary: summary, payload: { po_number, fields } } };
}

export function validateAssignPoLines(input: Record<string, unknown>): ValidationResult {
  const po_number = str(input.po_number);
  if (!po_number) return { ok: false, error: "Which PO should I assign lines to?" };
  const line_ids = Array.isArray(input.line_ids) ? (input.line_ids as unknown[]).map(String).filter(Boolean) : [];
  if (line_ids.length === 0) return { ok: false, error: `Which line(s) should run PO ${po_number}?` };
  if (line_ids.some((id) => !UUID_RE.test(id))) return { ok: false, error: LINE_IDS_ERROR };
  return {
    ok: true,
    action: { kind: "assign_po_lines", humanSummary: `Assign PO ${po_number} to ${line_ids.length} line(s)`, payload: { po_number, line_ids } },
  };
}

export function validateSetPoStatus(input: Record<string, unknown>): ValidationResult {
  const po_number = str(input.po_number);
  if (!po_number) return { ok: false, error: "Which PO's status should I change?" };
  const status = input.status !== undefined ? str(input.status) : undefined;
  const is_active = typeof input.is_active === "boolean" ? input.is_active : undefined;
  if (status === undefined && is_active === undefined) {
    return { ok: false, error: `What status should PO ${po_number} have?` };
  }
  if (status !== undefined && !VALID_PO_STATUS.includes(status)) {
    return { ok: false, error: `Status must be one of: ${VALID_PO_STATUS.join(", ")}.` };
  }
  const parts = [status !== undefined ? `status → ${status}` : null, is_active !== undefined ? `active → ${is_active}` : null].filter(Boolean);
  const payload: Record<string, unknown> = { po_number };
  if (status !== undefined) payload.status = status;
  if (is_active !== undefined) payload.is_active = is_active;
  return { ok: true, action: { kind: "set_po_status", humanSummary: `Set PO ${po_number} ${parts.join(", ")}`, payload } };
}

export function validateSetPoExFactory(input: Record<string, unknown>): ValidationResult {
  const po_number = str(input.po_number);
  if (!po_number) return { ok: false, error: "Which PO's ex-factory date should I change?" };
  const planned = input.planned_ex_factory !== undefined ? str(input.planned_ex_factory) : undefined;
  const actual = input.actual_ex_factory !== undefined ? str(input.actual_ex_factory) : undefined;
  if (planned === undefined && actual === undefined) return { ok: false, error: "Which date should I set?" };
  if (planned !== undefined && !DATE_RE.test(planned)) return { ok: false, error: "Planned ex-factory must be YYYY-MM-DD." };
  if (actual !== undefined && !DATE_RE.test(actual)) return { ok: false, error: "Actual ex-factory must be YYYY-MM-DD." };
  const payload: Record<string, unknown> = { po_number };
  if (planned !== undefined) payload.planned_ex_factory = planned;
  if (actual !== undefined) payload.actual_ex_factory = actual;
  const parts = [planned ? `planned → ${planned}` : null, actual ? `actual → ${actual}` : null].filter(Boolean);
  return { ok: true, action: { kind: "set_po_ex_factory", humanSummary: `Set PO ${po_number} ex-factory ${parts.join(", ")}`, payload } };
}

export function validateArchivePo(input: Record<string, unknown>): ValidationResult {
  const po_number = str(input.po_number);
  if (!po_number) return { ok: false, error: "Which PO should I archive?" };
  return {
    ok: true,
    action: { kind: "archive_po", humanSummary: `Archive PO ${po_number} (soft-delete — production history is kept)`, payload: { po_number } },
  };
}
