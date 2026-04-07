import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Ship, Search, Plus, Pencil, Trash2, Download, FileText,
  DollarSign, AlertCircle, CheckCircle2, Clock,
  ChevronUp, ChevronDown, TrendingUp, Anchor,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { motion } from "framer-motion";
import { jsPDF } from "jspdf";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  useExportCosts,
  useExportCostMutations,
  useExportCostSummary,
  type ExportCost,
  type ExportCostInsert,
  type ExportCostFilters,
} from "@/hooks/useExportCosts";

// ── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: "cnf", label: "C&F Charges" },
  { value: "freight", label: "Freight" },
  { value: "port", label: "Port Charges" },
  { value: "transport", label: "Transport" },
  { value: "testing", label: "Testing" },
  { value: "inspection", label: "Inspection" },
  { value: "courier", label: "Courier" },
  { value: "insurance", label: "Insurance" },
  { value: "documentation", label: "Documentation" },
  { value: "certification", label: "Certification" },
  { value: "customs", label: "Customs" },
  { value: "warehousing", label: "Warehousing" },
  { value: "other", label: "Other" },
] as const;

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.label])
);

const CATEGORY_BADGE: Record<string, string> = {
  cnf: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  freight: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  port: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  transport: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  testing: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  inspection: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  courier: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  insurance: "bg-green-500/10 text-green-400 border-green-500/20",
  documentation: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  certification: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  customs: "bg-red-500/10 text-red-400 border-red-500/20",
  warehousing: "bg-stone-500/10 text-stone-400 border-stone-500/20",
  other: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

const PAYMENT_BADGE: Record<string, string> = {
  unpaid: "bg-red-500/10 text-red-400 border-red-500/20",
  paid: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  partial: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

const CURRENCIES = ["USD", "BDT", "EUR", "GBP"] as const;

const PIE_COLORS = ["#22c55e", "#ef4444", "#f59e0b"];

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtDate(d: string | null) {
  if (!d) return "-";
  return format(new Date(d), "dd MMM yyyy");
}

type SortKey = "date_incurred" | "amount" | "category";
type SortDir = "asc" | "desc";

// ── Empty form state ─────────────────────────────────────────────────────────

function emptyForm(): ExportCostInsert {
  return {
    category: "cnf",
    description: "",
    vendor_name: null,
    amount: 0,
    currency: "USD",
    exchange_rate: 1,
    date_incurred: new Date().toISOString().slice(0, 10),
    shipment_ref: null,
    bl_number: null,
    invoice_ref: null,
    work_order_id: null,
    contract_id: null,
    lc_id: null,
    payment_status: "unpaid",
    payment_date: null,
    payment_reference: null,
    remarks: null,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Component ────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

export default function ExportCosts() {
  const { factory } = useAuth();

  // ── Filters ──────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterPayment, setFilterPayment] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterWorkOrder, setFilterWorkOrder] = useState("all");

  const apiFilters = useMemo<ExportCostFilters>(() => ({
    category: filterCategory !== "all" ? filterCategory : undefined,
    dateFrom: filterDateFrom || undefined,
    dateTo: filterDateTo || undefined,
    workOrderId: filterWorkOrder !== "all" ? filterWorkOrder : undefined,
    paymentStatus: filterPayment !== "all" ? filterPayment : undefined,
  }), [filterCategory, filterDateFrom, filterDateTo, filterWorkOrder, filterPayment]);

  const { costs, loading, refetch } = useExportCosts(apiFilters);
  const { createCost, updateCost, updatePaymentStatus, deleteCost, saving } = useExportCostMutations();
  const { categoryTotals, paymentSummary, monthlyTotals, grandTotal, loading: summaryLoading, refetch: refetchSummary } = useExportCostSummary();

  // ── Dropdowns data ───────────────────────────────────────────────────────
  const [workOrders, setWorkOrders] = useState<{ id: string; po_number: string }[]>([]);
  const [salesContracts, setSalesContracts] = useState<{ id: string; contract_number: string }[]>([]);
  const [masterLCs, setMasterLCs] = useState<{ id: string; lc_number: string }[]>([]);

  useEffect(() => {
    if (!factory?.id) return;
    supabase
      .from("work_orders")
      .select("id, po_number")
      .eq("factory_id", factory.id)
      .eq("is_active", true)
      .order("po_number")
      .then(({ data }) => setWorkOrders((data as any[]) ?? []));

    supabase
      .from("sales_contracts" as any)
      .select("id, contract_number")
      .eq("factory_id", factory.id)
      .order("contract_number")
      .then(({ data }) => setSalesContracts((data as any[]) ?? []));

    supabase
      .from("master_lcs" as any)
      .select("id, lc_number")
      .eq("factory_id", factory.id)
      .order("lc_number")
      .then(({ data }) => setMasterLCs((data as any[]) ?? []));
  }, [factory?.id]);

  // ── Dialog state ─────────────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ExportCostInsert>(emptyForm);

  // ── Delete state ─────────────────────────────────────────────────────────
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // ── Sort state ───────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey>("date_incurred");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col
      ? sortDir === "asc" ? <ChevronUp className="h-3 w-3 inline ml-1" /> : <ChevronDown className="h-3 w-3 inline ml-1" />
      : null;

  // ── Filtered + sorted costs ──────────────────────────────────────────────
  const filteredCosts = useMemo(() => {
    let list = costs ?? [];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          (c.description ?? "").toLowerCase().includes(q) ||
          (c.vendor_name ?? "").toLowerCase().includes(q) ||
          (c.shipment_ref ?? "").toLowerCase().includes(q) ||
          (c.bl_number ?? "").toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date_incurred") cmp = a.date_incurred.localeCompare(b.date_incurred);
      else if (sortKey === "amount") cmp = a.amount - b.amount;
      else if (sortKey === "category") cmp = a.category.localeCompare(b.category);
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [costs, search, sortKey, sortDir]);

  // ── KPI computations ────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const all = costs ?? [];
    const nowMonth = new Date().toISOString().slice(0, 7);
    let total = 0, unpaid = 0, paidThisMonth = 0, cnf = 0, freight = 0, otherCat = 0;
    for (const c of all) {
      const val = c.amount * (c.exchange_rate || 1);
      total += val;
      if (c.payment_status === "unpaid") unpaid += val;
      if (c.payment_status === "paid" && c.payment_date?.startsWith(nowMonth)) paidThisMonth += val;
      if (c.category === "cnf") cnf += val;
      else if (c.category === "freight") freight += val;
      else otherCat += val;
    }
    return { total, unpaid, paidThisMonth, cnf, freight, otherCat };
  }, [costs]);

  // ── PO map for display ──────────────────────────────────────────────────
  const poMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const wo of workOrders ?? []) m[wo.id] = wo.po_number;
    return m;
  }, [workOrders]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(cost: ExportCost) {
    setEditingId(cost.id);
    setForm({
      category: cost.category,
      description: cost.description,
      vendor_name: cost.vendor_name,
      amount: cost.amount,
      currency: cost.currency,
      exchange_rate: cost.exchange_rate,
      date_incurred: cost.date_incurred,
      shipment_ref: cost.shipment_ref,
      bl_number: cost.bl_number,
      invoice_ref: cost.invoice_ref,
      work_order_id: cost.work_order_id,
      contract_id: cost.contract_id,
      lc_id: cost.lc_id,
      payment_status: cost.payment_status,
      payment_date: cost.payment_date,
      payment_reference: cost.payment_reference,
      remarks: cost.remarks,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.description.trim()) {
      toast.error("Description is required");
      return;
    }
    if (!form.amount || form.amount <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }

    if (editingId) {
      const ok = await updateCost(editingId, form);
      if (ok) {
        setDialogOpen(false);
        refetch();
        refetchSummary();
      }
    } else {
      const result = await createCost(form);
      if (result) {
        setDialogOpen(false);
        refetch();
        refetchSummary();
      }
    }
  }

  async function handleStatusChange(id: string, status: "unpaid" | "paid" | "partial") {
    const ok = await updatePaymentStatus(id, status);
    if (ok) {
      refetch();
      refetchSummary();
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    const ok = await deleteCost(deleteId);
    if (ok) {
      setDeleteId(null);
      refetch();
      refetchSummary();
    }
  }

  // ── CSV Export ───────────────────────────────────────────────────────────

  function exportCSV() {
    const rows = filteredCosts ?? [];
    if (rows.length === 0) { toast.error("No data to export"); return; }
    const headers = [
      "Date", "Category", "Description", "Vendor", "Amount", "Currency",
      "Exchange Rate", "Shipment Ref", "BL Number", "Invoice Ref",
      "PO", "Payment Status", "Payment Date", "Payment Reference", "Remarks",
    ];
    const csvRows = [headers.join(",")];
    for (const c of rows) {
      csvRows.push([
        c.date_incurred,
        CATEGORY_LABEL[c.category] ?? c.category,
        `"${(c.description ?? "").replace(/"/g, '""')}"`,
        `"${(c.vendor_name ?? "").replace(/"/g, '""')}"`,
        c.amount,
        c.currency,
        c.exchange_rate,
        c.shipment_ref ?? "",
        c.bl_number ?? "",
        c.invoice_ref ?? "",
        c.work_order_id ? (poMap[c.work_order_id] ?? c.work_order_id) : "",
        c.payment_status,
        c.payment_date ?? "",
        c.payment_reference ?? "",
        `"${(c.remarks ?? "").replace(/"/g, '""')}"`,
      ].join(","));
    }
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `export-costs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  }

  // ── PDF Export ──────────────────────────────────────────────────────────

  function exportPDF() {
    const rows = filteredCosts ?? [];
    if (rows.length === 0) { toast.error("No data to export"); return; }
    const doc = new jsPDF({ orientation: "landscape" });
    const purple = [107, 33, 168] as const;
    doc.setFillColor(...purple);
    doc.rect(0, 0, 297, 20, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.text("Export Costs Report", 10, 13);
    doc.setFontSize(8);
    doc.text(`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`, 220, 13);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text(`Total Costs: $${fmt(kpis.total)}`, 10, 30);
    doc.text(`Unpaid: $${fmt(kpis.unpaid)}`, 80, 30);
    doc.text(`Records: ${rows.length}`, 150, 30);

    const colX = [10, 35, 65, 115, 145, 165, 185, 215, 245];
    const colHeaders = ["Date", "Category", "Description", "Vendor", "Amount", "Currency", "Status", "Shipment", "BL#"];
    let y = 40;
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    colHeaders.forEach((h, i) => doc.text(h, colX[i], y));
    y += 5;
    doc.setFont("helvetica", "normal");

    for (const c of rows) {
      if (y > 190) {
        doc.addPage();
        y = 15;
        doc.setFont("helvetica", "bold");
        colHeaders.forEach((h, i) => doc.text(h, colX[i], y));
        y += 5;
        doc.setFont("helvetica", "normal");
      }
      doc.text(c.date_incurred, colX[0], y);
      doc.text((CATEGORY_LABEL[c.category] ?? c.category).slice(0, 14), colX[1], y);
      doc.text((c.description ?? "").slice(0, 30), colX[2], y);
      doc.text((c.vendor_name ?? "").slice(0, 18), colX[3], y);
      doc.text(fmt(c.amount), colX[4], y);
      doc.text(c.currency, colX[5], y);
      doc.text(c.payment_status, colX[6], y);
      doc.text((c.shipment_ref ?? "").slice(0, 18), colX[7], y);
      doc.text((c.bl_number ?? "").slice(0, 16), colX[8], y);
      y += 5;
    }

    doc.save(`export-costs-${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success("PDF exported");
  }

  // ── Chart data ──────────────────────────────────────────────────────────

  const topCategories = useMemo(() => (categoryTotals ?? []).slice(0, 6), [categoryTotals]);
  const pieData = useMemo(() => [
    { name: "Paid", value: paymentSummary?.paid ?? 0 },
    { name: "Unpaid", value: paymentSummary?.unpaid ?? 0 },
    { name: "Partial", value: paymentSummary?.partial ?? 0 },
  ].filter((d) => d.value > 0), [paymentSummary]);

  // ══════════════════════════════════════════════════════════════════════════
  // ── Render ─────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-6">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Ship className="h-6 w-6 text-purple-400" />
            <h1 className="text-2xl font-bold">Export Costs</h1>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            C&amp;F, BL fees, inspection, insurance per shipment
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportPDF}>
            <FileText className="h-4 w-4 mr-1" /> Export PDF
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" /> Add Cost
          </Button>
        </div>
      </div>

      {/* ── KPI Cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Total Costs", value: kpis.total, icon: DollarSign, color: "text-purple-400" },
          { label: "Unpaid", value: kpis.unpaid, icon: AlertCircle, color: "text-red-400" },
          { label: "Paid This Month", value: kpis.paidThisMonth, icon: CheckCircle2, color: "text-emerald-400" },
          { label: "C&F Charges", value: kpis.cnf, icon: Ship, color: "text-purple-400" },
          { label: "Freight", value: kpis.freight, icon: Anchor, color: "text-blue-400" },
          { label: "Other Costs", value: kpis.otherCat, icon: TrendingUp, color: "text-amber-400" },
        ].map((kpi) => (
          <motion.div key={kpi.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">{kpi.label}</span>
                  <kpi.icon className={cn("h-4 w-4", kpi.color)} />
                </div>
                <p className="text-lg font-bold">${fmt(kpi.value)}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger><SelectValue placeholder="All Categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterPayment} onValueChange={setFilterPayment}>
              <SelectTrigger><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              placeholder="From"
            />
            <Input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              placeholder="To"
            />
            <Select value={filterWorkOrder} onValueChange={setFilterWorkOrder}>
              <SelectTrigger><SelectValue placeholder="All POs" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All POs</SelectItem>
                {(workOrders ?? []).map((wo) => (
                  <SelectItem key={wo.id} value={wo.id}>{wo.po_number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (filteredCosts ?? []).length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              No export costs found. Click &quot;Add Cost&quot; to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer whitespace-nowrap" onClick={() => toggleSort("date_incurred")}>
                      Date <SortIcon col="date_incurred" />
                    </TableHead>
                    <TableHead className="cursor-pointer whitespace-nowrap" onClick={() => toggleSort("category")}>
                      Category <SortIcon col="category" />
                    </TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="cursor-pointer whitespace-nowrap text-right" onClick={() => toggleSort("amount")}>
                      Amount <SortIcon col="amount" />
                    </TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead>Shipment / BL</TableHead>
                    <TableHead>PO</TableHead>
                    <TableHead>Payment Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(filteredCosts ?? []).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="whitespace-nowrap">{fmtDate(c.date_incurred)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-xs", CATEGORY_BADGE[c.category] ?? CATEGORY_BADGE.other)}>
                          {CATEGORY_LABEL[c.category] ?? c.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{c.description}</TableCell>
                      <TableCell>{c.vendor_name ?? "-"}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(c.amount)}</TableCell>
                      <TableCell>{c.currency}</TableCell>
                      <TableCell className="text-xs">
                        {c.shipment_ref ?? "-"}
                        {c.bl_number ? ` / ${c.bl_number}` : ""}
                      </TableCell>
                      <TableCell className="text-xs">
                        {c.work_order_id ? (poMap[c.work_order_id] ?? "-") : "-"}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={c.payment_status}
                          onValueChange={(val) => handleStatusChange(c.id, val as "unpaid" | "paid" | "partial")}
                        >
                          <SelectTrigger className="h-7 w-[100px]">
                            <Badge variant="outline" className={cn("text-xs", PAYMENT_BADGE[c.payment_status])}>
                              {c.payment_status}
                            </Badge>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unpaid">Unpaid</SelectItem>
                            <SelectItem value="paid">Paid</SelectItem>
                            <SelectItem value="partial">Partial</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(c.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Summary Charts ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Cost by category */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Cost by Category (Top 6)</CardTitle>
          </CardHeader>
          <CardContent>
            {(topCategories ?? []).length === 0 ? (
              <p className="text-muted-foreground text-xs text-center py-8">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topCategories} layout="vertical" margin={{ left: 60, right: 10, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} fontSize={10} />
                  <YAxis
                    type="category"
                    dataKey="category"
                    tickFormatter={(v: string) => CATEGORY_LABEL[v] ?? v}
                    fontSize={10}
                    width={55}
                  />
                  <Tooltip formatter={(v: number) => `$${fmt(v)}`} />
                  <Bar dataKey="total" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Paid vs Unpaid pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Paid vs Unpaid</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            {(pieData ?? []).length === 0 ? (
              <p className="text-muted-foreground text-xs text-center py-8">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    fontSize={10}
                  >
                    {(pieData ?? []).map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => `$${fmt(v)}`} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Monthly trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Monthly Trend (Last 6 Months)</CardTitle>
          </CardHeader>
          <CardContent>
            {(monthlyTotals ?? []).length === 0 ? (
              <p className="text-muted-foreground text-xs text-center py-8">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyTotals} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis dataKey="month" fontSize={10} />
                  <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} fontSize={10} />
                  <Tooltip formatter={(v: number) => `$${fmt(v)}`} />
                  <Bar dataKey="total" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Add / Edit Dialog ────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Export Cost" : "Add Export Cost"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Update the details of this export cost." : "Record a new export cost entry."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            {/* Category */}
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label>Description *</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="e.g. C&F agent fee for shipment #12"
              />
            </div>

            {/* Vendor */}
            <div className="space-y-1.5">
              <Label>Vendor Name</Label>
              <Input
                value={form.vendor_name ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, vendor_name: e.target.value || null }))}
                placeholder="e.g. ABC Logistics"
              />
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <Label>Amount *</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={form.amount || ""}
                onChange={(e) => setForm((f) => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
              />
            </div>

            {/* Currency */}
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Exchange Rate */}
            <div className="space-y-1.5">
              <Label>Exchange Rate</Label>
              <Input
                type="number"
                min={0}
                step={0.0001}
                value={form.exchange_rate || ""}
                onChange={(e) => setForm((f) => ({ ...f, exchange_rate: parseFloat(e.target.value) || 1 }))}
              />
            </div>

            {/* Date Incurred */}
            <div className="space-y-1.5">
              <Label>Date Incurred *</Label>
              <Input
                type="date"
                value={form.date_incurred}
                onChange={(e) => setForm((f) => ({ ...f, date_incurred: e.target.value }))}
              />
            </div>

            {/* Shipment Ref */}
            <div className="space-y-1.5">
              <Label>Shipment Reference</Label>
              <Input
                value={form.shipment_ref ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, shipment_ref: e.target.value || null }))}
              />
            </div>

            {/* BL Number */}
            <div className="space-y-1.5">
              <Label>BL Number</Label>
              <Input
                value={form.bl_number ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, bl_number: e.target.value || null }))}
              />
            </div>

            {/* Invoice Ref */}
            <div className="space-y-1.5">
              <Label>Invoice Reference</Label>
              <Input
                value={form.invoice_ref ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, invoice_ref: e.target.value || null }))}
              />
            </div>

            {/* Work Order */}
            <div className="space-y-1.5">
              <Label>Work Order / PO</Label>
              <Select
                value={form.work_order_id ?? "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, work_order_id: v === "none" ? null : v }))}
              >
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {(workOrders ?? []).map((wo) => (
                    <SelectItem key={wo.id} value={wo.id}>{wo.po_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sales Contract */}
            <div className="space-y-1.5">
              <Label>Sales Contract</Label>
              <Select
                value={form.contract_id ?? "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, contract_id: v === "none" ? null : v }))}
              >
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {(salesContracts ?? []).map((sc) => (
                    <SelectItem key={sc.id} value={sc.id}>{sc.contract_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Master LC */}
            <div className="space-y-1.5">
              <Label>Master LC</Label>
              <Select
                value={form.lc_id ?? "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, lc_id: v === "none" ? null : v }))}
              >
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {(masterLCs ?? []).map((lc) => (
                    <SelectItem key={lc.id} value={lc.id}>{lc.lc_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Payment Status */}
            <div className="space-y-1.5">
              <Label>Payment Status</Label>
              <Select
                value={form.payment_status}
                onValueChange={(v) => setForm((f) => ({ ...f, payment_status: v as "unpaid" | "paid" | "partial" }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Payment Date — shown when paid or partial */}
            {(form.payment_status === "paid" || form.payment_status === "partial") && (
              <div className="space-y-1.5">
                <Label>Payment Date</Label>
                <Input
                  type="date"
                  value={form.payment_date ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, payment_date: e.target.value || null }))}
                />
              </div>
            )}

            {/* Payment Reference — shown when paid or partial */}
            {(form.payment_status === "paid" || form.payment_status === "partial") && (
              <div className="space-y-1.5">
                <Label>Payment Reference</Label>
                <Input
                  value={form.payment_reference ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, payment_reference: e.target.value || null }))}
                  placeholder="e.g. TT ref, cheque #"
                />
              </div>
            )}

            {/* Remarks — full width */}
            <div className="space-y-1.5 md:col-span-2">
              <Label>Remarks</Label>
              <Textarea
                value={form.remarks ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value || null }))}
                rows={2}
                placeholder="Optional notes..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ──────────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Export Cost</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this export cost entry? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
