import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Calculator, Plus, Search, Copy, Pencil, Trash2, FileText,
  ArrowUpDown, ArrowUp, ArrowDown, Clock, CircleDashed, Send,
  CheckCircle2, AlertCircle, ChevronDown, LayoutTemplate, Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useCostSheetMutations, type CostSheet } from "@/hooks/useCostSheets";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  draft:    { label: "Draft",     icon: CircleDashed,  pill: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
  submitted:{ label: "Submitted", icon: Send,           pill: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  approved: { label: "Approved",  icon: CheckCircle2,   pill: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  sent:     { label: "Sent",      icon: Send,           pill: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  accepted: { label: "Accepted",  icon: CheckCircle2,   pill: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  rejected: { label: "Rejected",  icon: AlertCircle,    pill: "bg-red-500/10 text-red-400 border-red-500/20" },
} as const;

const STATUSES = ["draft", "submitted", "approved", "sent", "accepted", "rejected"] as const;

type SortKey = "date_desc" | "date_asc" | "buyer_asc";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Hook: fetch ALL cost sheets (including templates) ────────────────────────

function useAllCostSheets() {
  const { factory } = useAuth();
  const [costSheets, setCostSheets] = useState<CostSheet[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!factory?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("cost_sheets" as any)
      .select("*")
      .eq("factory_id", factory.id)
      .order("updated_at", { ascending: false });

    if (error) toast.error("Failed to load cost sheets", { description: error.message });
    else setCostSheets((data as unknown as CostSheet[]) ?? []);
    setLoading(false);
  }, [factory?.id]);

  useEffect(() => { fetch(); }, [fetch]);
  return { costSheets, loading, refetch: fetch };
}

// ── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, count, color, icon: Icon, active, onClick,
}: {
  label: string; count: number;
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
      <p className="text-xl font-bold tracking-tight">{count}</p>
      <p className="text-xs text-muted-foreground mt-0.5">cost sheet{count !== 1 ? "s" : ""}</p>
    </button>
  );
}

// ── Sort button ──────────────────────────────────────────────────────────────

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

// ── Main page ────────────────────────────────────────────────────────────────

export default function CostSheetList() {
  const navigate = useNavigate();
  const { costSheets, loading, refetch } = useAllCostSheets();
  const { duplicateCostSheet, deleteCostSheet } = useCostSheetMutations();

  const [search, setSearch]               = useState("");
  const [statusFilter, setStatusFilter]   = useState<"all" | CostSheet["status"]>("all");
  const [showTemplates, setShowTemplates] = useState(false);
  const [sort, setSort]                   = useState<SortKey>("date_desc");
  const [deleteTarget, setDeleteTarget]   = useState<CostSheet | null>(null);
  const [deleting, setDeleting]           = useState(false);

  // ── Computed totals ────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const nonTemplates = costSheets.filter((cs) => !cs.is_template);
    const pending      = nonTemplates.filter((cs) => cs.status === "draft" || cs.status === "submitted");
    const approved     = nonTemplates.filter((cs) => cs.status === "approved");
    const templates    = costSheets.filter((cs) => cs.is_template);
    return {
      total:     nonTemplates.length,
      pending:   pending.length,
      approved:  approved.length,
      templates: templates.length,
    };
  }, [costSheets]);

  // ── Filtered + sorted list ─────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = costSheets.filter((cs) => {
      // Template toggle
      if (!showTemplates && cs.is_template) return false;
      if (showTemplates && !cs.is_template) return false;

      if (statusFilter !== "all" && cs.status !== statusFilter) return false;
      if (
        q &&
        !cs.buyer_name.toLowerCase().includes(q) &&
        !cs.style_ref.toLowerCase().includes(q) &&
        !(cs.style_description ?? "").toLowerCase().includes(q)
      )
        return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sort === "date_desc") return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      if (sort === "date_asc")  return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
      if (sort === "buyer_asc") return a.buyer_name.localeCompare(b.buyer_name);
      return 0;
    });

    return list;
  }, [costSheets, search, statusFilter, showTemplates, sort]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleDuplicate = async (cs: CostSheet) => {
    const result = await duplicateCostSheet(cs.id, `${cs.style_description ?? cs.style_ref} (Copy)`);
    if (result) refetch();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const ok = await deleteCostSheet(deleteTarget.id);
    if (ok) refetch();
    setDeleteTarget(null);
    setDeleting(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-purple-400" />
            <h1 className="text-xl md:text-2xl font-bold">Order Costing</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Pre-production cost sheets and quotations
          </p>
        </div>
        <Button
          onClick={() => navigate("/finance/costing/new")}
          className="bg-purple-600 hover:bg-purple-700 text-white shrink-0"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          <span className="hidden sm:inline">New Cost Sheet</span>
          <span className="sm:hidden">New</span>
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Total" count={kpis.total}
          color="bg-purple-500/10 text-purple-500" icon={FileText}
          active={statusFilter === "all" && !showTemplates}
          onClick={() => { setStatusFilter("all"); setShowTemplates(false); }}
        />
        <KpiCard
          label="Pending" count={kpis.pending}
          color="bg-blue-500/10 text-blue-500" icon={Clock}
          active={statusFilter === "draft" || statusFilter === "submitted"}
          onClick={() => {
            setShowTemplates(false);
            setStatusFilter(statusFilter === "draft" ? "all" : "draft");
          }}
        />
        <KpiCard
          label="Approved" count={kpis.approved}
          color="bg-emerald-500/10 text-emerald-500" icon={CheckCircle2}
          active={statusFilter === "approved"}
          onClick={() => {
            setShowTemplates(false);
            setStatusFilter(statusFilter === "approved" ? "all" : "approved");
          }}
        />
        <KpiCard
          label="Templates" count={kpis.templates}
          color="bg-amber-500/10 text-amber-500" icon={LayoutTemplate}
          active={showTemplates}
          onClick={() => { setShowTemplates(!showTemplates); setStatusFilter("all"); }}
        />
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search buyer, style ref, or description..."
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

        {/* Template toggle */}
        <button
          onClick={() => setShowTemplates(!showTemplates)}
          className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 flex items-center gap-1.5",
            showTemplates
              ? "bg-amber-600 text-white"
              : "bg-muted text-muted-foreground hover:bg-muted/70"
          )}
        >
          <LayoutTemplate className="h-3.5 w-3.5" />
          Templates
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Calculator className="h-12 w-12 text-muted-foreground/20 mb-4" />
          <p className="font-medium text-muted-foreground">
            {costSheets.length === 0 ? "No cost sheets yet" : "No cost sheets match your filters"}
          </p>
          {costSheets.length === 0 && (
            <Button variant="outline" className="mt-4" onClick={() => navigate("/finance/costing/new")}>
              <Plus className="h-4 w-4 mr-2" />Create first cost sheet
            </Button>
          )}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="rounded-xl border border-border overflow-hidden"
        >
          {/* Desktop table header */}
          <div className="hidden md:grid md:grid-cols-[1.5fr_1.2fr_1fr_90px_100px_110px_100px_90px] gap-4 px-4 py-2.5 bg-muted/40 border-b border-border">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Style</span>
            <SortButton current={sort} value="buyer" asc="buyer_asc" desc="buyer_asc" onChange={setSort}>Buyer</SortButton>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Garment</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Qty</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Quoted</span>
            <SortButton current={sort} value="date" asc="date_asc" desc="date_desc" onChange={setSort}>Updated</SortButton>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Actions</span>
          </div>

          <AnimatePresence>
            {filtered.map((cs, i) => (
              <CostSheetRow
                key={cs.id}
                costSheet={cs}
                isLast={i === filtered.length - 1}
                onView={() => navigate(`/finance/costing/${cs.id}`)}
                onEdit={() => navigate(`/finance/costing/${cs.id}/edit`)}
                onDuplicate={() => handleDuplicate(cs)}
                onDelete={() => setDeleteTarget(cs)}
              />
            ))}
          </AnimatePresence>

          {/* Footer row */}
          <div className="hidden md:flex items-center justify-end px-4 py-3 bg-muted/20 border-t border-border gap-4">
            <span className="text-xs text-muted-foreground">{filtered.length} cost sheet{filtered.length !== 1 ? "s" : ""}</span>
          </div>
        </motion.div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete cost sheet</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the cost sheet for{" "}
              <span className="font-semibold text-foreground">{deleteTarget?.style_ref}</span>
              {deleteTarget?.buyer_name && <> ({deleteTarget.buyer_name})</>}?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Row component ────────────────────────────────────────────────────────────

