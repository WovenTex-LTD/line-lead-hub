// Server-side report generation for Lina.
// Builds production / insights / finance reports as PDF or CSV from the same
// production tables Lina already queries, uploads to a private "reports"
// Storage bucket, and returns a short-lived signed download URL.
//
// Deno-only module (imports jsPDF via esm.sh, uses crypto). NOT imported by
// any vitest test — the tool executor calls this through an injected function.

import { jsPDF } from "https://esm.sh/jspdf@2.5.1";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type ReportType = "production" | "insights" | "finance";
export type ReportFormat = "pdf" | "csv";

export interface ReportRequest {
  factoryId: string;
  factoryName: string;
  reportType: ReportType;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  format: ReportFormat;
}

export interface ReportResult {
  ok: boolean;
  url?: string;
  filename?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Report document model (rendered to both PDF and CSV)
// ---------------------------------------------------------------------------
interface ReportTable {
  columns: string[];
  rows: (string | number)[][];
}
interface ReportSection {
  heading: string;
  stats?: [string, string][];
  table?: ReportTable;
}
interface ReportDoc {
  title: string;
  subtitle: string;
  sections: ReportSection[];
}

const REPORT_BUCKET = "reports";
const SIGNED_URL_TTL = 60 * 60 * 24; // 24 hours

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------
export async function generateReport(
  sb: SupabaseClient,
  req: ReportRequest,
): Promise<ReportResult> {
  try {
    const doc =
      req.reportType === "finance"
        ? await buildFinanceReport(sb, req)
        : await buildProductionReport(sb, req); // production + insights share this

    const ext = req.format;
    const bytes =
      req.format === "csv"
        ? new TextEncoder().encode(renderCsv(doc))
        : new Uint8Array(renderPdf(doc).output("arraybuffer"));
    const contentType = req.format === "csv" ? "text/csv" : "application/pdf";

    const filename = `${req.reportType}-${req.start}_to_${req.end}.${ext}`;
    const path = `${req.factoryId}/${crypto.randomUUID()}-${filename}`;

    await ensureBucket(sb);

    const up = await sb.storage.from(REPORT_BUCKET).upload(path, bytes, {
      contentType,
      upsert: true,
    });
    if (up.error) return { ok: false, error: up.error.message };

    const signed = await sb.storage.from(REPORT_BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
    if (signed.error || !signed.data?.signedUrl) {
      return { ok: false, error: signed.error?.message ?? "could not create download link" };
    }
    return { ok: true, url: signed.data.signedUrl, filename };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function ensureBucket(sb: SupabaseClient): Promise<void> {
  // Idempotent: create the private bucket if it doesn't exist yet.
  const { data } = await sb.storage.getBucket(REPORT_BUCKET);
  if (!data) {
    await sb.storage.createBucket(REPORT_BUCKET, { public: false });
  }
}

// ---------------------------------------------------------------------------
// Production / Insights report (shared)
// ---------------------------------------------------------------------------
async function buildProductionReport(sb: SupabaseClient, req: ReportRequest): Promise<ReportDoc> {
  const { factoryId, start, end } = req;
  const [sewActR, sewTgtR, cutR, finR, linesR, blockSewR, blockFinR] = await Promise.all([
    sb.from("sewing_actuals").select("line_id, good_today, reject_today, rework_today, manpower_actual").eq("factory_id", factoryId).gte("production_date", start).lte("production_date", end),
    sb.from("sewing_targets").select("line_id, per_hour_target").eq("factory_id", factoryId).gte("production_date", start).lte("production_date", end),
    sb.from("cutting_actuals").select("day_cutting, day_input").eq("factory_id", factoryId).gte("production_date", start).lte("production_date", end),
    sb.from("finishing_daily_logs").select("poly, carton").eq("factory_id", factoryId).eq("log_type", "OUTPUT").gte("production_date", start).lte("production_date", end),
    sb.from("lines").select("id, line_id, name, is_active").eq("factory_id", factoryId).eq("is_active", true),
    sb.from("production_updates_sewing").select("blocker_impact").eq("factory_id", factoryId).eq("has_blocker", true).in("blocker_status", ["open", "in_progress"]),
    sb.from("production_updates_finishing").select("blocker_impact").eq("factory_id", factoryId).eq("has_blocker", true).in("blocker_status", ["open", "in_progress"]),
  ]);

  const sewActuals = (sewActR.data ?? []) as Record<string, number>[];
  const sewTargets = (sewTgtR.data ?? []) as Record<string, number>[];
  const cutting = (cutR.data ?? []) as Record<string, number>[];
  const finishing = (finR.data ?? []) as Record<string, number>[];
  const lines = (linesR.data ?? []) as Record<string, unknown>[];

  const sum = (rows: Record<string, number>[], k: string) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const totalGood = sum(sewActuals, "good_today");
  const totalReject = sum(sewActuals, "reject_today");
  const totalRework = sum(sewActuals, "rework_today");
  const sewTargetTotal = sum(sewTargets, "per_hour_target") * 8;
  const sewEff = sewTargetTotal > 0 ? Math.round((totalGood / sewTargetTotal) * 100) : null;
  const rejRate = totalGood + totalReject > 0 ? Math.round((totalReject / (totalGood + totalReject)) * 1000) / 10 : 0;
  const blockerCount = (blockSewR.data?.length ?? 0) + (blockFinR.data?.length ?? 0);

  // Per-line aggregation
  const goodByLine = new Map<string, number>();
  const rejByLine = new Map<string, number>();
  for (const a of sewActuals) {
    goodByLine.set(String(a.line_id), (goodByLine.get(String(a.line_id)) || 0) + (Number(a.good_today) || 0));
    rejByLine.set(String(a.line_id), (rejByLine.get(String(a.line_id)) || 0) + (Number(a.reject_today) || 0));
  }
  const tgtByLine = new Map<string, number>();
  for (const t of sewTargets) {
    tgtByLine.set(String(t.line_id), (tgtByLine.get(String(t.line_id)) || 0) + (Number(t.per_hour_target) || 0) * 8);
  }
  const lineRows = lines
    .map((l) => {
      const id = String(l.id);
      const good = goodByLine.get(id) || 0;
      const target = tgtByLine.get(id) || 0;
      const rej = rejByLine.get(id) || 0;
      return {
        name: String(l.name || l.line_id),
        good,
        target,
        eff: target > 0 ? Math.round((good / target) * 100) : 0,
        rej,
      };
    })
    .filter((r) => r.good > 0 || r.target > 0)
    .sort((a, b) => a.eff - b.eff);

  const isInsights = req.reportType === "insights";
  const sections: ReportSection[] = [
    {
      heading: "Production summary",
      stats: [
        ["Sewing good output", `${totalGood.toLocaleString()} pcs`],
        ["Sewing target", sewTargetTotal > 0 ? `${sewTargetTotal.toLocaleString()} pcs` : "not set"],
        ["Sewing efficiency", sewEff !== null ? `${sewEff}%` : "n/a"],
        ["Reject rate", `${rejRate}%`],
        ["Rework", `${totalRework.toLocaleString()} pcs`],
        ["Cutting (day output)", `${sum(cutting, "day_cutting").toLocaleString()} pcs`],
        ["Finishing poly", `${sum(finishing, "poly").toLocaleString()} pcs`],
        ["Finishing carton", `${sum(finishing, "carton").toLocaleString()}`],
        ["Open blockers", String(blockerCount)],
      ],
    },
    {
      heading: isInsights ? "Line performance (weakest first)" : "Per-line sewing output",
      table: {
        columns: ["Line", "Good", "Target", "Efficiency", "Rejects"],
        rows: lineRows.map((r) => [r.name, r.good, r.target || "-", r.target > 0 ? `${r.eff}%` : "-", r.rej]),
      },
    },
  ];

  return {
    title: `${isInsights ? "Insights" : "Production"} Report`,
    subtitle: `${req.factoryName} — ${start} to ${end}`,
    sections,
  };
}

// ---------------------------------------------------------------------------
// Finance report (mirrors the Finances page: sewing Output-Value basis)
// ---------------------------------------------------------------------------
async function buildFinanceReport(sb: SupabaseClient, req: ReportRequest): Promise<ReportDoc> {
  const { factoryId, start, end } = req;
  const { data: factory } = await sb
    .from("factory_accounts")
    .select("headcount_cost_value, headcount_cost_currency")
    .eq("id", factoryId)
    .single();
  const rate = (factory?.headcount_cost_value as number) ?? 0;
  const currency: string = (factory?.headcount_cost_currency as string) ?? "BDT";

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
    } catch (_e) { /* fallback */ }
  }
  const toUsd = (v: number) => (currency === "BDT" ? v * fx : v);

  const { data } = await sb
    .from("sewing_actuals")
    .select("good_today, manpower_actual, hours_actual, ot_manpower_actual, ot_hours_actual, work_orders(po_number, buyer, cm_per_dozen)")
    .eq("factory_id", factoryId)
    .gte("production_date", start)
    .lte("production_date", end);

  const rows = (data ?? []) as Record<string, unknown>[];
  let totalValue = 0;
  let totalCost = 0;
  const byPo: Record<string, { po: string; buyer: string; value: number; cost: number }> = {};
  for (const r of rows) {
    const wo = (r.work_orders ?? {}) as Record<string, unknown>;
    const cmDz = (wo.cm_per_dozen as number) || 0;
    if (cmDz <= 0) continue;
    const output = (r.good_today as number) || 0;
    const value = output > 0 ? (cmDz / 12) * output : 0;
    const costNative = rate > 0
      ? rate * (((r.manpower_actual as number) || 0) * ((r.hours_actual as number) || 0) + ((r.ot_manpower_actual as number) || 0) * ((r.ot_hours_actual as number) || 0))
      : 0;
    const cost = toUsd(costNative);
    totalValue += value;
    totalCost += cost;
    const po = (wo.po_number as string) || "N/A";
    if (!byPo[po]) byPo[po] = { po, buyer: (wo.buyer as string) || "", value: 0, cost: 0 };
    byPo[po].value += value;
    byPo[po].cost += cost;
  }
  const profit = totalValue - totalCost;
  const margin = totalValue > 0 ? Math.round((profit / totalValue) * 100) : 0;
  const usd = (v: number) => `$${Math.round(v).toLocaleString()}`;

  const poList = Object.values(byPo).sort((a, b) => b.value - a.value);

  return {
    title: "Finance Report",
    subtitle: `${req.factoryName} — ${start} to ${end} (USD, sewing Output-Value basis)`,
    sections: [
      {
        heading: "Summary",
        stats: [
          ["Output Value (revenue)", usd(totalValue)],
          ["Operating Cost", rate > 0 ? usd(totalCost) : "rate not configured"],
          ["Operating Profit", `${profit >= 0 ? "+" : "-"}${usd(Math.abs(profit))}`],
          ["Operating Margin", `${margin}%`],
        ],
      },
      {
        heading: "By PO",
        table: {
          columns: ["PO", "Buyer", "Value", "Cost", "Margin"],
          rows: poList.map((p) => [
            p.po,
            p.buyer || "-",
            usd(p.value),
            usd(p.cost),
            p.value > 0 ? `${Math.round(((p.value - p.cost) / p.value) * 100)}%` : "-",
          ]),
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------
function renderCsv(doc: ReportDoc): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const out: string[] = [esc(doc.title), esc(doc.subtitle), ""];
  for (const sec of doc.sections) {
    out.push(esc(sec.heading));
    if (sec.stats) {
      for (const [k, v] of sec.stats) out.push(`${esc(k)},${esc(v)}`);
    }
    if (sec.table) {
      out.push(sec.table.columns.map(esc).join(","));
      for (const row of sec.table.rows) out.push(row.map(esc).join(","));
    }
    out.push("");
  }
  return out.join("\n");
}

function renderPdf(doc: ReportDoc): jsPDF {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  let y = margin;

  const newPageIfNeeded = (needed: number) => {
    if (y + needed > pageH - margin) {
      pdf.addPage();
      y = margin;
    }
  };

  // Header band
  pdf.setFillColor(0x29, 0x5a, 0xd6);
  pdf.rect(0, 0, pageW, 70, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text(doc.title, margin, 34);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(doc.subtitle, margin, 52);
  pdf.setTextColor(20, 20, 20);
  y = 96;

  for (const sec of doc.sections) {
    newPageIfNeeded(40);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text(sec.heading, margin, y);
    y += 18;

    if (sec.stats) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      for (const [k, v] of sec.stats) {
        newPageIfNeeded(16);
        pdf.text(k, margin, y);
        pdf.text(String(v), pageW - margin, y, { align: "right" });
        y += 15;
      }
      y += 8;
    }

    if (sec.table) {
      const cols = sec.table.columns;
      const colW = (pageW - margin * 2) / cols.length;
      newPageIfNeeded(24);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      cols.forEach((c, i) => pdf.text(c, margin + i * colW, y));
      y += 6;
      pdf.setDrawColor(200, 200, 200);
      pdf.line(margin, y, pageW - margin, y);
      y += 12;
      pdf.setFont("helvetica", "normal");
      for (const row of sec.table.rows) {
        newPageIfNeeded(16);
        row.forEach((cell, i) => pdf.text(String(cell), margin + i * colW, y));
        y += 14;
      }
      y += 10;
    }
  }

  pdf.setFontSize(8);
  pdf.setTextColor(140, 140, 140);
  pdf.text("Generated by Lina, the ProductionPortal assistant.", margin, pageH - 24);
  return pdf;
}
