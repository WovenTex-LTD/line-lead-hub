import { useEffect, useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  format,
  differenceInDays,
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfQuarter,
} from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  DollarSign,
  Receipt,
  Wallet,
  Landmark,
  Calculator,
  Users,
  FileText,
  BarChart3,
  ArrowRight,
  AlertTriangle,
  Clock,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Calendar,
  CheckCircle2,
  Shield,
  Bell,
  Activity,
  Zap,
  Eye,
  Package,
  Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useFinancePortal } from "@/contexts/FinancePortalContext";
import { supabase } from "@/integrations/supabase/client";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Animation variants                                                */
/* ------------------------------------------------------------------ */

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const fmt = (n: number) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtInt = (n: number) => n.toLocaleString("en-US");

const now = new Date();
const todayStr = format(now, "yyyy-MM-dd");
const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
const monthEnd = format(endOfMonth(now), "yyyy-MM-dd");
const prevMonthStart = format(startOfMonth(subMonths(now, 1)), "yyyy-MM-dd");
const prevMonthEnd = format(endOfMonth(subMonths(now, 1)), "yyyy-MM-dd");
const quarterStart = format(startOfQuarter(now), "yyyy-MM-dd");

function daysUntil(dateStr: string) {
  return differenceInDays(new Date(dateStr), now);
}

function daysSince(dateStr: string) {
  return differenceInDays(now, new Date(dateStr));
}

