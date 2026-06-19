// Lina tool registry: assembles executors into role-filtered ToolDefinitions,
// exposes Anthropic schema export + dispatch with access control.

import type { ToolContext, ToolDefinition, UserRole } from "./types.ts";
import { isToolAllowed } from "./types.ts";
import {
  getProductionData, getMetrics, getBlockers, getWorkOrders, getLines,
  getFinancials, comparePeriods, findAnomalies, searchKnowledge,
  raiseSupportTicket, generateReport, getQCSummary, getMissingSubmissions,
  getDispatches, getInventory, getVoiceNotes, getPoTimeline,
} from "./insights.ts";
import {
  createPoTool, updatePoTool, assignPoLinesTool,
  setPoStatusTool, setPoExFactoryTool, archivePoTool, recordProductionTool, resolveBlockerTool, notifyUserTool, createReminderTool, setDispatchStatusTool,
  proposeCreateFormTool,
  proposeUpdateFormTool,
  proposeEditFormTool,
  getCustomFormTool,
  getCustomSubmissionsTool,
} from "./actions-tools.ts";

export const ALL_TOOLS: ToolDefinition[] = [
  {
    name: "get_production_data",
    description: "Get a department's production output for a day. Call this when the user asks how much was sewn/cut/finished, today's output, rejects, rework, or manpower. department is required.",
    input_schema: {
      type: "object",
      properties: {
        department: { type: "string", enum: ["sewing", "cutting", "finishing"], description: "Which department's data to fetch." },
        date: { type: "string", description: "Production date YYYY-MM-DD. Defaults to today." },
      },
      required: ["department"],
    },
    allowedRoles: "all",
    execute: getProductionData,
  },
  {
    name: "get_metrics",
    description: "Read the CANONICAL production metrics — one normalized vocabulary (output, target_output, reject, rework, manpower, hours, ot_hours, per_hour, per_hour_target, input, poly, carton) across sewing/cutting/finishing, target AND actual, STANDARD AND CUSTOM forms. Use this whenever you need to compare or compute across forms or departments — output vs target, efficiency, manpower productivity, custom-form data alongside standard. Because each custom form's differently-worded fields are already mapped to these roles, the same metric is directly comparable no matter which form produced it. Optionally filter by department, metric (a single metric_role), kind (target|actual), and a date range (defaults to today).",
    input_schema: {
      type: "object",
      properties: {
        department: { type: "string", enum: ["sewing", "cutting", "finishing"], description: "Limit to one department. Omit for all the user's departments." },
        metric: { type: "string", description: "Limit to one metric_role, e.g. output, target_output, manpower, hours, reject, per_hour_target. Omit for all." },
        kind: { type: "string", enum: ["target", "actual"], description: "Limit to target or actual. Omit for both." },
        start_date: { type: "string", description: "Range start YYYY-MM-DD. Defaults to today." },
        end_date: { type: "string", description: "Range end YYYY-MM-DD. Defaults to today." },
      },
    },
    allowedRoles: "all",
    execute: getMetrics,
  },
  {
    name: "get_blockers",
    description: "List open and in-progress production blockers across sewing and finishing. Call this when the user asks about issues, delays, problems, what's blocked, or bottlenecks.",
    input_schema: { type: "object", properties: {} },
    allowedRoles: "all",
    execute: getBlockers,
  },
  {
    name: "get_qc_summary",
    description: "Get quality-control results from QC daily inspection sheets: pass/fail rates, fail rate by PO and by line, sheet sign-off status, and the list of failed checks (open QC issues). Call this when the user asks about quality, QC, defects, pass/fail rates, inspections, or which POs/lines have quality problems. Defaults to today; pass start_date/end_date (YYYY-MM-DD) for a range, or po/line to focus.",
    input_schema: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "Range start YYYY-MM-DD. Defaults to today." },
        end_date: { type: "string", description: "Range end YYYY-MM-DD. Defaults to today." },
        po: { type: "string", description: "Optional: only this PO number." },
        line: { type: "string", description: "Optional: only this line (name or number)." },
      },
    },
    allowedRoles: "all",
    execute: getQCSummary,
  },
  {
    name: "get_missing_submissions",
    description: "List the active production lines that have NOT submitted their end-of-day production for a date (defaults to today). Call this when the user asks who hasn't submitted, which lines are missing/late, pending submissions, or 'who still needs to report'. With no department it returns lines that submitted nothing in any department; pass department (sewing/finishing/cutting) to check that department's output specifically. Optional date YYYY-MM-DD.",
    input_schema: {
      type: "object",
      properties: {
        department: { type: "string", enum: ["sewing", "finishing", "cutting"], description: "Optional: check only this department's end-of-day output." },
        date: { type: "string", description: "Optional date YYYY-MM-DD. Defaults to today." },
      },
    },
    allowedRoles: "all",
    execute: getMissingSubmissions,
  },
  {
    name: "get_dispatches",
    description: "List dispatch (gate-out) requests and their status. Defaults to those PENDING approval. Call when the user asks about dispatches, gate passes, shipments, what's waiting for approval, or trucks leaving. Each result shows its reference number (DSP-…), PO, quantity, destination and status. Pass status (pending/approved/rejected/cancelled/all) or po to filter.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pending", "approved", "rejected", "cancelled", "all"], description: "Defaults to pending." },
        po: { type: "string", description: "Optional: only dispatches for this PO." },
      },
    },
    allowedRoles: ["admin", "owner", "superadmin"],
    execute: getDispatches,
  },
  {
    name: "get_inventory",
    description: "Get current storage bin-card balances (fabric/material in storage). Call when the user asks how much material/fabric is in storage, stock levels, or the bin-card balance for a PO. Shows balance, total received and issued per PO/material. Pass po to focus on one order.",
    input_schema: {
      type: "object",
      properties: {
        po: { type: "string", description: "Optional: only this PO's storage." },
      },
    },
    allowedRoles: "all",
    execute: getInventory,
  },
  {
    name: "get_voice_notes",
    description: "Read back voice notes recorded on production/QC records — they are transcribed to text so you can summarize what was said. Call when the user asks what a voice note says, to summarize voice notes, or 'any voice notes on PO X / today?'. Filter by po (notes about that PO), record_type (e.g. finishing_daily_logs, sewing_actuals, qc_daily_sheet_item) and/or record_id. Transcription costs money and time, so keep limit small (default 5, max 8) and prefer a po/record filter over broad browsing.",
    input_schema: {
      type: "object",
      properties: {
        po: { type: "string", description: "Only voice notes about this PO." },
        record_type: { type: "string", description: "Only notes on this record type (e.g. finishing_daily_logs, sewing_actuals, qc_daily_sheet_item)." },
        record_id: { type: "string", description: "Only notes on this exact record id (UUID)." },
        since_days: { type: "number", description: "Look back this many days when browsing (default 14)." },
        limit: { type: "number", description: "Max notes to transcribe (default 5, max 8)." },
      },
    },
    allowedRoles: "all",
    execute: getVoiceNotes,
  },
  {
    name: "get_po_timeline",
    description: "Get a single PO's full activity log in date order — creation, cutting/sewing/finishing output, blockers, QC sheets and dispatches merged chronologically. Call when the user asks what happened with an order, its history, progress story, or 'walk me through PO X'. Requires a po number.",
    input_schema: {
      type: "object",
      properties: { po: { type: "string", description: "The PO number to trace." } },
      required: ["po"],
    },
    allowedRoles: "all",
    execute: getPoTimeline,
  },
  {
    name: "get_work_orders",
    description: "Get purchase-order / work-order status: quantities, progress, buyers, ex-factory dates. Call this for questions about POs, orders, buyers, shipment readiness, or order progress. Optionally filter by po or buyer.",
    input_schema: {
      type: "object",
      properties: {
        po: { type: "string", description: "PO number to filter by." },
        buyer: { type: "string", description: "Buyer/brand name to filter by." },
      },
    },
    allowedRoles: "all",
    execute: getWorkOrders,
  },
  {
    name: "get_lines",
    description: "Per-line sewing efficiency (output vs target, reject rate) over a date range. Call this for line performance, which lines are behind, best/worst line, or efficiency — for today OR for a week/month. Defaults to today; pass start_date and end_date (YYYY-MM-DD) for a weekly or monthly per-line breakdown.",
    input_schema: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "Range start, YYYY-MM-DD. Defaults to today." },
        end_date: { type: "string", description: "Range end, YYYY-MM-DD. Defaults to today." },
      },
    },
    allowedRoles: "all",
    execute: getLines,
  },
  {
    name: "get_financials",
    description: "Get today's revenue, cost, profit, and margin with per-PO and per-department breakdowns. Call this for any money/financial question. Restricted to admin and owner.",
    input_schema: { type: "object", properties: {} },
    allowedRoles: ["admin", "owner"],
    execute: getFinancials,
  },
  {
    name: "compare_periods",
    description: "Compare sewing good output between two date ranges and report the delta. Call this when the user wants a trend, a week-over-week change, or 'vs last week/month'. Provide period_a (more recent) and period_b (baseline) date ranges.",
    input_schema: {
      type: "object",
      properties: {
        metric: { type: "string", enum: ["sewing_good"], description: "Metric to compare." },
        period_a_start: { type: "string", description: "YYYY-MM-DD" },
        period_a_end: { type: "string", description: "YYYY-MM-DD" },
        period_b_start: { type: "string", description: "YYYY-MM-DD" },
        period_b_end: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["metric", "period_a_start", "period_a_end", "period_b_start", "period_b_end"],
    },
    allowedRoles: "all",
    execute: comparePeriods,
  },
  {
    name: "find_anomalies",
    description: "Scan today's sewing lines for problems: lines below 80% of target and reject rates over 5%. Call this when the user asks what's wrong, what needs attention, or for a health check.",
    input_schema: { type: "object", properties: {} },
    allowedRoles: "all",
    execute: findAnomalies,
  },
  {
    name: "search_knowledge",
    description: "Search THIS factory's own uploaded documents (manuals, policies, FAQs, certificates) and ProductionPortal how-to guides. Use ONLY for factory-specific documentation or app usage — NOT for general industry advice or best practices, which you should answer from your own expertise. Do not call this for open-ended 'how would you improve X' questions.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "What to search for." } },
      required: ["query"],
    },
    allowedRoles: "all",
    execute: searchKnowledge,
  },
  {
    name: "raise_support_ticket",
    description: "Escalate a problem to the Woventex team by email (contact@woventex.co). Call this when the user reports something you genuinely cannot resolve with your other tools: a bug, broken or missing data, an access/permission problem, or a feature request. Provide a clear 'problem' summary. Do NOT use it for questions you can answer or actions another tool covers, and do not raise more than one ticket for the same issue.",
    input_schema: {
      type: "object",
      properties: {
        problem: { type: "string", description: "Clear summary of the unresolved problem to escalate." },
        category: {
          type: "string",
          enum: ["bug", "data_issue", "access", "feature_request", "other"],
          description: "Problem category.",
        },
      },
      required: ["problem"],
    },
    allowedRoles: "all",
    execute: raiseSupportTicket,
  },
  {
    name: "generate_report",
    description: "Generate a downloadable report FILE (PDF or CSV) and give the user a download link. Use when the user asks for a report, export, or downloadable file. report_type is 'production' (output summary + per-line), 'insights' (production summary + line ranking + blockers), or 'finance' (revenue/cost/profit/margin by PO; admin/owner only). Provide start_date and end_date (YYYY-MM-DD) for the period — compute them from today's date. format defaults to pdf; use csv only if the user asks for a spreadsheet/CSV.",
    input_schema: {
      type: "object",
      properties: {
        report_type: { type: "string", enum: ["production", "insights", "finance"], description: "Which report to generate." },
        start_date: { type: "string", description: "Period start, YYYY-MM-DD." },
        end_date: { type: "string", description: "Period end, YYYY-MM-DD." },
        format: { type: "string", enum: ["pdf", "csv"], description: "File format. Defaults to pdf." },
      },
      required: ["report_type", "start_date", "end_date"],
    },
    allowedRoles: "all",
    execute: generateReport,
  },
  {
    name: "create_po",
    description: "Create a new purchase order (work order). Admin/owner only. Use when the user asks to add/create a PO. Required: po_number, buyer, style, order_number, planned_ex_factory (YYYY-MM-DD), line_ids (always ask the user which line(s) will run the PO; pass [] only if they explicitly say it isn't decided yet). Optional: order_qty, item, color, smv, cm_per_dozen, target_per_hour, target_per_day. This PROPOSES the change for the user to approve — it does not write directly.",
    input_schema: {
      type: "object",
      properties: {
        po_number: { type: "string" }, buyer: { type: "string" }, style: { type: "string" },
        order_number: { type: "string", description: "Order number that groups POs into one order in the Orders view. Ask the user for it — NEVER invent one." },
        planned_ex_factory: { type: "string", description: "YYYY-MM-DD" },
        order_qty: { type: "number" }, item: { type: "string" }, color: { type: "string" },
        smv: { type: "number" }, cm_per_dozen: { type: "number" },
        target_per_hour: { type: "number" }, target_per_day: { type: "number" },
        line_ids: { type: "array", items: { type: "string" }, description: "Production lines to run this PO, exactly as the user refers to them (e.g. 'Line 2'); matched to the factory's real lines automatically. ALWAYS ask the user which line(s) — pass an empty array only if they explicitly say it isn't decided yet." },
      },
      required: ["po_number", "buyer", "style", "order_number", "planned_ex_factory", "line_ids"],
    },
    allowedRoles: ["admin", "owner", "superadmin"],
    execute: createPoTool,
  },
  {
    name: "update_po",
    description: "Edit fields on an existing PO. Admin/owner only. Identify the PO by po_number; provide only the fields to change (buyer, style, item, color, order_number, order_qty, smv, cm_per_dozen, target_per_hour, target_per_day). Proposes the change for approval.",
    input_schema: {
      type: "object",
      properties: {
        po_number: { type: "string" }, buyer: { type: "string" }, style: { type: "string" },
        order_number: { type: "string", description: "Order number that groups POs into one order." },
        item: { type: "string" }, color: { type: "string" }, order_qty: { type: "number" },
        smv: { type: "number" }, cm_per_dozen: { type: "number" },
        target_per_hour: { type: "number" }, target_per_day: { type: "number" },
      },
      required: ["po_number"],
    },
    allowedRoles: ["admin", "owner", "superadmin"],
    execute: updatePoTool,
  },
  {
    name: "assign_po_lines",
    description: "Set which production lines run a PO. Admin/owner only. Proposes the change for approval.",
    input_schema: {
      type: "object",
      properties: { po_number: { type: "string" }, line_ids: { type: "array", items: { type: "string" }, description: "Lines exactly as the user refers to them (e.g. 'Line 2'); matched to the factory's real lines automatically. Replaces the PO's current line set." } },
      required: ["po_number", "line_ids"],
    },
    allowedRoles: ["admin", "owner", "superadmin"],
    execute: assignPoLinesTool,
  },
  {
    name: "set_po_status",
    description: "Change a PO's status (not_started, in_progress, completed, on_hold) and/or active flag. Admin/owner only. Proposes the change for approval.",
    input_schema: {
      type: "object",
      properties: { po_number: { type: "string" }, status: { type: "string", enum: ["not_started", "in_progress", "completed", "on_hold"] }, is_active: { type: "boolean" } },
      required: ["po_number"],
    },
    allowedRoles: ["admin", "owner", "superadmin"],
    execute: setPoStatusTool,
  },
  {
    name: "set_po_ex_factory",
    description: "Set a PO's planned and/or actual ex-factory date (YYYY-MM-DD). Admin/owner only. Proposes the change for approval.",
    input_schema: {
      type: "object",
      properties: { po_number: { type: "string" }, planned_ex_factory: { type: "string" }, actual_ex_factory: { type: "string" } },
      required: ["po_number"],
    },
    allowedRoles: ["admin", "owner", "superadmin"],
    execute: setPoExFactoryTool,
  },
  {
    name: "archive_po",
    description: "Archive (soft-delete) a PO — sets it inactive and status 'deleted'; production history is preserved. Admin/owner only. Proposes the change for approval. Never hard-deletes.",
    input_schema: { type: "object", properties: { po_number: { type: "string" } }, required: ["po_number"] },
    allowedRoles: ["admin", "owner", "superadmin"],
    execute: archivePoTool,
  },
  {
    name: "record_production",
    description: "Record / backfill end-of-day production OUTPUT for a PO so its sewing & finishing progress %% reflects reality. Admin/owner only. Use this for completed or legacy POs that show 0% because no end-of-day data was ever entered — e.g. to mark a finished PO 100%. Set to_full:true to record the PO's full order quantity for BOTH sewing and finishing (the simplest way to bring a completed PO to 100%), or pass explicit sewing_qty and/or finishing_qty. Optional production_date (YYYY-MM-DD, defaults to today). This PROPOSES the change for approval, then writes real production records (progress updates automatically). Finishing output is what drives the completion %.",
    input_schema: {
      type: "object",
      properties: {
        po_number: { type: "string" },
        to_full: { type: "boolean", description: "Record the PO's full order quantity for sewing + finishing (marks it 100%)." },
        sewing_qty: { type: "number", description: "Sewing good output to record (ignored if to_full)." },
        finishing_qty: { type: "number", description: "Finishing output to record — this drives the completion % (ignored if to_full)." },
        production_date: { type: "string", description: "YYYY-MM-DD; defaults to today." },
      },
      required: ["po_number"],
    },
    allowedRoles: ["admin", "owner", "superadmin"],
    execute: recordProductionTool,
  },
  {
    name: "resolve_blocker",
    description: "Resolve (close) the open production blocker(s) on a PO. Admin/owner only. Use when a blocker reported on a PO has been fixed — marks every open/in-progress blocker for that PO as resolved with today's date. Optionally pass resolution_note describing what was done. Call get_blockers first to see which POs have open blockers. PROPOSES the change for approval.",
    input_schema: {
      type: "object",
      properties: {
        po_number: { type: "string" },
        resolution_note: { type: "string", description: "Optional: what was done to resolve the blocker." },
      },
      required: ["po_number"],
    },
    allowedRoles: ["admin", "owner", "superadmin"],
    execute: resolveBlockerTool,
  },
  {
    name: "notify_user",
    description: "Send an in-app notification to people in the factory. Admin/owner only. Use when the user wants to alert or message someone — e.g. 'tell Line 3 to fix the machine', 'notify the supervisors about the delay', 'message Sarah that the order shipped'. Target at least one of: to_user_name (a specific person), to_line (everyone assigned to that line), to_role (everyone with that role). Provide a short message (and optional title). PROPOSES the notification for approval before sending.",
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string", description: "The notification body — what to tell them." },
        title: { type: "string", description: "Optional short title/subject. Defaults to a generic one." },
        to_user_name: { type: "string", description: "Full name of a specific person to notify." },
        to_line: { type: "string", description: "Line name/number — notifies everyone assigned to that line." },
        to_role: { type: "string", enum: ["worker", "supervisor", "admin", "owner"], description: "Notify everyone with this role." },
      },
      required: ["message"],
    },
    allowedRoles: ["admin", "owner", "superadmin"],
    execute: notifyUserTool,
  },
  {
    name: "create_reminder",
    description: "Set a personal follow-up reminder for the user. Available to all roles. Use when the user says 'remind me to…', 'follow up tomorrow', 'don't let me forget…'. Resolve relative dates to an absolute due_date (YYYY-MM-DD) using today's date from context (e.g. tomorrow, next Monday). due_time is optional 24h HH:MM (defaults to 09:00, the factory's local time). The reminder is delivered as a notification when it comes due. PROPOSES it for approval.",
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string", description: "What to remind the user about." },
        due_date: { type: "string", description: "Absolute date YYYY-MM-DD (compute from today for relative phrasing)." },
        due_time: { type: "string", description: "Optional 24h HH:MM in the factory's timezone. Defaults to 09:00." },
        title: { type: "string", description: "Optional short title. Defaults to 'Reminder'." },
      },
      required: ["message", "due_date"],
    },
    allowedRoles: "all",
    execute: createReminderTool,
  },
  {
    name: "set_dispatch_status",
    description: "Approve or reject a PENDING dispatch (gate-out) request, identified by its reference number (e.g. DSP-20260619-001). Admin/owner only. Rejecting requires a reason. Use get_dispatches first to find the reference number — a PO can have several dispatches, so always act on a specific reference. Note: approving here sets the status but does NOT generate the printable gate-pass PDF (do that in the app if needed). PROPOSES the change for approval.",
    input_schema: {
      type: "object",
      properties: {
        reference: { type: "string", description: "Dispatch reference number, e.g. DSP-20260619-001." },
        decision: { type: "string", enum: ["approve", "reject"], description: "Approve or reject the dispatch." },
        reason: { type: "string", description: "Required when rejecting: why it's rejected." },
      },
      required: ["reference", "decision"],
    },
    allowedRoles: ["admin", "owner", "superadmin"],
    execute: setDispatchStatusTool,
  },
  {
    name: "propose_create_form",
    description: "Create a NEW custom digital form from a description or an uploaded paper form image. Admin/owner only. Use when the user wants to add a new form/checklist (it appears in a chosen role's catalogue alongside that role's read-only default form). Extract a name, the role it is for, and the list of fields. If the user wants a NEW VERSION of one of the default production forms, also set slot_key so it appears on that form's versions screen. This PROPOSES the form for the user to approve — it does not create it directly. To CHANGE an existing custom form, use propose_update_form instead so a duplicate isn't created.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The form's title." },
        target_role: { type: "string", enum: ["sewing", "cutting", "finishing", "qc", "storage", "worker"], description: "Which role/department this form belongs to. Ask the user if unclear. Not needed when slot_key is set (the slot implies the role)." },
        slot_key: { type: "string", enum: ["sewing_morning_targets", "sewing_end_of_day", "cutting_morning_targets", "cutting_end_of_day", "finishing_daily_target", "finishing_daily_output"], description: "Set ONLY when this form is meant as a new version/variant of that default production form. Omit for a standalone form." },
        production_mapping: { type: "object", additionalProperties: { type: "string" }, description: "For a slot form (slot_key set), ALWAYS include this so the form feeds the production dashboards by default — don't wait to be asked. Map production values to this form's field LABELS. Keys depend on the slot — e.g. for sewing_end_of_day: good_output, reject, rework, manpower, hours, ot_hours; for sewing_morning_targets: target_output (map the target/planned OUTPUT field — REQUIRED for the target-vs-actual status to work), per_hour_target, manpower, hours, ot_hours; cutting: day_cutting, day_input, manpower, marker_capacity, lay_capacity, cutting_capacity, hours; finishing_daily_output: poly, carton, manpower, hours, ot_hours; finishing_daily_target: per_hour_target, manpower, hours, ot_hours. Example (end of day): {\"good_output\": \"Line output (Production)\", \"manpower\": \"Daily Manpower\", \"hours\": \"Worked Hours\"}. Example (morning target): {\"target_output\": \"Target Line output (Production)\", \"manpower\": \"Target Daily Manpower\", \"hours\": \"Target Worked Hours\"}. Line and PO are detected automatically from the form's line/PO picker fields." },
        description: { type: "string" },
        fields: {
          type: "array",
          description: "The fields, in order, as they appear on the form.",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              type: { type: "string", enum: ["text", "number", "date", "dropdown", "textarea", "checkbox", "computed", "auto", "po_select", "dynamic_select"], description: "Use \"dropdown\" for a FIXED list you supply via options; \"dynamic_select\" for a dropdown whose choices come live from a factory list (set source_key); \"computed\" for a formula over OTHER fields; \"auto\" for a value auto-filled from submission context; \"po_select\" to pick one of the factory's purchase orders." },
              required: { type: "boolean" },
              section: { type: "string", description: "Optional group/section heading this field belongs under." },
              options: { type: "array", items: { type: "string" }, description: "Choices for a fixed \"dropdown\" field." },
              source_key: { type: "string", enum: ["lines", "stages", "stage_progress", "milestones", "blocker_types", "blocker_owners", "blocker_impacts"], description: "Required for type \"dynamic_select\": which live factory list supplies the dropdown choices (kept in sync automatically). Use lines for production lines, stages/stage_progress/milestones for the production lists, blocker_types/blocker_owners/blocker_impacts for the blocker lists." },
              formula: { type: "string", description: "Required for type \"computed\": arithmetic that references OTHER fields by their exact label in braces, e.g. \"{Total Minutes Produced} / {Total Minutes Attended} * 100\". Supports + - * / and parentheses. The field auto-calculates and is read-only." },
              auto_source: { type: "string", enum: ["submission_date", "submission_time", "submission_datetime", "current_month", "current_year", "user_name", "user_email", "factory_name"], description: "Required for type \"auto\": which submission-context value fills the field automatically (read-only). E.g. submission_date for the date it's filled, user_name for who filled it." },
              metric_role: { type: "string", enum: ["output", "target_output", "reject", "rework", "manpower", "hours", "ot_hours", "per_hour", "per_hour_target", "input", "poly", "carton", "efficiency"], description: "Optional, for a NUMBER or COMPUTED field only: tag the canonical production metric this field's value represents, so the form feeds the Insights page and Lina even though it's not a default production form. Map by MEANING, not wording — e.g. 'Garments Produced Today' or 'Pieces Out' → output, 'Target Output'/'Planned Pcs' → target_output, 'Operators on Line'/'Headcount' → manpower, 'Hours Worked' → hours, 'Line Efficiency %' → efficiency, 'Rejects'/'Defects' → reject. Tag EVERY numeric field that is one of these. Omit for fields that aren't a production metric." },
            },
            required: ["label", "type"],
          },
        },
      },
      required: ["name", "target_role", "fields"],
    },
    allowedRoles: ["admin", "owner", "superadmin"],
    execute: proposeCreateFormTool,
  },
  {
    name: "propose_update_form",
    description: "Update an EXISTING custom form (one Lina previously created), identified by its exact name. Admin/owner only. Use when the user asks to change/edit a form they already made (e.g. 'add a field to the X form'). Provide the form's name and the FULL new list of fields it should have (the form's fields are replaced with this list). Never use this for the read-only default production forms. This PROPOSES the change for the user to approve.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The exact name of the existing custom form to update." },
        fields: {
          type: "array",
          description: "The complete new field list, in order (replaces the form's current fields).",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              type: { type: "string", enum: ["text", "number", "date", "dropdown", "textarea", "checkbox", "computed", "auto", "po_select", "dynamic_select"], description: "Use \"computed\" for a formula field, \"auto\" for a context-filled field, \"po_select\" for a PO picker, \"dynamic_select\" for a live factory-list dropdown (set source_key), \"dropdown\" for a fixed options list." },
              required: { type: "boolean" },
              section: { type: "string" },
              options: { type: "array", items: { type: "string" } },
              source_key: { type: "string", enum: ["lines", "stages", "stage_progress", "milestones", "blocker_types", "blocker_owners", "blocker_impacts"], description: "Required for type \"dynamic_select\": which live factory list supplies the choices." },
              formula: { type: "string", description: "Required for type \"computed\": arithmetic referencing OTHER fields by exact label in braces, e.g. \"{A} * {B}\". Supports + - * / and parentheses. Read-only, auto-calculated." },
              auto_source: { type: "string", enum: ["submission_date", "submission_time", "submission_datetime", "current_month", "current_year", "user_name", "user_email", "factory_name"], description: "Required for type \"auto\": which submission-context value fills the field (read-only)." },
              metric_role: { type: "string", enum: ["output", "target_output", "reject", "rework", "manpower", "hours", "ot_hours", "per_hour", "per_hour_target", "input", "poly", "carton", "efficiency"], description: "Optional, NUMBER/COMPUTED only: canonical production metric this value represents (output, manpower, hours, target_output, efficiency, …), so the form feeds Insights + Lina. Map by meaning regardless of wording. Omit if not a production metric." },
            },
            required: ["label", "type"],
          },
        },
      },
      required: ["name", "fields"],
    },
    allowedRoles: ["admin", "owner", "superadmin"],
    execute: proposeUpdateFormTool,
  },
  {
    name: "get_custom_form",
    description: "Show the current fields of an existing custom form, by exact name: each field's label, type, required flag, section, and any formula/source. Admin/owner only. Call this BEFORE editing a form (or when the user asks what's on a form) so you work from the real fields, never from memory.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string", description: "The exact name of the custom form." } },
      required: ["name"],
    },
    allowedRoles: ["admin", "owner", "superadmin"],
    execute: getCustomFormTool,
  },
  {
    name: "get_custom_form_submissions",
    description: "Read the SUBMISSIONS (filled-in data) of a custom form by name — the actual values people entered — so you can answer questions about them, compare forms, or compute things like efficiency, totals, or target-vs-actual. Admin/owner only. Returns each submission's field values with its date. To COMPARE two forms (e.g. a morning-target form vs an end-of-day form), call this once per form (optionally filtered to the same line/PO/day) and reason over the results. Use get_custom_form first if you need to know a form's field labels.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Exact name of the custom form whose submissions to read." },
        scope: { type: "string", enum: ["today", "week", "all"], description: "Time range — today, the last 7 days, or all (default: recent)." },
        line: { type: "string", description: "Optional: only submissions whose line field matches this." },
        po: { type: "string", description: "Optional: only submissions whose PO field matches this." },
        limit: { type: "number", description: "Max submissions to return (default 20, max 50)." },
      },
      required: ["name"],
    },
    allowedRoles: ["admin", "owner", "superadmin"],
    execute: getCustomSubmissionsTool,
  },
  {
    name: "propose_edit_form",
    description: "Make a TARGETED change to an existing custom form WITHOUT re-listing all its fields. Admin/owner only. This reads the form's current fields and applies only the operations you give, so fields you don't mention are kept exactly as they are. PREFER THIS over propose_update_form for any edit to an existing form (add/remove/rename a field, change a field's required flag or section, or convert a field's type — e.g. make it computed or auto-filled). If unsure of the exact field labels, call get_custom_form first. Proposes the change for the user to approve.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The exact name of the form to edit." },
        production_mapping: { type: "object", additionalProperties: { type: "string" }, description: "Set/replace the production mapping for a slot form so its data feeds the dashboards. Map production value keys to this form's field LABELS. Keys: sewing_end_of_day → good_output, reject, rework, manpower, hours, ot_hours; sewing_morning_targets → target_output (the planned/target OUTPUT — REQUIRED for target-vs-actual status), per_hour_target, manpower, hours, ot_hours. Line and PO are auto-detected. Example (morning target): {\"target_output\": \"Target Line output (Production)\", \"manpower\": \"Target Daily Manpower\", \"hours\": \"Target Worked Hours\"}." },
        remove: { type: "array", items: { type: "string" }, description: "Exact labels of fields to delete. Only these are removed." },
        rename: {
          type: "array",
          description: "Rename fields.",
          items: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"] },
        },
        set: {
          type: "array",
          description: "Modify existing fields (change required/section, or convert the field's type and its formula/source).",
          items: {
            type: "object",
            properties: {
              field: { type: "string", description: "Exact label of the field to change." },
              required: { type: "boolean" },
              section: { type: "string" },
              type: { type: "string", enum: ["text", "number", "date", "dropdown", "textarea", "checkbox", "computed", "auto", "po_select", "dynamic_select"] },
              options: { type: "array", items: { type: "string" } },
              formula: { type: "string", description: "When converting to type computed: arithmetic referencing OTHER fields by exact label in braces, e.g. \"{A} * {B}\"." },
              auto_source: { type: "string", enum: ["submission_date", "submission_time", "submission_datetime", "current_month", "current_year", "user_name", "user_email", "factory_name"] },
              source_key: { type: "string", enum: ["lines", "stages", "stage_progress", "milestones", "blocker_types", "blocker_owners", "blocker_impacts"] },
              metric_role: { type: "string", enum: ["output", "target_output", "reject", "rework", "manpower", "hours", "ot_hours", "per_hour", "per_hour_target", "input", "poly", "carton", "efficiency"], description: "Set/change the canonical production metric this NUMBER/COMPUTED field represents so it feeds Insights + Lina (output, manpower, hours, target_output, efficiency, …). Map by meaning regardless of wording." },
            },
            required: ["field"],
          },
        },
        add: {
          type: "array",
          description: "New fields to add. Each is a normal field spec, optionally with `after` to place it.",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              type: { type: "string", enum: ["text", "number", "date", "dropdown", "textarea", "checkbox", "computed", "auto", "po_select", "dynamic_select"] },
              required: { type: "boolean" },
              section: { type: "string" },
              options: { type: "array", items: { type: "string" } },
              formula: { type: "string" },
              auto_source: { type: "string", enum: ["submission_date", "submission_time", "submission_datetime", "current_month", "current_year", "user_name", "user_email", "factory_name"] },
              source_key: { type: "string", enum: ["lines", "stages", "stage_progress", "milestones", "blocker_types", "blocker_owners", "blocker_impacts"] },
              metric_role: { type: "string", enum: ["output", "target_output", "reject", "rework", "manpower", "hours", "ot_hours", "per_hour", "per_hour_target", "input", "poly", "carton", "efficiency"], description: "Canonical production metric this NUMBER/COMPUTED field represents so it feeds Insights + Lina. Map by meaning regardless of wording." },
              after: { type: "string", description: "Insert this new field directly after the field with this label (otherwise it's added at the end)." },
            },
            required: ["label", "type"],
          },
        },
      },
      required: ["name"],
    },
    allowedRoles: ["admin", "owner", "superadmin"],
    execute: proposeEditFormTool,
  },
];

export function getToolsForRole(role: UserRole): ToolDefinition[] {
  return ALL_TOOLS.filter((t) => isToolAllowed(t, role));
}

export function toAnthropicTools(tools: ToolDefinition[]): { name: string; description: string; input_schema: Record<string, unknown> }[] {
  return tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
}

export async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const tool = ALL_TOOLS.find((t) => t.name === name);
  if (!tool) return `Unknown tool: ${name}.`;
  if (!isToolAllowed(tool, ctx.role)) {
    return `You don't have access to ${name}. This tool is restricted for your role.`;
  }
  try {
    return await tool.execute(ctx, input ?? {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `(Tool ${name} failed: ${msg})`;
  }
}
