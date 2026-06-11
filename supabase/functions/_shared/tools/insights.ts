// Lina insight tool executors. Each wraps an exported live-data fetcher and
// enforces role/department access. Pure: Supabase client comes from ToolContext.

import type { ToolContext, Department } from "./types.ts";
import { allowedDepartmentsForRole } from "./types.ts";
import {
  fetchSewingOutput,
  fetchCutting,
  fetchFinishing,
  fetchBlockers,
  fetchWorkOrders,
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

/** get_lines([start_date], [end_date]) — per-line sewing efficiency over a date
 *  range (output vs target, reject rate). Defaults to today; pass a range for
 *  weekly/monthly per-line breakdowns. */
export async function getLines(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!allowedDepartmentsForRole(ctx.role).includes("sewing")) return DENY("line performance data");

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const start = typeof input.start_date === "string" && DATE_RE.test(input.start_date) ? input.start_date : ctx.today;
  const end = typeof input.end_date === "string" && DATE_RE.test(input.end_date) ? input.end_date : ctx.today;

  const [linesR, actR, tgtR] = await Promise.all([
    ctx.supabase.from("lines").select("id, line_id, name, is_active").eq("factory_id", ctx.factoryId).eq("is_active", true),
    ctx.supabase.from("sewing_actuals").select("line_id, good_today, reject_today").eq("factory_id", ctx.factoryId).gte("production_date", start).lte("production_date", end),
    ctx.supabase.from("sewing_targets").select("line_id, per_hour_target").eq("factory_id", ctx.factoryId).gte("production_date", start).lte("production_date", end),
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
  const targetByLine = new Map<string, number>();
  for (const t of targets) {
    targetByLine.set(t.line_id, (targetByLine.get(t.line_id) || 0) + (t.per_hour_target || 0) * 8);
  }

  const rows = lines
    .map((line) => {
      const good = goodByLine.get(line.id) || 0;
      const reject = rejectByLine.get(line.id) || 0;
      const target = targetByLine.get(line.id) || 0;
      const produced = good + reject;
      return {
        name: line.name || line.line_id,
        good,
        reject,
        target,
        eff: target > 0 ? Math.round((good / target) * 100) : null,
        rejRate: produced > 0 ? Math.round((reject / produced) * 1000) / 10 : 0,
      };
    })
    .filter((r) => r.target > 0 || r.good > 0);

  const period = start === end ? start : `${start} to ${end}`;
  if (rows.length === 0) {
    return `No sewing line activity is recorded for ${period}.`;
  }

  rows.sort((a, b) => (a.eff ?? 1e9) - (b.eff ?? 1e9)); // weakest first
  const totalGood = rows.reduce((s, r) => s + r.good, 0);
  const totalTarget = rows.reduce((s, r) => s + r.target, 0);
  const overall = totalTarget > 0 ? Math.round((totalGood / totalTarget) * 100) : null;

  const body = rows.map((r) => {
    const effStr = r.eff !== null ? `${r.eff}% efficiency (${r.good}/${r.target} pcs)` : `${r.good} pcs (no target set)`;
    const rejStr = r.rejRate > 0 ? `, ${r.rejRate}% reject` : "";
    return `- ${r.name}: ${effStr}${rejStr}`;
  });

  return [
    `Line performance for ${period} (weakest first)${overall !== null ? `, overall ${overall}%` : ""}:`,
    ...body,
  ].join("\n");
}

/** get_financials() — admin/owner only. Mirrors the app's Finances page:
 *  Output Value (revenue) = sewing good_today × (cm_per_dozen / 12) using 100%
 *  of entered CM; Operating Cost = rate × (manpower×hours + ot_manpower×ot_hours),
 *  sewing only; rows without a CM/dozen are skipped entirely (missing-CM rule). */
export async function getFinancials(ctx: ToolContext, _input: Record<string, unknown>): Promise<string> {
  if (!canSeeFinancials(ctx.role)) return DENY("financial data");

  // Headcount cost rate + currency from the factory account.
  const { data: factory } = await ctx.supabase
    .from("factory_accounts")
    .select("headcount_cost_value, headcount_cost_currency")
    .eq("id", ctx.factoryId)
    .single();
  const rate = (factory?.headcount_cost_value as number) ?? 0;
  const currency: string = (factory?.headcount_cost_currency as string) ?? "BDT";

  // BDT→USD conversion (live rate, fallback 1/121 — matches the Finances page).
  let fx = 1;
  if (currency === "BDT") {
    fx = 1 / 121;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: ctrl.signal });
      clearTimeout(t);
      const json = await res.json();
      if (json?.rates?.BDT) fx = 1 / json.rates.BDT;
    } catch (_e) {
      // keep fallback
    }
  }
  const toUsd = (v: number) => (currency === "BDT" ? v * fx : v);

  const { data, error } = await ctx.supabase
    .from("sewing_actuals")
    .select("good_today, manpower_actual, hours_actual, ot_manpower_actual, ot_hours_actual, work_orders(po_number, buyer, cm_per_dozen)")
    .eq("factory_id", ctx.factoryId)
    .eq("production_date", ctx.today);
  if (error) return `(${error.message})`;

  const rows = (data ?? []) as any[];
  if (rows.length === 0) {
    return `No sewing output has been submitted yet for ${ctx.today}, so there's no Output Value to report today.`;
  }

  let totalValue = 0;
  let totalCost = 0;
  const byPo: Record<string, { po: string; buyer: string; value: number; cost: number }> = {};
  for (const r of rows) {
    const cmDz = (r.work_orders?.cm_per_dozen as number) || 0;
    if (cmDz <= 0) continue; // missing-CM rule: skip row from both value and cost
    const output = r.good_today || 0;
    const value = output > 0 ? (cmDz / 12) * output : 0;
    const costNative = rate > 0
      ? rate * ((r.manpower_actual || 0) * (r.hours_actual || 0) + (r.ot_manpower_actual || 0) * (r.ot_hours_actual || 0))
      : 0;
    const cost = toUsd(costNative);
    totalValue += value;
    totalCost += cost;
    const po = r.work_orders?.po_number || "N/A";
    if (!byPo[po]) byPo[po] = { po, buyer: r.work_orders?.buyer || "", value: 0, cost: 0 };
    byPo[po].value += value;
    byPo[po].cost += cost;
  }

  const usd = (v: number) => `$${Math.round(v).toLocaleString()}`;
  if (totalValue === 0) {
    return `No sewing output with a CM/dozen price is recorded for ${ctx.today}, so today's Output Value is $0 so far.`;
  }
  if (rate === 0) {
    return `Output Value (today, ${ctx.today}): ${usd(totalValue)} from sewing output. Operating cost/profit can't be calculated — the headcount cost rate isn't set in Factory Setup.`;
  }

  const profit = totalValue - totalCost;
  const margin = Math.round((profit / totalValue) * 100);
  const lines = [
    `Today's financials (${ctx.today}), USD — same Output-Value basis as the Finances page:`,
    `- Output Value (revenue): ${usd(totalValue)}`,
    `- Operating Cost: ${usd(totalCost)}`,
    `- Operating Profit: ${profit >= 0 ? "+" : "-"}${usd(Math.abs(profit))}`,
    `- Operating Margin: ${margin}%`,
  ];
  const poList = Object.values(byPo).sort((a, b) => b.value - a.value).slice(0, 8);
  if (poList.length > 1) {
    lines.push(`By PO:`);
    for (const p of poList) {
      const m = p.value > 0 ? Math.round(((p.value - p.cost) / p.value) * 100) : 0;
      lines.push(`- ${p.po}${p.buyer ? ` (${p.buyer})` : ""}: value ${usd(p.value)}, cost ${usd(p.cost)}, margin ${m}%`);
    }
  }
  return lines.join("\n");
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

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (![aStart, aEnd, bStart, bEnd].every((d) => DATE_RE.test(d))) {
    return "I need both date ranges as valid YYYY-MM-DD dates to compare periods.";
  }

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

