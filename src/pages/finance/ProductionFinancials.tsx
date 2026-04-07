import { useState, useEffect, useMemo, useCallback, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { format, startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek, startOfQuarter, endOfQuarter } from "date-fns";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Factory, DollarSign, TrendingUp, TrendingDown, Search, Download, ChevronDown, ChevronUp, BarChart3, Package, Users } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useHeadcountCost } from "@/hooks/useHeadcountCost";

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const fadeUp = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } } };

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n: number) => n.toLocaleString("en-US");
const pct = (n: number) => `${n.toFixed(1)}%`;

function invoiceTotal(inv: any): number {
  return ((inv.invoice_line_items ?? []) as any[]).reduce((s: number, l: any) => {
    const line = (l.quantity ?? 0) * (l.unit_price ?? 0);
    return s + line - line * ((l.discount_pct ?? 0) / 100);
  }, 0);
}
function marginColor(m: number) {
  return m >= 10 ? "text-emerald-600 dark:text-emerald-400" : m >= 0 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
}
function marginBadge(m: number) {
  return m >= 10 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" : m >= 0 ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
}
function profitColor(p: number) {
  return p >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
}
type DateRange = "week" | "month" | "quarter" | "custom";
function getRange(r: DateRange, now: Date): [Date, Date] {
  if (r === "week") return [startOfWeek(now, { weekStartsOn: 1 }), endOfWeek(now, { weekStartsOn: 1 })];
  if (r === "quarter") return [startOfQuarter(now), endOfQuarter(now)];
  return [startOfMonth(now), endOfMonth(now)];
}

interface OrderRow {
  id: string; po_number: string; style: string; buyer: string; order_qty: number;
  cm_per_dozen: number; commercial_price: number; status: string; lines: string[];
  producedQty: number; efficiency: number; revenue: number; revenueEstimated: boolean;
  cmCostActual: number; supplierPayments: number; exportCosts: number;
  totalCost: number; profit: number; margin: number; costSheetEstimate: number | null;
}
interface LineRow {
  lineId: string; lineName: string; activeOrders: number; avgOperators: number;
  avgEfficiency: number; totalOutput: number; cmCost: number; revenueContribution: number; cmMargin: number;
}

