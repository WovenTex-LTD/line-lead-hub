// Lina tool registry: assembles executors into role-filtered ToolDefinitions,
// exposes Anthropic schema export + dispatch with access control.

import type { ToolContext, ToolDefinition, UserRole } from "./types.ts";
import { isToolAllowed } from "./types.ts";
import {
  getProductionData, getBlockers, getWorkOrders, getLines,
  getFinancials, comparePeriods, findAnomalies, searchKnowledge,
  raiseSupportTicket, generateReport,
} from "./insights.ts";
import {
  createPoTool, updatePoTool, assignPoLinesTool,
  setPoStatusTool, setPoExFactoryTool, archivePoTool,
  proposeCreateFormTool,
  proposeUpdateFormTool,
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
    name: "get_blockers",
    description: "List open and in-progress production blockers across sewing and finishing. Call this when the user asks about issues, delays, problems, what's blocked, or bottlenecks.",
    input_schema: { type: "object", properties: {} },
    allowedRoles: "all",
    execute: getBlockers,
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
    name: "propose_create_form",
    description: "Create a NEW custom digital form from a description or an uploaded paper form image. Admin/owner only. Use when the user wants to add a new form/checklist (it appears in a chosen role's catalogue alongside that role's read-only default form). Extract a name, the role it is for, and the list of fields. If the user wants a NEW VERSION of one of the default production forms, also set slot_key so it appears on that form's versions screen. This PROPOSES the form for the user to approve — it does not create it directly. To CHANGE an existing custom form, use propose_update_form instead so a duplicate isn't created.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The form's title." },
        target_role: { type: "string", enum: ["sewing", "cutting", "finishing", "qc", "storage", "worker"], description: "Which role/department this form belongs to. Ask the user if unclear. Not needed when slot_key is set (the slot implies the role)." },
        slot_key: { type: "string", enum: ["sewing_morning_targets", "sewing_end_of_day", "cutting_morning_targets", "cutting_end_of_day", "finishing_daily_target", "finishing_daily_output"], description: "Set ONLY when this form is meant as a new version/variant of that default production form. Omit for a standalone form." },
        description: { type: "string" },
        fields: {
          type: "array",
          description: "The fields, in order, as they appear on the form.",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              type: { type: "string", enum: ["text", "number", "date", "dropdown", "textarea", "checkbox"] },
              required: { type: "boolean" },
              section: { type: "string", description: "Optional group/section heading this field belongs under." },
              options: { type: "array", items: { type: "string" }, description: "Choices for a dropdown field." },
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
              type: { type: "string", enum: ["text", "number", "date", "dropdown", "textarea", "checkbox"] },
              required: { type: "boolean" },
              section: { type: "string" },
              options: { type: "array", items: { type: "string" } },
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
