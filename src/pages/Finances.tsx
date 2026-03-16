import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getTodayInTimezone } from "@/lib/date-utils";
import { Button } from "@/components/ui/button";
import {
  DollarSign, TrendingUp, TrendingDown, ChevronLeft, ChevronRight,
  ChevronRight as ChevronRightIcon, ArrowUp, ArrowDown, ArrowUpDown,
  Trophy, AlertCircle, Info, Sparkles, FileDown, Search, X, SlidersHorizontal
} from "lucide-react";
import { jsPDF } from "jspdf";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useHeadcountCost } from "@/hooks/useHeadcountCost";
import { PRODUCTION_CM_SHARE } from "@/lib/sewing-financials";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type RangeMode = "day" | "week" | "month";
type ActiveTab = "line" | "po";
type SortField = "name" | "output" | "value" | "cost" | "margin" | "marginPct";
type SortDir = "asc" | "desc";

interface LineRow {
  id: string;
  name: string;
  output: number;
  value: number;
  cost: number;
  margin: number;
  marginPct: number;
  outputShare: number;
  pos: { po: string; buyer: string; output: number }[];
}

interface PoRow {
  po: string;
  buyer: string;
  style: string;
  cmDz: number;
  prodCmDz: number;
  prodCmPc: number;
  output: number;
  value: number;
  cost: number;
  margin: number;
  marginPct: number;
  lines: { name: string; output: number }[];
}

// ─── Animated number counter ──────────────────────────────────────────────────

