// Lina tool registry: assembles executors into role-filtered ToolDefinitions,
// exposes Anthropic schema export + dispatch with access control.

import type { ToolContext, ToolDefinition, UserRole } from "./types.ts";
import { isToolAllowed } from "./types.ts";
import {
  getProductionData, getBlockers, getWorkOrders, getLines,
  getFinancials, comparePeriods, findAnomalies, searchKnowledge,
  raiseSupportTicket,
} from "./insights.ts";

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
    description: "Get a per-line efficiency overview for today (output vs target). Call this for questions about line performance, which lines are behind, best/worst line, or efficiency.",
    input_schema: { type: "object", properties: {} },
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
    description: "Search the factory knowledge base (manuals, policies, FAQs, certificates) for documentation. Call this when the user asks how to do something, about compliance/certifications, or for guidance not answerable from live production numbers.",
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