export default function ProductionFinancials() {
  const { factory } = useAuth();
  const navigate = useNavigate();
  const { headcountCost, isConfigured: hcConfigured, getCurrencySymbol } = useHeadcountCost();
  const sym = getCurrencySymbol();

  const [loading, setLoading] = useState(true);
  const [raw, setRaw] = useState<any>(null);
  const [dateRange, setDateRange] = useState<DateRange>("month");
  const [buyerFilter, setBuyerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [marginFilter, setMarginFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<string>("margin");
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(0);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [lineSortCol, setLineSortCol] = useState<string>("cmMargin");
  const [lineSortAsc, setLineSortAsc] = useState(true);

  /* ---------- Data fetching ---------- */

  useEffect(() => {
    if (!factory?.id) return;
    const fid = factory.id;

    const load = async () => {
      setLoading(true);

      const [woRes, sewActRes, sewTgtRes, costSheetRes, invRes, payRes, exportRes, lcCostRes] = await Promise.all([
        supabase.from("work_orders" as any).select("id, po_number, buyer, style, item, order_qty, cm_per_dozen, commercial_price, is_active, status, created_at").eq("factory_id", fid),
        supabase.from("sewing_actuals" as any).select("id, work_order_id, line_id, good_today, manpower_actual, hours_actual, ot_manpower_actual, ot_hours_actual, production_date, lines(name, line_id)").eq("factory_id", fid),
        supabase.from("sewing_targets" as any).select("id, work_order_id, line_id, per_hour_target, target_total_planned, hours_planned, manpower_planned, production_date").eq("factory_id", fid),
        supabase.from("cost_sheets" as any).select("id, work_order_id, quoted_price, desired_margin_pct, cost_sheet_fabrics(price_per_unit, consumption_per_dozen, wastage_pct, currency, exchange_rate), cost_sheet_trims(qty_per_garment, unit_price, is_buyer_supplied, currency, exchange_rate), cost_sheet_cm(cm_per_dozen, sam, efficiency_pct), cost_sheet_processes(cost_per_piece, currency, exchange_rate), cost_sheet_commercial(amount, cost_type, currency, exchange_rate)").eq("factory_id", fid).eq("is_template", false),
        supabase.from("invoices" as any).select("id, work_order_id, buyer_name, status, invoice_line_items(quantity, unit_price, discount_pct)").eq("factory_id", fid),
        supabase.from("payments" as any).select("id, linked_po_id, category, original_amount, original_currency, direction").eq("factory_id", fid).eq("direction", "out").is("deleted_at", null),
        supabase.from("export_costs" as any).select("id, work_order_id, category, amount, currency").eq("factory_id", fid),
        supabase.from("lc_banking_costs" as any).select("id, lc_id, amount, currency").eq("factory_id", fid),
      ]);

      setRaw({
        workOrders: (woRes.data ?? []) as any[],
        sewingActuals: (sewActRes.data ?? []) as any[],
        sewingTargets: (sewTgtRes.data ?? []) as any[],
        costSheets: (costSheetRes.data ?? []) as any[],
        invoices: (invRes.data ?? []) as any[],
        payments: (payRes.data ?? []) as any[],
        exportCosts: (exportRes.data ?? []) as any[],
        lcCosts: (lcCostRes.data ?? []) as any[],
      });

      setLoading(false);
    };

    load();
  }, [factory?.id]);

  /* ---------- Derived: date range ---------- */

  const now = useMemo(() => new Date(), []);
  const [rangeStart, rangeEnd] = useMemo(() => getRange(dateRange, now), [dateRange, now]);

  /* ---------- Derived: order rows ---------- */

  const orderRows = useMemo<OrderRow[]>(() => {
    if (!raw) return [];
    const rate = headcountCost.value ?? 0;

    return (raw.workOrders as any[]).map((wo: any) => {
      const woId = wo.id;

      // Sewing actuals for this order
      const actuals = (raw.sewingActuals as any[]).filter((a: any) => a.work_order_id === woId);
      const targets = (raw.sewingTargets as any[]).filter((t: any) => t.work_order_id === woId);

      // Lines
      const lineNames = [...new Set(actuals.map((a: any) => (a.lines as any)?.name).filter(Boolean))] as string[];

      // Produced qty
      const producedQty = actuals.reduce((s: number, a: any) => s + (a.good_today ?? 0), 0);

      // Efficiency
      const targetTotal = targets.reduce((s: number, t: any) => s + (t.target_total_planned ?? 0), 0);
      const efficiency = targetTotal > 0 ? (producedQty / targetTotal) * 100 : 0;

      // CM cost actual
      const cmCostActual = actuals.reduce((s: number, a: any) => {
        const reg = (a.manpower_actual ?? 0) * (a.hours_actual ?? 0) * rate;
        const ot = (a.ot_manpower_actual ?? 0) * (a.ot_hours_actual ?? 0) * rate * 2;
        return s + reg + ot;
      }, 0);

      // Revenue
      const matchedInvoices = (raw.invoices as any[]).filter((inv: any) => inv.work_order_id === woId);
      let revenue = 0;
      let revenueEstimated = false;
      if (matchedInvoices.length > 0) {
        revenue = matchedInvoices.reduce((s: number, inv: any) => s + invoiceTotal(inv), 0);
      } else {
        revenue = (wo.commercial_price ?? 0) * (wo.order_qty ?? 0);
        revenueEstimated = true;
      }

      // Supplier payments
      const supplierPayments = (raw.payments as any[])
        .filter((p: any) => p.linked_po_id === woId)
        .reduce((s: number, p: any) => s + (p.original_amount ?? 0), 0);

      // Export costs
      const exportCosts = (raw.exportCosts as any[])
        .filter((e: any) => e.work_order_id === woId)
        .reduce((s: number, e: any) => s + (e.amount ?? 0), 0);

      // Cost sheet estimate
      const cs = (raw.costSheets as any[]).find((c: any) => c.work_order_id === woId);
      const costSheetEstimate = cs?.quoted_price ?? null;

      const totalCost = cmCostActual + supplierPayments + exportCosts;
      const profit = revenue - totalCost;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

      return {
        id: woId,
        po_number: wo.po_number ?? "",
        style: wo.style ?? "",
        buyer: wo.buyer ?? "",
        order_qty: wo.order_qty ?? 0,
        cm_per_dozen: wo.cm_per_dozen ?? 0,
        commercial_price: wo.commercial_price ?? 0,
        status: wo.status ?? "",
        lines: lineNames,
        producedQty,
        efficiency,
        revenue,
        revenueEstimated,
        cmCostActual,
        supplierPayments,
        exportCosts,
        totalCost,
        profit,
        margin,
        costSheetEstimate,
      };
    });
  }, [raw, headcountCost.value]);

  /* ---------- Derived: filtered orders ---------- */

  const filteredOrders = useMemo(() => {
    let rows = orderRows;
    if (buyerFilter !== "all") rows = rows.filter((r) => r.buyer === buyerFilter);
    if (statusFilter !== "all") rows = rows.filter((r) => r.status === statusFilter);
    if (marginFilter === "positive") rows = rows.filter((r) => r.margin > 0);
    if (marginFilter === "negative") rows = rows.filter((r) => r.margin < 0);
    if (marginFilter === "below_target") rows = rows.filter((r) => r.margin < 10);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.po_number.toLowerCase().includes(q) ||
          r.style.toLowerCase().includes(q) ||
          r.buyer.toLowerCase().includes(q)
      );
    }
    // Sort
    rows = [...rows].sort((a: any, b: any) => {
      const av = a[sortCol] ?? 0;
      const bv = b[sortCol] ?? 0;
      if (typeof av === "string") return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortAsc ? av - bv : bv - av;
    });
    return rows;
  }, [orderRows, buyerFilter, statusFilter, marginFilter, search, sortCol, sortAsc]);

  const pagedOrders = useMemo(() => filteredOrders.slice(page * 10, page * 10 + 10), [filteredOrders, page]);
  const totalPages = Math.ceil(filteredOrders.length / 10);

  /* ---------- Derived: line rows ---------- */

  const lineRows = useMemo<LineRow[]>(() => {
    if (!raw) return [];
    const rate = headcountCost.value ?? 0;
    const actuals = raw.sewingActuals as any[];
    const targets = raw.sewingTargets as any[];

    const lineMap = new Map<string, { name: string; actuals: any[]; targets: any[]; woIds: Set<string> }>();

    for (const a of actuals) {
      const lid = a.line_id;
      if (!lid) continue;
      if (!lineMap.has(lid)) {
        lineMap.set(lid, {
          name: (a.lines as any)?.name ?? lid,
          actuals: [],
          targets: [],
          woIds: new Set(),
        });
      }
      const entry = lineMap.get(lid)!;
      entry.actuals.push(a);
      if (a.work_order_id) entry.woIds.add(a.work_order_id);
    }

    for (const t of targets) {
      const lid = t.line_id;
      if (!lid || !lineMap.has(lid)) continue;
      lineMap.get(lid)!.targets.push(t);
    }

    const woMap = new Map((raw.workOrders as any[]).map((w: any) => [w.id, w]));

    return Array.from(lineMap.entries()).map(([lid, data]) => {
      const output = data.actuals.reduce((s: number, a: any) => s + (a.good_today ?? 0), 0);
      const targetSum = data.targets.reduce((s: number, t: any) => s + (t.target_total_planned ?? 0), 0);
      const mpSum = data.actuals.reduce((s: number, a: any) => s + (a.manpower_actual ?? 0), 0);
      const avgOp = data.actuals.length > 0 ? mpSum / data.actuals.length : 0;

      const cmCost = data.actuals.reduce((s: number, a: any) => {
        const reg = (a.manpower_actual ?? 0) * (a.hours_actual ?? 0) * rate;
        const ot = (a.ot_manpower_actual ?? 0) * (a.ot_hours_actual ?? 0) * rate * 2;
        return s + reg + ot;
      }, 0);

      // Revenue contribution: output * (cm_per_dozen / 12) per work order
      let revContribution = 0;
      for (const a of data.actuals) {
        const wo = woMap.get(a.work_order_id);
        if (wo) {
          revContribution += (a.good_today ?? 0) * ((wo.cm_per_dozen ?? 0) / 12);
        }
      }

      const cmMargin = revContribution > 0 ? ((revContribution - cmCost) / revContribution) * 100 : 0;

      return {
        lineId: lid,
        lineName: data.name,
        activeOrders: data.woIds.size,
        avgOperators: Math.round(avgOp),
        avgEfficiency: targetSum > 0 ? (output / targetSum) * 100 : 0,
        totalOutput: output,
        cmCost,
        revenueContribution: revContribution,
        cmMargin,
      };
    });
  }, [raw, headcountCost.value]);

  const sortedLines = useMemo(() => {
    return [...lineRows].sort((a: any, b: any) => {
      const av = a[lineSortCol] ?? 0;
      const bv = b[lineSortCol] ?? 0;
      return lineSortAsc ? av - bv : bv - av;
    });
  }, [lineRows, lineSortCol, lineSortAsc]);

  /* ---------- Derived: KPI summary ---------- */

  const kpi = useMemo(() => {
    const totalRevenue = orderRows.reduce((s, r) => s + r.revenue, 0);
    const totalCost = orderRows.reduce((s, r) => s + r.totalCost, 0);
    const totalProfit = totalRevenue - totalCost;
    const overallMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    return { totalRevenue, totalCost, totalProfit, overallMargin };
  }, [orderRows]);

  /* ---------- Derived: margin trend (6 months) ---------- */

  const marginTrend = useMemo(() => {
    if (!raw) return [];
    const rate = headcountCost.value ?? 0;
    const months: { label: string; revenue: number; cost: number; margin: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = subMonths(now, i);
      const ms = format(startOfMonth(d), "yyyy-MM-dd");
      const me = format(endOfMonth(d), "yyyy-MM-dd");
      const label = format(d, "MMM yy");

      const monthActuals = (raw.sewingActuals as any[]).filter(
        (a: any) => a.production_date >= ms && a.production_date <= me
      );

      const cost = monthActuals.reduce((s: number, a: any) => {
        const reg = (a.manpower_actual ?? 0) * (a.hours_actual ?? 0) * rate;
        const ot = (a.ot_manpower_actual ?? 0) * (a.ot_hours_actual ?? 0) * rate * 2;
        return s + reg + ot;
      }, 0);

      // Revenue: output * cm_per_dozen / 12
      const woMap = new Map((raw.workOrders as any[]).map((w: any) => [w.id, w]));
      const revenue = monthActuals.reduce((s: number, a: any) => {
        const wo = woMap.get(a.work_order_id);
        return s + (a.good_today ?? 0) * ((wo?.cm_per_dozen ?? 0) / 12);
      }, 0);

      const margin = revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0;
      months.push({ label, revenue, cost, margin });
    }

    return months;
  }, [raw, headcountCost.value, now]);

  /* ---------- Derived: buyers list ---------- */

  const buyers = useMemo(() => {
    const set = new Set(orderRows.map((r) => r.buyer).filter(Boolean));
    return Array.from(set).sort();
  }, [orderRows]);

  /* ---------- Sort handler ---------- */

  const handleSort = useCallback(
    (col: string) => {
      if (sortCol === col) setSortAsc((p) => !p);
      else {
        setSortCol(col);
        setSortAsc(true);
      }
      setPage(0);
    },
    [sortCol]
  );

  const handleLineSort = useCallback(
    (col: string) => {
      if (lineSortCol === col) setLineSortAsc((p) => !p);
      else {
        setLineSortCol(col);
        setLineSortAsc(true);
      }
    },
    [lineSortCol]
  );

  const exportCSV = useCallback(() => {
    const rows = filteredOrders;
    if (!rows.length) { toast.error("No data to export"); return; }
    const csv = [["PO#","Style","Buyer","Lines","Order Qty","Produced Qty","Efficiency%","Revenue","CM Cost","Total Cost","Profit","Margin%"].join(","),
      ...rows.map((r) => [r.po_number, r.style, r.buyer, `"${r.lines.join("; ")}"`, r.order_qty, r.producedQty, r.efficiency.toFixed(1), r.revenue.toFixed(2), r.cmCostActual.toFixed(2), r.totalCost.toFixed(2), r.profit.toFixed(2), r.margin.toFixed(1)].join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `production-financials-${format(new Date(), "yyyy-MM-dd")}.csv`; a.click(); URL.revokeObjectURL(url);
    toast.success("CSV exported");
  }, [filteredOrders]);

  const exportPDF = useCallback(() => {
    const rows = filteredOrders;
    if (!rows.length) { toast.error("No data to export"); return; }
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFillColor(107, 33, 168); doc.rect(0, 0, 297, 22, "F");
    doc.setTextColor(255, 255, 255); doc.setFontSize(14); doc.text("Production Financials Report", 10, 14);
    doc.setFontSize(8); doc.text(`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`, 210, 14);
    doc.setTextColor(0, 0, 0); doc.setFontSize(10);
    doc.text(`Revenue: ${sym}${fmt(kpi.totalRevenue)}`, 10, 32); doc.text(`Cost: ${sym}${fmt(kpi.totalCost)}`, 80, 32);
    doc.text(`Profit: ${sym}${fmt(kpi.totalProfit)}`, 150, 32); doc.text(`Margin: ${pct(kpi.overallMargin)}`, 220, 32);
    const colX = [10, 40, 75, 105, 135, 155, 175, 200, 225, 250, 270];
    const hdrs = ["PO#","Style","Buyer","Order Qty","Produced","Eff%","Revenue","CM Cost","Total Cost","Profit","Margin%"];
    let y = 42; doc.setFontSize(7); doc.setFont("helvetica", "bold");
    hdrs.forEach((h, i) => doc.text(h, colX[i], y)); y += 5; doc.setFont("helvetica", "normal");
    for (const r of rows) {
      if (y > 190) { doc.addPage(); y = 15; doc.setFont("helvetica", "bold"); hdrs.forEach((h, i) => doc.text(h, colX[i], y)); y += 5; doc.setFont("helvetica", "normal"); }
      [r.po_number.slice(0,16), (r.style??"").slice(0,18), (r.buyer??"").slice(0,16), fmtInt(r.order_qty), fmtInt(r.producedQty), pct(r.efficiency), fmt(r.revenue), fmt(r.cmCostActual), fmt(r.totalCost), fmt(r.profit), pct(r.margin)].forEach((t, i) => doc.text(t, colX[i], y));
      y += 5;
    }
    doc.save(`production-financials-${format(new Date(), "yyyy-MM-dd")}.pdf`);
    toast.success("PDF exported");
  }, [filteredOrders, kpi, sym]);

  /* ---------- Sort icon ---------- */

  const SortIcon = ({ col, current, asc }: { col: string; current: string; asc: boolean }) => {
    if (col !== current) return <ChevronDown className="h-3 w-3 opacity-30" />;
    return asc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  /* ---------- Render ---------- */

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-12 rounded-lg" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Page header */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 p-2.5 shadow-lg shadow-purple-500/20">
            <Factory className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">Production Financials</h1>
            <p className="text-xs text-muted-foreground">Revenue, costs & margins across orders and lines</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={exportCSV} className="text-xs gap-1.5">
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button size="sm" variant="outline" onClick={exportPDF} className="text-xs gap-1.5">
            <Download className="h-3.5 w-3.5" /> PDF
          </Button>
        </div>
      </motion.div>

      {/* Summary KPI Cards */}
      <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Total Revenue",
            value: `${sym}${fmt(kpi.totalRevenue)}`,
            icon: DollarSign,
            gradient: "from-purple-500 to-violet-600",
            shadow: "shadow-purple-500/20",
          },
          {
            label: "Total Cost",
            value: `${sym}${fmt(kpi.totalCost)}`,
            icon: Package,
            gradient: "from-fuchsia-500 to-purple-600",
            shadow: "shadow-fuchsia-500/20",
          },
          {
            label: "Total Profit",
            value: `${sym}${fmt(kpi.totalProfit)}`,
            icon: kpi.totalProfit >= 0 ? TrendingUp : TrendingDown,
            gradient: kpi.totalProfit >= 0 ? "from-emerald-500 to-green-600" : "from-red-500 to-rose-600",
            shadow: kpi.totalProfit >= 0 ? "shadow-emerald-500/20" : "shadow-red-500/20",
          },
          {
            label: "Overall Margin",
            value: pct(kpi.overallMargin),
            icon: BarChart3,
            gradient: "from-violet-500 to-indigo-600",
            shadow: "shadow-violet-500/20",
            sub: kpi.overallMargin >= 10 ? "Above target (10%)" : "Below target (10%)",
          },
        ].map((card, idx) => (
          <motion.div key={idx} variants={fadeUp}>
            <div className="relative overflow-hidden rounded-xl border border-purple-200/60 dark:border-purple-800/40 bg-gradient-to-br from-purple-50/50 via-white to-violet-50/30 dark:from-purple-950/30 dark:via-card dark:to-violet-950/15 p-4">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-purple-500/5 to-transparent rounded-bl-full pointer-events-none" />
              <div className="flex items-start justify-between relative">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{card.label}</p>
                  <p className="text-xl md:text-2xl font-bold mt-1">{card.value}</p>
                  {card.sub && <p className="text-[10px] text-muted-foreground mt-1">{card.sub}</p>}
                </div>
                <div className={cn("rounded-lg bg-gradient-to-br p-2 shadow-md", card.gradient, card.shadow)}>
                  <card.icon className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Filters Bar */}
      <motion.div variants={fadeUp} initial="hidden" animate="show">
        <Card className="border-purple-200/60 dark:border-purple-800/40">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-end">
              {/* Date range quick buttons */}
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Period</label>
                <div className="flex gap-1">
                  {(["week", "month", "quarter"] as DateRange[]).map((r) => (
                    <Button
                      key={r}
                      size="sm"
                      variant={dateRange === r ? "default" : "outline"}
                      className={cn("text-xs h-8 px-3", dateRange === r && "bg-purple-600 hover:bg-purple-700")}
                      onClick={() => { setDateRange(r); setPage(0); }}
                    >
                      {r === "week" ? "This Week" : r === "month" ? "This Month" : "This Quarter"}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Buyer */}
              <div className="space-y-1 min-w-[140px]">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Buyer</label>
                <Select value={buyerFilter} onValueChange={(v) => { setBuyerFilter(v); setPage(0); }}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Buyers</SelectItem>
                    {buyers.map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status */}
              <div className="space-y-1 min-w-[140px]">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</label>
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="in_production">In Production</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="shipped">Shipped</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Margin */}
              <div className="space-y-1 min-w-[140px]">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Margin</label>
                <Select value={marginFilter} onValueChange={(v) => { setMarginFilter(v); setPage(0); }}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Margins</SelectItem>
                    <SelectItem value="positive">Positive</SelectItem>
                    <SelectItem value="negative">Negative</SelectItem>
                    <SelectItem value="below_target">Below 10%</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Search */}
              <div className="space-y-1 flex-1 min-w-[180px]">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Search</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="PO, style, buyer..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                    className="h-8 text-xs pl-8"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Tabs: Order View / Line View */}
      <motion.div variants={fadeUp} initial="hidden" animate="show">
        <Tabs defaultValue="orders" className="space-y-4">
          <TabsList className="bg-purple-100/50 dark:bg-purple-900/20">
            <TabsTrigger value="orders" className="text-xs data-[state=active]:bg-purple-600 data-[state=active]:text-white">
              Order View
            </TabsTrigger>
            <TabsTrigger value="lines" className="text-xs data-[state=active]:bg-purple-600 data-[state=active]:text-white">
              Line View
            </TabsTrigger>
          </TabsList>

          {/* ORDER VIEW */}
          <TabsContent value="orders">
            <Card className="border-purple-200/60 dark:border-purple-800/40">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-purple-50/50 dark:bg-purple-950/20">
                        {[
                          { key: "po_number", label: "PO#" },
                          { key: "style", label: "Style" },
                          { key: "buyer", label: "Buyer" },
                          { key: "lines", label: "Line(s)", sortable: false },
                          { key: "order_qty", label: "Order Qty" },
                          { key: "producedQty", label: "Produced" },
                          { key: "efficiency", label: "Eff%" },
                          { key: "revenue", label: "Revenue" },
                          { key: "cmCostActual", label: "CM Cost" },
                          { key: "totalCost", label: "Total Cost" },
                          { key: "profit", label: "Profit" },
                          { key: "margin", label: "Margin%" },
                        ].map((col) => (
                          <TableHead
                            key={col.key}
                            className={cn(
                              "text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap",
                              col.sortable !== false && "cursor-pointer select-none hover:text-purple-600"
                            )}
                            onClick={() => col.sortable !== false && handleSort(col.key)}
                          >
                            <span className="flex items-center gap-1">
                              {col.label}
                              {col.sortable !== false && <SortIcon col={col.key} current={sortCol} asc={sortAsc} />}
                            </span>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedOrders.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={12} className="text-center text-sm text-muted-foreground py-12">
                            No orders found
                          </TableCell>
                        </TableRow>
                      )}
                      {pagedOrders.map((row) => (
                        <Fragment key={row.id}>
                          <TableRow
                            className="cursor-pointer hover:bg-purple-50/40 dark:hover:bg-purple-950/10 transition-colors"
                            onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}
                          >
                            <TableCell className="text-xs font-medium">{row.po_number}</TableCell>
                            <TableCell className="text-xs">{row.style}</TableCell>
                            <TableCell className="text-xs">{row.buyer}</TableCell>
                            <TableCell className="text-xs">{row.lines.join(", ") || "-"}</TableCell>
                            <TableCell className="text-xs text-right">{fmtInt(row.order_qty)}</TableCell>
                            <TableCell className="text-xs text-right">{fmtInt(row.producedQty)}</TableCell>
                            <TableCell className="text-xs text-right">{pct(row.efficiency)}</TableCell>
                            <TableCell className="text-xs text-right">
                              {sym}{fmt(row.revenue)}
                              {row.revenueEstimated && <span className="text-[9px] text-muted-foreground ml-1">est.</span>}
                            </TableCell>
                            <TableCell className="text-xs text-right">{sym}{fmt(row.cmCostActual)}</TableCell>
                            <TableCell className="text-xs text-right">{sym}{fmt(row.totalCost)}</TableCell>
                            <TableCell className={cn("text-xs text-right font-medium", profitColor(row.profit))}>
                              {sym}{fmt(row.profit)}
                            </TableCell>
                            <TableCell className="text-xs text-right">
                              <Badge className={cn("text-[10px] font-semibold", marginBadge(row.margin))}>
                                {pct(row.margin)}
                              </Badge>
                            </TableCell>
                          </TableRow>
                          {expandedRow === row.id && (
                            <TableRow key={`${row.id}-exp`}>
                              <TableCell colSpan={12} className="bg-purple-50/30 dark:bg-purple-950/10 p-4">
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-3">
                                  <p className="text-xs font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider">Cost Breakdown</p>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                    {[["CM Cost (Actual)", row.cmCostActual], ["Supplier Payments", row.supplierPayments], ["Export Costs", row.exportCosts]].map(([label, val]) => (
                                      <div key={label as string} className="space-y-1"><p className="text-muted-foreground">{label as string}</p><p className="font-semibold">{sym}{fmt(val as number)}</p></div>
                                    ))}
                                    <div className="space-y-1"><p className="text-muted-foreground">Cost Sheet Estimate</p><p className="font-semibold">{row.costSheetEstimate != null ? `${sym}${fmt(row.costSheetEstimate)}` : "N/A"}</p></div>
                                  </div>
                                  {row.costSheetEstimate != null && (
                                    <div className="pt-2 border-t border-purple-200/40 dark:border-purple-800/30">
                                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Variance (Actual vs Estimated)</p>
                                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                                        <div><p className="text-muted-foreground">Total Actual</p><p className="font-semibold">{sym}{fmt(row.totalCost)}</p></div>
                                        <div><p className="text-muted-foreground">Estimated</p><p className="font-semibold">{sym}{fmt(row.costSheetEstimate)}</p></div>
                                        <div><p className="text-muted-foreground">Variance</p><p className={cn("font-semibold", row.totalCost > row.costSheetEstimate ? "text-red-600" : "text-emerald-600")}>{row.totalCost > row.costSheetEstimate ? "+" : ""}{sym}{fmt(row.totalCost - row.costSheetEstimate)}</p></div>
                                      </div>
                                    </div>
                                  )}
                                </motion.div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between p-3 border-t border-purple-200/40 dark:border-purple-800/30">
                    <p className="text-[11px] text-muted-foreground">
                      Showing {page * 10 + 1}-{Math.min((page + 1) * 10, filteredOrders.length)} of {filteredOrders.length}
                    </p>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)} className="h-7 text-xs px-2">
                        Prev
                      </Button>
                      <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} className="h-7 text-xs px-2">
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* LINE VIEW */}
          <TabsContent value="lines" className="space-y-6">
            <Card className="border-purple-200/60 dark:border-purple-800/40">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-purple-50/50 dark:bg-purple-950/20">
                        {[
                          { key: "lineName", label: "Line" },
                          { key: "activeOrders", label: "Active Orders" },
                          { key: "avgOperators", label: "Avg Operators" },
                          { key: "avgEfficiency", label: "Avg Eff%" },
                          { key: "totalOutput", label: "Total Output" },
                          { key: "cmCost", label: "CM Cost" },
                          { key: "revenueContribution", label: "Revenue" },
                          { key: "cmMargin", label: "CM Margin%" },
                        ].map((col) => (
                          <TableHead
                            key={col.key}
                            className="text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:text-purple-600"
                            onClick={() => handleLineSort(col.key)}
                          >
                            <span className="flex items-center gap-1">
                              {col.label}
                              <SortIcon col={col.key} current={lineSortCol} asc={lineSortAsc} />
                            </span>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedLines.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-12">
                            No line data available
                          </TableCell>
                        </TableRow>
                      )}
                      {sortedLines.map((row) => (
                        <TableRow key={row.lineId} className="hover:bg-purple-50/40 dark:hover:bg-purple-950/10">
                          <TableCell className="text-xs font-medium">{row.lineName}</TableCell>
                          <TableCell className="text-xs text-right">{row.activeOrders}</TableCell>
                          <TableCell className="text-xs text-right">{row.avgOperators}</TableCell>
                          <TableCell className="text-xs text-right">{pct(row.avgEfficiency)}</TableCell>
                          <TableCell className="text-xs text-right">{fmtInt(row.totalOutput)}</TableCell>
                          <TableCell className="text-xs text-right">{sym}{fmt(row.cmCost)}</TableCell>
                          <TableCell className="text-xs text-right">{sym}{fmt(row.revenueContribution)}</TableCell>
                          <TableCell className="text-xs text-right">
                            <Badge className={cn("text-[10px] font-semibold", marginBadge(row.cmMargin))}>
                              {pct(row.cmMargin)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Bar chart: CM Margin per Line */}
            {sortedLines.length > 0 && (
              <Card className="border-purple-200/60 dark:border-purple-800/40">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 p-2 shadow-md shadow-purple-500/20">
                      <BarChart3 className="h-4 w-4 text-white" />
                    </div>
                    <h3 className="text-sm font-bold tracking-tight">CM Margin by Line</h3>
                  </div>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={sortedLines} layout="vertical" margin={{ left: 60, right: 20 }}>
                      <XAxis type="number" tickFormatter={(v) => `${v.toFixed(0)}%`} fontSize={10} />
                      <YAxis type="category" dataKey="lineName" fontSize={10} width={55} />
                      <Tooltip
                        formatter={(v: number) => [`${v.toFixed(1)}%`, "CM Margin"]}
                        contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid rgba(139,92,246,0.3)" }}
                      />
                      <Bar dataKey="cmMargin" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Margin Trend Section */}
      {marginTrend.length > 0 && (
        <motion.div variants={fadeUp} initial="hidden" animate="show">
          <Card className="border-purple-200/60 dark:border-purple-800/40">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 p-2 shadow-md shadow-violet-500/20">
                  <TrendingUp className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight">Margin Trend</h3>
                  <p className="text-[10px] text-muted-foreground">Last 6 months CM margin based on production actuals</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-6 gap-2 mb-4">
                {marginTrend.map((m) => (
                  <div key={m.label} className="text-center"><p className="text-[10px] text-muted-foreground">{m.label}</p><p className={cn("text-xs font-bold", marginColor(m.margin))}>{pct(m.margin)}</p><p className="text-[9px] text-muted-foreground">Rev: {sym}{fmt(m.revenue)}</p></div>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={marginTrend}>
                  <XAxis dataKey="label" fontSize={10} />
                  <YAxis tickFormatter={(v) => `${v}%`} fontSize={10} />
                  <Tooltip
                    formatter={(v: number, name: string) => [
                      name === "margin" ? `${v.toFixed(1)}%` : `${sym}${fmt(v)}`,
                      name === "margin" ? "Margin" : name === "revenue" ? "Revenue" : "Cost",
                    ]}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid rgba(139,92,246,0.3)" }}
                  />
                  <Line type="monotone" dataKey="margin" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 4, fill: "#8b5cf6" }} />
                  <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                  <Line type="monotone" dataKey="cost" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Headcount cost warning */}
      {!hcConfigured && (
        <motion.div variants={fadeUp} initial="hidden" animate="show">
          <div className="rounded-xl border border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-700/40 p-4 flex items-start gap-3">
            <Users className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Headcount cost not configured</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                CM cost calculations require a headcount cost rate. Go to Factory Setup to configure it.
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
