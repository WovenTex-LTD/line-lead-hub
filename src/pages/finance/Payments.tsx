import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import {
  Wallet, Plus, ArrowDownLeft, ArrowUpRight, Search, Pencil, Trash2,
  DollarSign, Clock, AlertTriangle, CheckCircle2, ChevronUp, ChevronDown, X,
  TrendingUp, Users,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, differenceInDays, addDays, isWithinInterval } from "date-fns";

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending_approval: { label: "Pending",  cls: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
  approved:         { label: "Approved", cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  matched:          { label: "Matched",  cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  void:             { label: "Void",     cls: "bg-red-500/10 text-red-400 border-red-500/20" },
};

const METHOD_BADGE: Record<string, string> = {
  tt: "TT", lc_sight: "LC Sight", lc_deferred: "LC Deferred", dp: "D/P",
  cheque: "Cheque", cash: "Cash", bank_transfer: "Bank Transfer",
  bkash: "bKash", nagad: "Nagad", lc_auto_debit: "LC Auto-Debit",
};

const CATEGORY_BADGE: Record<string, { label: string; cls: string }> = {
  invoice_payment:  { label: "Invoice",       cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  supplier:         { label: "Supplier",       cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  btb_lc_maturity:  { label: "BTB LC",         cls: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  payroll:          { label: "Payroll",         cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  export_cost:      { label: "Export Cost",     cls: "bg-teal-500/10 text-teal-400 border-teal-500/20" },
  bank_charge:      { label: "Bank Charge",     cls: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" },
  overhead:         { label: "Overhead",        cls: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
  tax:              { label: "Tax",             cls: "bg-red-500/10 text-red-400 border-red-500/20" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtDate(d: string | null) {
  if (!d) return "-";
  return format(new Date(d), "dd MMM yyyy");
}
function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return differenceInDays(new Date(dateStr), new Date());
}
function urgencyBadge(days: number | null) {
  if (days === null) return null;
  if (days < 0) return <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/20 text-xs">{Math.abs(days)}d overdue</Badge>;
  if (days <= 7) return <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-xs">{days}d left</Badge>;
  return <Badge variant="outline" className="bg-slate-500/10 text-slate-400 border-slate-500/20 text-xs">{days}d</Badge>;
}

function invoiceTotal(inv: any): number {
  return ((inv.invoice_line_items ?? []) as any[]).reduce(
    (s: number, li: any) => s + (li.quantity ?? 0) * (li.unit_price ?? 0) * (1 - (li.discount_pct ?? 0) / 100), 0
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Payments() {
  const { factory, profile } = useAuth();

  // ── Data state ──────────────────────────────────────────────────────────────
  const [invoices, setInvoices] = useState<any[]>([]);
  const [btbLcs, setBtbLcs] = useState<any[]>([]);
  const [masterLcs, setMasterLcs] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Lookup data for dialogs ─────────────────────────────────────────────────
  const [allMasterLcs, setAllMasterLcs] = useState<any[]>([]);
  const [allBtbLcs, setAllBtbLcs] = useState<any[]>([]);
  const [allWorkOrders, setAllWorkOrders] = useState<any[]>([]);

  // ── Filters ─────────────────────────────────────────────────────────────────
  const [dirFilter, setDirFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // ── Dialogs ─────────────────────────────────────────────────────────────────
  const [showRecordDialog, setShowRecordDialog] = useState(false);
  const [recordStep, setRecordStep] = useState<0 | 1>(0);
  const [recordDirection, setRecordDirection] = useState<"in" | "out">("in");
  const [recordForm, setRecordForm] = useState<Record<string, any>>({});
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [markPaidItem, setMarkPaidItem] = useState<any>(null);
  const [markPaidForm, setMarkPaidForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [upcomingCollapsed, setUpcomingCollapsed] = useState(false);
  const [upcomingPage, setUpcomingPage] = useState(1);
  const [recordedPage, setRecordedPage] = useState(1);
  const PAGE_SIZE = 6;

  // ── Buyer receivables state ────────────────────────────────────────────────
  const [buyerSummary, setBuyerSummary] = useState<any[]>([]);
  const [expandedBuyer, setExpandedBuyer] = useState<string | null>(null);
  const [dirPillFilter, setDirPillFilter] = useState<"all" | "in" | "out">("all");

  // ── Fetch functions ─────────────────────────────────────────────────────────

  const fetchUpcoming = useCallback(async () => {
    if (!factory?.id) return;
    const [invRes, btbRes, mlcRes] = await Promise.all([
      supabase.from("invoices" as any)
        .select("id, invoice_number, buyer_name, currency, due_date, status, invoice_line_items(quantity, unit_price, discount_pct)")
        .eq("factory_id", factory.id)
        .in("status", ["draft", "sent", "overdue"] as any)
        .order("due_date"),
      supabase.from("btb_lcs" as any)
        .select("id, lc_number, supplier_name, lc_value, currency, maturity_date, status, master_lc_id")
        .eq("factory_id", factory.id)
        .in("status", ["opened", "docs_received", "accepted", "matured"] as any)
        .order("maturity_date"),
      supabase.from("master_lcs" as any)
        .select("id, lc_number, buyer_name, lc_value, currency, payment_type, tenor_days, expiry_date, total_shipped, status")
        .eq("factory_id", factory.id)
        .in("status", ["received", "advised", "confirmed", "partially_shipped", "fully_shipped"] as any)
        .order("expiry_date"),
    ]);
    setInvoices((invRes.data ?? []) as any[]);
    setBtbLcs((btbRes.data ?? []) as any[]);
    setMasterLcs((mlcRes.data ?? []) as any[]);
  }, [factory?.id]);

  const fetchPayments = useCallback(async () => {
    if (!factory?.id) return;
    const { data } = await supabase.from("payments" as any)
      .select("*")
      .eq("factory_id", factory.id)
      .is("deleted_at", null)
      .order("payment_date", { ascending: false });
    setPayments((data ?? []) as any[]);
  }, [factory?.id]);

  const fetchLookups = useCallback(async () => {
    if (!factory?.id) return;
    const [mlcRes, btbRes, woRes] = await Promise.all([
      supabase.from("master_lcs" as any).select("id, lc_number").eq("factory_id", factory.id),
      supabase.from("btb_lcs" as any).select("id, lc_number").eq("factory_id", factory.id),
      supabase.from("work_orders" as any).select("id, po_number, buyer").eq("factory_id", factory.id),
    ]);
    setAllMasterLcs((mlcRes.data ?? []) as any[]);
    setAllBtbLcs((btbRes.data ?? []) as any[]);
    setAllWorkOrders((woRes.data ?? []) as any[]);
  }, [factory?.id]);

  const fetchBuyerSummary = useCallback(async () => {
    if (!factory?.id) return;
    const [invRes, payRes] = await Promise.all([
      supabase.from("invoices" as any)
        .select("id, invoice_number, buyer_name, status, due_date, currency, invoice_line_items(quantity, unit_price, discount_pct)")
        .eq("factory_id", factory.id),
      supabase.from("payments" as any)
        .select("buyer_name, original_amount, payment_date, payment_method, bank_reference")
        .eq("factory_id", factory.id).eq("direction", "in").is("deleted_at", null),
    ]);
    const allInvoices = (invRes.data ?? []) as any[];
    const allInPayments = (payRes.data ?? []) as any[];

    const buyerMap: Record<string, { invoiced: number; paid: number; lastPayment: string | null; invoices: any[]; payments: any[] }> = {};
    for (const inv of allInvoices) {
      const buyer = inv.buyer_name ?? "Unknown";
      if (!buyerMap[buyer]) buyerMap[buyer] = { invoiced: 0, paid: 0, lastPayment: null, invoices: [], payments: [] };
      buyerMap[buyer].invoiced += invoiceTotal(inv);
      buyerMap[buyer].invoices.push(inv);
    }
    for (const pay of allInPayments) {
      const buyer = pay.buyer_name ?? "Unknown";
      if (!buyerMap[buyer]) buyerMap[buyer] = { invoiced: 0, paid: 0, lastPayment: null, invoices: [], payments: [] };
      buyerMap[buyer].paid += pay.original_amount ?? 0;
      buyerMap[buyer].payments.push(pay);
      if (!buyerMap[buyer].lastPayment || (pay.payment_date && pay.payment_date > buyerMap[buyer].lastPayment)) {
        buyerMap[buyer].lastPayment = pay.payment_date;
      }
    }
    const rows = Object.entries(buyerMap)
      .map(([buyer, d]) => ({ buyer, ...d, outstanding: d.invoiced - d.paid }))
      .filter(r => r.outstanding > 0)
      .sort((a, b) => b.outstanding - a.outstanding);
    setBuyerSummary(rows);
  }, [factory?.id]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchUpcoming(), fetchPayments(), fetchLookups(), fetchBuyerSummary()]).finally(() => setLoading(false));
  }, [fetchUpcoming, fetchPayments, fetchLookups, fetchBuyerSummary]);

  // ── Derived: upcoming rows ──────────────────────────────────────────────────

  const upcomingRows = useMemo(() => {
    const rows: any[] = [];
    (invoices ?? []).forEach((inv: any) => {
      rows.push({
        id: inv.id, type: "Invoice", ref: inv.invoice_number ?? "-",
        party: inv.buyer_name ?? "-", amount: invoiceTotal(inv),
        currency: inv.currency ?? "USD", dueDate: inv.due_date,
        days: daysUntil(inv.due_date), status: inv.status, source: "invoice", raw: inv,
      });
    });
    (btbLcs ?? []).forEach((b: any) => {
      rows.push({
        id: b.id, type: "BTB LC", ref: b.lc_number ?? "-",
        party: b.supplier_name ?? "-", amount: b.lc_value ?? 0,
        currency: b.currency ?? "USD", dueDate: b.maturity_date,
        days: daysUntil(b.maturity_date), status: b.status, source: "btb_lc", raw: b,
      });
    });
    (masterLcs ?? []).forEach((m: any) => {
      rows.push({
        id: m.id, type: "Master LC", ref: m.lc_number ?? "-",
        party: m.buyer_name ?? "-", amount: m.lc_value ?? 0,
        currency: m.currency ?? "USD", dueDate: m.expiry_date,
        days: daysUntil(m.expiry_date), status: m.status, source: "master_lc", raw: m,
      });
    });
    rows.sort((a, b) => {
      const ad = a.days ?? 9999, bd = b.days ?? 9999;
      return ad - bd;
    });
    return rows;
  }, [invoices, btbLcs, masterLcs]);

  // ── Derived: summary ────────────────────────────────────────────────────────

  const summary = useMemo(() => {
    const receivable = (invoices ?? []).reduce((s: number, inv: any) => s + invoiceTotal(inv), 0)
      + (masterLcs ?? []).reduce((s: number, m: any) => s + (m.lc_value ?? 0), 0);
    const payable = (btbLcs ?? []).reduce((s: number, b: any) => s + (b.lc_value ?? 0), 0);

    const now = new Date();
    const thisMonth = (payments ?? []).filter((p: any) => {
      if (!p.payment_date) return false;
      const d = new Date(p.payment_date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = (payments ?? []).filter((p: any) => {
      if (!p.payment_date) return false;
      const d = new Date(p.payment_date);
      return d.getMonth() === lastMonthDate.getMonth() && d.getFullYear() === lastMonthDate.getFullYear();
    });

    const sumDir = (arr: any[], dir: string) => arr.filter((p: any) => p.direction === dir)
      .reduce((s: number, p: any) => s + (p.original_amount ?? 0), 0);

    return {
      receivable, payable, net: receivable - payable,
      thisIn: sumDir(thisMonth, "in"), thisOut: sumDir(thisMonth, "out"),
      lastIn: sumDir(lastMonth, "in"), lastOut: sumDir(lastMonth, "out"),
      totalCount: (payments ?? []).length,
    };
  }, [invoices, masterLcs, btbLcs, payments]);

  // ── BTB LC Maturity Alerts (within 7 days) ──────────────────────────────────

  const btbMaturityAlerts = useMemo(() => {
    const now = new Date();
    const weekOut = addDays(now, 7);
    return (btbLcs ?? []).filter((b: any) => {
      if (!b.maturity_date) return false;
      const md = new Date(b.maturity_date);
      return md >= now && md <= weekOut;
    });
  }, [btbLcs]);

  const btbMaturityTotal = useMemo(
    () => btbMaturityAlerts.reduce((s: number, b: any) => s + (b.lc_value ?? 0), 0),
    [btbMaturityAlerts]
  );

  // ── Cash Flow Mini-Forecast ────────────────────────────────────────────────

  const cashFlowForecast = useMemo(() => {
    const now = new Date();
    const ranges = [
      { label: "Next 7 days", end: addDays(now, 7) },
      { label: "Next 14 days", end: addDays(now, 14) },
      { label: "Next 30 days", end: addDays(now, 30) },
    ];
    return ranges.map(({ label, end }) => {
      const inRange = (dateStr: string | null) => {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        return d >= now && d <= end;
      };
      const expectedIn = (invoices ?? [])
        .filter((inv: any) => inRange(inv.due_date))
        .reduce((s: number, inv: any) => s + invoiceTotal(inv), 0)
        + (masterLcs ?? [])
          .filter((m: any) => inRange(m.expiry_date))
          .reduce((s: number, m: any) => s + (m.lc_value ?? 0), 0);
      const expectedOut = (btbLcs ?? [])
        .filter((b: any) => inRange(b.maturity_date))
        .reduce((s: number, b: any) => s + (b.lc_value ?? 0), 0);
      return { label, expectedIn, expectedOut, net: expectedIn - expectedOut };
    });
  }, [invoices, btbLcs, masterLcs]);

  // ── Filtered payments ───────────────────────────────────────────────────────

  const filteredPayments = useMemo(() => {
    return (payments ?? []).filter((p: any) => {
      if (dirPillFilter !== "all" && p.direction !== dirPillFilter) return false;
      if (dirFilter !== "all" && p.direction !== dirFilter) return false;
      if (catFilter !== "all" && p.category !== catFilter) return false;
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        const hay = `${p.buyer_name ?? ""} ${p.payee_name ?? ""} ${p.bank_reference ?? ""} ${p.description ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [payments, dirFilter, dirPillFilter, catFilter, statusFilter, searchTerm]);

  // Reset pages when data/filters change
  useEffect(() => { setRecordedPage(1); }, [dirFilter, dirPillFilter, catFilter, statusFilter, searchTerm]);
  useEffect(() => { setUpcomingPage(1); }, [upcomingRows.length]);

  // ── Mutations ───────────────────────────────────────────────────────────────

  const savePayment = async () => {
    if (!factory?.id) return;
    setSaving(true);
    const f = recordForm;
    const isEdit = !!editingPayment;
    const dir = isEdit ? editingPayment.direction : recordDirection;

    const payload: Record<string, any> = {
      direction: dir,
      original_amount: parseFloat(f.amount) || 0,
      original_currency: f.currency || "USD",
      exchange_rate: parseFloat(f.exchange_rate) || null,
      payment_date: f.payment_date || new Date().toISOString().slice(0, 10),
      payment_method: f.payment_method || null,
      bank_reference: f.bank_reference || null,
      description: f.description || null,
      notes: f.notes || null,
      status: "approved",
    };

    if (dir === "in") {
      payload.buyer_name = f.buyer_name || null;
      payload.category = "invoice_payment";
      payload.linked_lc_id = f.linked_lc_id === "none" ? null : (f.linked_lc_id || null);
    } else {
      payload.payee_name = f.payee_name || null;
      payload.category = f.category || "supplier";
      payload.sub_category = f.sub_category || null;
      payload.linked_btb_lc_id = f.linked_btb_lc_id === "none" ? null : (f.linked_btb_lc_id || null);
      payload.linked_po_id = f.linked_po_id === "none" ? null : (f.linked_po_id || null);
    }

    let error: any;
    if (isEdit) {
      ({ error } = await supabase.from("payments" as any).update(payload as any).eq("id", editingPayment.id));
    } else {
      payload.factory_id = factory.id;
      payload.recorded_by = profile?.id ?? null;
      ({ error } = await supabase.from("payments" as any).insert(payload as any));
    }

    setSaving(false);
    if (error) { toast.error("Failed to save payment", { description: error.message }); return; }
    toast.success(isEdit ? "Payment updated" : "Payment recorded");
    closeRecordDialog();
    fetchPayments();
  };

  const updatePaymentStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("payments" as any).update({ status } as any).eq("id", id);
    if (error) { toast.error("Failed to update status"); return; }
    toast.success(`Status changed to ${status}`);
    fetchPayments();
  };

  const deletePayment = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("payments" as any).delete().eq("id", deleteTarget);
    if (error) { toast.error("Failed to delete payment"); return; }
    toast.success("Payment deleted");
    setDeleteTarget(null);
    fetchPayments();
  };

  const markAsPaid = async () => {
    if (!factory?.id || !markPaidItem) return;
    setSaving(true);
    const item = markPaidItem;
    const f = markPaidForm;
    const dir = item.source === "btb_lc" ? "out" : "in";

    // Create payment record — supports partial payments
    const paidAmount = parseFloat(f.amount) || item.amount;
    const isPartial = paidAmount < item.amount;
    const payload: Record<string, any> = {
      factory_id: factory.id,
      recorded_by: profile?.id ?? null,
      direction: dir,
      original_amount: paidAmount,
      original_currency: item.currency,
      payment_date: f.payment_date || new Date().toISOString().slice(0, 10),
      payment_method: f.payment_method || null,
      bank_reference: f.bank_reference || null,
      status: "approved",
      description: isPartial
        ? `Partial payment for ${item.type} ${item.ref} (${fmt(paidAmount)} of ${fmt(item.amount)})`
        : `Payment for ${item.type} ${item.ref}`,
    };

    if (dir === "in") {
      payload.buyer_name = item.party;
      payload.category = "invoice_payment";
      if (item.source === "master_lc") payload.linked_lc_id = item.id;
    } else {
      payload.payee_name = item.party;
      payload.category = "btb_lc_maturity";
      payload.linked_btb_lc_id = item.id;
    }

    const { error: payErr } = await supabase.from("payments" as any).insert(payload as any);
    if (payErr) { toast.error("Failed to record payment", { description: payErr.message }); setSaving(false); return; }

    // Update source record status — only for full payments
    if (isPartial) {
      toast.info("Partial payment recorded. Invoice remains outstanding.");
    } else {
      if (item.source === "invoice") {
        await supabase.from("invoices" as any).update({ status: "paid" } as any).eq("id", item.id);
      } else if (item.source === "btb_lc") {
        await supabase.from("btb_lcs" as any).update({ status: "paid", payment_date: f.payment_date || new Date().toISOString().slice(0, 10) } as any).eq("id", item.id);
      } else if (item.source === "master_lc") {
        await supabase.from("master_lcs" as any).update({ status: "closed" } as any).eq("id", item.id);
      }
      toast.success(`${item.type} marked as paid`);
    }
    setMarkPaidItem(null);
    setMarkPaidForm({});

    // Refetch after a small delay to ensure DB consistency
    await new Promise(r => setTimeout(r, 300));
    await Promise.all([fetchUpcoming(), fetchPayments(), fetchBuyerSummary()]);
    setSaving(false);
  };

  // ── Dialog helpers ──────────────────────────────────────────────────────────

  const openRecordDialog = (direction?: "in" | "out") => {
    setEditingPayment(null);
    setRecordForm({ currency: "USD", payment_date: new Date().toISOString().slice(0, 10) });
    if (direction) {
      setRecordDirection(direction);
      setRecordStep(1);
    } else {
      setRecordStep(0);
    }
    setShowRecordDialog(true);
  };

  const openEditDialog = (p: any) => {
    setEditingPayment(p);
    setRecordDirection(p.direction);
    setRecordForm({
      amount: String(p.original_amount ?? ""),
      currency: p.original_currency ?? "USD",
      exchange_rate: p.exchange_rate ? String(p.exchange_rate) : "",
      payment_date: p.payment_date ?? "",
      payment_method: p.payment_method ?? "",
      bank_reference: p.bank_reference ?? "",
      description: p.description ?? "",
      notes: p.notes ?? "",
      buyer_name: p.buyer_name ?? "",
      payee_name: p.payee_name ?? "",
      category: p.category ?? "supplier",
      sub_category: p.sub_category ?? "",
      linked_lc_id: p.linked_lc_id ?? "none",
      linked_btb_lc_id: p.linked_btb_lc_id ?? "none",
      linked_po_id: p.linked_po_id ?? "none",
    });
    setRecordStep(1);
    setShowRecordDialog(true);
  };

  const closeRecordDialog = () => {
    setShowRecordDialog(false);
    setEditingPayment(null);
    setRecordForm({});
    setRecordStep(0);
  };

  const openMarkPaid = (row: any) => {
    setMarkPaidItem(row);
    setMarkPaidForm({
      payment_date: new Date().toISOString().slice(0, 10),
      payment_method: "",
      bank_reference: "",
      amount: String(row.amount),
    });
  };

  // ── Loading state ───────────────────────────────────────────────────────────

  if (!factory?.id) {
    return <div className="p-6 text-center text-muted-foreground">No factory selected</div>;
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
        </div>
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/10">
            <Wallet className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Payments</h1>
            <p className="text-sm text-muted-foreground">Track receivables, payables, and recorded payments</p>
          </div>
        </div>
        <Button onClick={() => openRecordDialog()} className="bg-purple-600 hover:bg-purple-700">
          <Plus className="h-4 w-4 mr-1" /> Record Payment
        </Button>
      </div>

      {/* ── Summary Strip ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-emerald-500/20">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Receivables</p>
            <p className="text-2xl font-bold font-mono text-emerald-400">${fmt(summary.receivable)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {(invoices ?? []).length} invoices + {(masterLcs ?? []).length} LCs
            </p>
          </CardContent>
        </Card>
        <Card className="border-red-500/20">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Payables</p>
            <p className="text-2xl font-bold font-mono text-red-400">${fmt(summary.payable)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {(btbLcs ?? []).length} BTB LCs active
            </p>
          </CardContent>
        </Card>
        <Card className={cn("border-purple-500/20", summary.net >= 0 ? "" : "")}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Net Position</p>
            <p className={cn("text-2xl font-bold font-mono", summary.net >= 0 ? "text-emerald-400" : "text-red-400")}>
              {summary.net >= 0 ? "+" : "-"}${fmt(Math.abs(summary.net))}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Receivables minus payables</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Buyer Receivables Summary ─────────────────────────────────────── */}
      {(buyerSummary ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-400" />
              <h2 className="font-semibold">Buyer Receivables</h2>
              <Badge variant="outline" className="text-xs">{buyerSummary.length} buyers</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Buyer</TableHead>
                    <TableHead className="text-right">Total Invoiced</TableHead>
                    <TableHead className="text-right">Total Paid</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead>Last Payment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(buyerSummary ?? []).map((row: any) => (
                    <Fragment key={row.buyer}>
                      <TableRow className="cursor-pointer hover:bg-purple-500/5"
                        onClick={() => setExpandedBuyer(expandedBuyer === row.buyer ? null : row.buyer)}>
                        <TableCell className="text-sm font-medium flex items-center gap-1">
                          {expandedBuyer === row.buyer ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          {row.buyer}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">${fmt(row.invoiced)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-emerald-400">${fmt(row.paid)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-red-400">${fmt(row.outstanding)}</TableCell>
                        <TableCell className="text-sm">{fmtDate(row.lastPayment)}</TableCell>
                      </TableRow>
                      {expandedBuyer === row.buyer && (
                        <TableRow key={`${row.buyer}-detail`}>
                          <TableCell colSpan={5} className="p-0">
                            <div className="bg-muted/30 p-3 space-y-3">
                              {/* Invoices */}
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Invoices</p>
                                <div className="space-y-1">
                                  {(row.invoices ?? []).map((inv: any) => (
                                    <div key={inv.id} className="flex items-center justify-between text-sm px-2 py-1 rounded bg-background/50">
                                      <span className="font-mono text-xs">{inv.invoice_number ?? "-"}</span>
                                      <span className="font-mono">${fmt(invoiceTotal(inv))}</span>
                                      <Badge variant="outline" className="text-xs capitalize">{(inv.status ?? "").replace(/_/g, " ")}</Badge>
                                      <span className="text-xs text-muted-foreground">{fmtDate(inv.due_date)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {/* Payments */}
                              {(row.payments ?? []).length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Payments Received</p>
                                  <div className="space-y-1">
                                    {(row.payments ?? []).map((pay: any, idx: number) => (
                                      <div key={idx} className="flex items-center justify-between text-sm px-2 py-1 rounded bg-background/50">
                                        <span className="text-xs">{fmtDate(pay.payment_date)}</span>
                                        <span className="font-mono text-emerald-400">${fmt(pay.original_amount ?? 0)}</span>
                                        <Badge variant="outline" className="text-xs">{METHOD_BADGE[pay.payment_method] ?? pay.payment_method ?? "-"}</Badge>
                                        <span className="font-mono text-xs text-muted-foreground">{pay.bank_reference ?? "-"}</span>
                                      </div>
                                    ))}
                                  </div>
                                  {/* Running balance */}
                                  <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t px-2">
                                    <span>Running Balance</span>
                                    <span className="font-mono text-red-400">${fmt(row.outstanding)}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── BTB LC Maturity Alerts ─────────────────────────────────────────── */}
      {btbMaturityAlerts.length > 0 && (
        <Card className="border-red-500/40 bg-red-500/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-400">
                  ${fmt(btbMaturityTotal)} in BTB LC maturities this week
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {btbMaturityAlerts.map((b: any, i: number) => (
                    <span key={b.id}>
                      {i > 0 && ", "}
                      [{b.lc_number}] ${fmt(b.lc_value ?? 0)} matures {fmtDate(b.maturity_date)}
                    </span>
                  ))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Section A: Upcoming & Overdue ──────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between cursor-pointer" onClick={() => setUpcomingCollapsed(!upcomingCollapsed)}>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-purple-400" />
              <h2 className="font-semibold">Upcoming & Overdue</h2>
              <Badge variant="outline" className="text-xs">{upcomingRows.length}</Badge>
            </div>
            {upcomingCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </div>
        </CardHeader>
        {!upcomingCollapsed && (
          <CardContent className="pt-0">
            {upcomingRows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No upcoming or overdue items</p>
            ) : (
              <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[90px]">Type</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Buyer / Supplier</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Urgency</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[100px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upcomingRows.slice((upcomingPage - 1) * PAGE_SIZE, upcomingPage * PAGE_SIZE).map(row => (
                      <TableRow key={`${row.source}-${row.id}`}>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-xs",
                            row.source === "invoice" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                            row.source === "btb_lc" ? "bg-purple-500/10 text-purple-400 border-purple-500/20" :
                            "bg-blue-500/10 text-blue-400 border-blue-500/20"
                          )}>{row.type}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{row.ref}</TableCell>
                        <TableCell className="text-sm">{row.party}</TableCell>
                        <TableCell className={cn("text-right font-mono text-sm", row.source === "btb_lc" ? "text-red-400" : "text-emerald-400")}>
                          {row.source === "btb_lc" ? "-" : "+"}{row.currency} {fmt(row.amount)}
                        </TableCell>
                        <TableCell className="text-sm">{fmtDate(row.dueDate)}</TableCell>
                        <TableCell>{urgencyBadge(row.days)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">{(row.status ?? "").replace(/_/g, " ")}</Badge>
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" className="text-xs h-7"
                            onClick={() => openMarkPaid(row)}>
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Paid
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {upcomingRows.length > PAGE_SIZE && (
                <div className="flex items-center justify-between pt-3 border-t mt-3">
                  <p className="text-xs text-muted-foreground">
                    Showing {Math.min((upcomingPage - 1) * PAGE_SIZE + 1, upcomingRows.length)}-{Math.min(upcomingPage * PAGE_SIZE, upcomingRows.length)} of {upcomingRows.length}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={upcomingPage <= 1} onClick={() => setUpcomingPage(p => p - 1)}>Previous</Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={upcomingPage * PAGE_SIZE >= upcomingRows.length} onClick={() => setUpcomingPage(p => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
              </>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Section B: Recorded Payments ───────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-purple-400" />
              <h2 className="font-semibold">Recorded Payments</h2>
              <Badge variant="outline" className="text-xs">{filteredPayments.length}</Badge>
              {/* Direction pill buttons */}
              <div className="flex items-center gap-1 ml-2">
                {(["all", "in", "out"] as const).map((d) => (
                  <button key={d} onClick={() => setDirPillFilter(d)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-medium transition-colors border",
                      dirPillFilter === d
                        ? d === "in" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                          : d === "out" ? "bg-red-500/20 text-red-400 border-red-500/30"
                          : "bg-purple-500/20 text-purple-400 border-purple-500/30"
                        : "bg-muted/30 text-muted-foreground border-transparent hover:bg-muted/50"
                    )}>
                    {d === "all" ? "All" : d === "in" ? "Money In" : "Money Out"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Search..." className="pl-8 h-9 w-[180px]"
                  value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
              <Select value={dirFilter} onValueChange={setDirFilter}>
                <SelectTrigger className="h-9 w-[100px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="in">In</SelectItem>
                  <SelectItem value="out">Out</SelectItem>
                </SelectContent>
              </Select>
              <Select value={catFilter} onValueChange={setCatFilter}>
                <SelectTrigger className="h-9 w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {Object.entries(CATEGORY_BADGE).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {Object.entries(STATUS_BADGE).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {filteredPayments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No payments found</p>
          ) : (
            <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="w-[60px]">Dir</TableHead>
                    <TableHead>Buyer / Payee</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Linked</TableHead>
                    <TableHead className="w-[140px]">Status</TableHead>
                    <TableHead className="w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments.slice((recordedPage - 1) * PAGE_SIZE, recordedPage * PAGE_SIZE).map((p: any) => {
                    const cat = CATEGORY_BADGE[p.category] ?? { label: p.category ?? "-", cls: "bg-slate-500/10 text-slate-400 border-slate-500/20" };
                    const st = STATUS_BADGE[p.status] ?? { label: p.status ?? "-", cls: "bg-slate-500/10 text-slate-400 border-slate-500/20" };
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="text-sm">{fmtDate(p.payment_date)}</TableCell>
                        <TableCell>
                          {p.direction === "in" ? (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs">
                              <ArrowDownLeft className="h-3 w-3 mr-0.5" /> In
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/20 text-xs">
                              <ArrowUpRight className="h-3 w-3 mr-0.5" /> Out
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{p.buyer_name || p.payee_name || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-xs", cat.cls)}>{cat.label}</Badge>
                        </TableCell>
                        <TableCell className={cn("text-right font-mono text-sm", p.direction === "in" ? "text-emerald-400" : "text-red-400")}>
                          {p.direction === "in" ? "+" : "-"}{p.original_currency ?? "USD"} {fmt(p.original_amount ?? 0)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs bg-slate-500/10 text-slate-400 border-slate-500/20">
                            {METHOD_BADGE[p.payment_method] ?? p.payment_method ?? "-"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{p.bank_reference ?? "-"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {p.linked_lc_id && (() => {
                            const lc = (allMasterLcs ?? []).find((l: any) => l.id === p.linked_lc_id);
                            return lc ? <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/20">LC: {lc.lc_number}</Badge> : null;
                          })()}
                          {p.linked_btb_lc_id && (() => {
                            const lc = (allBtbLcs ?? []).find((l: any) => l.id === p.linked_btb_lc_id);
                            return lc ? <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-400 border-purple-500/20">BTB: {lc.lc_number}</Badge> : null;
                          })()}
                          {!p.linked_lc_id && !p.linked_btb_lc_id && "-"}
                        </TableCell>
                        <TableCell>
                          <Select value={p.status ?? "pending_approval"} onValueChange={(v) => updatePaymentStatus(p.id, v)}>
                            <SelectTrigger className="h-7 text-xs w-[120px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(STATUS_BADGE).map(([k, v]) => (
                                <SelectItem key={k} value={k}>{v.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditDialog(p)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-300"
                              onClick={() => setDeleteTarget(p.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {filteredPayments.length > PAGE_SIZE && (
              <div className="flex items-center justify-between pt-3 border-t mt-3">
                <p className="text-xs text-muted-foreground">
                  Showing {Math.min((recordedPage - 1) * PAGE_SIZE + 1, filteredPayments.length)}-{Math.min(recordedPage * PAGE_SIZE, filteredPayments.length)} of {filteredPayments.length}
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" className="h-7 text-xs" disabled={recordedPage <= 1} onClick={() => setRecordedPage(p => p - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" disabled={recordedPage * PAGE_SIZE >= filteredPayments.length} onClick={() => setRecordedPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Section C: Payment History Summary ─────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-purple-400" />
            <h2 className="font-semibold">Payment History</h2>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg border p-4 space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">This Month</p>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Received</span>
                <span className="font-mono text-emerald-400">${fmt(summary.thisIn)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Paid</span>
                <span className="font-mono text-red-400">${fmt(summary.thisOut)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold border-t pt-2">
                <span>Net</span>
                <span className={cn("font-mono", summary.thisIn - summary.thisOut >= 0 ? "text-emerald-400" : "text-red-400")}>
                  ${fmt(summary.thisIn - summary.thisOut)}
                </span>
              </div>
            </div>
            <div className="rounded-lg border p-4 space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Last Month</p>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Received</span>
                <span className="font-mono text-emerald-400">${fmt(summary.lastIn)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Paid</span>
                <span className="font-mono text-red-400">${fmt(summary.lastOut)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold border-t pt-2">
                <span>Net</span>
                <span className={cn("font-mono", summary.lastIn - summary.lastOut >= 0 ? "text-emerald-400" : "text-red-400")}>
                  ${fmt(summary.lastIn - summary.lastOut)}
                </span>
              </div>
            </div>
            <div className="rounded-lg border p-4 flex flex-col items-center justify-center">
              <p className="text-3xl font-bold font-mono text-purple-400">{summary.totalCount}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Total Recorded Payments</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Cash Flow Mini-Forecast ───────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-purple-400" />
            <h2 className="font-semibold">Cash Flow Forecast</h2>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2">
            {cashFlowForecast.map((row) => (
              <div key={row.label} className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm font-medium w-[110px]">{row.label}</span>
                <div className="flex items-center gap-6 text-sm">
                  <span>
                    <span className="text-muted-foreground mr-1">In:</span>
                    <span className="font-mono text-emerald-400">${fmt(row.expectedIn)}</span>
                  </span>
                  <span>
                    <span className="text-muted-foreground mr-1">Out:</span>
                    <span className="font-mono text-red-400">${fmt(row.expectedOut)}</span>
                  </span>
                  <span>
                    <span className="text-muted-foreground mr-1">Net:</span>
                    <span className={cn("font-mono font-semibold", row.net >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {row.net >= 0 ? "+" : "-"}${fmt(Math.abs(row.net))}
                    </span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Record Payment Dialog ──────────────────────────────────────────── */}
      <Dialog open={showRecordDialog} onOpenChange={(open) => { if (!open) closeRecordDialog(); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPayment ? "Edit Payment" : "Record Payment"}</DialogTitle>
          </DialogHeader>

          {recordStep === 0 && !editingPayment && (
            <div className="grid grid-cols-2 gap-4 py-4">
              <Card className="cursor-pointer hover:border-emerald-500/50 transition-colors"
                onClick={() => { setRecordDirection("in"); setRecordStep(1); }}>
                <CardContent className="p-6 flex flex-col items-center gap-3">
                  <div className="p-3 rounded-full bg-emerald-500/10">
                    <ArrowDownLeft className="h-6 w-6 text-emerald-400" />
                  </div>
                  <p className="font-semibold">Money In</p>
                  <p className="text-xs text-muted-foreground text-center">Payment received from buyer</p>
                </CardContent>
              </Card>
              <Card className="cursor-pointer hover:border-red-500/50 transition-colors"
                onClick={() => { setRecordDirection("out"); setRecordStep(1); }}>
                <CardContent className="p-6 flex flex-col items-center gap-3">
                  <div className="p-3 rounded-full bg-red-500/10">
                    <ArrowUpRight className="h-6 w-6 text-red-400" />
                  </div>
                  <p className="font-semibold">Money Out</p>
                  <p className="text-xs text-muted-foreground text-center">Payment made to supplier</p>
                </CardContent>
              </Card>
            </div>
          )}

          {recordStep === 1 && (
            <div className="space-y-4 py-2">
              {recordDirection === "in" ? (
                <>
                  <div className="space-y-1.5">
                    <Label>Buyer Name</Label>
                    <Input value={recordForm.buyer_name ?? ""} onChange={e => setRecordForm(p => ({ ...p, buyer_name: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Amount</Label>
                      <Input type="number" value={recordForm.amount ?? ""} onChange={e => setRecordForm(p => ({ ...p, amount: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Currency</Label>
                      <Select value={recordForm.currency ?? "USD"} onValueChange={v => setRecordForm(p => ({ ...p, currency: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="BDT">BDT</SelectItem>
                          <SelectItem value="EUR">EUR</SelectItem>
                          <SelectItem value="GBP">GBP</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Exchange Rate</Label>
                      <Input type="number" step="0.01" value={recordForm.exchange_rate ?? ""} onChange={e => setRecordForm(p => ({ ...p, exchange_rate: e.target.value }))} placeholder="Optional" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Payment Date</Label>
                      <Input type="date" value={recordForm.payment_date ?? ""} onChange={e => setRecordForm(p => ({ ...p, payment_date: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Payment Method</Label>
                    <Select value={recordForm.payment_method || "tt"} onValueChange={v => setRecordForm(p => ({ ...p, payment_method: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tt">TT</SelectItem>
                        <SelectItem value="lc_sight">LC Sight</SelectItem>
                        <SelectItem value="lc_deferred">LC Deferred</SelectItem>
                        <SelectItem value="dp">D/P</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="cash">Cash</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Bank Reference</Label>
                    <Input value={recordForm.bank_reference ?? ""} onChange={e => setRecordForm(p => ({ ...p, bank_reference: e.target.value }))} placeholder="Optional" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Description</Label>
                    <Input value={recordForm.description ?? ""} onChange={e => setRecordForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Link to Master LC</Label>
                    <Select value={recordForm.linked_lc_id ?? "none"} onValueChange={v => setRecordForm(p => ({ ...p, linked_lc_id: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {(allMasterLcs ?? []).map((lc: any) => (
                          <SelectItem key={lc.id} value={lc.id}>{lc.lc_number}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Notes</Label>
                    <Textarea rows={2} value={recordForm.notes ?? ""} onChange={e => setRecordForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional" />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label>Payee Name</Label>
                    <Input value={recordForm.payee_name ?? ""} onChange={e => setRecordForm(p => ({ ...p, payee_name: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    <Select value={recordForm.category || "supplier"} onValueChange={v => setRecordForm(p => ({ ...p, category: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="supplier">Supplier</SelectItem>
                        <SelectItem value="btb_lc_maturity">BTB LC Maturity</SelectItem>
                        <SelectItem value="payroll">Payroll</SelectItem>
                        <SelectItem value="export_cost">Export Cost</SelectItem>
                        <SelectItem value="bank_charge">Bank Charge</SelectItem>
                        <SelectItem value="overhead">Overhead</SelectItem>
                        <SelectItem value="tax">Tax</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Amount</Label>
                      <Input type="number" value={recordForm.amount ?? ""} onChange={e => setRecordForm(p => ({ ...p, amount: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Currency</Label>
                      <Select value={recordForm.currency ?? "USD"} onValueChange={v => setRecordForm(p => ({ ...p, currency: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="BDT">BDT</SelectItem>
                          <SelectItem value="EUR">EUR</SelectItem>
                          <SelectItem value="GBP">GBP</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Exchange Rate</Label>
                      <Input type="number" step="0.01" value={recordForm.exchange_rate ?? ""} onChange={e => setRecordForm(p => ({ ...p, exchange_rate: e.target.value }))} placeholder="Optional" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Payment Date</Label>
                      <Input type="date" value={recordForm.payment_date ?? ""} onChange={e => setRecordForm(p => ({ ...p, payment_date: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Payment Method</Label>
                    <Select value={recordForm.payment_method || "bank_transfer"} onValueChange={v => setRecordForm(p => ({ ...p, payment_method: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="bkash">bKash</SelectItem>
                        <SelectItem value="nagad">Nagad</SelectItem>
                        <SelectItem value="lc_auto_debit">LC Auto-Debit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Bank Reference</Label>
                    <Input value={recordForm.bank_reference ?? ""} onChange={e => setRecordForm(p => ({ ...p, bank_reference: e.target.value }))} placeholder="Optional" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Description</Label>
                    <Input value={recordForm.description ?? ""} onChange={e => setRecordForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Link to BTB LC</Label>
                      <Select value={recordForm.linked_btb_lc_id ?? "none"} onValueChange={v => setRecordForm(p => ({ ...p, linked_btb_lc_id: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {(allBtbLcs ?? []).map((lc: any) => (
                            <SelectItem key={lc.id} value={lc.id}>{lc.lc_number}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Link to PO</Label>
                      <Select value={recordForm.linked_po_id ?? "none"} onValueChange={v => setRecordForm(p => ({ ...p, linked_po_id: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {(allWorkOrders ?? []).map((wo: any) => (
                            <SelectItem key={wo.id} value={wo.id}>{wo.po_number} — {wo.buyer}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Sub-Category</Label>
                    <Input value={recordForm.sub_category ?? ""} onChange={e => setRecordForm(p => ({ ...p, sub_category: e.target.value }))} placeholder="Optional" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Notes</Label>
                    <Textarea rows={2} value={recordForm.notes ?? ""} onChange={e => setRecordForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional" />
                  </div>
                </>
              )}
            </div>
          )}

          {recordStep === 1 && (
            <DialogFooter>
              {!editingPayment && (
                <Button variant="outline" onClick={() => setRecordStep(0)}>Back</Button>
              )}
              <Button className="bg-purple-600 hover:bg-purple-700" disabled={saving} onClick={savePayment}>
                {saving ? "Saving..." : editingPayment ? "Update" : "Save Payment"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Mark as Paid Dialog ────────────────────────────────────────────── */}
      <Dialog open={!!markPaidItem} onOpenChange={(open) => { if (!open) { setMarkPaidItem(null); setMarkPaidForm({}); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark as Paid</DialogTitle>
          </DialogHeader>
          {markPaidItem && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border p-3 space-y-1">
                <p className="text-sm font-medium">{markPaidItem.type}: {markPaidItem.ref}</p>
                <p className="text-sm text-muted-foreground">{markPaidItem.party}</p>
                <p className="font-mono text-sm">{markPaidItem.currency} {fmt(markPaidItem.amount)}</p>
              </div>
              <div className="space-y-1.5">
                <Label>Amount to Pay</Label>
                <Input type="number" step="0.01" value={markPaidForm.amount ?? String(markPaidItem.amount)}
                  onChange={e => setMarkPaidForm(p => ({ ...p, amount: e.target.value }))} />
                {parseFloat(markPaidForm.amount ?? "0") < markPaidItem.amount && parseFloat(markPaidForm.amount ?? "0") > 0 && (
                  <p className="text-xs text-amber-400">Partial payment -- source will remain outstanding.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Payment Date</Label>
                <Input type="date" value={markPaidForm.payment_date ?? ""} onChange={e => setMarkPaidForm(p => ({ ...p, payment_date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Payment Method</Label>
                <Select value={markPaidForm.payment_method || "tt"} onValueChange={v => setMarkPaidForm(p => ({ ...p, payment_method: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tt">TT</SelectItem>
                    <SelectItem value="lc_sight">LC Sight</SelectItem>
                    <SelectItem value="lc_deferred">LC Deferred</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Bank Reference</Label>
                <Input value={markPaidForm.bank_reference ?? ""} onChange={e => setMarkPaidForm(p => ({ ...p, bank_reference: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMarkPaidItem(null); setMarkPaidForm({}); }}>Cancel</Button>
            <Button className="bg-purple-600 hover:bg-purple-700" disabled={saving} onClick={markAsPaid}>
              {saving ? "Saving..." : "Confirm Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Payment</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this payment record. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={deletePayment}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
