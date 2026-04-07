import { useState, useMemo, useCallback, useEffect } from "react";
import {
  FileText, Download, FileDown, Search, Calendar, Filter,
  Loader2, BarChart3, Landmark, Ship, AlertTriangle, DollarSign,
  Users, Clock, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableFooter,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { motion } from "framer-motion";
import { jsPDF } from "jspdf";
import { format, differenceInDays, parseISO, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  type MasterLC,
  type BtbLC,
  type LCBankingCost,
  type LCDiscrepancy,
  type LCShipment,
} from "@/hooks/useLCManagement";
import { cn } from "@/lib/utils";

// ── Report types ───────────────────────────────────────────────────────────

const REPORT_TYPES = [
  { key: "active_lc",       label: "Active LC Register",     icon: FileText },
  { key: "btb_lc",          label: "BTB LC Register",        icon: Ship },
  { key: "maturity",        label: "LC Maturity Schedule",   icon: Calendar },
  { key: "utilisation",     label: "LC Utilisation Report",  icon: BarChart3 },
  { key: "expired",         label: "Expired LC Report",      icon: Clock },
  { key: "discrepancy",     label: "Discrepancy Report",     icon: AlertTriangle },
  { key: "banking_cost",    label: "Banking Cost Summary",   icon: DollarSign },
  { key: "buyer_summary",   label: "Buyer-wise LC Summary",  icon: Users },
] as const;

type ReportType = typeof REPORT_TYPES[number]["key"];

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "\u2014";
  return format(parseISO(d), "dd MMM yyyy");
}
function fmtPct(n: number) {
  return `${Math.round(n * 100) / 100}%`;
}
function daysLeft(d: string | null | undefined): number {
  if (!d) return 0;
  return differenceInDays(parseISO(d), new Date());
}

// ── Data hook ──────────────────────────────────────────────────────────────

interface LCReportData {
  masterLCs: MasterLC[];
  btbLCs: BtbLC[];
  bankingCosts: LCBankingCost[];
  discrepancies: LCDiscrepancy[];
  loading: boolean;
}

function useLCReportData(): LCReportData {
  const { factory } = useAuth();
  const [masterLCs, setMasterLCs] = useState<MasterLC[]>([]);
  const [btbLCs, setBtbLCs] = useState<BtbLC[]>([]);
  const [bankingCosts, setBankingCosts] = useState<LCBankingCost[]>([]);
  const [discrepancies, setDiscrepancies] = useState<LCDiscrepancy[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!factory?.id) return;
    setLoading(true);

    const [mlcRes, btbRes, costRes, discRes] = await Promise.all([
      supabase.from("master_lcs" as any).select("*, lc_shipments(*), lc_discrepancies(*), lc_banking_costs(*)").eq("factory_id", factory.id).order("issue_date", { ascending: false }),
      supabase.from("btb_lcs" as any).select("*").eq("factory_id", factory.id).order("issue_date", { ascending: false }),
      supabase.from("lc_banking_costs" as any).select("*").eq("factory_id", factory.id),
      supabase.from("lc_discrepancies" as any).select("*"),
    ]);

    if (mlcRes.error) toast.error("Failed to load Master LCs");
    if (btbRes.error) toast.error("Failed to load BTB LCs");

    setMasterLCs((mlcRes.data as unknown as MasterLC[]) ?? []);
    setBtbLCs((btbRes.data as unknown as BtbLC[]) ?? []);
    setBankingCosts((costRes.data as unknown as LCBankingCost[]) ?? []);
    setDiscrepancies((discRes.data as unknown as LCDiscrepancy[]) ?? []);
    setLoading(false);
  }, [factory?.id]);

  useEffect(() => { fetch(); }, [fetch]);
  return { masterLCs, btbLCs, bankingCosts, discrepancies, loading };
}

// ── STATUS configs ─────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  received: "Received", advised: "Advised", confirmed: "Confirmed",
  partially_shipped: "Part Shipped", fully_shipped: "Fully Shipped",
  expired: "Expired", cancelled: "Cancelled", closed: "Closed",
  opened: "Opened", docs_received: "Docs Received", accepted: "Accepted",
  matured: "Matured", paid: "Paid",
};

// ── PDF helper ─────────────────────────────────────────────────────────────