/** generate_report(report_type, start_date, end_date, [format]) — produces the
 *  same export file the app's manual Export button makes, downloaded for the user
 *  via the client. */
export async function generateReport(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  const reportType = String(input.report_type ?? "") as "production" | "insights" | "finance";
  if (!["production", "insights", "finance"].includes(reportType)) {
    return "Tell me which report you'd like: production, insights, or finance.";
  }
  if (reportType === "finance" && !canSeeFinancials(ctx.role)) return DENY("financial reports");
  if (reportType !== "finance" && !canSeeAnyProduction(ctx.role)) return DENY(`${reportType} reports`);

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const start = typeof input.start_date === "string" && DATE_RE.test(input.start_date) ? input.start_date : ctx.today;
  const end = typeof input.end_date === "string" && DATE_RE.test(input.end_date) ? input.end_date : ctx.today;
  const format = input.format === "csv" ? "csv" : "pdf";

  ctx.requestExport({ reportType, start, end, format });
  const range = start === end ? start : `${start} to ${end}`;
  return `Generating your ${reportType} report (${range}) as ${format.toUpperCase()} — it will download in a moment.`;
}

/** raise_support_ticket(problem, [category]) — emails a ticket to the Woventex
 *  team when Lina can't resolve a problem with her other tools. */
export async function raiseSupportTicket(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  const problem = String(input.problem ?? "").trim();
  if (!problem) {
    return "I need a short description of the problem before I can raise a ticket.";
  }
  const category = typeof input.category === "string" ? input.category : undefined;
  const result = await ctx.escalate({ problem, category });
  if (!result.ok) {
    return `I couldn't raise the ticket automatically${result.error ? ` (${result.error})` : ""}. Please email contact@woventex.co directly and the team will help.`;
  }
  return "I've raised a ticket with the Woventex team at contact@woventex.co — they'll follow up on this. Is there anything else I can help with in the meantime?";
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
