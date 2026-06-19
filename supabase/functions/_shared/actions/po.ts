// Pure validators + types for Lina's PO write actions. Shared by the preview
// tools and the execute-action function so validation is identical on both sides.
// Pure: no Deno/runtime imports, no Deno.env.

export type PoActionKind =
  | "create_po" | "update_po" | "assign_po_lines"
  | "set_po_status" | "set_po_ex_factory" | "archive_po"
  | "record_production" | "resolve_blocker" | "notify_user" | "create_reminder"
  | "set_dispatch_status"
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
  // line_ids must be PROVIDED (ask the user!), but may be explicitly empty when the
  // user says the line isn't decided yet — they can assign later via assign_po_lines.
  if (!Array.isArray(input.line_ids)) {
    return { ok: false, error: "Which production line(s) will run this PO? Ask the user — if they say it isn't decided yet, pass an empty list and they can assign lines later." };
  }
  const lineIds = (input.line_ids as unknown[]).map(String).filter(Boolean);
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

// Resolve (close) the open production blocker(s) on a PO. Marks every
// open/in-progress blocker for that PO as resolved with today's date, optionally
// recording what was done. Use after a blocker reported on a PO has been fixed.
export function validateResolveBlocker(input: Record<string, unknown>): ValidationResult {
  const po_number = str(input.po_number);
  if (!po_number) return { ok: false, error: "Which PO's blocker should I resolve?" };
  const resolution_note = str(input.resolution_note);
  const payload: Record<string, unknown> = { po_number };
  if (resolution_note) payload.resolution_note = resolution_note;
  const summary = `Resolve open blocker(s) on PO ${po_number}${resolution_note ? ` — "${resolution_note}"` : ""} (marks them resolved as of today).`;
  return { ok: true, action: { kind: "resolve_blocker", humanSummary: summary, payload } };
}

export const NOTIFY_ROLES = ["worker", "supervisor", "admin", "owner"];

// Send an in-app notification to a person (by name), everyone assigned to a line,
// and/or a whole role. At least one recipient target is required. The executor
// resolves targets to user_ids and inserts one notification per recipient.
export function validateNotifyUser(input: Record<string, unknown>): ValidationResult {
  const message = str(input.message);
  if (!message) return { ok: false, error: "What message should I send?" };
  const to_user_name = str(input.to_user_name);
  const to_line = str(input.to_line);
  const to_role = str(input.to_role).toLowerCase();
  if (!to_user_name && !to_line && !to_role) {
    return { ok: false, error: "Who should I notify? Give a person's name, a line, or a role (worker / supervisor / admin / owner)." };
  }
  if (to_role && !NOTIFY_ROLES.includes(to_role)) {
    return { ok: false, error: `Role must be one of: ${NOTIFY_ROLES.join(", ")}.` };
  }
  const title = str(input.title) || "Message from your team";
  const payload: Record<string, unknown> = { title, message };
  if (to_user_name) payload.to_user_name = to_user_name;
  if (to_line) payload.to_line = to_line;
  if (to_role) payload.to_role = to_role;
  const who = [
    to_user_name || null,
    to_line ? `everyone on ${to_line}` : null,
    to_role ? `all ${to_role}s` : null,
  ].filter(Boolean).join(" and ");
  const summary = `Send a notification to ${who}: "${message}".`;
  return { ok: true, action: { kind: "notify_user", humanSummary: summary, payload } };
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Create a personal follow-up reminder for the requesting user. due_date is the
// calendar date (YYYY-MM-DD) in the factory's timezone; due_time is 24h HH:MM
// (defaults to 09:00). Delivered as a notification once it's due.
export function validateCreateReminder(input: Record<string, unknown>): ValidationResult {
  const message = str(input.message);
  if (!message) return { ok: false, error: "What should the reminder say?" };
  const due_date = str(input.due_date);
  if (!due_date || !DATE_RE.test(due_date)) return { ok: false, error: "When should I remind you? Give a date as YYYY-MM-DD." };
  let due_time = str(input.due_time);
  if (due_time && !TIME_RE.test(due_time)) return { ok: false, error: "Time must be 24-hour HH:MM, e.g. 09:00 or 17:30." };
  if (!due_time) due_time = "09:00";
  const title = str(input.title) || "Reminder";
  const payload = { title, message, due_date, due_time };
  const summary = `Set a reminder for ${due_date} at ${due_time}: "${message}".`;
  return { ok: true, action: { kind: "create_reminder", humanSummary: summary, payload } };
}

// Approve or reject a pending dispatch (gate-out) request, identified by its
// reference number (DSP-…). Rejecting requires a reason.
export function validateSetDispatchStatus(input: Record<string, unknown>): ValidationResult {
  const reference = str(input.reference);
  if (!reference) return { ok: false, error: "Which dispatch? Give its reference number (e.g. DSP-20260619-001)." };
  const decision = str(input.decision).toLowerCase();
  if (decision !== "approve" && decision !== "reject") {
    return { ok: false, error: "Should I approve or reject it? Set decision to 'approve' or 'reject'." };
  }
  const reason = str(input.reason);
  if (decision === "reject" && !reason) return { ok: false, error: "Give a reason for rejecting the dispatch." };
  const payload: Record<string, unknown> = { reference, decision };
  if (reason) payload.reason = reason;
  const summary = decision === "approve"
    ? `Approve dispatch ${reference}.`
    : `Reject dispatch ${reference} — "${reason}".`;
  return { ok: true, action: { kind: "set_dispatch_status", humanSummary: summary, payload } };
}

// Record (backfill) end-of-day production output for a PO so its progress %
// reflects reality — e.g. set a completed/legacy PO to 100%. Either `to_full`
// (record the PO's full order quantity for sewing + finishing) or explicit
// sewing_qty / finishing_qty. The executor resolves the line and writes real
// production rows via the upsert_custom_production_row RPC.
export function validateRecordProduction(input: Record<string, unknown>): ValidationResult {
  const po_number = str(input.po_number);
  if (!po_number) return { ok: false, error: "Which PO should I record production for?" };
  const to_full = input.to_full === true;
  const sewing_qty = num(input.sewing_qty);
  const finishing_qty = num(input.finishing_qty);
  const production_date = str(input.production_date);
  if (!to_full && sewing_qty === undefined && finishing_qty === undefined) {
    return { ok: false, error: "Tell me the quantities to record (sewing and/or finishing), or say to mark the PO fully complete." };
  }
  if (production_date && !DATE_RE.test(production_date)) {
    return { ok: false, error: "Production date must be YYYY-MM-DD." };
  }
  if (sewing_qty !== undefined && sewing_qty < 0) return { ok: false, error: "Sewing quantity can't be negative." };
  if (finishing_qty !== undefined && finishing_qty < 0) return { ok: false, error: "Finishing quantity can't be negative." };
  const payload: Record<string, unknown> = { po_number, to_full };
  if (sewing_qty !== undefined) payload.sewing_qty = sewing_qty;
  if (finishing_qty !== undefined) payload.finishing_qty = finishing_qty;
  if (production_date) payload.production_date = production_date;
  const what = to_full
    ? "full order quantity (sewing + finishing → 100%)"
    : [sewing_qty !== undefined ? `sewing ${sewing_qty.toLocaleString()}` : null,
       finishing_qty !== undefined ? `finishing ${finishing_qty.toLocaleString()}` : null].filter(Boolean).join(", ");
  const summary = `Record production for PO ${po_number}: ${what}${production_date ? ` on ${production_date}` : ""} — backfills end-of-day data and updates the progress %.`;
  return { ok: true, action: { kind: "record_production", humanSummary: summary, payload } };
}