function createPdf(title: string, orientation: "portrait" | "landscape" = "landscape") {
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ml = 10;
  let y = 15;

  // Header bar
  doc.setFillColor(109, 40, 217); // violet-600
  doc.rect(0, 0, pw, 12, "F");
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(title, ml, 8);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`, pw - ml, 8, { align: "right" });
  y = 18;

  doc.setTextColor(0, 0, 0);
  return { doc, pw, ml, y };
}

function pdfTable(
  doc: jsPDF, headers: string[], rows: string[][], startY: number,
  ml: number, pw: number, colWidths?: number[]
): number {
  const cw = pw - ml * 2;
  const numCols = headers.length;
  const widths = colWidths ?? headers.map(() => cw / numCols);
  const rh = 5;
  let y = startY;

  // Header row
  doc.setFillColor(243, 232, 255); // violet-100
  doc.rect(ml, y, cw, rh + 1, "F");
  doc.setFontSize(6);
  doc.setFont("helvetica", "bold");
  let x = ml + 1;
  headers.forEach((h, i) => {
    doc.text(h, x, y + 3.5);
    x += widths[i];
  });
  y += rh + 2;

  // Data rows
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  rows.forEach((row, ri) => {
    if (y > doc.internal.pageSize.getHeight() - 15) {
      doc.addPage();
      y = 15;
    }
    if (ri % 2 === 0) {
      doc.setFillColor(250, 250, 250);
      doc.rect(ml, y - 1, cw, rh, "F");
    }
    x = ml + 1;
    row.forEach((cell, ci) => {
      const maxW = widths[ci] - 2;
      const text = doc.splitTextToSize(cell, maxW)[0] ?? "";
      doc.text(text, x, y + 2.5);
      x += widths[ci];
    });
    y += rh;
  });

  return y;
}

// ── CSV helper ─────────────────────────────────────────────────────────────

function downloadCsv(headers: string[], rows: string[][], filename: string) {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [
    headers.map(escape).join(","),
    ...rows.map((r) => r.map(escape).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Report data builders ───────────────────────────────────────────────────

function buildActiveLCData(lcs: MasterLC[], dateFrom: string, dateTo: string, buyerFilter: string, statusFilter: string) {
  const headers = ["LC#", "Buyer", "Value", "Currency", "Issue Date", "Expiry Date", "Latest Shipment", "Utilized%", "Remaining", "Status", "Days Left"];
  const active = lcs.filter((lc) => !["expired", "cancelled", "closed"].includes(lc.status));
  const filtered = applyFilters(active, dateFrom, dateTo, buyerFilter, statusFilter);
  const rows = filtered.map((lc) => {
    const shipments = lc.lc_shipments ?? [];
    const drawn = shipments.reduce((s, sh) => s + (sh.invoice_value ?? 0), 0);
    const utilPct = lc.lc_value > 0 ? (drawn / lc.lc_value) * 100 : 0;
    const remaining = lc.lc_value - drawn;
    const dl = daysLeft(lc.expiry_date);
    return [
      lc.lc_number, lc.buyer_name, fmt(lc.lc_value), lc.currency,
      fmtDate(lc.issue_date), fmtDate(lc.expiry_date), fmtDate(lc.latest_shipment_date),
      fmtPct(utilPct), fmt(remaining), STATUS_LABELS[lc.status] ?? lc.status,
      dl.toString(),
    ];
  });
  return { headers, rows, filtered };
}

function buildBtbLCData(btbLcs: BtbLC[], masterLCs: MasterLC[], dateFrom: string, dateTo: string, buyerFilter: string, statusFilter: string) {
  const headers = ["BTB LC#", "Supplier", "Purpose", "Value", "Master LC#", "Issue Date", "Maturity Date", "Status", "Days to Maturity"];
  const masterMap = new Map(masterLCs.map((m) => [m.id, m.lc_number]));
  let filtered = btbLcs;
  if (dateFrom) filtered = filtered.filter((b) => b.issue_date >= dateFrom);
  if (dateTo) filtered = filtered.filter((b) => b.issue_date <= dateTo);
  if (statusFilter) filtered = filtered.filter((b) => b.status === statusFilter);
  const rows = filtered.map((b) => {
    const dtm = b.maturity_date ? daysLeft(b.maturity_date) : 0;
    return [
      b.lc_number, b.supplier_name, b.purpose, fmt(b.lc_value),
      masterMap.get(b.master_lc_id ?? "") ?? "\u2014",
      fmtDate(b.issue_date), fmtDate(b.maturity_date),
      STATUS_LABELS[b.status] ?? b.status, dtm.toString(),
    ];
  });
  return { headers, rows, filtered };
}

function buildMaturitySchedule(btbLcs: BtbLC[], masterLCs: MasterLC[]) {
  const headers = ["Week", "BTB LC#", "Supplier", "Value", "Currency", "Maturity Date", "Master LC#", "Status"];
  const masterMap = new Map(masterLCs.map((m) => [m.id, m.lc_number]));
  const withMaturity = btbLcs
    .filter((b) => b.maturity_date && !["paid", "cancelled"].includes(b.status))
    .sort((a, b) => (a.maturity_date ?? "").localeCompare(b.maturity_date ?? ""));

  const rows = withMaturity.map((b) => {
    const d = parseISO(b.maturity_date!);
    const ws = format(startOfWeek(d, { weekStartsOn: 1 }), "dd MMM");
    const we = format(endOfWeek(d, { weekStartsOn: 1 }), "dd MMM yyyy");
    return [
      `${ws} - ${we}`, b.lc_number, b.supplier_name, fmt(b.lc_value),
      b.currency, fmtDate(b.maturity_date),
      masterMap.get(b.master_lc_id ?? "") ?? "\u2014",
      STATUS_LABELS[b.status] ?? b.status,
    ];
  });
  return { headers, rows };
}

function buildUtilisationReport(lcs: MasterLC[]) {
  const headers = ["LC#", "Buyer", "LC Value", "Drawn", "Remaining", "Tolerance%", "Max Drawable", "Shipments", "Utilized%"];
  const rows = lcs.map((lc) => {
    const shipments = lc.lc_shipments ?? [];
    const drawn = shipments.reduce((s, sh) => s + (sh.invoice_value ?? 0), 0);
    const maxDrawable = lc.lc_value * (1 + (lc.tolerance_pct ?? 0) / 100);
    const remaining = maxDrawable - drawn;
    const utilPct = lc.lc_value > 0 ? (drawn / lc.lc_value) * 100 : 0;
    return [
      lc.lc_number, lc.buyer_name, fmt(lc.lc_value), fmt(drawn),
      fmt(remaining), `${lc.tolerance_pct}%`, fmt(maxDrawable),
      shipments.length.toString(), fmtPct(utilPct),
    ];
  });
  return { headers, rows };
}

function buildExpiredReport(lcs: MasterLC[]) {
  const headers = ["LC#", "Buyer", "Original Value", "Utilized Value", "Unused Value", "Currency", "Expiry Date", "Status", "Reason"];
  const expired = lcs.filter((lc) => lc.status === "expired" || (lc.expiry_date && parseISO(lc.expiry_date) < new Date()));
  const rows = expired.map((lc) => {
    const drawn = (lc.lc_shipments ?? []).reduce((s, sh) => s + (sh.invoice_value ?? 0), 0);
    const unused = lc.lc_value - drawn;
    const reason = drawn === 0 ? "No shipments made" : drawn < lc.lc_value ? "Partially utilized" : "Fully utilized";
    return [
      lc.lc_number, lc.buyer_name, fmt(lc.lc_value), fmt(drawn),
      fmt(unused), lc.currency, fmtDate(lc.expiry_date),
      STATUS_LABELS[lc.status] ?? lc.status, reason,
    ];
  });
  return { headers, rows };
}

function buildDiscrepancyReport(lcs: MasterLC[]) {
  const headers = ["LC#", "Buyer", "Discrepancy Count", "Resolved", "Pending", "Resolution Rate", "Avg Resolution Days", "Bank Charges"];
  const rows = lcs
    .filter((lc) => (lc.lc_discrepancies ?? []).length > 0)
    .map((lc) => {
      const discs = lc.lc_discrepancies ?? [];
      const resolved = discs.filter((d) => d.status === "resolved");
      const pending = discs.filter((d) => d.status === "pending");
      const rate = discs.length > 0 ? (resolved.length / discs.length) * 100 : 0;
      const avgDays = resolved.length > 0
        ? resolved.reduce((s, d) => {
            if (d.resolution_date && d.notice_date) {
              return s + differenceInDays(parseISO(d.resolution_date), parseISO(d.notice_date));
            }
            return s;
          }, 0) / resolved.length
        : 0;
      const charges = discs.reduce((s, d) => s + (d.bank_charges ?? 0), 0);
      return [
        lc.lc_number, lc.buyer_name, discs.length.toString(),
        resolved.length.toString(), pending.length.toString(),
        fmtPct(rate), Math.round(avgDays).toString(), fmt(charges),
      ];
    });
  return { headers, rows };
}

function buildBankingCostSummary(costs: LCBankingCost[], lcs: MasterLC[]) {
  const headers = ["Cost Type", "Count", "Total Amount", "Currency", "Per-LC Average"];
  const grouped = new Map<string, { count: number; total: number; currency: string }>();
  costs.forEach((c) => {
    const key = c.cost_type;
    const existing = grouped.get(key) ?? { count: 0, total: 0, currency: c.currency };
    existing.count += 1;
    existing.total += c.amount;
    grouped.set(key, existing);
  });
  const lcCount = Math.max(1, lcs.length);
  const rows: string[][] = [];
  let grandTotal = 0;
  grouped.forEach((val, key) => {
    grandTotal += val.total;
    rows.push([
      key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      val.count.toString(), fmt(val.total), val.currency, fmt(val.total / lcCount),
    ]);
  });
  // Grand total row
  rows.push(["GRAND TOTAL", "", fmt(grandTotal), "", fmt(grandTotal / lcCount)]);
  return { headers, rows };
}

function buildBuyerSummary(lcs: MasterLC[]) {
  const headers = ["Buyer", "LC Count", "Total Value", "Currency", "Avg Usance Days", "Discrepancy Rate", "Avg Days to Payment"];
  const grouped = new Map<string, MasterLC[]>();
  lcs.forEach((lc) => {
    const arr = grouped.get(lc.buyer_name) ?? [];
    arr.push(lc);
    grouped.set(lc.buyer_name, arr);
  });
  const rows: string[][] = [];
  grouped.forEach((buyerLCs, buyer) => {
    const totalValue = buyerLCs.reduce((s, lc) => s + lc.lc_value, 0);
    const avgUsance = buyerLCs.reduce((s, lc) => s + (lc.tenor_days ?? 0), 0) / buyerLCs.length;
    const totalDiscs = buyerLCs.reduce((s, lc) => s + (lc.lc_discrepancies?.length ?? 0), 0);
    const totalShipments = buyerLCs.reduce((s, lc) => s + (lc.lc_shipments?.length ?? 0), 0);
    const discRate = totalShipments > 0 ? (totalDiscs / totalShipments) * 100 : 0;
    // Avg days to payment
    let payDays = 0;
    let payCount = 0;
    buyerLCs.forEach((lc) => {
      (lc.lc_shipments ?? []).forEach((sh) => {
        if (sh.payment_received_date && sh.docs_submitted_date) {
          payDays += differenceInDays(parseISO(sh.payment_received_date), parseISO(sh.docs_submitted_date));
          payCount++;
        }
      });
    });
    const avgPayDays = payCount > 0 ? Math.round(payDays / payCount) : 0;
    const currency = buyerLCs[0]?.currency ?? "USD";
    rows.push([
      buyer, buyerLCs.length.toString(), fmt(totalValue), currency,
      Math.round(avgUsance).toString(), fmtPct(discRate), avgPayDays.toString(),
    ]);
  });
  return { headers, rows };
}

// ── Filter helper ──────────────────────────────────────────────────────────

function applyFilters(lcs: MasterLC[], dateFrom: string, dateTo: string, buyerFilter: string, statusFilter: string): MasterLC[] {
  let filtered = lcs;
  if (dateFrom) filtered = filtered.filter((lc) => lc.issue_date >= dateFrom);
  if (dateTo) filtered = filtered.filter((lc) => lc.issue_date <= dateTo);
  if (buyerFilter) {
    const q = buyerFilter.toLowerCase();
    filtered = filtered.filter((lc) => lc.buyer_name.toLowerCase().includes(q));
  }
  if (statusFilter) {
    filtered = filtered.filter((lc) => lc.status === statusFilter);
  }
  return filtered;
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function LCReports() {
  const { masterLCs, btbLCs, bankingCosts, discrepancies, loading } = useLCReportData();
  const [reportType, setReportType] = useState<ReportType>("active_lc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [buyerFilter, setBuyerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [exporting, setExporting] = useState(false);

  // Build current report
  const { headers, rows } = useMemo(() => {
    switch (reportType) {
      case "active_lc":
        return buildActiveLCData(masterLCs, dateFrom, dateTo, buyerFilter, statusFilter);
      case "btb_lc":
        return buildBtbLCData(btbLCs, masterLCs, dateFrom, dateTo, buyerFilter, statusFilter);
      case "maturity":
        return buildMaturitySchedule(btbLCs, masterLCs);
      case "utilisation":
        return buildUtilisationReport(applyFilters(masterLCs, dateFrom, dateTo, buyerFilter, statusFilter));
      case "expired":
        return buildExpiredReport(masterLCs);
      case "discrepancy":
        return buildDiscrepancyReport(applyFilters(masterLCs, dateFrom, dateTo, buyerFilter, statusFilter));
      case "banking_cost":
        return buildBankingCostSummary(bankingCosts, masterLCs);
      case "buyer_summary":
        return buildBuyerSummary(applyFilters(masterLCs, dateFrom, dateTo, buyerFilter, statusFilter));
      default:
        return { headers: [], rows: [] };
    }
  }, [reportType, masterLCs, btbLCs, bankingCosts, discrepancies, dateFrom, dateTo, buyerFilter, statusFilter]);

  const reportLabel = REPORT_TYPES.find((r) => r.key === reportType)?.label ?? "Report";

  // ── Export PDF ─────────────────────────────────────────────────────────

  const handleExportPdf = () => {
    setExporting(true);
    try {
      const { doc, pw, ml, y } = createPdf(reportLabel, headers.length > 7 ? "landscape" : "portrait");

      // Title
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(reportLabel, ml, y + 2);

      const colWidths = headers.map((_, i) => {
        const totalW = pw - ml * 2;
        return totalW / headers.length;
      });
      pdfTable(doc, headers, rows, y + 6, ml, pw, colWidths);

      // Footer
      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFontSize(6);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(150, 150, 150);
        doc.text(
          `Page ${i} of ${pages}`,
          pw / 2, doc.internal.pageSize.getHeight() - 5,
          { align: "center" }
        );
      }

      doc.save(`${reportType}-report-${format(new Date(), "yyyy-MM-dd")}.pdf`);
      toast.success("PDF exported");
    } catch (e: any) {
      toast.error("Failed to export PDF", { description: e.message });
    } finally {
      setExporting(false);
    }
  };

  // ── Export CSV ─────────────────────────────────────────────────────────

  const handleExportCsv = () => {
    downloadCsv(headers, rows, `${reportType}-report-${format(new Date(), "yyyy-MM-dd")}.csv`);
    toast.success("CSV exported");
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0">
            <BarChart3 className="h-5 w-5 text-purple-500" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">LC Reports</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {masterLCs.length} master LCs &middot; {btbLCs.length} BTB LCs
            </p>
          </div>
        </div>

        {/* Export buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline" size="sm"
            onClick={handleExportCsv}
            disabled={loading || rows.length === 0}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export CSV
          </Button>
          <Button
            size="sm"
            className="bg-purple-600 hover:bg-purple-700 text-white"
            onClick={handleExportPdf}
            disabled={loading || rows.length === 0 || exporting}
          >
            {exporting
              ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              : <FileDown className="h-3.5 w-3.5 mr-1.5" />}
            Export PDF
          </Button>
        </div>
      </div>

      {/* Report type selector */}
      <div className="flex gap-1.5 flex-wrap">
        {REPORT_TYPES.map((rt) => {
          const Icon = rt.icon;
          const active = reportType === rt.key;
          return (
            <button
              key={rt.key}
              onClick={() => setReportType(rt.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                active
                  ? "bg-purple-600 text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
            >
              <Icon className="h-3 w-3" />
              <span className="hidden sm:inline">{rt.label}</span>
              <span className="sm:hidden">{rt.label.split(" ")[0]}</span>
            </button>
          );
        })}
      </div>

      {/* Filters bar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex gap-2 flex-1">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 text-sm w-[140px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 text-sm w-[140px]"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Buyer</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Filter buyer..."
                value={buyerFilter}
                onChange={(e) => setBuyerFilter(e.target.value)}
                className="h-9 text-sm pl-8 w-[180px]"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Input
              placeholder="e.g. confirmed"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 text-sm w-[140px]"
            />
          </div>
        </div>
      </div>

      {/* Report viewer */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}
        </div>
      ) : rows.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 text-center"
        >
          <FileText className="h-12 w-12 text-muted-foreground/20 mb-4" />
          <p className="font-medium text-muted-foreground">No data for this report</p>
          <p className="text-sm text-muted-foreground mt-1">Try adjusting your filters or selecting a different report type</p>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-xl border border-border overflow-hidden"
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  {headers.map((h) => (
                    <TableHead key={h} className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, ri) => {
                  const isTotal = row[0] === "GRAND TOTAL";
                  return (
                    <TableRow
                      key={ri}
                      className={cn(
                        "hover:bg-muted/20",
                        isTotal && "bg-purple-500/5 font-semibold"
                      )}
                    >
                      {row.map((cell, ci) => (
                        <TableCell
                          key={ci}
                          className={cn(
                            "text-sm whitespace-nowrap",
                            ci === 0 && "font-mono text-purple-400 font-medium"
                          )}
                        >
                          {cell}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={headers.length} className="text-xs text-muted-foreground">
                    {rows.length} row{rows.length !== 1 ? "s" : ""} &middot; {reportLabel}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </motion.div>
      )}
    </div>
  );
}
