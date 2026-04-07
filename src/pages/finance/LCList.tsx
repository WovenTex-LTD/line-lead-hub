import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Landmark, Search, Clock, DollarSign, Ship, FileText,
  ChevronUp, ChevronDown, Settings, BarChart3, Plus,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useMasterLCs, useBtbLCs,
  type MasterLC, type BtbLC,
} from "@/hooks/useLCManagement";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  format, differenceInDays, startOfWeek, endOfWeek, addWeeks,
  addDays, isWithinInterval, isSameWeek, startOfMonth, endOfMonth,
  addMonths,
} from "date-fns";

// ── Constants ────────────────────────────────────────────────────────────────

const MASTER_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  received:          { label: "Received",          cls: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
  in_production:     { label: "In Production",     cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  advised:           { label: "Advised",           cls: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
  confirmed:         { label: "Confirmed",         cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  ready_to_ship:     { label: "Ready to Ship",     cls: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  partially_shipped: { label: "Partially Shipped", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  fully_shipped:     { label: "Fully Shipped",     cls: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" },
  docs_submitted:    { label: "Docs Submitted",    cls: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" },
  payment_pending:   { label: "Payment Pending",   cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  expired:           { label: "Expired",           cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  cancelled:         { label: "Cancelled",         cls: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
  closed:            { label: "Closed",            cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
};

const BTB_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  opened:        { label: "Opened",        cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  docs_received: { label: "Docs Received", cls: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
  accepted:      { label: "Accepted",      cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  matured:       { label: "Matured",       cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  paid:          { label: "Paid",          cls: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  expired:       { label: "Expired",       cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  cancelled:     { label: "Cancelled",     cls: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
};

const PURPOSE_BADGE: Record<string, string> = {
  fabric:      "bg-blue-500/10 text-blue-400 border-blue-500/20",
  trims:       "bg-purple-500/10 text-purple-400 border-purple-500/20",
  accessories: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  washing:     "bg-teal-500/10 text-teal-400 border-teal-500/20",
  other:       "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

const SETTLEMENT_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  shipped:           { label: "Shipped",           cls: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
  docs_submitted:    { label: "Docs Submitted",    cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  under_examination: { label: "Under Examination", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  accepted:          { label: "Accepted",          cls: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" },
  payment_pending:   { label: "Payment Pending",   cls: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  paid:              { label: "Paid",              cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  discrepant:        { label: "Discrepant",        cls: "bg-red-500/10 text-red-400 border-red-500/20" },
};

const MASTER_STATUSES = Object.keys(MASTER_STATUS_BADGE) as string[];

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtCompact(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${fmt(n)}`;
}
function fmtDate(d: string | null) {
  if (!d) return "-";
  return format(new Date(d), "dd MMM yyyy");
}
function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return differenceInDays(new Date(dateStr), new Date());
}

// ── Sort helper ─────────────────────────────────────────────────────────────

type SortDir = "asc" | "desc";

function useSortable<K extends string>(defaultKey: K, defaultDir: SortDir = "asc") {
  const [sortKey, setSortKey] = useState<K>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const toggle = (key: K) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  return { sortKey, sortDir, toggle };
}

function SortHeader({ label, field, sortKey, sortDir, onToggle }: {
  label: string; field: string; sortKey: string; sortDir: SortDir; onToggle: (f: any) => void;
}) {
  const active = sortKey === field;
  return (
    <button
      onClick={() => onToggle(field)}
      className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
    >
      {label}
      {active && (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
    </button>
  );
}

// ── Urgency border helper ────────────────────────────────────────────────────

function urgencyBorder(daysLeft: number | null): string {
  if (daysLeft === null) return "border-l-2 border-l-transparent";
  if (daysLeft < 0) return "border-l-2 border-l-red-500";
  if (daysLeft < 14) return "border-l-2 border-l-red-500";
  if (daysLeft <= 30) return "border-l-2 border-l-amber-500";
  return "border-l-2 border-l-emerald-500";
}

// ── Settlement data hook ────────────────────────────────────────────────────

interface SettlementRow {
  id: string;
  lc_id: string;
  lc_number: string;
  buyer_name: string;
  shipment_number: number;
  invoice_number: string | null;
  invoice_value: number;
  docs_submitted_date: string | null;
  expected_payment_date: string | null;
  payment_received_date: string | null;
  payment_amount: number | null;
  discrepancies: string | null;
  status: string;
}

function useSettlements() {
  const { factory } = useAuth();
  const [rows, setRows] = useState<SettlementRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!factory?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("lc_shipments" as any)
      .select("*, master_lcs!inner(lc_number, buyer_name, expected_payment_date)")
      .eq("master_lcs.factory_id", factory.id)
      .order("shipment_date", { ascending: false });

    if (error) {
      // Fallback: try simpler query
      const { data: d2, error: e2 } = await supabase
        .from("lc_shipments" as any)
        .select("*")
        .order("shipment_date", { ascending: false });
      if (!e2 && d2) {
        setRows((d2 as any[]).map((s: any) => ({
          id: s.id,
          lc_id: s.lc_id,
          lc_number: s.lc_id?.substring(0, 8) ?? "",
          buyer_name: "",
          shipment_number: s.shipment_number,
          invoice_number: s.invoice_number,
          invoice_value: s.invoice_value ?? 0,
          docs_submitted_date: s.docs_submitted_date,
          expected_payment_date: null,
          payment_received_date: s.payment_received_date,
          payment_amount: s.payment_amount,
          discrepancies: s.discrepancies,
          status: s.status ?? "shipped",
        })));
      }
    } else if (data) {
      setRows((data as any[]).map((s: any) => ({
        id: s.id,
        lc_id: s.lc_id,
        lc_number: s.master_lcs?.lc_number ?? "",
        buyer_name: s.master_lcs?.buyer_name ?? "",
        shipment_number: s.shipment_number,
        invoice_number: s.invoice_number,
        invoice_value: s.invoice_value ?? 0,
        docs_submitted_date: s.docs_submitted_date,
        expected_payment_date: s.master_lcs?.expected_payment_date ?? null,
        payment_received_date: s.payment_received_date,
        payment_amount: s.payment_amount,
        discrepancies: s.discrepancies,
        status: s.status ?? "shipped",
      })));
    }
    setLoading(false);
  }, [factory?.id]);

  useEffect(() => { fetch(); }, [fetch]);
  return { rows, loading, refetch: fetch };
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Main Component ─────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

export default function LCList() {
  const navigate = useNavigate();

  // Data
  const { lcs: masterLcs, loading: masterLoading } = useMasterLCs();
  const { btbLcs, loading: btbLoading } = useBtbLCs();
  const { rows: settlements, loading: settlementsLoading } = useSettlements();

  // UI state
  const [tab, setTab] = useState("active");
  const [masterSearch, setMasterSearch] = useState("");
  const [masterStatusFilter, setMasterStatusFilter] = useState<string>("all");
  const [btbSearch, setBtbSearch] = useState("");
  const [deadlineHorizon, setDeadlineHorizon] = useState<30 | 60 | 90>(30);

  // ── Tab 1: Active LCs ──────────────────────────────────────────────────────

  const masterSort = useSortable<"lc_number" | "buyer_name" | "lc_value" | "latest_shipment_date" | "expiry_date" | "utilized" | "status" | "days_left">("expiry_date", "asc");

  const filteredMasterLcs = useMemo(() => {
    const q = masterSearch.toLowerCase();
    const filtered = masterLcs.filter((lc) => {
      if (masterStatusFilter !== "all" && lc.status !== masterStatusFilter) return false;
      if (q) {
        return lc.lc_number.toLowerCase().includes(q) || lc.buyer_name.toLowerCase().includes(q);
      }
      return true;
    });

    const { sortKey, sortDir } = masterSort;
    const dir = sortDir === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      switch (sortKey) {
        case "lc_number": return dir * a.lc_number.localeCompare(b.lc_number);
        case "buyer_name": return dir * a.buyer_name.localeCompare(b.buyer_name);
        case "lc_value": return dir * ((a.lc_value ?? 0) - (b.lc_value ?? 0));
        case "latest_shipment_date": return dir * (new Date(a.latest_shipment_date || "9999").getTime() - new Date(b.latest_shipment_date || "9999").getTime());
        case "expiry_date": return dir * (new Date(a.expiry_date || "9999").getTime() - new Date(b.expiry_date || "9999").getTime());
        case "status": return dir * a.status.localeCompare(b.status);
        case "utilized": {
          const aP = a.lc_value > 0 ? a.total_utilized / a.lc_value : 0;
          const bP = b.lc_value > 0 ? b.total_utilized / b.lc_value : 0;
          return dir * (aP - bP);
        }
        case "days_left": return dir * ((daysUntil(a.expiry_date) ?? 9999) - (daysUntil(b.expiry_date) ?? 9999));
        default: return 0;
      }
    });
    return filtered;
  }, [masterLcs, masterSearch, masterStatusFilter, masterSort.sortKey, masterSort.sortDir]);

  const masterSummary = useMemo(() => ({
    count: filteredMasterLcs.length,
    totalValue: filteredMasterLcs.reduce((s, lc) => s + (lc.lc_value ?? 0), 0),
    totalUtilized: filteredMasterLcs.reduce((s, lc) => s + (lc.total_utilized ?? 0), 0),
  }), [filteredMasterLcs]);

  // ── Tab 2: BTB Tracker ─────────────────────────────────────────────────────

  const btbSort = useSortable<"lc_number" | "supplier_name" | "purpose" | "lc_value" | "acceptance_date" | "maturity_date" | "days_to_maturity" | "status">("maturity_date", "asc");

  const btbMaturitySummary = useMemo(() => {
    const now = new Date();
    const thisWeekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const twoWeeksEnd = addDays(thisWeekEnd, 14);
    const thisMonthEnd = endOfMonth(now);
    const nextMonthEnd = endOfMonth(addMonths(now, 1));

    const unpaid = btbLcs.filter(b => b.status !== "paid" && b.status !== "cancelled");

    return {
      thisWeek: unpaid.filter(b => b.maturity_date && new Date(b.maturity_date) <= thisWeekEnd && new Date(b.maturity_date) >= now).reduce((s, b) => s + (b.lc_value ?? 0), 0),
      next2Weeks: unpaid.filter(b => b.maturity_date && new Date(b.maturity_date) > thisWeekEnd && new Date(b.maturity_date) <= twoWeeksEnd).reduce((s, b) => s + (b.lc_value ?? 0), 0),
      thisMonth: unpaid.filter(b => b.maturity_date && new Date(b.maturity_date) >= startOfMonth(now) && new Date(b.maturity_date) <= thisMonthEnd).reduce((s, b) => s + (b.lc_value ?? 0), 0),
      nextMonth: unpaid.filter(b => {
        if (!b.maturity_date) return false;
        const d = new Date(b.maturity_date);
        return d >= startOfMonth(addMonths(now, 1)) && d <= nextMonthEnd;
      }).reduce((s, b) => s + (b.lc_value ?? 0), 0),
    };
  }, [btbLcs]);

  const filteredBtbLcs = useMemo(() => {
    const q = btbSearch.toLowerCase();
    const filtered = btbLcs.filter((lc) => {
      if (q) {
        return lc.lc_number.toLowerCase().includes(q) || lc.supplier_name.toLowerCase().includes(q);
      }
      return true;
    });

    const { sortKey, sortDir } = btbSort;
    const dir = sortDir === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      switch (sortKey) {
        case "lc_number": return dir * a.lc_number.localeCompare(b.lc_number);
        case "supplier_name": return dir * a.supplier_name.localeCompare(b.supplier_name);
        case "purpose": return dir * a.purpose.localeCompare(b.purpose);
        case "lc_value": return dir * ((a.lc_value ?? 0) - (b.lc_value ?? 0));
        case "acceptance_date": return dir * (new Date(a.acceptance_date || "9999").getTime() - new Date(b.acceptance_date || "9999").getTime());
        case "maturity_date": return dir * (new Date(a.maturity_date || "9999").getTime() - new Date(b.maturity_date || "9999").getTime());
        case "days_to_maturity": return dir * ((daysUntil(a.maturity_date) ?? 9999) - (daysUntil(b.maturity_date) ?? 9999));
        case "status": return dir * a.status.localeCompare(b.status);
        default: return 0;
      }
    });
    return filtered;
  }, [btbLcs, btbSearch, btbSort.sortKey, btbSort.sortDir]);

  // ── Tab 3: Deadlines ───────────────────────────────────────────────────────

  type Deadline = {
    type: "shipment" | "expiry" | "presentation" | "btb_maturity";
    date: Date;
    lcNumber: string;
    lcId: string;
    name: string; // buyer or supplier
    label: string;
  };

  const deadlines = useMemo(() => {
    const now = new Date();
    const horizon = addDays(now, deadlineHorizon);
    const result: Deadline[] = [];

    for (const lc of masterLcs) {
      if (lc.status === "closed" || lc.status === "cancelled" || lc.status === "expired") continue;

      // Latest shipment date
      if (lc.latest_shipment_date) {
        const d = new Date(lc.latest_shipment_date);
        if (d >= now && d <= horizon) {
          result.push({ type: "shipment", date: d, lcNumber: lc.lc_number, lcId: lc.id, name: lc.buyer_name, label: "Latest Shipment" });
        }
      }

      // Expiry date
      if (lc.expiry_date) {
        const d = new Date(lc.expiry_date);
        if (d >= now && d <= horizon) {
          result.push({ type: "expiry", date: d, lcNumber: lc.lc_number, lcId: lc.id, name: lc.buyer_name, label: "LC Expiry" });
        }
      }

      // Presentation deadline = latest_shipment_date + presentation_period
      if (lc.latest_shipment_date && lc.presentation_period) {
        const d = addDays(new Date(lc.latest_shipment_date), lc.presentation_period);
        if (d >= now && d <= horizon) {
          result.push({ type: "presentation", date: d, lcNumber: lc.lc_number, lcId: lc.id, name: lc.buyer_name, label: "Doc Presentation" });
        }
      }
    }

    for (const btb of btbLcs) {
      if (btb.status === "paid" || btb.status === "cancelled" || btb.status === "expired") continue;
      if (btb.maturity_date) {
        const d = new Date(btb.maturity_date);
        if (d >= now && d <= horizon) {
          result.push({ type: "btb_maturity", date: d, lcNumber: btb.lc_number, lcId: btb.id, name: btb.supplier_name, label: "BTB Maturity" });
        }
      }
    }

    result.sort((a, b) => a.date.getTime() - b.date.getTime());
    return result;
  }, [masterLcs, btbLcs, deadlineHorizon]);

  const deadlineWeeks = useMemo(() => {
    if (deadlines.length === 0) return [];
    const now = new Date();
    const groups: { weekStart: Date; weekEnd: Date; label: string; isThisWeek: boolean; items: Deadline[] }[] = [];
    const horizon = addDays(now, deadlineHorizon);
    let ws = startOfWeek(now, { weekStartsOn: 1 });

    while (ws <= horizon) {
      const we = endOfWeek(ws, { weekStartsOn: 1 });
      const items = deadlines.filter(dl => isWithinInterval(dl.date, { start: ws, end: we }));
      if (items.length > 0) {
        const isThisWeek = isSameWeek(now, ws, { weekStartsOn: 1 });
        const label = isThisWeek
          ? `This Week (${format(ws, "MMM d")} - ${format(we, "MMM d")})`
          : `Week of ${format(ws, "MMM d")} - ${format(we, "MMM d")}`;
        groups.push({ weekStart: ws, weekEnd: we, label, isThisWeek, items });
      }
      ws = addWeeks(ws, 1);
    }
    return groups;
  }, [deadlines, deadlineHorizon]);

  const deadlineIcon = (type: Deadline["type"]) => {
    switch (type) {
      case "shipment": return <Ship className="h-3.5 w-3.5 text-blue-400" />;
      case "expiry": return <Clock className="h-3.5 w-3.5 text-red-400" />;
      case "presentation": return <FileText className="h-3.5 w-3.5 text-purple-400" />;
      case "btb_maturity": return <DollarSign className="h-3.5 w-3.5 text-amber-400" />;
    }
  };

  const deadlineDotColor = (type: Deadline["type"]) => {
    switch (type) {
      case "shipment": return "bg-blue-400";
      case "expiry": return "bg-red-400";
      case "presentation": return "bg-purple-400";
      case "btb_maturity": return "bg-amber-400";
    }
  };

  // ── Tab 4: Settlement ──────────────────────────────────────────────────────

  const settlementSummary = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const pendingPayment = settlements
      .filter(s => !s.payment_received_date)
      .reduce((sum, s) => sum + s.invoice_value, 0);

    const receivedThisMonth = settlements
      .filter(s => {
        if (!s.payment_received_date) return false;
        const d = new Date(s.payment_received_date);
        return d >= monthStart && d <= monthEnd;
      })
      .reduce((sum, s) => sum + (s.payment_amount ?? 0), 0);

    const paidRows = settlements.filter(s => s.payment_received_date && s.docs_submitted_date);
    const avgDays = paidRows.length > 0
      ? Math.round(paidRows.reduce((sum, s) => sum + differenceInDays(new Date(s.payment_received_date!), new Date(s.docs_submitted_date!)), 0) / paidRows.length)
      : 0;

    return { pendingPayment, receivedThisMonth, avgDays };
  }, [settlements]);

  const settlementSort = useSortable<"lc_number" | "buyer_name" | "shipment_number" | "invoice_value" | "docs_submitted_date" | "status">("docs_submitted_date", "desc");

  const sortedSettlements = useMemo(() => {
    const sorted = [...settlements];
    const { sortKey, sortDir } = settlementSort;
    const dir = sortDir === "asc" ? 1 : -1;
    sorted.sort((a, b) => {
      switch (sortKey) {
        case "lc_number": return dir * a.lc_number.localeCompare(b.lc_number);
        case "buyer_name": return dir * a.buyer_name.localeCompare(b.buyer_name);
        case "shipment_number": return dir * (a.shipment_number - b.shipment_number);
        case "invoice_value": return dir * (a.invoice_value - b.invoice_value);
        case "docs_submitted_date": return dir * (new Date(a.docs_submitted_date || "9999").getTime() - new Date(b.docs_submitted_date || "9999").getTime());
        case "status": return dir * a.status.localeCompare(b.status);
        default: return 0;
      }
    });
    return sorted;
  }, [settlements, settlementSort.sortKey, settlementSort.sortDir]);

  // ── Loading skeleton ──────────────────────────────────────────────────────

  const TableSkeleton = () => (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded" />
      ))}
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ── Render ─────────────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-4">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-purple-500/15 flex items-center justify-center">
            <Landmark className="h-4 w-4 text-purple-400" />
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">LC Management</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => navigate("/finance/lc/reports")} className="gap-1.5 text-xs">
            <BarChart3 className="h-3.5 w-3.5" /> Reports
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/finance/lc/settings")} className="gap-1.5 text-xs">
            <Settings className="h-3.5 w-3.5" /> Settings
          </Button>
          <Button size="sm" onClick={() => navigate("/finance/lc/new?type=master")} className="gap-1.5 text-xs bg-purple-600 hover:bg-purple-700">
            <Plus className="h-3.5 w-3.5" /> New Master LC
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate("/finance/lc/new?type=btb")} className="gap-1.5 text-xs border-purple-500/30 text-purple-400 hover:bg-purple-500/10">
            <Plus className="h-3.5 w-3.5" /> New BTB LC
          </Button>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/50 border border-border">
          <TabsTrigger value="active" className="text-xs data-[state=active]:bg-purple-500/15 data-[state=active]:text-purple-300">
            Active LCs
          </TabsTrigger>
          <TabsTrigger value="btb" className="text-xs data-[state=active]:bg-purple-500/15 data-[state=active]:text-purple-300">
            BTB Tracker
          </TabsTrigger>
          <TabsTrigger value="deadlines" className="text-xs data-[state=active]:bg-purple-500/15 data-[state=active]:text-purple-300">
            Deadlines{deadlines.length > 0 ? ` (${deadlines.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="settlement" className="text-xs data-[state=active]:bg-purple-500/15 data-[state=active]:text-purple-300">
            Settlement
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* TAB 1: Active LCs                                              */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="active" className="mt-4 space-y-3">
          {/* Filter bar */}
          <div className="flex flex-col md:flex-row items-start md:items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search LC# or buyer..."
                value={masterSearch}
                onChange={(e) => setMasterSearch(e.target.value)}
                className="pl-8 h-8 text-xs bg-background"
              />
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <button
                onClick={() => setMasterStatusFilter("all")}
                className={cn("px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors",
                  masterStatusFilter === "all" ? "bg-purple-500/15 text-purple-300 border-purple-500/30" : "bg-muted/50 text-muted-foreground border-transparent hover:border-border"
                )}
              >All</button>
              {MASTER_STATUSES.map(s => (
                <button
                  key={s}
                  onClick={() => setMasterStatusFilter(s)}
                  className={cn("px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors",
                    masterStatusFilter === s ? "bg-purple-500/15 text-purple-300 border-purple-500/30" : "bg-muted/50 text-muted-foreground border-transparent hover:border-border"
                  )}
                >{MASTER_STATUS_BADGE[s]?.label ?? s}</button>
              ))}
            </div>
            <div className="flex items-center gap-3 ml-auto text-xs text-muted-foreground whitespace-nowrap">
              <span><strong className="text-foreground">{masterSummary.count}</strong> LCs</span>
              <span>{fmtCompact(masterSummary.totalValue)} total value</span>
              <span>{fmtCompact(masterSummary.totalUtilized)} utilized</span>
            </div>
          </div>

          {/* Table */}
          {masterLoading ? <TableSkeleton /> : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="text-left px-3 py-2"><SortHeader label="LC#" field="lc_number" {...masterSort} onToggle={masterSort.toggle} /></th>
                      <th className="text-left px-3 py-2"><SortHeader label="Buyer" field="buyer_name" {...masterSort} onToggle={masterSort.toggle} /></th>
                      <th className="text-right px-3 py-2"><SortHeader label="Value" field="lc_value" {...masterSort} onToggle={masterSort.toggle} /></th>
                      <th className="text-left px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Ccy</th>
                      <th className="text-left px-3 py-2"><SortHeader label="Latest Ship" field="latest_shipment_date" {...masterSort} onToggle={masterSort.toggle} /></th>
                      <th className="text-left px-3 py-2"><SortHeader label="Expiry" field="expiry_date" {...masterSort} onToggle={masterSort.toggle} /></th>
                      <th className="text-left px-3 py-2"><SortHeader label="Utilized%" field="utilized" {...masterSort} onToggle={masterSort.toggle} /></th>
                      <th className="text-left px-3 py-2"><SortHeader label="Status" field="status" {...masterSort} onToggle={masterSort.toggle} /></th>
                      <th className="text-right px-3 py-2"><SortHeader label="Days Left" field="days_left" {...masterSort} onToggle={masterSort.toggle} /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMasterLcs.map((lc) => {
                      const days = daysUntil(lc.expiry_date);
                      const utilPct = lc.lc_value > 0 ? Math.round((lc.total_utilized / lc.lc_value) * 100) : 0;
                      const badge = MASTER_STATUS_BADGE[lc.status] ?? { label: lc.status, cls: "bg-slate-500/10 text-slate-400" };
                      return (
                        <tr
                          key={lc.id}
                          onClick={() => navigate(`/finance/lc/${lc.id}`)}
                          className={cn(
                            "cursor-pointer hover:bg-muted/30 transition-colors",
                            urgencyBorder(days),
                          )}
                        >
                          <td className="px-3 py-2 font-mono font-medium text-foreground">{lc.lc_number}</td>
                          <td className="px-3 py-2 text-muted-foreground max-w-[160px] truncate">{lc.buyer_name}</td>
                          <td className="px-3 py-2 text-right font-mono">{fmt(lc.lc_value)}</td>
                          <td className="px-2 py-2 text-muted-foreground">{lc.currency}</td>
                          <td className="px-3 py-2 text-muted-foreground">{fmtDate(lc.latest_shipment_date)}</td>
                          <td className="px-3 py-2 text-muted-foreground">{fmtDate(lc.expiry_date)}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Progress value={utilPct} className="h-1.5 w-16 bg-muted" />
                              <span className="font-mono text-muted-foreground w-8 text-right">{utilPct}%</span>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className={cn("text-[10px] font-medium px-1.5 py-0", badge.cls)}>
                              {badge.label}
                            </Badge>
                          </td>
                          <td className={cn("px-3 py-2 text-right font-mono font-medium", days !== null && days < 14 ? "text-red-400" : "text-muted-foreground")}>
                            {days !== null ? `${days}d` : "-"}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredMasterLcs.length === 0 && (
                      <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">No LCs match your filters</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {filteredMasterLcs.map((lc) => {
                  const days = daysUntil(lc.expiry_date);
                  const utilPct = lc.lc_value > 0 ? Math.round((lc.total_utilized / lc.lc_value) * 100) : 0;
                  const badge = MASTER_STATUS_BADGE[lc.status] ?? { label: lc.status, cls: "bg-slate-500/10 text-slate-400" };
                  return (
                    <div
                      key={lc.id}
                      onClick={() => navigate(`/finance/lc/${lc.id}`)}
                      className={cn(
                        "rounded-lg border border-border bg-card p-3 cursor-pointer hover:bg-muted/20 transition-colors",
                        urgencyBorder(days),
                      )}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="font-mono font-medium text-sm">{lc.lc_number}</p>
                          <p className="text-xs text-muted-foreground">{lc.buyer_name}</p>
                        </div>
                        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", badge.cls)}>
                          {badge.label}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Value</span>
                          <p className="font-mono">{lc.currency} {fmt(lc.lc_value)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Expiry</span>
                          <p>{fmtDate(lc.expiry_date)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Days</span>
                          <p className={cn("font-mono font-medium", days !== null && days < 14 ? "text-red-400" : "")}>{days !== null ? `${days}d` : "-"}</p>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Progress value={utilPct} className="h-1.5 flex-1 bg-muted" />
                        <span className="text-[10px] font-mono text-muted-foreground">{utilPct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* TAB 2: BTB Tracker                                             */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="btb" className="mt-4 space-y-3">
          {/* Summary strip */}
          <div className="flex items-center gap-0 rounded-lg border border-border overflow-hidden text-xs">
            <div className={cn("flex-1 px-3 py-2 border-r border-border", btbMaturitySummary.thisWeek > 0 ? "bg-red-500/5" : "bg-muted/20")}>
              <span className="text-muted-foreground">This Week</span>
              <p className={cn("font-mono font-semibold", btbMaturitySummary.thisWeek > 0 ? "text-red-400" : "text-foreground")}>
                {fmtCompact(btbMaturitySummary.thisWeek)}
              </p>
            </div>
            <div className="flex-1 px-3 py-2 border-r border-border bg-muted/20">
              <span className="text-muted-foreground">Next 2 Weeks</span>
              <p className="font-mono font-semibold text-amber-400">{fmtCompact(btbMaturitySummary.next2Weeks)}</p>
            </div>
            <div className="flex-1 px-3 py-2 border-r border-border bg-muted/20">
              <span className="text-muted-foreground">This Month</span>
              <p className="font-mono font-semibold">{fmtCompact(btbMaturitySummary.thisMonth)}</p>
            </div>
            <div className="flex-1 px-3 py-2 bg-muted/20">
              <span className="text-muted-foreground">Next Month</span>
              <p className="font-mono font-semibold">{fmtCompact(btbMaturitySummary.nextMonth)}</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search BTB LC# or supplier..."
              value={btbSearch}
              onChange={(e) => setBtbSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-background"
            />
          </div>

          {btbLoading ? <TableSkeleton /> : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="text-left px-3 py-2"><SortHeader label="BTB LC#" field="lc_number" {...btbSort} onToggle={btbSort.toggle} /></th>
                      <th className="text-left px-3 py-2"><SortHeader label="Supplier" field="supplier_name" {...btbSort} onToggle={btbSort.toggle} /></th>
                      <th className="text-left px-3 py-2"><SortHeader label="Purpose" field="purpose" {...btbSort} onToggle={btbSort.toggle} /></th>
                      <th className="text-right px-3 py-2"><SortHeader label="Value" field="lc_value" {...btbSort} onToggle={btbSort.toggle} /></th>
                      <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Master LC#</th>
                      <th className="text-left px-3 py-2"><SortHeader label="Acceptance" field="acceptance_date" {...btbSort} onToggle={btbSort.toggle} /></th>
                      <th className="text-left px-3 py-2"><SortHeader label="Maturity" field="maturity_date" {...btbSort} onToggle={btbSort.toggle} /></th>
                      <th className="text-right px-3 py-2"><SortHeader label="Days" field="days_to_maturity" {...btbSort} onToggle={btbSort.toggle} /></th>
                      <th className="text-left px-3 py-2"><SortHeader label="Status" field="status" {...btbSort} onToggle={btbSort.toggle} /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBtbLcs.map((lc) => {
                      const days = daysUntil(lc.maturity_date);
                      const badge = BTB_STATUS_BADGE[lc.status] ?? { label: lc.status, cls: "bg-slate-500/10 text-slate-400" };
                      const purposeCls = PURPOSE_BADGE[lc.purpose] ?? PURPOSE_BADGE.other ?? "bg-slate-500/10 text-slate-400";
                      // Find parent master LC number
                      const parentMaster = lc.master_lc_id ? masterLcs.find(m => m.id === lc.master_lc_id) : null;
                      return (
                        <tr
                          key={lc.id}
                          className={cn("hover:bg-muted/30 transition-colors", urgencyBorder(days))}
                        >
                          <td className="px-3 py-2 font-mono font-medium">{lc.lc_number}</td>
                          <td className="px-3 py-2 text-muted-foreground max-w-[140px] truncate">{lc.supplier_name}</td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className={cn("text-[10px] font-medium px-1.5 py-0 capitalize", purposeCls)}>
                              {lc.purpose}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{lc.currency} {fmt(lc.lc_value)}</td>
                          <td className="px-3 py-2">
                            {parentMaster ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); navigate(`/finance/lc/${parentMaster.id}`); }}
                                className="font-mono text-purple-400 hover:underline"
                              >{parentMaster.lc_number}</button>
                            ) : <span className="text-muted-foreground">-</span>}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{fmtDate(lc.acceptance_date)}</td>
                          <td className="px-3 py-2 text-muted-foreground">{fmtDate(lc.maturity_date)}</td>
                          <td className={cn("px-3 py-2 text-right font-mono font-medium", days !== null && days < 14 ? "text-red-400" : "text-muted-foreground")}>
                            {days !== null ? `${days}d` : "-"}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className={cn("text-[10px] font-medium px-1.5 py-0", badge.cls)}>
                              {badge.label}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredBtbLcs.length === 0 && (
                      <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">No BTB LCs found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {filteredBtbLcs.map((lc) => {
                  const days = daysUntil(lc.maturity_date);
                  const badge = BTB_STATUS_BADGE[lc.status] ?? { label: lc.status, cls: "bg-slate-500/10 text-slate-400" };
                  const purposeCls = PURPOSE_BADGE[lc.purpose] ?? PURPOSE_BADGE.other ?? "bg-slate-500/10 text-slate-400";
                  return (
                    <div
                      key={lc.id}
                      className={cn("rounded-lg border border-border bg-card p-3", urgencyBorder(days))}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="font-mono font-medium text-sm">{lc.lc_number}</p>
                          <p className="text-xs text-muted-foreground">{lc.supplier_name}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 capitalize", purposeCls)}>{lc.purpose}</Badge>
                          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", badge.cls)}>{badge.label}</Badge>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Value</span>
                          <p className="font-mono">{lc.currency} {fmt(lc.lc_value)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Maturity</span>
                          <p>{fmtDate(lc.maturity_date)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Days</span>
                          <p className={cn("font-mono font-medium", days !== null && days < 14 ? "text-red-400" : "")}>{days !== null ? `${days}d` : "-"}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* TAB 3: Deadlines                                               */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="deadlines" className="mt-4 space-y-4">
          {/* Horizon selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Horizon:</span>
            {([30, 60, 90] as const).map((h) => (
              <button
                key={h}
                onClick={() => setDeadlineHorizon(h)}
                className={cn(
                  "px-3 py-1 rounded text-xs font-medium border transition-colors",
                  deadlineHorizon === h
                    ? "bg-purple-500/15 text-purple-300 border-purple-500/30"
                    : "bg-muted/50 text-muted-foreground border-transparent hover:border-border"
                )}
              >{h} days</button>
            ))}
            <span className="ml-auto text-xs text-muted-foreground">
              {deadlines.length} deadline{deadlines.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-400 inline-block" /> Shipment</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400 inline-block" /> Expiry</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-purple-400 inline-block" /> Doc Presentation</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400 inline-block" /> BTB Maturity</span>
          </div>

          {(masterLoading || btbLoading) ? <TableSkeleton /> : deadlineWeeks.length === 0 ? (
            <div className="text-center py-16">
              <CheckCircle2 className="h-10 w-10 text-emerald-400/50 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No deadlines in the next {deadlineHorizon} days</p>
              <p className="text-xs text-muted-foreground mt-1">Everything looks clear ahead.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {deadlineWeeks.map((week) => (
                <div key={week.label} className={cn("rounded-lg border border-border overflow-hidden", week.isThisWeek ? "bg-purple-500/5 border-purple-500/20" : "")}>
                  <div className={cn("px-4 py-2 border-b border-border", week.isThisWeek ? "bg-purple-500/10" : "bg-muted/30")}>
                    <h3 className="text-xs font-semibold">{week.label}</h3>
                  </div>
                  <div className="divide-y divide-border">
                    {week.items.map((dl, idx) => {
                      const daysLeft = differenceInDays(dl.date, new Date());
                      return (
                        <div
                          key={`${dl.lcNumber}-${dl.type}-${idx}`}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors"
                        >
                          <div className="flex items-center gap-2 shrink-0">
                            {deadlineIcon(dl.type)}
                            <span className={cn("h-2 w-2 rounded-full", deadlineDotColor(dl.type))} />
                          </div>
                          <button
                            onClick={() => navigate(`/finance/lc/${dl.lcId}`)}
                            className="font-mono text-xs font-medium text-purple-400 hover:underline shrink-0"
                          >{dl.lcNumber}</button>
                          <span className="text-xs text-muted-foreground truncate">{dl.name}</span>
                          <span className="text-xs text-muted-foreground shrink-0">{dl.label}</span>
                          <span className="text-xs text-muted-foreground ml-auto shrink-0">{format(dl.date, "EEE, MMM d")}</span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] font-mono px-1.5 py-0 shrink-0",
                              daysLeft < 7 ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-muted text-muted-foreground border-border"
                            )}
                          >{daysLeft}d</Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* TAB 4: Settlement Tracker                                      */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="settlement" className="mt-4 space-y-3">
          {/* Summary strip */}
          <div className="flex items-center gap-0 rounded-lg border border-border overflow-hidden text-xs">
            <div className="flex-1 px-3 py-2 border-r border-border bg-muted/20">
              <span className="text-muted-foreground">Pending Payment</span>
              <p className="font-mono font-semibold text-amber-400">{fmtCompact(settlementSummary.pendingPayment)}</p>
            </div>
            <div className="flex-1 px-3 py-2 border-r border-border bg-muted/20">
              <span className="text-muted-foreground">Received This Month</span>
              <p className="font-mono font-semibold text-emerald-400">{fmtCompact(settlementSummary.receivedThisMonth)}</p>
            </div>
            <div className="flex-1 px-3 py-2 bg-muted/20">
              <span className="text-muted-foreground">Avg Days to Payment</span>
              <p className="font-mono font-semibold">{settlementSummary.avgDays}d</p>
            </div>
          </div>

          {settlementsLoading ? <TableSkeleton /> : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="text-left px-3 py-2"><SortHeader label="LC#" field="lc_number" {...settlementSort} onToggle={settlementSort.toggle} /></th>
                      <th className="text-left px-3 py-2"><SortHeader label="Buyer" field="buyer_name" {...settlementSort} onToggle={settlementSort.toggle} /></th>
                      <th className="text-right px-3 py-2"><SortHeader label="Ship#" field="shipment_number" {...settlementSort} onToggle={settlementSort.toggle} /></th>
                      <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Invoice#</th>
                      <th className="text-right px-3 py-2"><SortHeader label="Invoice Value" field="invoice_value" {...settlementSort} onToggle={settlementSort.toggle} /></th>
                      <th className="text-left px-3 py-2"><SortHeader label="Docs Submitted" field="docs_submitted_date" {...settlementSort} onToggle={settlementSort.toggle} /></th>
                      <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Expected Pay</th>
                      <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Actual Pay</th>
                      <th className="text-right px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Received</th>
                      <th className="text-right px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Net</th>
                      <th className="text-left px-3 py-2"><SortHeader label="Status" field="status" {...settlementSort} onToggle={settlementSort.toggle} /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSettlements.map((s) => {
                      const badge = SETTLEMENT_STATUS_BADGE[s.status] ?? { label: s.status, cls: "bg-slate-500/10 text-slate-400" };
                      const deductions = s.payment_amount != null ? s.invoice_value - s.payment_amount : null;
                      const net = s.payment_amount ?? null;
                      const isOverdue = !s.payment_received_date && s.expected_payment_date && new Date(s.expected_payment_date) < new Date();
                      const showExpectedDate = !s.payment_received_date && s.expected_payment_date;
                      return (
                        <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-3 py-2">
                            <button
                              onClick={() => navigate(`/finance/lc/${s.lc_id}`)}
                              className="font-mono font-medium text-purple-400 hover:underline"
                            >{s.lc_number}</button>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground max-w-[120px] truncate">{s.buyer_name || "-"}</td>
                          <td className="px-3 py-2 text-right font-mono">{s.shipment_number}</td>
                          <td className="px-3 py-2 font-mono text-muted-foreground">{s.invoice_number || "-"}</td>
                          <td className="px-3 py-2 text-right font-mono">{fmt(s.invoice_value)}</td>
                          <td className="px-3 py-2 text-muted-foreground">{fmtDate(s.docs_submitted_date)}</td>
                          <td className="px-3 py-2">
                            {showExpectedDate ? (
                              <span className={cn("text-xs", isOverdue ? "text-red-400 font-medium" : "text-amber-400")}>
                                {fmtDate(s.expected_payment_date)}{isOverdue ? " (overdue)" : ""}
                              </span>
                            ) : <span className="text-muted-foreground">-</span>}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{fmtDate(s.payment_received_date)}</td>
                          <td className="px-3 py-2 text-right font-mono">{s.payment_amount != null ? fmt(s.payment_amount) : "-"}</td>
                          <td className="px-3 py-2 text-right font-mono">
                            {deductions != null && deductions !== 0 ? (
                              <span className="text-red-400">-{fmt(Math.abs(deductions))}</span>
                            ) : net != null ? (
                              <span>{fmt(net)}</span>
                            ) : "-"}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className={cn("text-[10px] font-medium px-1.5 py-0", badge.cls)}>
                              {badge.label}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                    {sortedSettlements.length === 0 && (
                      <tr><td colSpan={11} className="text-center py-12 text-muted-foreground">
                        <div className="space-y-1">
                          <Ship className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                          <p className="font-medium">No shipments recorded yet</p>
                          <p className="text-xs">Add shipments from individual LC detail pages.</p>
                        </div>
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {sortedSettlements.map((s) => {
                  const badge = SETTLEMENT_STATUS_BADGE[s.status] ?? { label: s.status, cls: "bg-slate-500/10 text-slate-400" };
                  const isOverdue = !s.payment_received_date && s.expected_payment_date && new Date(s.expected_payment_date) < new Date();
                  return (
                    <div key={s.id} className="rounded-lg border border-border bg-card p-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <button
                            onClick={() => navigate(`/finance/lc/${s.lc_id}`)}
                            className="font-mono font-medium text-sm text-purple-400 hover:underline"
                          >{s.lc_number}</button>
                          <p className="text-xs text-muted-foreground">{s.buyer_name || "Unknown"} / Ship #{s.shipment_number}</p>
                        </div>
                        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", badge.cls)}>
                          {badge.label}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Invoice</span>
                          <p className="font-mono">{fmt(s.invoice_value)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Received</span>
                          <p className="font-mono">{s.payment_amount != null ? fmt(s.payment_amount) : "-"}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Docs Sent</span>
                          <p>{fmtDate(s.docs_submitted_date)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Payment</span>
                          <p className={cn(isOverdue ? "text-red-400" : "")}>
                            {s.payment_received_date ? fmtDate(s.payment_received_date) : s.expected_payment_date ? `${fmtDate(s.expected_payment_date)}${isOverdue ? " (overdue)" : ""}` : "-"}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
