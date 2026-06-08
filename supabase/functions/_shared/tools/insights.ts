// Lina insight tool executors. Each wraps an exported live-data fetcher and
// enforces role/department access. Pure: Supabase client comes from ToolContext.

import type { ToolContext, Department } from "./types";
import { allowedDepartmentsForRole } from "./types";
import {
  fetchSewingOutput,
  fetchCutting,
  fetchFinishing,
  fetchBlockers,
  fetchWorkOrders,
  fetchLines,
  fetchFinancials,
} from "../live-data.ts";

const DENY = (what: string) =>
  `You don't have access to ${what}. This data is restricted for your role — please contact your administrator if you need it.`;

function canSeeProductionFloor(role: string): boolean {
  const depts = allowedDepartmentsForRole(role);
  return depts.includes("sewing") || depts.includes("finishing");
}

function canSeeAnyProduction(role: string): boolean {
  return allowedDepartmentsForRole(role).length > 0;
}

function canSeeFinancials(role: string): boolean {
  return role === "admin" || role === "owner";
}

/** get_production_data(department, [date]) — sewing/cutting/finishing actuals. */
export async function getProductionData(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  const dept = String(input.department ?? "sewing") as Department;
  const date = typeof input.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.date)
    ? input.date
    : ctx.today;

  if (!allowedDepartmentsForRole(ctx.role).includes(dept)) {
    return DENY(`${dept} production data`);
  }

  let result;
  if (dept === "sewing") result = await fetchSewingOutput(ctx.supabase, ctx.factoryId, date);
  else if (dept === "cutting") result = await fetchCutting(ctx.supabase, ctx.factoryId, date);
  else result = await fetchFinishing(ctx.supabase, ctx.factoryId, date);

  return result.error ? `(${result.error})` : result.summary;
}

/** get_blockers() — open/in-progress blockers across sewing + finishing. */
export async function getBlockers(ctx: ToolContext, _input: Record<string, unknown>): Promise<string> {
  if (!canSeeProductionFloor(ctx.role)) return DENY("blocker data");
  const result = await fetchBlockers(ctx.supabase, ctx.factoryId);
  return result.error ? `(${result.error})` : result.summary;
}

/** get_work_orders([po], [buyer]) — PO status, quantities, progress, ex-factory. */
export async function getWorkOrders(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!canSeeAnyProduction(ctx.role)) return DENY("work order data");
  const po = typeof input.po === "string" ? input.po : null;
  const buyer = typeof input.buyer === "string" ? input.buyer : null;
  const result = await fetchWorkOrders(ctx.supabase, ctx.factoryId, po, buyer, ctx.today);
  return result.error ? `(${result.error})` : result.summary;
}

/** get_lines() — per-line efficiency overview (sewing). */
export async function getLines(ctx: ToolContext, _input: Record<string, unknown>): Promise<string> {
  if (!allowedDepartmentsForRole(ctx.role).includes("sewing")) return DENY("line performance data");
  const result = await fetchLines(ctx.supabase, ctx.factoryId, ctx.today);
  return result.error ? `(${result.error})` : result.summary;
}

/** get_financials() — admin/owner only. Revenue/cost/profit/margin. */
export async function getFinancials(ctx: ToolContext, _input: Record<string, unknown>): Promise<string> {
  if (!canSeeFinancials(ctx.role)) return DENY("financial data");
  const result = await fetchFinancials(ctx.supabase, ctx.factoryId, ctx.today);
  return result.error ? `(${result.error})` : result.summary;
}
