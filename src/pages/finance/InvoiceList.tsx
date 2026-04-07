import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus, Receipt, Search, FileText, CheckCircle2, Send, AlertCircle,
  Clock, ArrowUpDown, ArrowUp, ArrowDown, Edit, Eye, ChevronDown,
  TrendingUp, Banknote, TriangleAlert, CircleDashed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useInvoices, useInvoiceMutations, calcInvoiceTotals, type Invoice } from "@/hooks/useInvoices";
import { cn } from "@/lib/utils";

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  draft:   { label: "Draft",   icon: CircleDashed,  pill: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
  sent:    { label: "Sent",    icon: Send,           pill: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  paid:    { label: "Paid",    icon: CheckCircle2,   pill: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  overdue: { label: "Overdue", icon: AlertCircle,    pill: "bg-red-500/10 text-red-400 border-red-500/20" },
} as const;

const TYPE_LABELS: Record<string, string> = {
  commercial:  "Commercial",
  proforma:    "Proforma",
  credit_note: "Credit Note",
  debit_note:  "Debit Note",
};

const STATUSES = ["draft", "sent", "paid", "overdue"] as const;
const TYPES    = ["commercial", "proforma", "credit_note", "debit_note"] as const;

type SortKey = "date_desc" | "date_asc" | "amount_desc" | "amount_asc" | "buyer_asc";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtCompact(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${fmt(n)}`;
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function isOverdue(inv: Invoice) {
  return inv.due_date && inv.status !== "paid" && new Date(inv.due_date) < new Date();
}
function invoiceTotal(inv: Invoice) {
  return calcInvoiceTotals(inv.invoice_line_items ?? [], inv.exchange_rate).totalUsd;
}

// ── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, amount, count, color, icon: Icon, active, onClick,
}: {
  label: string; amount: number; count: number;
  color: string; icon: React.ElementType;
  active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-xl border p-4 text-left transition-all w-full",
        active
          ? "border-purple-500/40 bg-purple-500/8 ring-1 ring-purple-500/20"
          : "border-border bg-card hover:border-border/80 hover:bg-muted/30"
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center", color)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className="text-xl font-bold tracking-tight">{fmtCompact(amount)}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{count} invoice{count !== 1 ? "s" : ""}</p>
    </button>
  );
}

// ── Sort button ───────────────────────────────────────────────────────────────

function SortButton({ current, value, asc, desc, children, onChange }: {
  current: SortKey; value: string; asc: SortKey; desc: SortKey;
  children: React.ReactNode; onChange: (s: SortKey) => void;
}) {
  const isAsc = current === asc;
  const isDesc = current === desc;
  const active = isAsc || isDesc;
  return (
    <button
      onClick={() => onChange(isDesc ? asc : desc)}
      className={cn(
        "flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider select-none",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
      {active
        ? (isDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)
        : <ArrowUpDown className="h-3 w-3 opacity-40" />}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InvoiceList() {
  const navigate = useNavigate();
  const { invoices, loading, refetch } = useInvoices();
  const { updateStatus } = useInvoiceMutations();

  const [search, setSearch]           = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Invoice["status"]>("all");
  const [typeFilter, setTypeFilter]   = useState<"all" | typeof TYPES[number]>("all");
  const [sort, setSort]               = useState<SortKey>("date_desc");
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);

  // ── Computed totals ───────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const paid       = invoices.filter((i) => i.status === "paid");
    const sent       = invoices.filter((i) => i.status === "sent");
    const overdue    = invoices.filter((i) => i.status === "overdue" || isOverdue(i));
    const all        = invoices;
    const sum = (arr: Invoice[]) => arr.reduce((s, i) => s + invoiceTotal(i), 0);
    return {
      total:       { amount: sum(all),     count: all.length },
      paid:        { amount: sum(paid),    count: paid.length },
      outstanding: { amount: sum(sent),    count: sent.length },
      overdue:     { amount: sum(overdue), count: overdue.length },
    };
  }, [invoices]);

  // ── Filtered + sorted list ────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = invoices.filter((inv) => {
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (typeFilter !== "all" && (inv.invoice_type ?? "commercial") !== typeFilter) return false;
      if (q && !inv.invoice_number.toLowerCase().includes(q) && !inv.buyer_name.toLowerCase().includes(q)) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sort === "date_desc") return new Date(b.issue_date).getTime() - new Date(a.issue_date).getTime();
      if (sort === "date_asc")  return new Date(a.issue_date).getTime() - new Date(b.issue_date).getTime();
      if (sort === "amount_desc") return invoiceTotal(b) - invoiceTotal(a);
      if (sort === "amount_asc")  return invoiceTotal(a) - invoiceTotal(b);
      if (sort === "buyer_asc")   return a.buyer_name.localeCompare(b.buyer_name);
      return 0;
    });

    return list;
  }, [invoices, search, statusFilter, typeFilter, sort]);

  const handleQuickStatus = async (inv: Invoice, status: Invoice["status"]) => {
    setStatusUpdating(inv.id);
    const ok = await updateStatus(inv.id, status);
    if (ok) refetch();
    setStatusUpdating(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Invoices</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {invoices.length} total · {kpis.outstanding.count} outstanding
          </p>
        </div>
        <Button
          onClick={() => navigate("/finance/invoices/new")}
          className="bg-purple-600 hover:bg-purple-700 text-white shrink-0"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          <span className="hidden sm:inline">New Invoice</span>
          <span className="sm:hidden">New</span>
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="All Invoiced" amount={kpis.total.amount} count={kpis.total.count}
          color="bg-purple-500/10 text-purple-500" icon={TrendingUp}
          active={statusFilter === "all" && typeFilter === "all"}
          onClick={() => { setStatusFilter("all"); setTypeFilter("all"); }}
        />
        <KpiCard
          label="Paid" amount={kpis.paid.amount} count={kpis.paid.count}
          color="bg-emerald-500/10 text-emerald-500" icon={CheckCircle2}
          active={statusFilter === "paid"}
          onClick={() => setStatusFilter(statusFilter === "paid" ? "all" : "paid")}
        />
        <KpiCard
          label="Outstanding" amount={kpis.outstanding.amount} count={kpis.outstanding.count}
          color="bg-blue-500/10 text-blue-500" icon={Banknote}
          active={statusFilter === "sent"}
          onClick={() => setStatusFilter(statusFilter === "sent" ? "all" : "sent")}
        />
        <KpiCard
          label="Overdue" amount={kpis.overdue.amount} count={kpis.overdue.count}
          color="bg-red-500/10 text-red-500" icon={TriangleAlert}
          active={statusFilter === "overdue"}
          onClick={() => setStatusFilter(statusFilter === "overdue" ? "all" : "overdue")}
        />
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search invoice number or buyer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Status filter pills */}
        <div className="flex gap-1.5 flex-wrap">
          {(["all", ...STATUSES] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize",
                statusFilter === f
                  ? "bg-purple-600 text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
            >
              {f === "all" ? "All" : STATUS_CONFIG[f].label}
            </button>
          ))}
        </div>

        {/* Type filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="shrink-0 text-xs gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              {typeFilter === "all" ? "All Types" : TYPE_LABELS[typeFilter]}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTypeFilter("all")}>All Types</DropdownMenuItem>
            <DropdownMenuSeparator />
            {TYPES.map((t) => (
              <DropdownMenuItem key={t} onClick={() => setTypeFilter(t)}>
                {TYPE_LABELS[t]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Receipt className="h-12 w-12 text-muted-foreground/20 mb-4" />
          <p className="font-medium text-muted-foreground">
            {invoices.length === 0 ? "No invoices yet" : "No invoices match your filters"}
          </p>
          {invoices.length === 0 && (
            <Button variant="outline" className="mt-4" onClick={() => navigate("/finance/invoices/new")}>
              <Plus className="h-4 w-4 mr-2" />Create first invoice
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          {/* Desktop table header */}
          <div className="hidden md:grid md:grid-cols-[2fr_1.5fr_110px_110px_130px_110px_80px] gap-4 px-4 py-2.5 bg-muted/40 border-b border-border">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Invoice</span>
            <SortButton current={sort} value="buyer" asc="buyer_asc" desc="buyer_asc" onChange={setSort}>Buyer</SortButton>
            <SortButton current={sort} value="date" asc="date_asc" desc="date_desc" onChange={setSort}>Date</SortButton>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Due</span>
            <SortButton current={sort} value="amount" asc="amount_asc" desc="amount_desc" onChange={setSort}>Amount</SortButton>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Actions</span>
          </div>

          {filtered.map((inv, i) => (
            <InvoiceRow
              key={inv.id}
              invoice={inv}
              isLast={i === filtered.length - 1}
              statusUpdating={statusUpdating === inv.id}
              onView={() => navigate(`/finance/invoices/${inv.id}`)}
              onEdit={() => navigate(`/finance/invoices/${inv.id}/edit`)}
              onStatusChange={(s) => handleQuickStatus(inv, s)}
            />
          ))}

          {/* Total row */}
          <div className="hidden md:flex items-center justify-end px-4 py-3 bg-muted/20 border-t border-border gap-4">
            <span className="text-xs text-muted-foreground">{filtered.length} invoice{filtered.length !== 1 ? "s" : ""}</span>
            <span className="text-sm font-bold">
              ${fmt(filtered.reduce((s, i) => s + invoiceTotal(i), 0))}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Row component ─────────────────────────────────────────────────────────────

function InvoiceRow({
  invoice, isLast, statusUpdating, onView, onEdit, onStatusChange,
}: {
  invoice: Invoice;
  isLast: boolean;
  statusUpdating: boolean;
  onView: () => void;
  onEdit: () => void;
  onStatusChange: (s: Invoice["status"]) => void;
}) {
  const lineItems = invoice.invoice_line_items ?? [];
  const total = invoiceTotal(invoice);
  const cfg = STATUS_CONFIG[invoice.status];
  const StatusIcon = cfg.icon;
  const overdue = isOverdue(invoice);
  const type = invoice.invoice_type ?? "commercial";

  return (
    <div
      className={cn(
        "group",
        !isLast && "border-b border-border/60"
      )}
    >
      {/* Desktop row */}
      <div
        className="hidden md:grid md:grid-cols-[2fr_1.5fr_110px_110px_130px_110px_80px] gap-4 px-4 py-3 items-center hover:bg-muted/20 transition-colors cursor-pointer"
        onClick={onView}
      >
        {/* Invoice # + type */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold text-purple-400">{invoice.invoice_number}</span>
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {TYPE_LABELS[type] ?? type}
            </span>
          </div>
          {lineItems.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">{lineItems.length} line item{lineItems.length !== 1 ? "s" : ""}</p>
          )}
        </div>

        {/* Buyer */}
        <p className="text-sm font-medium truncate">{invoice.buyer_name}</p>

        {/* Issue date */}
        <p className="text-sm text-muted-foreground">{fmtDate(invoice.issue_date)}</p>

        {/* Due date */}
        <p className={cn("text-sm", overdue ? "text-red-400 font-medium" : "text-muted-foreground")}>
          {invoice.due_date ? fmtDate(invoice.due_date) : "—"}
          {overdue && <span className="ml-1 text-[10px]">OVERDUE</span>}
        </p>

        {/* Amount */}
        <div>
          <p className="text-sm font-semibold">${fmt(total)}</p>
          <p className="text-xs text-muted-foreground">BDT {fmt(total * invoice.exchange_rate)}</p>
        </div>

        {/* Status */}
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                disabled={statusUpdating}
                className={cn(
                  "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-opacity",
                  cfg.pill,
                  statusUpdating && "opacity-50"
                )}
              >
                <StatusIcon className="h-3 w-3" />
                {cfg.label}
                <ChevronDown className="h-2.5 w-2.5 ml-0.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {STATUSES.filter((s) => s !== invoice.status).map((s) => {
                const C = STATUS_CONFIG[s];
                return (
                  <DropdownMenuItem key={s} onClick={() => onStatusChange(s)}>
                    <C.icon className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                    Mark as {C.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onView}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="View"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Edit"
          >
            <Edit className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Mobile card */}
      <div
        className="md:hidden p-4 cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={onView}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-mono text-sm font-bold text-purple-400">{invoice.invoice_number}</span>
              <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border", cfg.pill)}>
                <StatusIcon className="h-3 w-3" />
                {cfg.label}
              </span>
            </div>
            <p className="font-semibold truncate">{invoice.buyer_name}</p>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />{fmtDate(invoice.issue_date)}
              </span>
              {invoice.due_date && (
                <span className={cn(overdue && "text-red-400 font-medium")}>
                  Due {fmtDate(invoice.due_date)}{overdue ? " · OVERDUE" : ""}
                </span>
              )}
              <span className="bg-muted px-1.5 py-0.5 rounded text-[10px]">
                {TYPE_LABELS[type] ?? type}
              </span>
            </div>
          </div>
          <div className="text-right shrink-0">
            {lineItems.length > 0 ? (
              <>
                <p className="font-bold">${fmt(total)}</p>
                <p className="text-xs text-muted-foreground">BDT {fmt(total * invoice.exchange_rate)}</p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground italic">No items</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