function AnimatedNumber({ value, formatter }: { value: number; formatter: (n: number) => string }) {
  const [displayed, setDisplayed] = useState(0);
  const prev = useRef(0);
  const raf = useRef<number>(0);

  useEffect(() => {
    const start = prev.current;
    const end = value;
    prev.current = value;
    if (start === end) return;
    const t0 = performance.now();
    const duration = 700;
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 4);
      setDisplayed(Math.round(start + (end - start) * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value]);

  return <>{formatter(displayed)}</>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtUsd(v: number) {
  return "$" + Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtUsdCompact(v: number) {
  const a = Math.abs(v);
  if (a >= 1_000_000) return "$" + (a / 1_000_000).toFixed(2) + "M";
  if (a >= 1_000) return "$" + (a / 1_000).toFixed(1) + "k";
  return "$" + a.toFixed(0);
}

function marginBorderColor(pct: number) {
  if (pct >= 25) return "border-l-emerald-500";
  if (pct >= 10) return "border-l-emerald-400/60";
  if (pct > 0)   return "border-l-emerald-300/30";
  if (pct < -10) return "border-l-rose-600";
  if (pct < 0)   return "border-l-rose-400/60";
  return "border-l-border/0";
}


// ─── Chart tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background/98 backdrop-blur-md border shadow-2xl rounded-xl p-3.5 text-xs min-w-[170px]">
      <p className="font-semibold text-sm mb-2.5 pb-2 border-b">{label}</p>
      {payload.map((e: any) => (
        <div key={e.name} className="flex items-center justify-between gap-6 py-1">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: e.color }} />
            <span className="text-muted-foreground">{e.name}</span>
          </div>
          <span className="font-mono font-semibold tabular-nums">{fmtUsd(e.value)}</span>
        </div>
      ))}
      {payload.length === 2 && (
        <div className="flex items-center justify-between gap-6 pt-2 mt-1 border-t">
          <span className="text-muted-foreground">Margin</span>
          <span className={cn("font-mono font-semibold tabular-nums", payload[0].value - payload[1].value >= 0 ? "text-emerald-600" : "text-rose-500")}>
            {payload[0].value - payload[1].value >= 0 ? "+" : "−"}{fmtUsd(payload[0].value - payload[1].value)}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Sort icon ────────────────────────────────────────────────────────────────

function SortIcon({ field, active, dir }: { field: string; active: string; dir: SortDir }) {
  if (active !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-20 inline-block" />;
  return dir === "desc"
    ? <ArrowDown className="h-3 w-3 ml-1 text-primary inline-block" />
    : <ArrowUp className="h-3 w-3 ml-1 text-primary inline-block" />;
}

// ─── Margin pill ──────────────────────────────────────────────────────────────

function MarginPill({ pct }: { pct: number }) {
  if (pct === 0) return <span className="text-muted-foreground/50">—</span>;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full tabular-nums",
      pct > 0
        ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400"
        : "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400"
    )}>
      {pct > 0 ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
      {Math.abs(pct)}%
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Finances() {
  const { profile, factory } = useAuth();
  const { headcountCost, isConfigured: costConfigured } = useHeadcountCost();

  const [rangeMode, setRangeMode] = useState<RangeMode>("week");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sewingData, setSewingData] = useState<any[]>([]);
  const [bdtToUsd, setBdtToUsd] = useState<number | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>("line");
  const [sortField, setSortField] = useState<SortField>("value");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"pdf" | "csv">("pdf");

  const [lineSearch, setLineSearch] = useState("");
  const [lineMarginFilter, setLineMarginFilter] = useState<"all" | "positive" | "negative">("all");
  const [poSearch, setPoSearch] = useState("");
  const [poMarginFilter, setPoMarginFilter] = useState<"all" | "positive" | "negative">("all");

  const tz = factory?.timezone || "Asia/Dhaka";
  const todayStr = getTodayInTimezone(tz);

  // Apply finance (purple) theme while on this page
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "finance");
    return () => { document.documentElement.removeAttribute("data-theme"); };
  }, []);

  // ── BDT rate ──────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    fetch("https://open.er-api.com/v6/latest/USD")
      .then(r => r.json())
      .then(j => { if (!cancelled && j?.rates?.BDT) setBdtToUsd(1 / j.rates.BDT); })
      .catch(() => { if (!cancelled) setBdtToUsd(1 / 121); });
    return () => { cancelled = true; };
  }, []);

  // ── Date range ────────────────────────────────────────────────────────────

  const { startDate, endDate, label } = useMemo(() => {
    const today = new Date(todayStr + "T00:00:00");
    if (rangeMode === "day") {
      const d = subDays(today, -offset);
      const ds = format(d, "yyyy-MM-dd");
      return { startDate: ds, endDate: ds, label: format(d, "EEE, MMM d yyyy") };
    }
    if (rangeMode === "week") {
      const base = startOfWeek(today, { weekStartsOn: 0 });
      const ws = new Date(base); ws.setDate(base.getDate() + offset * 7);
      const we = endOfWeek(ws, { weekStartsOn: 0 });
      return { startDate: format(ws, "yyyy-MM-dd"), endDate: format(we, "yyyy-MM-dd"), label: `${format(ws, "MMM d")} – ${format(we, "MMM d, yyyy")}` };
    }
    const base = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    return { startDate: format(startOfMonth(base), "yyyy-MM-dd"), endDate: format(endOfMonth(base), "yyyy-MM-dd"), label: format(base, "MMMM yyyy") };
  }, [rangeMode, offset, todayStr]);

  const isAtPresent = useMemo(() => {
    if (rangeMode === "day") return startDate >= todayStr;
    if (rangeMode === "week") return startDate >= format(startOfWeek(new Date(todayStr + "T00:00:00"), { weekStartsOn: 0 }), "yyyy-MM-dd");
    return startDate >= format(startOfMonth(new Date(todayStr + "T00:00:00")), "yyyy-MM-dd");
  }, [rangeMode, startDate, todayStr]);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!profile?.factory_id) return;
    setLoading(true); setSelectedId(null);
    supabase
      .from("sewing_actuals")
      .select("good_today, manpower_actual, hours_actual, ot_manpower_actual, ot_hours_actual, production_date, work_orders(po_number, buyer, style, cm_per_dozen), lines(name, line_id)")
      .eq("factory_id", profile.factory_id)
      .gte("production_date", startDate)
      .lte("production_date", endDate)
      .then(({ data }) => { setSewingData(data || []); setLoading(false); });
  }, [profile?.factory_id, startDate, endDate]);

  // ── Compute ───────────────────────────────────────────────────────────────

  const { lineRows, poRows, summary } = useMemo(() => {
    const rate = headcountCost.value ?? 0;
    const isBdt = headcountCost.currency === "BDT";
    const fx = bdtToUsd ?? (1 / 121);

    const lineMap = new Map<string, { id: string; name: string; output: number; value: number; rawCost: number; posMap: Map<string, { po: string; buyer: string; output: number }> }>();
    const poMap = new Map<string, { po: string; buyer: string; style: string; cmDz: number; output: number; value: number; rawCost: number; linesMap: Map<string, { name: string; output: number }> }>();
    let totalOutput = 0;

    sewingData.forEach((s: any) => {
      const lineId = s.lines?.line_id || s.lines?.name || "__u";
      const lineName = s.lines?.name || "Unassigned";
      const po = s.work_orders?.po_number || null;
      const buyer = s.work_orders?.buyer || "";
      const cmDz = s.work_orders?.cm_per_dozen || 0;
      const output = s.good_today || 0;
      const rawCost = rate > 0 ? rate * ((s.manpower_actual || 0) * (s.hours_actual || 0) + (s.ot_manpower_actual || 0) * (s.ot_hours_actual || 0)) : 0;
      const val = cmDz > 0 && output > 0 ? (cmDz * PRODUCTION_CM_SHARE / 12) * output : 0;
      totalOutput += output;

      if (!lineMap.has(lineId)) lineMap.set(lineId, { id: lineId, name: lineName, output: 0, value: 0, rawCost: 0, posMap: new Map() });
      const lr = lineMap.get(lineId)!;
      lr.output += output; lr.value += val; lr.rawCost += rawCost;
      if (po) { const e = lr.posMap.get(po); if (e) e.output += output; else lr.posMap.set(po, { po, buyer, output }); }

      if (po) {
        if (!poMap.has(po)) poMap.set(po, { po, buyer, style: s.work_orders?.style || "", cmDz, output: 0, value: 0, rawCost: 0, linesMap: new Map() });
        const pr = poMap.get(po)!;
        pr.output += output; pr.value += val; pr.rawCost += rawCost;
        const el = pr.linesMap.get(lineId); if (el) el.output += output; else pr.linesMap.set(lineId, { name: lineName, output });
      }
    });

    const toUsd = (r: number) => isBdt ? r * fx : r;
    const mp = (v: number, c: number) => v === 0 ? 0 : Math.round(((v - c) / v) * 100);

    const lineRows: LineRow[] = Array.from(lineMap.values()).map(r => {
      const cost = toUsd(r.rawCost); const margin = r.value - cost;
      return { id: r.id, name: r.name, output: r.output, value: r.value, cost, margin, marginPct: mp(r.value, cost), outputShare: totalOutput > 0 ? Math.round(r.output / totalOutput * 100) : 0, pos: Array.from(r.posMap.values()).sort((a, b) => b.output - a.output) };
    });
    const poRows: PoRow[] = Array.from(poMap.values()).map(r => {
      const cost = toUsd(r.rawCost); const margin = r.value - cost; const pdz = r.cmDz * PRODUCTION_CM_SHARE;
      return { po: r.po, buyer: r.buyer, style: r.style, cmDz: r.cmDz, prodCmDz: pdz, prodCmPc: pdz / 12, output: r.output, value: r.value, cost, margin, marginPct: mp(r.value, cost), lines: Array.from(r.linesMap.values()).sort((a, b) => b.output - a.output) };
    });

    const totalValue = lineRows.reduce((s, r) => s + r.value, 0);
    const totalCost = lineRows.reduce((s, r) => s + r.cost, 0);
    const totalMargin = totalValue - totalCost;
    const totalMarginPct = totalValue > 0 ? Math.round(totalMargin / totalValue * 100) : 0;
    const linesWithValue = lineRows.filter(r => r.value > 0);
    const bestLine = linesWithValue.length > 0 ? linesWithValue.reduce((b, r) => r.marginPct > b.marginPct ? r : b, linesWithValue[0]) : null;
    const worstLine = linesWithValue.length > 1 ? linesWithValue.reduce((w, r) => r.marginPct < w.marginPct ? r : w, linesWithValue[0]) : null;

    return { lineRows, poRows, summary: { totalValue, totalCost, totalMargin, totalMarginPct, hasData: lineRows.some(r => r.output > 0), totalOutput, bestLine, worstLine } };
  }, [sewingData, headcountCost.value, headcountCost.currency, bdtToUsd]);

  // ── Sort ──────────────────────────────────────────────────────────────────

  function toggleSort(f: SortField) {
    if (sortField === f) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortField(f); setSortDir("desc"); }
    setSelectedId(null);
  }

  const sortedLineRows = useMemo(() => [...lineRows].sort((a, b) => {
    const m = sortDir === "desc" ? -1 : 1;
    return sortField === "name" ? m * a.name.localeCompare(b.name) : m * ((a as any)[sortField] - (b as any)[sortField]);
  }), [lineRows, sortField, sortDir]);

  const sortedPoRows = useMemo(() => [...poRows].sort((a, b) => {
    const m = sortDir === "desc" ? -1 : 1;
    return sortField === "name" ? m * a.po.localeCompare(b.po) : m * ((a as any)[sortField] - (b as any)[sortField]);
  }), [poRows, sortField, sortDir]);

  // ── Filtered rows ─────────────────────────────────────────────────────────

  const filteredLineRows = useMemo(() => sortedLineRows.filter(r => {
    const q = lineSearch.trim().toLowerCase();
    if (q && !r.name.toLowerCase().includes(q)) return false;
    if (lineMarginFilter === "positive" && r.margin <= 0) return false;
    if (lineMarginFilter === "negative" && r.margin >= 0) return false;
    return true;
  }), [sortedLineRows, lineSearch, lineMarginFilter]);

  const filteredPoRows = useMemo(() => sortedPoRows.filter(r => {
    const q = poSearch.trim().toLowerCase();
    if (q && !r.po.toLowerCase().includes(q) && !r.buyer.toLowerCase().includes(q) && !r.style.toLowerCase().includes(q)) return false;
    if (poMarginFilter === "positive" && r.margin <= 0) return false;
    if (poMarginFilter === "negative" && r.margin >= 0) return false;
    return true;
  }), [sortedPoRows, poSearch, poMarginFilter]);

  // ── Chart data ────────────────────────────────────────────────────────────

  const chartData = useMemo(() => {
    const src = activeTab === "line"
      ? sortedLineRows.filter(r => r.output > 0).slice(0, 10).map(r => ({ name: r.name, "Output Value": Math.round(r.value), "Op. Cost": Math.round(r.cost), _margin: r.marginPct }))
      : sortedPoRows.filter(r => r.output > 0).slice(0, 10).map(r => ({ name: r.po, "Output Value": Math.round(r.value), "Op. Cost": Math.round(r.cost), _margin: r.marginPct }));
    return src.sort((a, b) => b["Output Value"] - a["Output Value"]);
  }, [activeTab, sortedLineRows, sortedPoRows]);

  const isBDT = headcountCost.currency === "BDT";

  // ── PDF Report ────────────────────────────────────────────────────────────

  function handleExportPdf() {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const m = 12;
    const cw = pw - m * 2;
    const factoryName = factory?.name || "—";

    const fmtUsd = (v: number) => `$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const sign = (v: number) => v >= 0 ? "+" : "-";

    let y = m;

    // ── Header ──
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Financial Operations Report", m, y + 6);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`${factoryName}  |  ${label}  |  Production CM = 70% of entered CM/dozen`, m, y + 13);
    doc.text(`Generated: ${format(new Date(), "PPpp")}`, pw - m, y + 13, { align: "right" });
    doc.setTextColor(0);
    y += 20;

    // ── Divider ──
    doc.setDrawColor(220);
    doc.line(m, y, pw - m, y);
    y += 6;

    // ── Summary boxes ──
    const boxes = [
      { label: "Output Value", value: fmtUsd(summary.totalValue) },
      { label: "Operating Cost", value: fmtUsd(summary.totalCost) },
      { label: "Operating Margin", value: `${sign(summary.totalMargin)}${fmtUsd(summary.totalMargin)}` },
      { label: "Margin %", value: `${summary.totalMarginPct}%` },
      { label: "Total Output", value: `${summary.totalOutput.toLocaleString()} pcs` },
    ];
    const bw = cw / boxes.length;
    boxes.forEach((b, i) => {
      const bx = m + i * bw;
      doc.setFillColor(247, 247, 252);
      doc.roundedRect(bx, y, bw - 2, 18, 2, 2, "F");
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120);
      doc.text(b.label.toUpperCase(), bx + (bw - 2) / 2, y + 6, { align: "center" });
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0);
      doc.text(b.value, bx + (bw - 2) / 2, y + 14, { align: "center" });
    });
    y += 24;

    // ── Helper: draw a table ──
    const drawTable = (
      title: string,
      headers: string[],
      rowData: (string | number)[][],
      colWidths: number[],
      aligns: ("left" | "right" | "center")[],
    ) => {
      if (y + 30 > ph - m) { doc.addPage(); y = m; }

      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0);
      doc.text(title, m, y + 4);
      y += 8;

      // Header row
      const headerH = 7;
      doc.setFillColor(237, 233, 254); // violet-100
      doc.rect(m, y, cw, headerH, "F");
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(80);
      let cx = m + 1;
      headers.forEach((h, i) => {
        const tw = colWidths[i];
        if (aligns[i] === "right") doc.text(h, cx + tw - 2, y + 5, { align: "right" });
        else doc.text(h, cx + 1, y + 5);
        cx += tw;
      });
      y += headerH;

      // Data rows
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30);
      rowData.forEach((row, ri) => {
        if (y + 6 > ph - m) { doc.addPage(); y = m; }
        const rowH = 6;
        if (ri % 2 === 1) { doc.setFillColor(250, 249, 255); doc.rect(m, y, cw, rowH, "F"); }
        doc.setFontSize(7.5);
        cx = m + 1;
        row.forEach((cell, i) => {
          const tw = colWidths[i];
          const txt = String(cell);
          if (aligns[i] === "right") doc.text(txt, cx + tw - 2, y + 4.5, { align: "right" });
          else doc.text(txt, cx + 1, y + 4.5);
          cx += tw;
        });
        y += rowH;
      });

      // Total row
      if (y + 7 > ph - m) { doc.addPage(); y = m; }
      doc.setFillColor(235, 230, 255);
      doc.rect(m, y, cw, 7, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(40);
      cx = m + 1;
      const totals = rowData.reduce<(number | null)[]>((acc, row) => {
        row.forEach((cell, i) => {
          if (typeof cell === "number") acc[i] = (acc[i] as number || 0) + cell;
          else if (acc[i] === undefined) acc[i] = null;
        });
        return acc;
      }, []);
      headers.forEach((_, i) => {
        const tw = colWidths[i];
        if (i === 0) { doc.text("TOTAL", cx + 1, y + 5); }
        else if (typeof totals[i] === "number") {
          const v = totals[i] as number;
          const txt = i <= 1 ? v.toLocaleString() : (aligns[i] === "right" ? `${sign(v)}${fmtUsd(v)}` : `${v.toFixed(0)}`);
          if (aligns[i] === "right") doc.text(txt, cx + tw - 2, y + 5, { align: "right" });
          else doc.text(txt, cx + 1, y + 5);
        }
        cx += tw;
      });
      y += 7 + 5;
    };

    // ── By Line table ──
    drawTable(
      "BY SEWING LINE",
      ["Line", "Output (pcs)", "Output Value", "Operating Cost", "Margin", "Margin %", "Share"],
      sortedLineRows.map(r => [r.name, r.output, `${sign(r.value)}${fmtUsd(r.value)}`, fmtUsd(r.cost), `${sign(r.margin)}${fmtUsd(r.margin)}`, `${r.marginPct}%`, `${r.outputShare}%`]),
      [50, 28, 40, 40, 40, 24, 20],
      ["left", "right", "right", "right", "right", "right", "right"],
    );

    // ── By Work Order table ──
    drawTable(
      "BY WORK ORDER (PO)",
      ["PO Number", "Buyer", "Style", "Output (pcs)", "CM/Dozen", "Prod CM/pc", "Output Value", "Oper. Cost", "Margin", "Margin %"],
      sortedPoRows.map(r => [r.po, r.buyer, r.style, r.output, `$${r.cmDz.toFixed(2)}`, `$${r.prodCmPc.toFixed(4)}`, `${sign(r.value)}${fmtUsd(r.value)}`, fmtUsd(r.cost), `${sign(r.margin)}${fmtUsd(r.margin)}`, `${r.marginPct}%`]),
      [30, 30, 28, 24, 22, 24, 32, 30, 32, 20],
      ["left", "left", "left", "right", "right", "right", "right", "right", "right", "right"],
    );

    // ── Daily detail by line ──
    if (rangeMode !== "day") {
      const rate = headcountCost.value ?? 0;
      const isBdt = headcountCost.currency === "BDT";
      const fx = bdtToUsd ?? (1 / 121);
      const toUsd = (r: number) => isBdt ? r * fx : r;

      // Build map: date → lineId → { name, output, value, rawCost }
      const dayMap = new Map<string, Map<string, { name: string; output: number; value: number; rawCost: number }>>();
      (sewingData as any[]).forEach(s => {
        const date: string = s.production_date;
        const lineId: string = s.lines?.line_id || s.lines?.name || "__u";
        const lineName: string = s.lines?.name || "Unassigned";
        const cmDz: number = s.work_orders?.cm_per_dozen || 0;
        const output: number = s.good_today || 0;
        const rawCost: number = rate > 0 ? rate * ((s.manpower_actual || 0) * (s.hours_actual || 0) + (s.ot_manpower_actual || 0) * (s.ot_hours_actual || 0)) : 0;
        const val: number = cmDz > 0 && output > 0 ? (cmDz * PRODUCTION_CM_SHARE / 12) * output : 0;
        if (!dayMap.has(date)) dayMap.set(date, new Map());
        const lm = dayMap.get(date)!;
        if (!lm.has(lineId)) lm.set(lineId, { name: lineName, output: 0, value: 0, rawCost: 0 });
        const lr = lm.get(lineId)!;
        lr.output += output; lr.value += val; lr.rawCost += rawCost;
      });

      const sortedDates = Array.from(dayMap.keys()).sort();

      if (sortedDates.length > 0) {
        // Section header
        if (y + 20 > ph - m) { doc.addPage(); y = m; }
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0);
        doc.text("DAILY DETAIL — BY LINE", m, y + 4);
        y += 10;

        const dCols = [50, 26, 38, 38, 38, 22];
        const dAligns: ("left" | "right")[] = ["left", "right", "right", "right", "right", "right"];
        const dHeaders = ["Line", "Output (pcs)", "Output Value", "Oper. Cost", "Margin", "Margin %"];

        sortedDates.forEach(date => {
          const lm = dayMap.get(date)!;
          const lines = Array.from(lm.values()).sort((a, b) => b.output - a.output);
          const dayOut = lines.reduce((s, l) => s + l.output, 0);
          const dayVal = lines.reduce((s, l) => s + l.value, 0);
          const dayCost = toUsd(lines.reduce((s, l) => s + l.rawCost, 0));
          const dayMargin = dayVal - dayCost;
          const dayMpct = dayVal > 0 ? Math.round((dayMargin / dayVal) * 100) : 0;

          // Date sub-header
          if (y + 14 > ph - m) { doc.addPage(); y = m; }
          const displayDate = new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
          doc.setFillColor(237, 233, 254);
          doc.rect(m, y, cw, 6, "F");
          doc.setFontSize(7.5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(60, 40, 120);
          doc.text(displayDate, m + 2, y + 4.5);
          doc.setTextColor(60, 40, 120);
          doc.text(`Total: ${dayOut.toLocaleString()} pcs  |  ${sign(dayVal)}${fmtUsd(dayVal)}  |  Cost: ${fmtUsd(dayCost)}  |  Margin: ${sign(dayMargin)}${fmtUsd(dayMargin)} (${dayMpct}%)`, pw - m - 2, y + 4.5, { align: "right" });
          y += 6;

          // Column header
          if (y + 6 > ph - m) { doc.addPage(); y = m; }
          doc.setFillColor(248, 246, 255);
          doc.rect(m, y, cw, 5, "F");
          doc.setFontSize(6);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(120);
          let cx = m + 1;
          dHeaders.forEach((h, i) => {
            if (dAligns[i] === "right") doc.text(h, cx + dCols[i] - 2, y + 3.5, { align: "right" });
            else doc.text(h, cx + 1, y + 3.5);
            cx += dCols[i];
          });
          y += 5;

          // Line rows
          doc.setFont("helvetica", "normal");
          doc.setTextColor(30);
          lines.forEach((l, ri) => {
            if (y + 5 > ph - m) { doc.addPage(); y = m; }
            const cost = toUsd(l.rawCost);
            const margin = l.value - cost;
            const mpct = l.value > 0 ? Math.round((margin / l.value) * 100) : 0;
            if (ri % 2 === 1) { doc.setFillColor(252, 251, 255); doc.rect(m, y, cw, 5, "F"); }
            doc.setFontSize(7);
            cx = m + 1;
            const cells = [l.name, l.output.toLocaleString(), `${sign(l.value)}${fmtUsd(l.value)}`, fmtUsd(cost), `${sign(margin)}${fmtUsd(margin)}`, `${mpct}%`];
            cells.forEach((cell, i) => {
              if (dAligns[i] === "right") doc.text(cell, cx + dCols[i] - 2, y + 3.5, { align: "right" });
              else doc.text(cell, cx + 1, y + 3.5);
              cx += dCols[i];
            });
            y += 5;
          });
          y += 3;
        });
      }
    }

    // ── Footer ──
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(160);
    doc.text("Production Portal  •  Sewing dept only  •  Figures in USD", pw / 2, ph - 5, { align: "center" });

    doc.save(`financials-${label.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.pdf`);
  }

  // ── CSV Export ────────────────────────────────────────────────────────────

  function handleExportCsv() {
    const factoryName = factory?.name || "—";
    const fmtN = (v: number, dp = 2) => v.toFixed(dp);
    const sign = (v: number) => v >= 0 ? "+" : "-";
    const q = (s: string | number) => {
      const str = String(s);
      return str.includes(",") || str.includes('"') || str.includes("\n")
        ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const row = (...cells: (string | number)[]) => cells.map(q).join(",");
    const blank = () => "";
    const lines: string[] = [];

    // ── Header block ──
    lines.push(row("FINANCIAL OPERATIONS REPORT"));
    lines.push(row("Factory", factoryName));
    lines.push(row("Period", label));
    lines.push(row("Generated", format(new Date(), "PPpp")));
    lines.push(row("Note", "Production CM = 70% of entered CM/dozen (sewing dept only). All figures in USD."));
    lines.push(blank());

    // ── Summary ──
    lines.push(row("SUMMARY"));
    lines.push(row("Output Value ($)", "Operating Cost ($)", "Operating Margin ($)", "Margin %", "Total Output (pcs)"));
    lines.push(row(
      fmtN(summary.totalValue),
      fmtN(summary.totalCost),
      `${sign(summary.totalMargin)}${fmtN(Math.abs(summary.totalMargin))}`,
      `${summary.totalMarginPct}%`,
      summary.totalOutput,
    ));
    lines.push(blank());

    // ── By Sewing Line ──
    lines.push(row("BY SEWING LINE"));
    lines.push(row("Line", "Output (pcs)", "Output Value ($)", "Operating Cost ($)", "Margin ($)", "Margin %", "Output Share %"));
    sortedLineRows.forEach(r => {
      lines.push(row(
        r.name,
        r.output,
        fmtN(r.value),
        fmtN(r.cost),
        `${sign(r.margin)}${fmtN(Math.abs(r.margin))}`,
        `${r.marginPct}%`,
        `${r.outputShare}%`,
      ));
    });
    lines.push(row(
      "TOTAL",
      summary.totalOutput,
      fmtN(summary.totalValue),
      fmtN(summary.totalCost),
      `${sign(summary.totalMargin)}${fmtN(Math.abs(summary.totalMargin))}`,
      `${summary.totalMarginPct}%`,
      "100%",
    ));
    lines.push(blank());

    // ── By Work Order ──
    lines.push(row("BY WORK ORDER (PO)"));
    lines.push(row("PO Number", "Buyer", "Style", "Output (pcs)", "CM/Dozen ($)", "Prod CM/Dozen ($)", "Prod CM/pc ($)", "Output Value ($)", "Oper. Cost ($)", "Margin ($)", "Margin %"));
    sortedPoRows.forEach(r => {
      lines.push(row(
        r.po,
        r.buyer,
        r.style,
        r.output,
        fmtN(r.cmDz),
        fmtN(r.prodCmDz),
        fmtN(r.prodCmPc, 4),
        fmtN(r.value),
        fmtN(r.cost),
        `${sign(r.margin)}${fmtN(Math.abs(r.margin))}`,
        `${r.marginPct}%`,
      ));
    });
    lines.push(row(
      "TOTAL", "", "",
      summary.totalOutput,
      "", "", "",
      fmtN(summary.totalValue),
      fmtN(summary.totalCost),
      `${sign(summary.totalMargin)}${fmtN(Math.abs(summary.totalMargin))}`,
      `${summary.totalMarginPct}%`,
    ));
    lines.push(blank());

    // ── Daily Detail (week / month only) ──
    if (rangeMode !== "day") {
      const rate = headcountCost.value ?? 0;
      const isBdt = headcountCost.currency === "BDT";
      const fx = bdtToUsd ?? (1 / 121);
      const toUsd = (r: number) => isBdt ? r * fx : r;

      const dayMap = new Map<string, Map<string, { name: string; output: number; value: number; rawCost: number }>>();
      (sewingData as any[]).forEach(s => {
        const date: string = s.production_date;
        const lineId: string = s.lines?.line_id || s.lines?.name || "__u";
        const lineName: string = s.lines?.name || "Unassigned";
        const cmDz: number = s.work_orders?.cm_per_dozen || 0;
        const output: number = s.good_today || 0;
        const rawCost: number = rate > 0 ? rate * ((s.manpower_actual || 0) * (s.hours_actual || 0) + (s.ot_manpower_actual || 0) * (s.ot_hours_actual || 0)) : 0;
        const val: number = cmDz > 0 && output > 0 ? (cmDz * PRODUCTION_CM_SHARE / 12) * output : 0;
        if (!dayMap.has(date)) dayMap.set(date, new Map());
        const lm = dayMap.get(date)!;
        if (!lm.has(lineId)) lm.set(lineId, { name: lineName, output: 0, value: 0, rawCost: 0 });
        const lr = lm.get(lineId)!;
        lr.output += output; lr.value += val; lr.rawCost += rawCost;
      });

      const sortedDates = Array.from(dayMap.keys()).sort();
      if (sortedDates.length > 0) {
        lines.push(row("DAILY DETAIL — BY LINE"));
        lines.push(row("Date", "Line", "Output (pcs)", "Output Value ($)", "Oper. Cost ($)", "Margin ($)", "Margin %"));

        sortedDates.forEach(date => {
          const lm = dayMap.get(date)!;
          const dayLines = Array.from(lm.values()).sort((a, b) => b.output - a.output);
          const displayDate = new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
          const dayOut = dayLines.reduce((s, l) => s + l.output, 0);
          const dayVal = dayLines.reduce((s, l) => s + l.value, 0);
          const dayCost = toUsd(dayLines.reduce((s, l) => s + l.rawCost, 0));
          const dayMargin = dayVal - dayCost;
          const dayMpct = dayVal > 0 ? Math.round((dayMargin / dayVal) * 100) : 0;

          dayLines.forEach(l => {
            const cost = toUsd(l.rawCost);
            const margin = l.value - cost;
            const mpct = l.value > 0 ? Math.round((margin / l.value) * 100) : 0;
            lines.push(row(
              displayDate,
              l.name,
              l.output,
              fmtN(l.value),
              fmtN(cost),
              `${sign(margin)}${fmtN(Math.abs(margin))}`,
              `${mpct}%`,
            ));
          });

          // Day subtotal
          lines.push(row(
            `${displayDate} — DAY TOTAL`,
            "",
            dayOut,
            fmtN(dayVal),
            fmtN(dayCost),
            `${sign(dayMargin)}${fmtN(Math.abs(dayMargin))}`,
            `${dayMpct}%`,
          ));
          lines.push(blank());
        });
      }
    }

    // ── Footer ──
    lines.push(row("Production Portal  •  Sewing dept only  •  Figures in USD"));

    const csv = lines.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `financials-${label.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="py-5 lg:py-8 space-y-7 max-w-[1200px]">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl bg-violet-100 dark:bg-violet-950/50 flex items-center justify-center shrink-0 shadow-sm">
            <DollarSign className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <div className="flex items-baseline gap-3">
              <h1 className="text-2xl font-bold tracking-tight">
                Financial Operations
              </h1>
              {isBDT && bdtToUsd && (
                <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {(1 / bdtToUsd).toFixed(1)} BDT/USD
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground/70 mt-0.5 tracking-wide">
              Sewing dept · Production CM = 70% of entered CM · All figures in USD
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* PDF Report button */}
          <Button variant="outline" size="sm" onClick={() => setExportDialogOpen(true)} className="h-8 gap-1.5 text-xs border-violet-200 text-violet-700 hover:bg-violet-50 hover:text-violet-800 dark:border-violet-800 dark:text-violet-400 dark:hover:bg-violet-950/40">
            <FileDown className="h-3.5 w-3.5" />
            PDF Report
          </Button>
          {/* Period selector */}
          <div className="flex rounded-lg border overflow-hidden text-[11px] font-medium">
            {(["day", "week", "month"] as RangeMode[]).map(m => (
              <button key={m} onClick={() => { setRangeMode(m); setOffset(0); setSelectedId(null); }}
                className={cn("px-3 py-1.5 capitalize transition-all",
                  rangeMode === m ? "bg-violet-600 text-white" : "bg-background hover:bg-muted text-muted-foreground"
                )}>{m}</button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7 rounded-lg" onClick={() => { setOffset(o => o - 1); setSelectedId(null); }}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs font-medium min-w-[152px] text-center">{label}</span>
            <Button variant="outline" size="icon" className="h-7 w-7 rounded-lg" onClick={() => { setOffset(o => o + 1); setSelectedId(null); }} disabled={isAtPresent}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Executive summary strip ──────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {(loading || summary.hasData) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="relative rounded-2xl border shadow-sm overflow-hidden"
          >
            {/* Purple gradient accent strip at the top */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 to-purple-600" />

            {/* Subtle grid texture */}
            <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.04]" style={{
              backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
              backgroundSize: "32px 32px"
            }} />

            <div className="relative grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0">

              {/* Output Value */}
              <div className="p-6 pt-7 space-y-1 bg-emerald-50/40 dark:bg-emerald-950/10">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-6 w-6 rounded-md bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60">Output Value</p>
                </div>
                <p className={cn("text-3xl lg:text-4xl font-bold tabular-nums leading-none mt-2", loading ? "opacity-0" : "opacity-100 transition-opacity")}>
                  {loading ? "—" : <AnimatedNumber value={summary.totalValue} formatter={fmtUsdCompact} />}
                </p>
                <p className="text-[11px] text-muted-foreground/60 pt-1">
                  {loading ? <span className="inline-block h-3 w-20 bg-muted rounded animate-pulse" /> : `${summary.totalOutput.toLocaleString()} pcs produced`}
                </p>
              </div>

              {/* Operating Cost */}
              <div className="p-6 pt-7 space-y-1">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-6 w-6 rounded-md bg-muted flex items-center justify-center">
                    <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60">Operating Cost</p>
                </div>
                <p className="text-3xl lg:text-4xl font-bold tabular-nums leading-none mt-2">
                  {loading ? <span className="inline-block h-9 w-28 bg-muted rounded-lg animate-pulse" /> : <AnimatedNumber value={summary.totalCost} formatter={fmtUsdCompact} />}
                </p>
                <p className="text-[11px] text-muted-foreground/60 pt-1">
                  {loading ? <span className="inline-block h-3 w-24 bg-muted rounded animate-pulse" /> : (costConfigured ? "Sewing manpower" : <span className="text-amber-500 font-medium">Cost not configured</span>)}
                </p>
              </div>

              {/* Operating Margin */}
              <div className={cn("p-6 pt-7 space-y-1 transition-colors duration-500",
                !loading && summary.hasData && summary.totalMargin > 0 ? "bg-emerald-50/60 dark:bg-emerald-950/20" :
                !loading && summary.hasData && summary.totalMargin < 0 ? "bg-rose-50/60 dark:bg-rose-950/20" : ""
              )}>
                <div className="flex items-center gap-2 mb-1">
                  <div className={cn("h-6 w-6 rounded-md flex items-center justify-center",
                    !loading && summary.totalMargin > 0 ? "bg-emerald-100 dark:bg-emerald-900/50" :
                    !loading && summary.totalMargin < 0 ? "bg-rose-100 dark:bg-rose-900/50" : "bg-muted"
                  )}>
                    {!loading && summary.totalMargin >= 0
                      ? <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      : <TrendingDown className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                    }
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60">Operating Margin</p>
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <p className={cn("text-3xl lg:text-4xl font-bold tabular-nums leading-none", !loading && (summary.totalMargin >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"))}>
                    {loading ? <span className="inline-block h-9 w-28 bg-muted rounded-lg animate-pulse" /> : (
                      <>{summary.totalMargin >= 0 ? "+" : "−"}<AnimatedNumber value={Math.abs(summary.totalMargin)} formatter={fmtUsdCompact} /></>
                    )}
                  </p>
                  {!loading && summary.totalMarginPct !== 0 && (
                    <span className={cn("text-base font-bold tabular-nums", summary.totalMarginPct >= 0 ? "text-emerald-500" : "text-rose-500")}>
                      {summary.totalMarginPct}%
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground/60 flex items-center gap-1 pt-1">
                  {!loading && (summary.totalMargin >= 0
                    ? <><TrendingUp className="h-3 w-3 text-emerald-500" /> Positive operational result</>
                    : <><TrendingDown className="h-3 w-3 text-rose-500" /> Negative operational result</>
                  )}
                </p>
              </div>

              {/* Performance signals */}
              <div className="p-6 pt-7 space-y-4 bg-amber-50/30 dark:bg-amber-950/10">
                {loading ? (
                  <div className="space-y-3">
                    <div className="h-3 w-16 bg-muted rounded animate-pulse" />
                    <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                    <div className="h-3 w-16 bg-muted rounded animate-pulse mt-4" />
                    <div className="h-4 w-28 bg-muted rounded animate-pulse" />
                  </div>
                ) : (
                  <>
                    {summary.bestLine && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60 mb-2">Top Line</p>
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center shrink-0">
                            <Trophy className="h-3 w-3 text-amber-500" />
                          </div>
                          <span className="text-sm font-semibold truncate">{summary.bestLine.name}</span>
                          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 shrink-0 ml-auto">
                            +{summary.bestLine.marginPct}%
                          </span>
                        </div>
                      </div>
                    )}
                    {summary.worstLine && summary.worstLine.id !== summary.bestLine?.id && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60 mb-2">Needs Attention</p>
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                            <AlertCircle className="h-3 w-3 text-muted-foreground" />
                          </div>
                          <span className="text-sm font-medium truncate text-muted-foreground">{summary.worstLine.name}</span>
                          <span className={cn("text-xs font-bold shrink-0 ml-auto", summary.worstLine.marginPct < 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>
                            {summary.worstLine.marginPct}%
                          </span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      {!loading && !summary.hasData && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-24 text-center">
          <div className="h-14 w-14 rounded-2xl border-2 border-dashed flex items-center justify-center mb-4">
            <DollarSign className="h-6 w-6 text-muted-foreground/30" />
          </div>
          <p className="text-sm font-semibold text-muted-foreground">No data for this period</p>
          <p className="text-xs text-muted-foreground/60 mt-1.5 max-w-xs">Sewing submissions with CM values on work orders will appear here.</p>
        </motion.div>
      )}

      {summary.hasData && !loading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="space-y-7">

          {/* ── Tab navigation ─────────────────────────────────────────── */}
          <div className="flex items-end justify-between border-b">
            <div className="flex gap-1">
              {([["line", "By Line"], ["po", "By Work Order"]] as [ActiveTab, string][]).map(([tab, lbl]) => (
                <button key={tab}
                  onClick={() => { setActiveTab(tab); setSelectedId(null); setSortField("value"); setSortDir("desc"); }}
                  className={cn(
                    "px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px mr-1 rounded-t-sm",
                    activeTab === tab
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  )}
                  
                >{lbl}</button>
              ))}
            </div>
            <button onClick={() => setMethodologyOpen(o => !o)}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors pb-2.5">
              <Info className="h-3 w-3" /><span>Methodology</span>
            </button>
          </div>

          {/* Methodology panel */}
          <AnimatePresence>
            {methodologyOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden -mt-5">
                <div className="rounded-xl border border-dashed bg-muted/20 p-5 text-xs space-y-2 text-muted-foreground">
                  <p className="font-semibold text-foreground text-sm flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> How output value is calculated</p>
                  <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1.5 mt-2">
                    <p><span className="text-foreground font-medium">Production CM/dz</span> = CM entered × 70%</p>
                    <p><span className="text-foreground font-medium">Production CM/pc</span> = Production CM/dz ÷ 12</p>
                    <p><span className="text-foreground font-medium">Output Value</span> = Output (pcs) × Production CM/pc</p>
                    <p><span className="text-foreground font-medium">Operating Cost</span> = Rate × Σ (manpower × hours)</p>
                  </div>
                  <p className="text-muted-foreground/60 text-[11px] pt-1">The 30% excluded from CM covers commercial costs (LC, transport, agent fees) outside this operational view.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Chart ─────────────────────────────────────────────────── */}
          {chartData.length > 0 && (
            <div className="relative rounded-2xl border shadow-sm overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500 opacity-60" />
              <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60">
                  {activeTab === "line" ? "Line" : "Work Order"} Performance Ranking
                </p>
                <div className="flex items-center gap-4">
                  {[["#10b981", "Output Value"], ["#f43f5e", "Op. Cost"]].map(([color, label]) => (
                    <div key={label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <div className="h-2.5 w-3.5 rounded-sm" style={{ background: color }} />
                      {label}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ height: Math.max(chartData.length * 52 + 20, 130) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 48, bottom: 0, left: 4 }} barGap={3} barCategoryGap="32%">
                    <defs>
                      <linearGradient id="gradValue" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#34d399" stopOpacity={0.7} />
                      </linearGradient>
                      <linearGradient id="gradCost" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.85} />
                        <stop offset="100%" stopColor="#fb7185" stopOpacity={0.65} />
                      </linearGradient>
                    </defs>
                    <XAxis type="number" tickFormatter={fmtUsdCompact} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "inherit" }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} axisLine={false} tickLine={false} width={activeTab === "line" ? 68 : 92} />
                    <RechartsTooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
                    <Bar dataKey="Output Value" fill="url(#gradValue)" radius={[0, 4, 4, 0]} maxBarSize={15} />
                    <Bar dataKey="Op. Cost" fill="url(#gradCost)" radius={[0, 4, 4, 0]} maxBarSize={15} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              </div>
            </div>
          )}

          {/* ── By Line table ──────────────────────────────────────────── */}
          {activeTab === "line" && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
              {/* Search + filter bar */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 pointer-events-none" />
                  <input
                    value={lineSearch}
                    onChange={e => setLineSearch(e.target.value)}
                    placeholder="Search lines…"
                    className="w-full pl-8 pr-8 py-2 text-xs rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-violet-400 placeholder:text-muted-foreground/40"
                  />
                  {lineSearch && (
                    <button onClick={() => setLineSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                  {(["all", "positive", "negative"] as const).map(f => (
                    <button key={f} onClick={() => setLineMarginFilter(f)}
                      className={cn("px-2.5 py-1.5 text-[11px] font-medium rounded-lg capitalize transition-all",
                        lineMarginFilter === f
                          ? f === "positive" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                            : f === "negative" ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400"
                            : "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-400"
                          : "text-muted-foreground hover:bg-muted"
                      )}>
                      {f === "all" ? "All" : f === "positive" ? "▲ Profitable" : "▼ Unprofitable"}
                    </button>
                  ))}
                </div>
                {(lineSearch || lineMarginFilter !== "all") && (
                  <span className="text-[11px] text-muted-foreground/60">{filteredLineRows.length} of {sortedLineRows.length}</span>
                )}
              </div>
              <div className="relative rounded-2xl border shadow-sm overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-violet-400 to-purple-500 opacity-50" />
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-violet-50/40 dark:bg-violet-950/10">
                        {[
                          ["name", "Line", "text-left"],
                          ["output", "Output", "text-right"],
                          ["value", "Output Value", "text-right"],
                          ["cost", "Op. Cost", "text-right"],
                          ["margin", "Margin", "text-right"],
                          ["marginPct", "%", "text-center"],
                        ].map(([field, label, align]) => (
                          <th key={field}
                            onClick={() => toggleSort(field as SortField)}
                            className={cn("py-3 px-4 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60 cursor-pointer select-none whitespace-nowrap hover:text-muted-foreground transition-colors", align)}>
                            {label} <SortIcon field={field} active={sortField} dir={sortDir} />
                          </th>
                        ))}
                        <th className="py-3 px-4 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60 hidden sm:table-cell">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLineRows.length === 0 && (
                        <tr><td colSpan={7} className="py-10 text-center text-sm text-muted-foreground/50">No lines match your search or filter.</td></tr>
                      )}
                      {filteredLineRows.map((row, i) => (
                        <Fragment key={row.id}>
                          <tr
                            onClick={() => setSelectedId(p => p === row.id ? null : row.id)}
                            className={cn(
                              "border-b last:border-0 cursor-pointer transition-all duration-150 border-l-2",
                              marginBorderColor(row.marginPct),
                              selectedId === row.id ? "bg-primary/[0.04]" : "hover:bg-muted/25"
                            )}
                            style={{ animationDelay: `${i * 40}ms` }}
                          >
                            <td className="py-4 px-4 pl-3">
                              <div className="flex items-center gap-2.5">
                                <ChevronRightIcon className={cn("h-3.5 w-3.5 text-muted-foreground/30 transition-transform duration-200 shrink-0", selectedId === row.id && "rotate-90 text-primary")} />
                                <span className="text-sm font-semibold">{row.name}</span>
                              </div>
                            </td>
                            <td className="py-4 px-4 text-right text-sm tabular-nums">{row.output.toLocaleString()}</td>
                            <td className="py-4 px-4 text-right text-sm font-medium tabular-nums text-emerald-700 dark:text-emerald-400">{fmtUsd(row.value)}</td>
                            <td className="py-4 px-4 text-right text-sm tabular-nums text-muted-foreground">{fmtUsd(row.cost)}</td>
                            <td className={cn("py-4 px-4 text-right text-sm font-semibold tabular-nums", row.margin >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                              {row.margin >= 0 ? "+" : "−"}{fmtUsd(row.margin)}
                            </td>
                            <td className="py-4 px-4 text-center"><MarginPill pct={row.marginPct} /></td>
                            <td className="py-4 px-4 hidden sm:table-cell">
                              <div className="flex items-center gap-2 min-w-[80px]">
                                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${row.outputShare}%` }}
                                    transition={{ duration: 0.6, delay: i * 0.05, ease: "easeOut" }}
                                    className="h-full rounded-full bg-foreground/20"
                                  />
                                </div>
                                <span className="text-[10px] text-muted-foreground tabular-nums w-6 text-right">{row.outputShare}%</span>
                              </div>
                            </td>
                          </tr>

                          {/* Drill-down */}
                          <AnimatePresence>
                            {selectedId === row.id && (
                              <tr className="bg-primary/[0.02] border-b last:border-0">
                                <td colSpan={7} className="p-0">
                                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                    <div className="px-12 py-5 grid grid-cols-1 sm:grid-cols-2 gap-6 border-l-2 border-primary/20 ml-0">
                                      <div>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50 mb-3">{row.name} · Detail</p>
                                        <div className="space-y-2.5">
                                          {[
                                            ["Output", row.output.toLocaleString() + " pcs"],
                                            ["Output Value", fmtUsd(row.value)],
                                            ["Operating Cost", fmtUsd(row.cost)],
                                            ["Operating Margin", (row.margin >= 0 ? "+" : "−") + fmtUsd(row.margin)],
                                            ["Margin %", row.marginPct !== 0 ? row.marginPct + "%" : "—"],
                                            ["Output Share", row.outputShare + "% of total"],
                                          ].map(([lbl, val]) => (
                                            <div key={lbl} className="flex items-center justify-between text-xs gap-4">
                                              <span className="text-muted-foreground">{lbl}</span>
                                              <span className="font-medium">{val}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                      {row.pos.length > 0 && (
                                        <div>
                                          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50 mb-3">Work Orders ({row.pos.length})</p>
                                          <div className="space-y-2">
                                            {row.pos.map(p => (
                                              <div key={p.po} className="flex items-center justify-between text-xs">
                                                <div className="flex items-center gap-2">
                                                  <span className="font-semibold">{p.po}</span>
                                                  {p.buyer && <span className="text-muted-foreground">{p.buyer}</span>}
                                                </div>
                                                <span className="text-muted-foreground tabular-nums">{p.output.toLocaleString()} pcs</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </motion.div>
                                </td>
                              </tr>
                            )}
                          </AnimatePresence>
                        </Fragment>
                      ))}
                    </tbody>

                    {filteredLineRows.length > 1 && (() => {
                      const fOut = filteredLineRows.reduce((s, r) => s + r.output, 0);
                      const fVal = filteredLineRows.reduce((s, r) => s + r.value, 0);
                      const fCost = filteredLineRows.reduce((s, r) => s + r.cost, 0);
                      const fMargin = fVal - fCost;
                      const fMpct = fVal > 0 ? Math.round(fMargin / fVal * 100) : 0;
                      return (
                      <tfoot>
                        <tr className="border-t bg-violet-50/40 dark:bg-violet-950/10">
                          <td className="py-3 px-4 pl-10 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            {filteredLineRows.length < sortedLineRows.length ? `Subtotal (${filteredLineRows.length})` : "Total"}
                          </td>
                          <td className="py-3 px-4 text-right text-xs font-bold tabular-nums">{fOut.toLocaleString()}</td>
                          <td className="py-3 px-4 text-right text-xs font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{fmtUsd(fVal)}</td>
                          <td className="py-3 px-4 text-right text-xs font-bold text-muted-foreground tabular-nums">{fmtUsd(fCost)}</td>
                          <td className={cn("py-3 px-4 text-right text-xs font-bold tabular-nums", fMargin >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                            {fMargin >= 0 ? "+" : "−"}{fmtUsd(fMargin)}
                          </td>
                          <td className="py-3 px-4 text-center"><MarginPill pct={fMpct} /></td>
                          <td className="hidden sm:table-cell" />
                        </tr>
                      </tfoot>
                      );
                    })()}
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── By PO table ────────────────────────────────────────────── */}
          {activeTab === "po" && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
              {/* Search + filter bar */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 pointer-events-none" />
                  <input
                    value={poSearch}
                    onChange={e => setPoSearch(e.target.value)}
                    placeholder="Search by PO, buyer, style…"
                    className="w-full pl-8 pr-8 py-2 text-xs rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-violet-400 placeholder:text-muted-foreground/40"
                  />
                  {poSearch && (
                    <button onClick={() => setPoSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                  {(["all", "positive", "negative"] as const).map(f => (
                    <button key={f} onClick={() => setPoMarginFilter(f)}
                      className={cn("px-2.5 py-1.5 text-[11px] font-medium rounded-lg capitalize transition-all",
                        poMarginFilter === f
                          ? f === "positive" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                            : f === "negative" ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400"
                            : "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-400"
                          : "text-muted-foreground hover:bg-muted"
                      )}>
                      {f === "all" ? "All" : f === "positive" ? "▲ Profitable" : "▼ Unprofitable"}
                    </button>
                  ))}
                </div>
                {(poSearch || poMarginFilter !== "all") && (
                  <span className="text-[11px] text-muted-foreground/60">{filteredPoRows.length} of {sortedPoRows.length}</span>
                )}
              </div>
              <div className="relative rounded-2xl border shadow-sm overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-violet-400 to-purple-500 opacity-50" />
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-violet-50/40 dark:bg-violet-950/10">
                        {[
                          ["name", "Work Order", "text-left"],
                          ["output", "Output", "text-right"],
                          ["value", "Output Value", "text-right"],
                          ["cost", "Op. Cost", "text-right"],
                          ["margin", "Margin", "text-right"],
                          ["marginPct", "%", "text-center"],
                        ].map(([field, label, align]) => (
                          <th key={field} onClick={() => toggleSort(field as SortField)}
                            className={cn("py-3 px-4 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60 cursor-pointer select-none whitespace-nowrap hover:text-muted-foreground transition-colors", align)}>
                            {label} <SortIcon field={field} active={sortField} dir={sortDir} />
                          </th>
                        ))}
                        <th className="py-3 px-4 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60 text-left whitespace-nowrap hidden sm:table-cell">Buyer</th>
                        <th className="py-3 px-4 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60 text-right whitespace-nowrap hidden md:table-cell">CM/Pc</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPoRows.length === 0 && (
                        <tr><td colSpan={8} className="py-10 text-center text-sm text-muted-foreground/50">No work orders match your search or filter.</td></tr>
                      )}
                      {filteredPoRows.map((row) => (
                        <Fragment key={row.po}>
                          <tr
                            onClick={() => setSelectedId(p => p === row.po ? null : row.po)}
                            className={cn(
                              "border-b last:border-0 cursor-pointer transition-all duration-150 border-l-2",
                              marginBorderColor(row.marginPct),
                              selectedId === row.po ? "bg-primary/[0.04]" : "hover:bg-muted/25"
                            )}
                          >
                            <td className="py-4 px-4 pl-3">
                              <div className="flex items-center gap-2.5">
                                <ChevronRightIcon className={cn("h-3.5 w-3.5 text-muted-foreground/30 transition-transform duration-200 shrink-0", selectedId === row.po && "rotate-90 text-primary")} />
                                <span className="text-sm font-bold">{row.po}</span>
                                {row.style && <span className="text-xs text-muted-foreground hidden lg:block">{row.style}</span>}
                              </div>
                            </td>
                            <td className="py-4 px-4 text-right text-sm tabular-nums">{row.output.toLocaleString()}</td>
                            <td className="py-4 px-4 text-right text-sm font-medium tabular-nums text-emerald-700 dark:text-emerald-400">{fmtUsd(row.value)}</td>
                            <td className="py-4 px-4 text-right text-sm tabular-nums text-muted-foreground">{fmtUsd(row.cost)}</td>
                            <td className={cn("py-4 px-4 text-right text-sm font-semibold tabular-nums", row.margin >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                              {row.margin >= 0 ? "+" : "−"}{fmtUsd(row.margin)}
                            </td>
                            <td className="py-4 px-4 text-center"><MarginPill pct={row.marginPct} /></td>
                            <td className="py-4 px-4 text-sm text-muted-foreground hidden sm:table-cell">{row.buyer || "—"}</td>
                            <td className="py-4 px-4 text-right text-xs tabular-nums text-muted-foreground/60 hidden md:table-cell">
                              {row.prodCmPc > 0 ? `$${row.prodCmPc.toFixed(4)}` : "—"}
                            </td>
                          </tr>

                          {/* Drill-down */}
                          <AnimatePresence>
                            {selectedId === row.po && (
                              <tr className="bg-primary/[0.02] border-b last:border-0">
                                <td colSpan={8} className="p-0">
                                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                    <div className="px-12 py-5 grid grid-cols-1 sm:grid-cols-2 gap-6 border-l-2 border-primary/20">
                                      <div className="space-y-5">
                                        <div>
                                          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50 mb-3">CM Breakdown</p>
                                          <div className="space-y-2.5">
                                            {[
                                              ["Entered CM/dz", row.cmDz > 0 ? `$${row.cmDz.toFixed(2)}` : "—"],
                                              ["Production CM/dz (70%)", row.prodCmDz > 0 ? `$${row.prodCmDz.toFixed(2)}` : "—"],
                                              ["Production CM/pc", row.prodCmPc > 0 ? `$${row.prodCmPc.toFixed(4)}` : "—"],
                                            ].map(([lbl, val]) => (
                                              <div key={lbl} className="flex items-center justify-between text-xs gap-4">
                                                <span className="text-muted-foreground">{lbl}</span>
                                                <span className="font-medium">{val}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                        <div>
                                          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50 mb-3">Performance</p>
                                          <div className="space-y-2.5">
                                            {[
                                              ["Output", row.output.toLocaleString() + " pcs"],
                                              ["Output Value", fmtUsd(row.value)],
                                              ["Operating Cost", fmtUsd(row.cost)],
                                              ["Operating Margin", (row.margin >= 0 ? "+" : "−") + fmtUsd(row.margin)],
                                              ["Margin %", row.marginPct !== 0 ? row.marginPct + "%" : "—"],
                                            ].map(([lbl, val]) => (
                                              <div key={lbl} className="flex items-center justify-between text-xs gap-4">
                                                <span className="text-muted-foreground">{lbl}</span>
                                                <span className="font-medium">{val}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                      {row.lines.length > 0 && (
                                        <div>
                                          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50 mb-3">Lines Contributed ({row.lines.length})</p>
                                          <div className="space-y-3">
                                            {row.lines.map(l => {
                                              const share = row.output > 0 ? Math.round(l.output / row.output * 100) : 0;
                                              return (
                                                <div key={l.name} className="space-y-1.5">
                                                  <div className="flex items-center justify-between text-xs">
                                                    <span className="font-semibold">{l.name}</span>
                                                    <span className="text-muted-foreground tabular-nums">{l.output.toLocaleString()} pcs · {share}%</span>
                                                  </div>
                                                  <div className="h-1 rounded-full bg-muted overflow-hidden">
                                                    <motion.div initial={{ width: 0 }} animate={{ width: `${share}%` }} transition={{ duration: 0.5, ease: "easeOut" }} className="h-full rounded-full bg-primary/30" />
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </motion.div>
                                </td>
                              </tr>
                            )}
                          </AnimatePresence>
                        </Fragment>
                      ))}
                    </tbody>

                    {filteredPoRows.length > 1 && (() => {
                      const fOut = filteredPoRows.reduce((s, r) => s + r.output, 0);
                      const fVal = filteredPoRows.reduce((s, r) => s + r.value, 0);
                      const fCost = filteredPoRows.reduce((s, r) => s + r.cost, 0);
                      const fMargin = fVal - fCost;
                      const fMpct = fVal > 0 ? Math.round(fMargin / fVal * 100) : 0;
                      return (
                      <tfoot>
                        <tr className="border-t bg-violet-50/40 dark:bg-violet-950/10">
                          <td className="py-3 px-4 pl-10 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            {filteredPoRows.length < sortedPoRows.length ? `Subtotal (${filteredPoRows.length})` : "Total"}
                          </td>
                          <td className="py-3 px-4 text-right text-xs font-bold tabular-nums">{fOut.toLocaleString()}</td>
                          <td className="py-3 px-4 text-right text-xs font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{fmtUsd(fVal)}</td>
                          <td className="py-3 px-4 text-right text-xs font-bold text-muted-foreground tabular-nums">{fmtUsd(fCost)}</td>
                          <td className={cn("py-3 px-4 text-right text-xs font-bold tabular-nums", fMargin >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                            {fMargin >= 0 ? "+" : "−"}{fmtUsd(fMargin)}
                          </td>
                          <td className="py-3 px-4 text-center"><MarginPill pct={fMpct} /></td>
                          <td className="hidden sm:table-cell" />
                          <td className="hidden md:table-cell" />
                        </tr>
                      </tfoot>
                      );
                    })()}
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* Cost not configured notice */}
          {!costConfigured && (
            <p className="text-[11px] text-amber-600/80 dark:text-amber-400/80 text-center">
              Headcount cost not configured — operating cost shows as $0. Configure it in Factory Setup.
            </p>
          )}

        </motion.div>
      )}

      {/* ── Export Dialog ──────────────────────────────────────────────── */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Export Financial Report</DialogTitle>
          </DialogHeader>

          {/* Report Type */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground/80">Report Type</p>
            <div className="grid grid-cols-3 gap-2">
              {(["day", "week", "month"] as RangeMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => { setRangeMode(m); setOffset(0); setSelectedId(null); }}
                  className={cn(
                    "py-3 rounded-xl text-sm font-semibold capitalize transition-all",
                    rangeMode === m
                      ? "bg-violet-600 text-white shadow-sm shadow-violet-200 dark:shadow-violet-900"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  )}
                >
                  {m === "day" ? "Daily" : m === "week" ? "Weekly" : "Monthly"}
                </button>
              ))}
            </div>
          </div>

          {/* Period navigator */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground/80">Period</p>
            <div className="flex items-center gap-2 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/40 dark:bg-violet-950/20 px-3 py-3">
              <button
                onClick={() => setOffset(o => o - 1)}
                className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-colors text-violet-600 dark:text-violet-400"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="flex-1 text-center text-sm font-medium text-violet-900 dark:text-violet-200">{label}</span>
              <button
                onClick={() => setOffset(o => o + 1)}
                disabled={isAtPresent}
                className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-colors text-violet-600 dark:text-violet-400 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Format */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground/80">Format</p>
            <div className="grid grid-cols-2 gap-2">
              {(["pdf", "csv"] as const).map(fmt => (
                <button
                  key={fmt}
                  onClick={() => setExportFormat(fmt)}
                  className={cn(
                    "py-3 rounded-xl text-sm font-semibold uppercase transition-all",
                    exportFormat === fmt
                      ? "bg-violet-600 text-white shadow-sm shadow-violet-200 dark:shadow-violet-900"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  )}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>

          {/* Download button */}
          <button
            onClick={() => {
              setExportDialogOpen(false);
              if (exportFormat === "pdf") handleExportPdf();
              else handleExportCsv();
            }}
            disabled={loading || !summary.hasData}
            className="w-full py-4 rounded-xl bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white font-semibold text-sm flex items-center justify-center gap-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-violet-200 dark:shadow-violet-900/50 mt-1"
          >
            <FileDown className="h-4 w-4" />
            {loading ? "Loading data…" : !summary.hasData ? "No data for this period" : `Download ${exportFormat.toUpperCase()}`}
          </button>
        </DialogContent>
      </Dialog>

    </div>
  );
}