function CostSheetRow({
  costSheet, isLast, onView, onEdit, onDuplicate, onDelete,
}: {
  costSheet: CostSheet;
  isLast: boolean;
  onView: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const cfg = STATUS_CONFIG[costSheet.status];
  const StatusIcon = cfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn("group", !isLast && "border-b border-border/60")}
    >
      {/* Desktop row */}
      <div
        className="hidden md:grid md:grid-cols-[1.5fr_1.2fr_1fr_90px_100px_110px_100px_90px] gap-4 px-4 py-3 items-center hover:bg-muted/20 transition-colors cursor-pointer"
        onClick={onView}
      >
        {/* Style */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold text-purple-400 truncate">{costSheet.style_ref}</span>
            {costSheet.is_template && (
              <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                Template
              </span>
            )}
          </div>
          {costSheet.style_description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{costSheet.style_description}</p>
          )}
        </div>

        {/* Buyer */}
        <p className="text-sm font-medium truncate">{costSheet.buyer_name}</p>

        {/* Garment type */}
        <p className="text-sm text-muted-foreground truncate">{costSheet.garment_type ?? "-"}</p>

        {/* Qty */}
        <p className="text-sm text-muted-foreground">
          {costSheet.target_quantity ? costSheet.target_quantity.toLocaleString() : "-"}
        </p>

        {/* Status */}
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border w-fit",
            cfg.pill
          )}
        >
          <StatusIcon className="h-3 w-3" />
          {cfg.label}
        </span>

        {/* Quoted price */}
        <p className="text-sm font-semibold">
          {costSheet.quoted_price != null ? `$${fmt(costSheet.quoted_price)}` : "-"}
        </p>

        {/* Updated */}
        <p className="text-sm text-muted-foreground">{fmtDate(costSheet.updated_at)}</p>

        {/* Actions */}
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDuplicate}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Duplicate"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
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
              <span className="font-mono text-sm font-bold text-purple-400">{costSheet.style_ref}</span>
              <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border", cfg.pill)}>
                <StatusIcon className="h-3 w-3" />
                {cfg.label}
              </span>
              {costSheet.is_template && (
                <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                  Template
                </span>
              )}
            </div>
            <p className="font-semibold truncate">{costSheet.buyer_name}</p>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
              {costSheet.garment_type && (
                <span className="flex items-center gap-1">
                  <Package className="h-3 w-3" />{costSheet.garment_type}
                </span>
              )}
              {costSheet.target_quantity && (
                <span>Qty: {costSheet.target_quantity.toLocaleString()}</span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />{fmtDate(costSheet.updated_at)}
              </span>
            </div>
          </div>
          <div className="text-right shrink-0">
            {costSheet.quoted_price != null ? (
              <p className="font-bold">${fmt(costSheet.quoted_price)}</p>
            ) : (
              <p className="text-xs text-muted-foreground italic">No quote</p>
            )}
          </div>
        </div>

        {/* Mobile action bar */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/40" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Pencil className="h-3 w-3" />Edit
          </button>
          <button
            onClick={onDuplicate}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Copy className="h-3 w-3" />Duplicate
          </button>
          <button
            onClick={onDelete}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-400 transition-colors ml-auto"
          >
            <Trash2 className="h-3 w-3" />Delete
          </button>
        </div>
      </div>
    </motion.div>
  );
}
