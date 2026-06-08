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

/** compare_periods(metric, period_a_*, period_b_*) — currently supports the
 *  "sewing_good" metric (sum of good_today). Returns a delta summary. */
export async function comparePeriods(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!allowedDepartmentsForRole(ctx.role).includes("sewing")) return DENY("production comparison data");

  const metric = String(input.metric ?? "sewing_good");
  if (metric !== "sewing_good") {
    return `Comparison for metric "${metric}" isn't available yet. Supported: sewing_good.`;
  }
  const aStart = String(input.period_a_start);
  const aEnd = String(input.period_a_end);
  const bStart = String(input.period_b_start);
  const bEnd = String(input.period_b_end);

  const sumGood = async (start: string, end: string): Promise<number> => {
    const { data, error } = await ctx.supabase
      .from("sewing_actuals")
      .select("good_today")
      .eq("factory_id", ctx.factoryId)
      .gte("production_date", start)
      .lte("production_date", end);
    if (error) return 0;
    return (data ?? []).reduce((s: number, r: any) => s + (r.good_today || 0), 0);
  };

  const a = await sumGood(aStart, aEnd);
  const b = await sumGood(bStart, bEnd);
  const delta = a - b;
  const pct = b > 0 ? Math.round((delta / b) * 1000) / 10 : null;
  const dir = delta > 0 ? "up" : delta < 0 ? "down" : "unchanged";

  return [
    `Sewing good output comparison:`,
    `- Period A (${aStart}…${aEnd}): ${a} pcs`,
    `- Period B (${bStart}…${bEnd}): ${b} pcs`,
    `- Change: ${dir} ${Math.abs(delta)} pcs${pct !== null ? ` (${pct}%)` : ""}`,
  ].join("\n");
}

function formatChunks(rows: any[]): string {
  return rows
    .map((r, i) => {
      const loc = r.page_number ? `Page ${r.page_number}` : r.section_heading || "General";
      return `[${i + 1}] ${r.document_title} (${loc}, ${(r.similarity * 100).toFixed(0)}% match):\n${r.content}`;
    })
    .join("\n\n");
}

/** search_knowledge(query) — vector RAG over knowledge_chunks. Embeds on demand. */
export async function searchKnowledge(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  const query = String(input.query ?? "").trim();
  if (!query) return "No search query was provided.";

  const embedding = await ctx.embed(query);
  const embeddingStr = `[${embedding.join(",")}]`;

  const primary = await ctx.supabase.rpc("search_knowledge", {
    query_embedding: embeddingStr,
    match_threshold: 0.3,
    match_count: 8,
    p_factory_id: ctx.factoryId,
    p_language: null,
  });
  let rows = (primary.data ?? []) as any[];

  if (rows.length === 0) {
    const fallback = await ctx.supabase.rpc("search_knowledge", {
      query_embedding: embeddingStr,
      match_threshold: 0.15,
      match_count: 5,
      p_factory_id: ctx.factoryId,
      p_language: null,
    });
    rows = (fallback.data ?? []) as any[];
  }

  if (rows.length === 0) {
    return "No relevant documentation was found in the knowledge base for that query.";
  }
  return formatChunks(rows);
}

/** find_anomalies() — flags sewing lines below 80% of daily target and reject
 *  rates over 5% for today. */
export async function findAnomalies(ctx: ToolContext, _input: Record<string, unknown>): Promise<string> {
  if (!allowedDepartmentsForRole(ctx.role).includes("sewing")) return DENY("anomaly data");

  const [linesR, actR, tgtR] = await Promise.all([
    ctx.supabase.from("lines").select("id, line_id, name, is_active").eq("factory_id", ctx.factoryId).eq("is_active", true),
    ctx.supabase.from("sewing_actuals").select("line_id, good_today, reject_today").eq("factory_id", ctx.factoryId).eq("production_date", ctx.today),
    ctx.supabase.from("sewing_targets").select("line_id, per_hour_target").eq("factory_id", ctx.factoryId).eq("production_date", ctx.today),
  ]);

  const lines = (linesR.data ?? []) as any[];
  const actuals = (actR.data ?? []) as any[];
  const targets = (tgtR.data ?? []) as any[];

  const goodByLine = new Map<string, number>();
  const rejectByLine = new Map<string, number>();
  for (const a of actuals) {
    goodByLine.set(a.line_id, (goodByLine.get(a.line_id) || 0) + (a.good_today || 0));
    rejectByLine.set(a.line_id, (rejectByLine.get(a.line_id) || 0) + (a.reject_today || 0));
  }
  const dailyTargetByLine = new Map<string, number>();
  for (const t of targets) {
    dailyTargetByLine.set(t.line_id, (dailyTargetByLine.get(t.line_id) || 0) + (t.per_hour_target || 0) * 8);
  }

  const flags: string[] = [];
  for (const line of lines) {
    const name = line.name || line.line_id;
    const good = goodByLine.get(line.id) || 0;
    const reject = rejectByLine.get(line.id) || 0;
    const target = dailyTargetByLine.get(line.id) || 0;
    if (target > 0) {
      const eff = Math.round((good / target) * 100);
      if (eff < 80) flags.push(`- ${name}: behind target at ${eff}% (${good}/${target} pcs)`);
    }
    const produced = good + reject;
    if (produced > 0) {
      const rejRate = Math.round((reject / produced) * 1000) / 10;
      if (rejRate > 5) flags.push(`- ${name}: high reject rate ${rejRate}% (${reject} rejects)`);
    }
  }

  if (flags.length === 0) return "No anomalies detected today — all reporting lines are at or near target with normal reject rates.";
  return `Anomalies detected today (${ctx.today}):\n${flags.join("\n")}`;
}