function timeAgo(dateStr: string) {
  const ms = now.getTime() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${Math.max(0, mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function invoiceTotal(inv: any): number {
  const lines = ((inv.invoice_line_items ?? []) as any[]);
  return lines.reduce((ls: number, l: any) => {
    const line = (l.quantity ?? 0) * (l.unit_price ?? 0);
    const disc = line * ((l.discount_pct ?? 0) / 100);
    return ls + line - disc;
  }, 0);
}

/* ------------------------------------------------------------------ */
/*  Skeleton sections                                                 */
/* ------------------------------------------------------------------ */

function SectionSkeleton({ rows = 3, height = "h-24" }: { rows?: number; height?: string }) {
  return (
    <div className="space-y-3">
      <Skeleton className={cn("w-full rounded-xl", height)} />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="w-full h-8 rounded-lg" />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section Header                                                    */
/* ------------------------------------------------------------------ */

function SectionHeader({
  icon: Icon,
  title,
  linkText,
  linkPath,
  gradient = "from-purple-500 to-violet-600",
  shadow = "shadow-purple-500/20",
}: {
  icon: any;
  title: string;
  linkText?: string;
  linkPath?: string;
  gradient?: string;
  shadow?: string;
}) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <div className={cn("rounded-lg bg-gradient-to-br p-2 shadow-md", gradient, shadow)}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <h3 className="text-sm font-bold tracking-tight">{title}</h3>
      </div>
      {linkText && linkPath && (
        <button
          onClick={() => navigate(linkPath)}
          className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 flex items-center gap-0.5 transition-colors"
        >
          {linkText} <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Card shell                                                        */
/* ------------------------------------------------------------------ */

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-purple-200/60 dark:border-purple-800/40 bg-gradient-to-br from-purple-50/50 via-white to-violet-50/30 dark:from-purple-950/30 dark:via-card dark:to-violet-950/15",
        className
      )}
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-purple-500/5 to-transparent rounded-bl-full pointer-events-none" />
      <div className="relative p-4 md:p-5">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function FinanceDashboard() {
  const { factory } = useAuth();
  const { bdtToUsd } = useFinancePortal();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [alertsExpanded, setAlertsExpanded] = useState(false);

  /* ---------- Data fetching ---------- */

  useEffect(() => {
    if (!factory?.id) return;
    const fid = factory.id;

    const load = async () => {
      setLoading(true);

      const [invRes, btbRes, mlcRes, payRes, contractRes, costSheetRes, exportRes, buyerRes, discRes] =
        await Promise.all([
          supabase
            .from("invoices" as any)
            .select(
              "id, invoice_number, buyer_name, currency, due_date, status, created_at, invoice_line_items(quantity, unit_price, discount_pct)"
            )
            .eq("factory_id", fid),
          supabase
            .from("btb_lcs" as any)
            .select("id, lc_number, supplier_name, lc_value, currency, maturity_date, status")
            .eq("factory_id", fid),
          supabase
            .from("master_lcs" as any)
            .select(
              "id, lc_number, buyer_name, lc_value, currency, expiry_date, total_shipped, total_utilized, status, docs_submitted_date, latest_shipment_date"
            )
            .eq("factory_id", fid),
          supabase
            .from("payments" as any)
            .select(
              "id, direction, category, buyer_name, payee_name, original_amount, original_currency, payment_date, status, description, created_at"
            )
            .eq("factory_id", fid)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(30),
          supabase
            .from("sales_contracts" as any)
            .select("id, contract_number, buyer_name, total_value, status, created_at")
            .eq("factory_id", fid),
          supabase
            .from("cost_sheets" as any)
            .select("id, status")
            .eq("factory_id", fid)
            .eq("is_template", false),
          supabase
            .from("export_costs" as any)
            .select("id, amount, date_incurred")
            .eq("factory_id", fid)
            .gte("date_incurred", monthStart),
          supabase
            .from("buyer_profiles" as any)
            .select("id, company_name")
            .eq("factory_id", fid),
          supabase.from("lc_discrepancies" as any).select("id, status"),
        ]);

      setData({
        invoices: ((invRes.data as any[]) ?? []),
        btbLcs: ((btbRes.data as any[]) ?? []),
        masterLcs: ((mlcRes.data as any[]) ?? []),
        payments: ((payRes.data as any[]) ?? []),
        contracts: ((contractRes.data as any[]) ?? []),
        costSheets: ((costSheetRes.data as any[]) ?? []),
        exportCosts: ((exportRes.data as any[]) ?? []),
        buyers: ((buyerRes.data as any[]) ?? []),
        discrepancies: ((discRes.data as any[]) ?? []),
      });
      setLoading(false);
    };

    load();
  }, [factory?.id]);

  /* ---------------------------------------------------------------- */
  /*  Derived metrics                                                 */
  /* ---------------------------------------------------------------- */

  const invoices = (data?.invoices ?? []) as any[];
  const btbLcs = (data?.btbLcs ?? []) as any[];
  const masterLcs = (data?.masterLcs ?? []) as any[];
  const payments = (data?.payments ?? []) as any[];
  const contracts = (data?.contracts ?? []) as any[];
  const costSheets = (data?.costSheets ?? []) as any[];
  const exportCosts = (data?.exportCosts ?? []) as any[];
  const buyers = (data?.buyers ?? []) as any[];
  const discrepancies = (data?.discrepancies ?? []) as any[];

  // --- Cash Position ---
  const unpaidInvoices = invoices.filter((i: any) =>
    ["draft", "sent", "overdue"].includes(i.status)
  );

  const totalReceivables = unpaidInvoices.reduce(
    (sum: number, inv: any) => sum + invoiceTotal(inv),
    0
  );

  const activeBtbStatuses = ["opened", "docs_received", "accepted", "matured"];
  const activeBtbLcs = btbLcs.filter((lc: any) => activeBtbStatuses.includes(lc.status));
  const totalPayables = activeBtbLcs.reduce(
    (sum: number, lc: any) => sum + (lc.lc_value ?? 0),
    0
  );

  const netPosition = totalReceivables - totalPayables;

  // --- This month payments ---
  const thisMonthPayments = payments.filter(
    (p: any) => (p.payment_date ?? "").slice(0, 7) === todayStr.slice(0, 7)
  );
  const thisMonthReceived = thisMonthPayments
    .filter((p: any) => p.direction === "in")
    .reduce((sum: number, p: any) => sum + (p.original_amount ?? 0), 0);
  const thisMonthPaid = thisMonthPayments
    .filter((p: any) => p.direction === "out")
    .reduce((sum: number, p: any) => sum + (p.original_amount ?? 0), 0);

  // --- Previous month payments ---
  const prevMonthPayments = payments.filter((p: any) => {
    const d = p.payment_date ?? "";
    return d >= prevMonthStart && d <= prevMonthEnd;
  });
  const prevMonthReceived = prevMonthPayments
    .filter((p: any) => p.direction === "in")
    .reduce((sum: number, p: any) => sum + (p.original_amount ?? 0), 0);
  const prevMonthPaid = prevMonthPayments
    .filter((p: any) => p.direction === "out")
    .reduce((sum: number, p: any) => sum + (p.original_amount ?? 0), 0);

  // --- Overdue invoices bucketed ---
  const overdueInvoices = invoices.filter((i: any) => i.status === "overdue");
  const overdue90Plus = overdueInvoices.filter(
    (i: any) => i.due_date && daysSince(i.due_date) > 90
  );
  const overdue31to90 = overdueInvoices.filter(
    (i: any) => i.due_date && daysSince(i.due_date) > 30 && daysSince(i.due_date) <= 90
  );

  // --- Ageing buckets ---
  const ageingBuckets = useMemo(() => {
    const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
    unpaidInvoices.forEach((inv: any) => {
      const amt = invoiceTotal(inv);
      if (!inv.due_date) {
        buckets.current += amt;
        return;
      }
      const age = daysSince(inv.due_date);
      if (age <= 0) buckets.current += amt;
      else if (age <= 30) buckets.d1_30 += amt;
      else if (age <= 60) buckets.d31_60 += amt;
      else if (age <= 90) buckets.d61_90 += amt;
      else buckets.d90plus += amt;
    });
    return buckets;
  }, [data]);

  const ageingTotal =
    ageingBuckets.current +
    ageingBuckets.d1_30 +
    ageingBuckets.d31_60 +
    ageingBuckets.d61_90 +
    ageingBuckets.d90plus;

  // --- Top 5 debtors ---
  const debtorMap = useMemo(() => {
    const map: Record<string, { outstanding: number; oldestAge: number; buyerId?: string }> = {};
    unpaidInvoices.forEach((inv: any) => {
      const name = inv.buyer_name ?? "Unknown";
      const amt = invoiceTotal(inv);
      const age = inv.due_date ? Math.max(0, daysSince(inv.due_date)) : 0;
      if (!map[name]) map[name] = { outstanding: 0, oldestAge: 0 };
      map[name].outstanding += amt;
      map[name].oldestAge = Math.max(map[name].oldestAge, age);
      const buyer = buyers.find((b: any) => b.company_name === name);
      if (buyer) map[name].buyerId = buyer.id;
    });
    return Object.entries(map)
      .sort((a, b) => b[1].outstanding - a[1].outstanding)
      .slice(0, 5);
  }, [data]);

  // --- LC metrics ---
  const activeMasterStatuses = ["received", "advised", "confirmed", "partially_shipped", "fully_shipped"];
  const activeMasterLcs = masterLcs.filter((lc: any) => activeMasterStatuses.includes(lc.status));
  const activeMasterLcValue = activeMasterLcs.reduce(
    (sum: number, lc: any) => sum + (lc.lc_value ?? 0),
    0
  );
  const activeBtbLcValue = activeBtbLcs.reduce(
    (sum: number, lc: any) => sum + (lc.lc_value ?? 0),
    0
  );

  const docsPendingLcs = masterLcs.filter(
    (lc: any) =>
      lc.latest_shipment_date && !lc.docs_submitted_date && activeMasterStatuses.includes(lc.status)
  );

  const btbMaturingThisMonth = btbLcs.filter(
    (lc: any) =>
      lc.maturity_date &&
      lc.maturity_date >= monthStart &&
      lc.maturity_date <= monthEnd &&
      activeBtbStatuses.includes(lc.status)
  );
  const btbMaturingThisMonthValue = btbMaturingThisMonth.reduce(
    (sum: number, lc: any) => sum + (lc.lc_value ?? 0),
    0
  );

  const lcsExpiring30d = masterLcs.filter((lc: any) => {
    if (!lc.expiry_date) return false;
    const d = daysUntil(lc.expiry_date);
    return d >= 0 && d <= 30 && activeMasterStatuses.includes(lc.status);
  });

  const totalLcValue = activeMasterLcs.reduce(
    (sum: number, lc: any) => sum + (lc.lc_value ?? 0),
    0
  );
  const totalShipped = activeMasterLcs.reduce(
    (sum: number, lc: any) => sum + (lc.total_shipped ?? 0),
    0
  );
  const utilisationPct = totalLcValue > 0 ? (totalShipped / totalLcValue) * 100 : 0;

  // --- BTB LCs maturing soon ---
  const maturingLcs3d = btbLcs.filter((lc: any) => {
    if (!lc.maturity_date) return false;
    const d = daysUntil(lc.maturity_date);
    return d >= 0 && d <= 3 && activeBtbStatuses.includes(lc.status);
  });
  const maturingLcs4to14 = btbLcs.filter((lc: any) => {
    if (!lc.maturity_date) return false;
    const d = daysUntil(lc.maturity_date);
    return d >= 4 && d <= 14 && activeBtbStatuses.includes(lc.status);
  });

  // --- Master LCs expiring <=7d with no docs ---
  const masterLcsExpiringNoDocs = masterLcs.filter((lc: any) => {
    if (!lc.expiry_date) return false;
    const d = daysUntil(lc.expiry_date);
    return d >= 0 && d <= 7 && !lc.docs_submitted_date && activeMasterStatuses.includes(lc.status);
  });

  // --- Pending approval payments ---
  const pendingPayments = payments.filter((p: any) => p.status === "pending_approval");
  const unresolvedDisc = discrepancies.filter((d: any) => d.status !== "resolved");

  // --- LC proceeds expected this week ---
  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() + 7);
  const weekEndStr = format(weekEnd, "yyyy-MM-dd");
  const lcProceedsThisWeek = invoices.filter(
    (i: any) => i.due_date && i.due_date >= todayStr && i.due_date <= weekEndStr && ["sent"].includes(i.status)
  );

  // --- Draft cost sheets ---
  const draftCostSheets = costSheets.filter((cs: any) => cs.status === "draft");

  // --- Export cost total ---
  const exportCostTotal = exportCosts.reduce(
    (sum: number, e: any) => sum + (e.amount ?? 0),
    0
  );

  /* ---------------------------------------------------------------- */
  /*  Alerts                                                          */
  /* ---------------------------------------------------------------- */

  const alerts = useMemo(() => {
    const list: { severity: "red" | "amber" | "blue"; label: string; count: number; path: string }[] = [];

    if (overdue90Plus.length > 0)
      list.push({
        severity: "red",
        label: `${overdue90Plus.length} invoice${overdue90Plus.length > 1 ? "s" : ""} overdue 90+ days`,
        count: overdue90Plus.length,
        path: "/finance/invoices",
      });
    if (maturingLcs3d.length > 0)
      list.push({
        severity: "red",
        label: `${maturingLcs3d.length} BTB LC${maturingLcs3d.length > 1 ? "s" : ""} maturing within 3 days`,
        count: maturingLcs3d.length,
        path: "/finance/lc",
      });
    if (masterLcsExpiringNoDocs.length > 0)
      list.push({
        severity: "red",
        label: `${masterLcsExpiringNoDocs.length} Master LC${masterLcsExpiringNoDocs.length > 1 ? "s" : ""} expiring in 7 days with no docs`,
        count: masterLcsExpiringNoDocs.length,
        path: "/finance/lc",
      });

    if (overdue31to90.length > 0)
      list.push({
        severity: "amber",
        label: `${overdue31to90.length} invoice${overdue31to90.length > 1 ? "s" : ""} overdue 31-90 days`,
        count: overdue31to90.length,
        path: "/finance/invoices",
      });
    if (maturingLcs4to14.length > 0)
      list.push({
        severity: "amber",
        label: `${maturingLcs4to14.length} BTB LC${maturingLcs4to14.length > 1 ? "s" : ""} maturing 4-14 days`,
        count: maturingLcs4to14.length,
        path: "/finance/lc",
      });
    if (pendingPayments.length > 0)
      list.push({
        severity: "amber",
        label: `${pendingPayments.length} payment${pendingPayments.length > 1 ? "s" : ""} pending approval`,
        count: pendingPayments.length,
        path: "/finance/payments",
      });
    if (unresolvedDisc.length > 0)
      list.push({
        severity: "amber",
        label: `${unresolvedDisc.length} unresolved discrepanc${unresolvedDisc.length > 1 ? "ies" : "y"}`,
        count: unresolvedDisc.length,
        path: "/finance/lc",
      });

    if (lcProceedsThisWeek.length > 0)
      list.push({
        severity: "blue",
        label: `${lcProceedsThisWeek.length} LC proceed${lcProceedsThisWeek.length > 1 ? "s" : ""} expected this week`,
        count: lcProceedsThisWeek.length,
        path: "/finance/invoices",
      });
    if (draftCostSheets.length > 0)
      list.push({
        severity: "blue",
        label: `${draftCostSheets.length} draft cost sheet${draftCostSheets.length > 1 ? "s" : ""}`,
        count: draftCostSheets.length,
        path: "/finance/costing",
      });

    return list;
  }, [data]);

  const urgentCount = alerts.filter((a) => a.severity === "red").length;
  const warningCount = alerts.filter((a) => a.severity === "amber").length;
  const infoCount = alerts.filter((a) => a.severity === "blue").length;
  const visibleAlerts = alertsExpanded ? alerts : alerts.slice(0, 8);

  /* ---------------------------------------------------------------- */
  /*  Upcoming cash obligations (14 days)                             */
  /* ---------------------------------------------------------------- */

  const fourteenDaysOut = new Date(now);
  fourteenDaysOut.setDate(now.getDate() + 14);
  const fourteenStr = format(fourteenDaysOut, "yyyy-MM-dd");

  const upcomingObligations = useMemo(() => {
    const items: any[] = [];
    // BTB LC maturities in next 14 days
    btbLcs
      .filter(
        (lc: any) =>
          lc.maturity_date &&
          lc.maturity_date >= todayStr &&
          lc.maturity_date <= fourteenStr &&
          activeBtbStatuses.includes(lc.status)
      )
      .forEach((lc: any) => {
        items.push({
          date: lc.maturity_date,
          type: "LC Maturity",
          desc: `${lc.lc_number ?? "BTB LC"} - ${lc.supplier_name ?? "Supplier"}`,
          amount: lc.lc_value ?? 0,
          direction: "out",
        });
      });
    // Outgoing payments with future dates
    payments
      .filter(
        (p: any) =>
          p.direction === "out" &&
          p.payment_date &&
          p.payment_date >= todayStr &&
          p.payment_date <= fourteenStr
      )
      .forEach((p: any) => {
        items.push({
          date: p.payment_date,
          type: "Payment",
          desc: p.payee_name || p.description || "Outgoing payment",
          amount: p.original_amount ?? 0,
          direction: "out",
        });
      });
    return items.sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  const totalOutgoing14d = upcomingObligations.reduce(
    (sum: number, o: any) => sum + o.amount,
    0
  );

  // Expected incoming in 14 days (invoices due)
  const expectedIncoming14d = invoices
    .filter(
      (i: any) =>
        i.due_date &&
        i.due_date >= todayStr &&
        i.due_date <= fourteenStr &&
        ["sent", "draft"].includes(i.status)
    )
    .reduce((sum: number, inv: any) => sum + invoiceTotal(inv), 0);

  const cashGap = expectedIncoming14d - totalOutgoing14d;

  /* ---------------------------------------------------------------- */
  /*  Revenue & Profit Snapshot                                       */
  /* ---------------------------------------------------------------- */

  const revenueThisMonth = invoices
    .filter((i: any) => (i.created_at ?? "").slice(0, 7) === todayStr.slice(0, 7))
    .reduce((sum: number, inv: any) => sum + invoiceTotal(inv), 0);

  const revenuePrevMonth = invoices
    .filter((i: any) => {
      const d = (i.created_at ?? "").slice(0, 10);
      return d >= prevMonthStart && d <= prevMonthEnd;
    })
    .reduce((sum: number, inv: any) => sum + invoiceTotal(inv), 0);

  const totalCostsThisMonth = thisMonthPaid + exportCostTotal;
  const totalCostsPrevMonth = prevMonthPaid;
  const netProfit = thisMonthReceived - totalCostsThisMonth;
  const marginPct = thisMonthReceived > 0 ? (netProfit / thisMonthReceived) * 100 : 0;

  /* ---------------------------------------------------------------- */
  /*  Buyer performance                                               */
  /* ---------------------------------------------------------------- */

  const buyerPerformance = useMemo(() => {
    const map: Record<
      string,
      { outstanding: number; invoicedQuarter: number; maxOverdueDays: number; buyerId?: string }
    > = {};
    invoices.forEach((inv: any) => {
      const name = inv.buyer_name ?? "Unknown";
      if (!map[name]) map[name] = { outstanding: 0, invoicedQuarter: 0, maxOverdueDays: 0 };
      if (["draft", "sent", "overdue"].includes(inv.status)) {
        map[name].outstanding += invoiceTotal(inv);
      }
      if (inv.status === "overdue" && inv.due_date) {
        map[name].maxOverdueDays = Math.max(map[name].maxOverdueDays, daysSince(inv.due_date));
      }
      if ((inv.created_at ?? "").slice(0, 10) >= quarterStart) {
        map[name].invoicedQuarter += invoiceTotal(inv);
      }
      const buyer = buyers.find((b: any) => b.company_name === name);
      if (buyer) map[name].buyerId = buyer.id;
    });
    return Object.entries(map)
      .sort((a, b) => b[1].outstanding - a[1].outstanding)
      .slice(0, 8);
  }, [data]);

  /* ---------------------------------------------------------------- */
  /*  Monthly trend (last 6 months)                                   */
  /* ---------------------------------------------------------------- */

  const monthlyTrend = useMemo(() => {
    const months: { label: string; invoiced: number; received: number; costs: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const m = subMonths(now, i);
      const mStart = format(startOfMonth(m), "yyyy-MM-dd");
      const mEnd = format(endOfMonth(m), "yyyy-MM-dd");
      const label = format(m, "MMM");

      const invoiced = invoices
        .filter((inv: any) => {
          const d = (inv.created_at ?? "").slice(0, 10);
          return d >= mStart && d <= mEnd;
        })
        .reduce((s: number, inv: any) => s + invoiceTotal(inv), 0);

      const received = payments
        .filter(
          (p: any) =>
            p.direction === "in" && p.payment_date && p.payment_date >= mStart && p.payment_date <= mEnd
        )
        .reduce((s: number, p: any) => s + (p.original_amount ?? 0), 0);

      const costs = payments
        .filter(
          (p: any) =>
            p.direction === "out" && p.payment_date && p.payment_date >= mStart && p.payment_date <= mEnd
        )
        .reduce((s: number, p: any) => s + (p.original_amount ?? 0), 0);

      months.push({ label, invoiced: Math.round(invoiced), received: Math.round(received), costs: Math.round(costs) });
    }
    return months;
  }, [data]);

  /* ---------------------------------------------------------------- */
  /*  Recent Activity Feed                                            */
  /* ---------------------------------------------------------------- */

  const recentActivity = useMemo(() => {
    const items: any[] = [];
    payments.slice(0, 10).forEach((p: any) => {
      items.push({
        type: p.direction === "in" ? "Payment In" : "Payment Out",
        icon: p.direction === "in" ? ArrowDownLeft : ArrowUpRight,
        desc: `${p.direction === "in" ? "Received" : "Paid"} $${fmt(p.original_amount ?? 0)} ${p.direction === "in" ? "from" : "to"} ${p.buyer_name || p.payee_name || "Unknown"}`,
        amount: p.original_amount ?? 0,
        currency: p.original_currency ?? "USD",
        date: p.created_at,
        dotColor: p.direction === "in" ? "bg-emerald-500" : "bg-red-500",
        amountColor: p.direction === "in" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
        path: "/finance/payments",
      });
    });
    invoices.slice(0, 5).forEach((inv: any) => {
      items.push({
        type: "Invoice Created",
        icon: Receipt,
        desc: `Invoice ${inv.invoice_number ?? "INV"} raised for ${inv.buyer_name ?? "buyer"} -- $${fmt(invoiceTotal(inv))}`,
        amount: invoiceTotal(inv),
        currency: inv.currency ?? "USD",
        date: inv.created_at,
        dotColor: "bg-blue-500",
        amountColor: "text-blue-600 dark:text-blue-400",
        path: "/finance/invoices",
      });
    });
    contracts.slice(0, 3).forEach((c: any) => {
      items.push({
        type: "Contract",
        icon: FileText,
        desc: `Contract ${c.contract_number ?? ""} with ${c.buyer_name ?? "buyer"} -- $${fmt(c.total_value ?? 0)}`,
        amount: c.total_value ?? 0,
        currency: "USD",
        date: c.created_at,
        dotColor: "bg-violet-500",
        amountColor: "text-violet-600 dark:text-violet-400",
        path: "/finance/contracts",
      });
    });
    return items
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
  }, [data]);

  /* ---------------------------------------------------------------- */
  /*  Module quick links                                              */
  /* ---------------------------------------------------------------- */

  const modules = [
    {
      label: "Invoicing",
      icon: Receipt,
      stat: `${fmtInt(unpaidInvoices.length)} outstanding`,
      path: "/finance/invoices",
      gradient: "from-blue-500 to-indigo-600",
      shadow: "shadow-blue-500/25 group-hover:shadow-blue-500/40",
      border: "border-blue-200/60 dark:border-blue-800/40",
      bg: "from-blue-50 via-white to-indigo-50/50 dark:from-blue-950/40 dark:via-card dark:to-indigo-950/20",
      label_color: "text-blue-600/70 dark:text-blue-400/70",
    },
    {
      label: "Payments",
      icon: Wallet,
      stat: `$${fmt(thisMonthReceived)} this mo`,
      path: "/finance/payments",
      gradient: "from-emerald-500 to-teal-600",
      shadow: "shadow-emerald-500/25 group-hover:shadow-emerald-500/40",
      border: "border-emerald-200/60 dark:border-emerald-800/40",
      bg: "from-emerald-50 via-white to-teal-50/50 dark:from-emerald-950/40 dark:via-card dark:to-teal-950/20",
      label_color: "text-emerald-600/70 dark:text-emerald-400/70",
    },
    {
      label: "Contracts",
      icon: FileText,
      stat: `${fmtInt(contracts.length)} total`,
      path: "/finance/contracts",
      gradient: "from-indigo-500 to-violet-600",
      shadow: "shadow-indigo-500/25 group-hover:shadow-indigo-500/40",
      border: "border-indigo-200/60 dark:border-indigo-800/40",
      bg: "from-indigo-50 via-white to-violet-50/50 dark:from-indigo-950/40 dark:via-card dark:to-violet-950/20",
      label_color: "text-indigo-600/70 dark:text-indigo-400/70",
    },
    {
      label: "LC Mgmt",
      icon: Landmark,
      stat: `${fmtInt(activeMasterLcs.length)} active`,
      path: "/finance/lc",
      gradient: "from-purple-500 to-violet-600",
      shadow: "shadow-purple-500/25 group-hover:shadow-purple-500/40",
      border: "border-purple-200/60 dark:border-purple-800/40",
      bg: "from-purple-50 via-white to-violet-50/50 dark:from-purple-950/40 dark:via-card dark:to-violet-950/20",
      label_color: "text-purple-600/70 dark:text-purple-400/70",
    },
    {
      label: "Costing",
      icon: Calculator,
      stat: `${fmtInt(costSheets.length)} sheets`,
      path: "/finance/costing",
      gradient: "from-amber-500 to-orange-600",
      shadow: "shadow-amber-500/25 group-hover:shadow-amber-500/40",
      border: "border-amber-200/60 dark:border-amber-800/40",
      bg: "from-amber-50 via-white to-orange-50/50 dark:from-amber-950/40 dark:via-card dark:to-orange-950/20",
      label_color: "text-amber-600/70 dark:text-amber-400/70",
    },
    {
      label: "Export Costs",
      icon: BarChart3,
      stat: `$${fmt(exportCostTotal)} mo`,
      path: "/finance/export-costs",
      gradient: "from-teal-500 to-cyan-600",
      shadow: "shadow-teal-500/25 group-hover:shadow-teal-500/40",
      border: "border-teal-200/60 dark:border-teal-800/40",
      bg: "from-teal-50 via-white to-cyan-50/50 dark:from-teal-950/40 dark:via-card dark:to-cyan-950/20",
      label_color: "text-teal-600/70 dark:text-teal-400/70",
    },
    {
      label: "Buyers",
      icon: Users,
      stat: `${fmtInt(buyers.length)} profiles`,
      path: "/finance/buyers",
      gradient: "from-rose-500 to-pink-600",
      shadow: "shadow-rose-500/25 group-hover:shadow-rose-500/40",
      border: "border-rose-200/60 dark:border-rose-800/40",
      bg: "from-rose-50 via-white to-pink-50/50 dark:from-rose-950/40 dark:via-card dark:to-pink-950/20",
      label_color: "text-rose-600/70 dark:text-rose-400/70",
    },
  ];

  /* ---------------------------------------------------------------- */
  /*  MoM change helper                                               */
  /* ---------------------------------------------------------------- */

  function MoMArrow({ current, previous }: { current: number; previous: number }) {
    if (previous === 0 && current === 0) return <span className="text-[9px] text-muted-foreground">--</span>;
    const pctChange = previous > 0 ? ((current - previous) / previous) * 100 : current > 0 ? 100 : 0;
    const up = pctChange >= 0;
    return (
      <span className={cn("text-[9px] font-semibold flex items-center gap-0.5", up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
        {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {Math.abs(Math.round(pctChange))}%
      </span>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  if (loading) {
    return (
      <div className="py-3 md:py-4 lg:py-6 space-y-5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="space-y-1">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
        <Skeleton className="h-40 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
        <Skeleton className="h-48 rounded-xl" />
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-5">
      {/* ========== HEADER ========== */}
      <motion.div
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 p-2.5 shadow-lg shadow-purple-500/25">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">Finance Command Centre</h1>
            <p className="text-xs text-muted-foreground">
              {factory?.name ? `${factory.name} \u00B7 ` : ""}
              {now.toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
        </div>
      </motion.div>

      {/* ================================================================ */}
      {/* SECTION 1: Cash Position Summary (3 gradient KPI cards)          */}
      {/* ================================================================ */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        {/* Total Receivables */}
        <motion.div variants={fadeUp}>
          <button onClick={() => navigate("/finance/payments")} className="block w-full text-left">
            <div className="relative overflow-hidden rounded-xl border border-emerald-200/60 dark:border-emerald-800/40 bg-gradient-to-br from-purple-50 via-white to-emerald-50/50 dark:from-purple-950/40 dark:via-card dark:to-emerald-950/20 p-4 md:p-5 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group">
              <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-bl from-emerald-500/8 to-transparent rounded-bl-full pointer-events-none" />
              <div className="relative flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-emerald-600/70 dark:text-emerald-400/70">
                    Total Receivables
                  </p>
                  <p className="font-mono text-2xl md:text-3xl font-bold tracking-tight text-emerald-900 dark:text-emerald-100">
                    <AnimatedNumber value={totalReceivables} formatFn={(n) => `$${fmt(n)}`} />
                  </p>
                  <p className="text-[10px] md:text-xs text-muted-foreground">
                    {unpaidInvoices.length} invoices outstanding
                  </p>
                </div>
                <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 p-2.5 shadow-lg shadow-emerald-500/25 group-hover:shadow-emerald-500/40 transition-shadow">
                  <DollarSign className="h-5 w-5 text-white" />
                </div>
              </div>
            </div>
          </button>
        </motion.div>

        {/* Total Payables */}
        <motion.div variants={fadeUp}>
          <button onClick={() => navigate("/finance/lc")} className="block w-full text-left">
            <div className="relative overflow-hidden rounded-xl border border-red-200/60 dark:border-red-800/40 bg-gradient-to-br from-purple-50 via-white to-red-50/50 dark:from-purple-950/40 dark:via-card dark:to-red-950/20 p-4 md:p-5 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group">
              <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-bl from-red-500/8 to-transparent rounded-bl-full pointer-events-none" />
              <div className="relative flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-red-600/70 dark:text-red-400/70">
                    Total Payables
                  </p>
                  <p className="font-mono text-2xl md:text-3xl font-bold tracking-tight text-red-900 dark:text-red-100">
                    <AnimatedNumber value={totalPayables} formatFn={(n) => `$${fmt(n)}`} />
                  </p>
                  <p className="text-[10px] md:text-xs text-muted-foreground">
                    {activeBtbLcs.length} BTB LCs active
                  </p>
                </div>
                <div className="rounded-xl bg-gradient-to-br from-red-500 to-rose-600 p-2.5 shadow-lg shadow-red-500/25 group-hover:shadow-red-500/40 transition-shadow">
                  <CreditCard className="h-5 w-5 text-white" />
                </div>
              </div>
            </div>
          </button>
        </motion.div>

        {/* Net Position */}
        <motion.div variants={fadeUp}>
          <button onClick={() => navigate("/finance/payments")} className="block w-full text-left">
            <div className="relative overflow-hidden rounded-xl border border-purple-200/60 dark:border-purple-800/40 bg-gradient-to-br from-purple-50 via-white to-violet-50/50 dark:from-purple-950/40 dark:via-card dark:to-violet-950/20 p-4 md:p-5 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group">
              <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-bl from-purple-500/8 to-transparent rounded-bl-full pointer-events-none" />
              <div className="relative flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-purple-600/70 dark:text-purple-400/70">
                    Net Position
                  </p>
                  <p
                    className={cn(
                      "font-mono text-2xl md:text-3xl font-bold tracking-tight",
                      netPosition >= 0
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-red-700 dark:text-red-300"
                    )}
                  >
                    {netPosition >= 0 ? "+" : "-"}
                    <AnimatedNumber value={Math.abs(netPosition)} formatFn={(n) => `$${fmt(n)}`} />
                  </p>
                  <p className="text-[10px] md:text-xs text-muted-foreground">Current exposure</p>
                </div>
                <div
                  className={cn(
                    "rounded-xl bg-gradient-to-br p-2.5 shadow-lg transition-shadow",
                    netPosition >= 0
                      ? "from-emerald-500 to-teal-600 shadow-emerald-500/25 group-hover:shadow-emerald-500/40"
                      : "from-red-500 to-rose-600 shadow-red-500/25 group-hover:shadow-red-500/40"
                  )}
                >
                  {netPosition >= 0 ? (
                    <TrendingUp className="h-5 w-5 text-white" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-white" />
                  )}
                </div>
              </div>
            </div>
          </button>
        </motion.div>
      </motion.div>

      {/* Exchange rate line */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground bg-gradient-to-r from-transparent via-purple-50/80 to-transparent dark:via-purple-950/20 rounded-lg px-4 py-2">
          <DollarSign className="h-3 w-3 text-purple-400" />
          <span>Exchange Rate:</span>
          <span className="font-mono font-bold text-purple-700 dark:text-purple-300">
            1 USD = {bdtToUsd ?? "..."} BDT
          </span>
        </div>
      </motion.div>

      {/* ================================================================ */}
      {/* SECTION 2: Alerts Strip                                          */}
      {/* ================================================================ */}
      <motion.div variants={fadeUp} initial="hidden" animate="show">
        <div className="relative overflow-hidden rounded-xl border border-purple-200/40 dark:border-purple-800/30 bg-gradient-to-r from-purple-50/80 via-white to-purple-50/80 dark:from-purple-950/30 dark:via-card dark:to-purple-950/30 px-4 py-3">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500/[0.03] via-transparent to-purple-500/[0.03]" />
          <div className="relative">
            {/* Summary line */}
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <span className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-purple-600/60 dark:text-purple-400/60 shrink-0">
                <Bell className="h-3.5 w-3.5 inline mr-1" />
                Alerts
              </span>
              <div className="h-4 w-px bg-purple-300/40 dark:bg-purple-700/40" />
              {alerts.length === 0 ? (
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    All clear -- nothing urgent
                  </span>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 ml-1" />
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  {urgentCount > 0 && (
                    <Badge variant="outline" className="bg-red-100/80 text-red-700 border-red-200/60 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800/40 text-[10px]">
                      {urgentCount} Urgent
                    </Badge>
                  )}
                  {warningCount > 0 && (
                    <Badge variant="outline" className="bg-amber-100/80 text-amber-700 border-amber-200/60 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/40 text-[10px]">
                      {warningCount} Warnings
                    </Badge>
                  )}
                  {infoCount > 0 && (
                    <Badge variant="outline" className="bg-blue-100/80 text-blue-700 border-blue-200/60 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800/40 text-[10px]">
                      {infoCount} Info
                    </Badge>
                  )}
                  {alerts.length > 8 && (
                    <button
                      onClick={() => setAlertsExpanded(!alertsExpanded)}
                      className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold flex items-center gap-0.5"
                    >
                      {alertsExpanded ? "Show less" : "Show all"}
                      {alertsExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  )}
                </div>
              )}
            </div>
            {/* Alert badges */}
            {alerts.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {visibleAlerts.map((alert, idx) => {
                  const colorMap = {
                    red: "bg-red-100/80 text-red-700 border-red-200/60 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800/40",
                    amber: "bg-amber-100/80 text-amber-700 border-amber-200/60 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/40",
                    blue: "bg-blue-100/80 text-blue-700 border-blue-200/60 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800/40",
                  };
                  const dotMap = { red: "bg-red-500", amber: "bg-amber-500", blue: "bg-blue-500" };
                  return (
                    <button
                      key={idx}
                      onClick={() => navigate(alert.path)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all duration-200 hover:scale-105 border",
                        colorMap[alert.severity]
                      )}
                    >
                      <div className={cn("h-1.5 w-1.5 rounded-full animate-pulse", dotMap[alert.severity])} />
                      {alert.label}
                      <ChevronRight className="h-3 w-3 opacity-50" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* ================================================================ */}
      {/* SECTION 3: Upcoming Cash Obligations (14 days)                   */}
      {/* ================================================================ */}
      <motion.div variants={fadeUp} initial="hidden" animate="show">
        <SectionCard>
          <SectionHeader
            icon={Calendar}
            title="Upcoming Cash Obligations (Next 14 Days)"
            linkText="View Cash Flow"
            linkPath="/finance/payments"
          />

          {upcomingObligations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-400 mb-2" />
              <p className="text-xs text-muted-foreground">No upcoming obligations</p>
            </div>
          ) : (
            <>
              {/* Table header */}
              <div className="grid grid-cols-[80px_60px_1fr_auto] gap-3 pb-2 border-b border-purple-100 dark:border-purple-900/40 mb-1">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">Date</span>
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">Type</span>
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">Description</span>
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60 text-right">Amount</span>
              </div>
              {upcomingObligations.slice(0, 8).map((item: any, idx: number) => (
                <div
                  key={idx}
                  className="grid grid-cols-[80px_60px_1fr_auto] gap-3 items-center py-2 px-1 rounded-md hover:bg-purple-50/60 dark:hover:bg-purple-950/30 transition-colors"
                >
                  <span className="text-[10px] font-mono text-muted-foreground">{item.date}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[9px] px-1.5 py-0 h-5 font-semibold justify-center",
                      item.type === "LC Maturity"
                        ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400"
                        : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                    )}
                  >
                    {item.type === "LC Maturity" ? "LC" : "Pay"}
                  </Badge>
                  <span className="text-xs truncate">{item.desc}</span>
                  <span className="text-xs font-mono font-semibold text-right text-red-600 dark:text-red-400">
                    -${fmt(item.amount)}
                  </span>
                </div>
              ))}
            </>
          )}

          {/* Totals */}
          <div className="mt-3 pt-3 border-t border-purple-100 dark:border-purple-900/40 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                Total outgoing next 14 days:
              </span>
              <span className="font-mono text-sm font-bold text-red-600 dark:text-red-400">
                ${fmt(totalOutgoing14d)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                Expected incoming:
              </span>
              <span className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
                ${fmt(expectedIncoming14d)}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-dashed border-purple-200 dark:border-purple-800">
              <span className="text-xs font-bold">Cash Gap:</span>
              <span
                className={cn(
                  "font-mono text-sm font-bold",
                  cashGap >= 0
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-red-700 dark:text-red-300"
                )}
              >
                {cashGap >= 0 ? "+" : "-"}${fmt(Math.abs(cashGap))}
              </span>
            </div>
          </div>
        </SectionCard>
      </motion.div>

      {/* ================================================================ */}
      {/* SECTION 4: Two-column - Receivables Ageing + Revenue Snapshot    */}
      {/* ================================================================ */}
      <motion.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-4"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        {/* Left - Receivables Ageing */}
        <motion.div variants={fadeUp}>
          <SectionCard>
            <SectionHeader
              icon={BarChart3}
              title="Receivables Ageing"
              linkText="View Invoices"
              linkPath="/finance/invoices"
            />

            {/* Stacked horizontal bar */}
            {ageingTotal > 0 ? (
              <>
                <div className="flex h-6 rounded-full overflow-hidden mb-3">
                  {[
                    { value: ageingBuckets.current, color: "bg-emerald-500", label: "Current" },
                    { value: ageingBuckets.d1_30, color: "bg-blue-500", label: "1-30d" },
                    { value: ageingBuckets.d31_60, color: "bg-amber-500", label: "31-60d" },
                    { value: ageingBuckets.d61_90, color: "bg-orange-500", label: "61-90d" },
                    { value: ageingBuckets.d90plus, color: "bg-red-500", label: "90+d" },
                  ].map((b, i) => {
                    const pct = (b.value / ageingTotal) * 100;
                    if (pct < 0.5) return null;
                    return (
                      <div
                        key={i}
                        className={cn(b.color, "relative group/bar transition-all")}
                        style={{ width: `${pct}%` }}
                        title={`${b.label}: $${fmt(b.value)}`}
                      />
                    );
                  })}
                </div>
                {/* Legend */}
                <div className="flex flex-wrap gap-3 mb-4">
                  {[
                    { label: "Current", color: "bg-emerald-500", value: ageingBuckets.current },
                    { label: "1-30d", color: "bg-blue-500", value: ageingBuckets.d1_30 },
                    { label: "31-60d", color: "bg-amber-500", value: ageingBuckets.d31_60 },
                    { label: "61-90d", color: "bg-orange-500", value: ageingBuckets.d61_90 },
                    { label: "90+d", color: "bg-red-500", value: ageingBuckets.d90plus },
                  ].map((b, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <div className={cn("h-2 w-2 rounded-full", b.color)} />
                      <span className="text-[10px] text-muted-foreground">
                        {b.label}: <span className="font-mono font-semibold">${fmt(b.value)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-6 rounded-full bg-muted/30 mb-4" />
            )}

            {/* Top 5 debtors table */}
            <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
              Top Debtors
            </div>
            {debtorMap.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No outstanding receivables</p>
            ) : (
              <div className="space-y-0">
                {debtorMap.map(([name, info], idx) => {
                  const health =
                    info.oldestAge > 60 ? "bg-red-500" : info.oldestAge > 0 ? "bg-amber-500" : "bg-emerald-500";
                  return (
                    <button
                      key={idx}
                      onClick={() => info.buyerId && navigate(`/finance/buyers/${info.buyerId}`)}
                      className="w-full flex items-center justify-between py-2 px-1 rounded-md hover:bg-purple-50/60 dark:hover:bg-purple-950/30 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={cn("h-2 w-2 rounded-full shrink-0", health)} />
                        <span className="text-xs truncate">{name}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono text-xs font-semibold">${fmt(info.outstanding)}</span>
                        <span className="text-[10px] text-muted-foreground w-12 text-right">
                          {info.oldestAge > 0 ? `${info.oldestAge}d` : "Current"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </motion.div>

        {/* Right - Revenue & Profit Snapshot */}
        <motion.div variants={fadeUp}>
          <SectionCard>
            <SectionHeader
              icon={TrendingUp}
              title="Revenue & Profit Snapshot"
              linkText="View Payments"
              linkPath="/finance/payments"
              gradient="from-emerald-500 to-teal-600"
              shadow="shadow-emerald-500/20"
            />

            <div className="grid grid-cols-2 gap-3 mb-3">
              {/* Revenue This Month */}
              <div className="rounded-lg border border-blue-200/40 dark:border-blue-800/30 bg-blue-50/50 dark:bg-blue-950/20 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-600/70 dark:text-blue-400/70 mb-1">
                  Revenue (This Month)
                </p>
                <button onClick={() => navigate("/finance/invoices")} className="block">
                  <p className="font-mono text-lg font-bold text-blue-900 dark:text-blue-100">${fmt(revenueThisMonth)}</p>
                </button>
                <MoMArrow current={revenueThisMonth} previous={revenuePrevMonth} />
              </div>

              {/* Payments Received */}
              <div className="rounded-lg border border-emerald-200/40 dark:border-emerald-800/30 bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600/70 dark:text-emerald-400/70 mb-1">
                  Payments Received
                </p>
                <button onClick={() => navigate("/finance/payments")} className="block">
                  <p className="font-mono text-lg font-bold text-emerald-900 dark:text-emerald-100">
                    ${fmt(thisMonthReceived)}
                  </p>
                </button>
                <MoMArrow current={thisMonthReceived} previous={prevMonthReceived} />
              </div>

              {/* Total Costs */}
              <div className="rounded-lg border border-red-200/40 dark:border-red-800/30 bg-red-50/50 dark:bg-red-950/20 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-red-600/70 dark:text-red-400/70 mb-1">
                  Total Costs
                </p>
                <button onClick={() => navigate("/finance/export-costs")} className="block">
                  <p className="font-mono text-lg font-bold text-red-900 dark:text-red-100">
                    ${fmt(totalCostsThisMonth)}
                  </p>
                </button>
                <MoMArrow current={totalCostsThisMonth} previous={totalCostsPrevMonth} />
              </div>

              {/* Net Profit */}
              <div className="rounded-lg border border-purple-200/40 dark:border-purple-800/30 bg-purple-50/50 dark:bg-purple-950/20 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-purple-600/70 dark:text-purple-400/70 mb-1">
                  Net Profit
                </p>
                <button onClick={() => navigate("/finance/payments")} className="block">
                  <p
                    className={cn(
                      "font-mono text-lg font-bold",
                      netProfit >= 0
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-red-700 dark:text-red-300"
                    )}
                  >
                    {netProfit >= 0 ? "+" : "-"}${fmt(Math.abs(netProfit))}
                  </p>
                </button>
                <div className="flex items-center gap-2">
                  <MoMArrow
                    current={netProfit}
                    previous={prevMonthReceived - totalCostsPrevMonth}
                  />
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[9px] px-1 py-0 h-4",
                      marginPct > 10
                        ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400"
                        : marginPct >= 5
                        ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400"
                        : "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400"
                    )}
                  >
                    {marginPct.toFixed(1)}% margin
                  </Badge>
                </div>
              </div>
            </div>
          </SectionCard>
        </motion.div>
      </motion.div>

      {/* ================================================================ */}
      {/* SECTION 5: LC Overview Panel                                     */}
      {/* ================================================================ */}
      <motion.div variants={fadeUp} initial="hidden" animate="show">
        <SectionCard>
          <SectionHeader
            icon={Landmark}
            title="LC Overview"
            linkText="View All LCs"
            linkPath="/finance/lc"
            gradient="from-purple-500 to-violet-600"
            shadow="shadow-purple-500/20"
          />

          {/* 3+2 metric boxes */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
            <button onClick={() => navigate("/finance/lc")} className="text-left rounded-lg border border-purple-200/40 dark:border-purple-800/30 bg-purple-50/50 dark:bg-purple-950/20 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-purple-600/70 dark:text-purple-400/70">Active Master LCs</p>
              <p className="font-mono text-lg font-bold">{activeMasterLcs.length}</p>
              <p className="text-[10px] font-mono text-muted-foreground">${fmt(activeMasterLcValue)}</p>
            </button>

            <button onClick={() => navigate("/finance/lc")} className="text-left rounded-lg border border-indigo-200/40 dark:border-indigo-800/30 bg-indigo-50/50 dark:bg-indigo-950/20 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600/70 dark:text-indigo-400/70">Active BTB LCs</p>
              <p className="font-mono text-lg font-bold">{activeBtbLcs.length}</p>
              <p className="text-[10px] font-mono text-muted-foreground">${fmt(activeBtbLcValue)}</p>
            </button>

            <button onClick={() => navigate("/finance/lc")} className="text-left rounded-lg border border-amber-200/40 dark:border-amber-800/30 bg-amber-50/50 dark:bg-amber-950/20 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600/70 dark:text-amber-400/70">Docs Pending</p>
              <p className="font-mono text-lg font-bold">{docsPendingLcs.length}</p>
              <p className="text-[10px] text-muted-foreground">Shipped, no docs</p>
            </button>

            <button onClick={() => navigate("/finance/lc")} className="text-left rounded-lg border border-red-200/40 dark:border-red-800/30 bg-red-50/50 dark:bg-red-950/20 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-red-600/70 dark:text-red-400/70">BTB Maturing (Month)</p>
              <p className="font-mono text-lg font-bold">{btbMaturingThisMonth.length}</p>
              <p className="text-[10px] font-mono text-muted-foreground">${fmt(btbMaturingThisMonthValue)}</p>
            </button>

            <button onClick={() => navigate("/finance/lc")} className="text-left rounded-lg border border-rose-200/40 dark:border-rose-800/30 bg-rose-50/50 dark:bg-rose-950/20 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-600/70 dark:text-rose-400/70">Expiring 30d</p>
              <p className="font-mono text-lg font-bold">{lcsExpiring30d.length}</p>
              <p className="text-[10px] text-muted-foreground">Master LCs</p>
            </button>
          </div>

          {/* LCs Expiring within 30 days list */}
          {lcsExpiring30d.length > 0 && (
            <div className="mb-4">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
                Expiring Soon
              </p>
              {lcsExpiring30d.slice(0, 3).map((lc: any, idx: number) => (
                <button
                  key={idx}
                  onClick={() => navigate("/finance/lc")}
                  className="w-full flex items-center justify-between py-1.5 px-1 rounded-md hover:bg-purple-50/60 dark:hover:bg-purple-950/30 transition-colors text-left"
                >
                  <span className="text-xs font-mono">{lc.lc_number}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">{lc.buyer_name}</span>
                    <span className="text-[10px] font-bold text-red-600 dark:text-red-400">
                      {daysUntil(lc.expiry_date)}d left
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Utilisation bar */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                LC Utilisation
              </span>
              <span className="font-mono text-xs font-bold text-purple-700 dark:text-purple-300">
                {utilisationPct.toFixed(1)}%
              </span>
            </div>
            <div className="h-3 rounded-full bg-muted/30 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-purple-500 to-violet-600 transition-all duration-500"
                style={{ width: `${Math.min(100, utilisationPct)}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[9px] text-muted-foreground">
                Shipped: <span className="font-mono font-semibold">${fmt(totalShipped)}</span>
              </span>
              <span className="text-[9px] text-muted-foreground">
                Total LC Value: <span className="font-mono font-semibold">${fmt(totalLcValue)}</span>
              </span>
            </div>
          </div>
        </SectionCard>
      </motion.div>

      {/* ================================================================ */}
      {/* SECTION 6: Two-column - Buyer Performance + Monthly Trend        */}
      {/* ================================================================ */}
      <motion.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-4"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        {/* Left - Buyer Performance */}
        <motion.div variants={fadeUp}>
          <SectionCard>
            <SectionHeader
              icon={Users}
              title="Buyer Performance"
              linkText="View All Buyers"
              linkPath="/finance/buyers"
              gradient="from-rose-500 to-pink-600"
              shadow="shadow-rose-500/20"
            />

            {/* Table header */}
            <div className="grid grid-cols-[1fr_auto_auto_24px] gap-3 pb-2 border-b border-purple-100 dark:border-purple-900/40 mb-1">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">Buyer</span>
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60 text-right w-24">Outstanding</span>
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60 text-right w-24">Invoiced (Qtr)</span>
              <span />
            </div>

            {buyerPerformance.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No buyer data</p>
            ) : (
              buyerPerformance.map(([name, info], idx) => {
                const health =
                  info.maxOverdueDays > 60
                    ? "bg-red-500"
                    : info.maxOverdueDays > 0
                    ? "bg-amber-500"
                    : "bg-emerald-500";
                return (
                  <button
                    key={idx}
                    onClick={() => info.buyerId && navigate(`/finance/buyers/${info.buyerId}`)}
                    className="w-full grid grid-cols-[1fr_auto_auto_24px] gap-3 items-center py-2 px-1 rounded-md hover:bg-purple-50/60 dark:hover:bg-purple-950/30 transition-colors text-left"
                  >
                    <span className="text-xs truncate">{name}</span>
                    <span className="font-mono text-xs font-semibold text-right w-24">${fmt(info.outstanding)}</span>
                    <span className="font-mono text-xs text-muted-foreground text-right w-24">${fmt(info.invoicedQuarter)}</span>
                    <div className={cn("h-2.5 w-2.5 rounded-full ml-auto", health)} />
                  </button>
                );
              })
            )}
          </SectionCard>
        </motion.div>

        {/* Right - Monthly Trend */}
        <motion.div variants={fadeUp}>
          <SectionCard>
            <SectionHeader
              icon={BarChart3}
              title="Monthly Trend (6 Months)"
              gradient="from-blue-500 to-indigo-600"
              shadow="shadow-blue-500/20"
            />

            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyTrend} barGap={2} barCategoryGap="20%">
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "currentColor" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: "currentColor" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    width={50}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "11px",
                    }}
                    formatter={(value: number, name: string) => [`$${fmt(value)}`, name]}
                  />
                  <Bar dataKey="invoiced" name="Invoiced" fill="#818cf8" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="received" name="Received" fill="#34d399" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="costs" name="Costs" fill="#f87171" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-4 mt-2">
              {[
                { label: "Invoiced", color: "bg-indigo-400" },
                { label: "Received", color: "bg-emerald-400" },
                { label: "Costs", color: "bg-red-400" },
              ].map((l, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className={cn("h-2 w-2 rounded-full", l.color)} />
                  <span className="text-[10px] text-muted-foreground">{l.label}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        </motion.div>
      </motion.div>

      {/* ================================================================ */}
      {/* SECTION 7: Recent Activity Feed                                  */}
      {/* ================================================================ */}
      <motion.div variants={fadeUp} initial="hidden" animate="show">
        <SectionCard>
          <SectionHeader
            icon={Activity}
            title="Recent Activity"
            linkText="View all"
            linkPath="/finance/payments"
            gradient="from-violet-500 to-purple-600"
            shadow="shadow-violet-500/20"
          />

          {recentActivity.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">No recent activity</p>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[7px] top-3 bottom-3 w-px bg-gradient-to-b from-purple-300/40 via-purple-200/20 to-transparent dark:from-purple-700/40 dark:via-purple-800/20" />
              <div className="space-y-0.5">
                {recentActivity.map((item: any, idx: number) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={idx}
                      onClick={() => navigate(item.path)}
                      className="relative w-full flex items-start gap-3 py-2 px-1 rounded-md hover:bg-purple-50/60 dark:hover:bg-purple-950/30 transition-colors text-left"
                    >
                      {/* Dot */}
                      <div
                        className={cn(
                          "relative z-10 mt-1.5 h-[9px] w-[9px] rounded-full ring-2 ring-white dark:ring-card shrink-0",
                          item.dotColor
                        )}
                      />
                      {/* Content */}
                      <div className="min-w-0 flex-1 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-xs font-medium block truncate">{item.desc}</span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1 py-0 h-4 border-purple-200/50 dark:border-purple-800/40 font-medium"
                            >
                              {item.type}
                            </Badge>
                            <span className="text-[9px] text-muted-foreground">
                              {item.date ? timeAgo(item.date) : ""}
                            </span>
                          </div>
                        </div>
                        {item.amount != null && item.amount > 0 && (
                          <span className={cn("text-xs font-mono font-semibold shrink-0", item.amountColor)}>
                            ${fmt(item.amount)}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </SectionCard>
      </motion.div>

      {/* ================================================================ */}
      {/* SECTION 8: Module Quick Links                                    */}
      {/* ================================================================ */}
      <motion.div variants={fadeUp} initial="hidden" animate="show">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {modules.map((mod) => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.label}
                onClick={() => navigate(mod.path)}
                className={cn(
                  "group relative overflow-hidden rounded-xl border bg-gradient-to-br p-3.5 text-left transition-all duration-300 hover:shadow-xl hover:-translate-y-1",
                  mod.border,
                  mod.bg
                )}
              >
                <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-purple-500/5 to-transparent rounded-bl-full pointer-events-none" />
                <div className="relative">
                  <div
                    className={cn(
                      "rounded-lg bg-gradient-to-br p-2 shadow-lg transition-shadow w-fit mb-2.5",
                      mod.gradient,
                      mod.shadow
                    )}
                  >
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <p className="text-xs font-bold tracking-tight mb-0.5">{mod.label}</p>
                  <p className={cn("text-[10px] font-mono", mod.label_color)}>{mod.stat}</p>
                </div>
                <ArrowRight className="absolute top-3 right-3 h-3 w-3 text-muted-foreground/30 group-hover:text-purple-500 group-hover:translate-x-0.5 transition-all duration-300" />
              </button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
