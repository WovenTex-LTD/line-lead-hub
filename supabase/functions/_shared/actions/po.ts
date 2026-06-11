// Pure validators + types for Lina's PO write actions. Shared by the preview
// tools and the execute-action function so validation is identical on both sides.
// Pure: no Deno/runtime imports, no Deno.env.

export type PoActionKind =
  | "create_po" | "update_po" | "assign_po_lines"
  | "set_po_status" | "set_po_ex_factory" | "archive_po";

export interface ProposedAction {
  kind: PoActionKind;
  humanSummary: string;
  payload: Record<string, unknown>;
}

export type ValidationResult =
  | { ok: true; action: ProposedAction }
  | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const VALID_PO_STATUS = ["not_started", "in_progress", "completed", "on_hold"];

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (typeof v === "number" && !Number.isNaN(v) ? v : undefined);

export function validateCreatePo(input: Record<string, unknown>): ValidationResult {
  const po_number = str(input.po_number);
  const buyer = str(input.buyer);
  const style = str(input.style);
  const planned_ex_factory = str(input.planned_ex_factory);
  if (!po_number) return { ok: false, error: "A PO number is required to create a PO." };
  if (!buyer) return { ok: false, error: "A buyer is required to create a PO." };
  if (!style) return { ok: false, error: "A style is required to create a PO." };
  if (!planned_ex_factory || !DATE_RE.test(planned_ex_factory)) {
    return { ok: false, error: "A valid planned ex-factory date (YYYY-MM-DD) is required." };
  }
  const order_qty = num(input.order_qty) ?? 0;
  const status = VALID_PO_STATUS.includes(str(input.status)) ? str(input.status) : "not_started";
  const lineIds = Array.isArray(input.line_ids) ? (input.line_ids as unknown[]).map(String) : [];
  const payload: Record<string, unknown> = {
    po_number, buyer, style, order_qty, planned_ex_factory, status,
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
  const TEXT_FIELDS = ["buyer", "style", "item", "color"] as const;
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
