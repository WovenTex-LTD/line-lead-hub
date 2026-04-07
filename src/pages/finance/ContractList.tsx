import { useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText, Plus, Upload, Search, Trash2, Pencil, Loader2, FileUp,
  ArrowUpDown, ArrowUp, ArrowDown, CheckCircle2, CircleDashed,
  Clock, Package, DollarSign, TruckIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  useSalesContracts,
  useSalesContractMutations,
  useExtractPO,
  type SalesContract,
} from "@/hooks/useSalesContracts";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  draft:         { label: "Draft",         icon: CircleDashed, pill: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
  confirmed:     { label: "Confirmed",     icon: CheckCircle2, pill: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  in_production: { label: "In Production", icon: Clock,        pill: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  shipped:       { label: "Shipped",       icon: TruckIcon,    pill: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  completed:     { label: "Completed",     icon: CheckCircle2, pill: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  cancelled:     { label: "Cancelled",     icon: CircleDashed, pill: "bg-red-500/10 text-red-400 border-red-500/20" },
} as const;

const STATUSES = ["draft", "confirmed", "in_production", "shipped", "completed", "cancelled"] as const;

type SortKey = "date_desc" | "date_asc" | "buyer_asc";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, subtitle, color, icon: Icon, active, onClick,
}: {
  label: string; value: string | number; subtitle: string;
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
      <p className="text-xl font-bold tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
    </button>
  );
}

// ── Sort button ──────────────────────────────────────────────────────────────

function SortButton({ current, asc, desc, children, onChange }: {
  current: SortKey; asc: SortKey; desc: SortKey;
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

export default function ContractList() {
  const navigate = useNavigate();
  const { contracts, loading, refetch } = useSalesContracts();
  const { deleteContract } = useSalesContractMutations();
  const { uploading, uploadAndExtract } = useExtractPO();

  const [search, setSearch]             = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | SalesContract["status"]>("all");
  const [sort, setSort]                 = useState<SortKey>("date_desc");
  const [deleteTarget, setDeleteTarget] = useState<SalesContract | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [showUpload, setShowUpload]     = useState(false);
  const [dragOver, setDragOver]         = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Computed totals ────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const active = contracts.filter(
      (c) => c.status === "confirmed" || c.status === "in_production"
    );
    const totalValue = contracts.reduce((sum, c) => sum + (c.total_value ?? 0), 0);
    const shippedCompleted = contracts.filter(
      (c) => c.status === "shipped" || c.status === "completed"
    );
    return {
      total: contracts.length,
      active: active.length,
      totalValue,
      shippedCompleted: shippedCompleted.length,
    };
  }, [contracts]);

  // ── Filtered + sorted list ─────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = contracts.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (q) {
        const matchHeader =
          c.buyer_name.toLowerCase().includes(q) ||
          c.contract_number.toLowerCase().includes(q);
        const matchItems = c.sales_contract_items?.some(
          (it) => it.style_ref.toLowerCase().includes(q)
        );
        if (!matchHeader && !matchItems) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sort === "date_desc") return new Date(b.contract_date).getTime() - new Date(a.contract_date).getTime();
      if (sort === "date_asc")  return new Date(a.contract_date).getTime() - new Date(b.contract_date).getTime();
      if (sort === "buyer_asc") return a.buyer_name.localeCompare(b.buyer_name);
      return 0;
    });

    return list;
  }, [contracts, search, statusFilter, sort]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const ok = await deleteContract(deleteTarget.id);
    if (ok) refetch();
    setDeleteTarget(null);
    setDeleting(false);
  };

  const handleFileUpload = async (file: File) => {
    const validTypes = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast.error("Invalid file type", { description: "Please upload a PDF or image file." });
      return;
    }
    const result = await uploadAndExtract(file);
    if (result.documentId) {
      setShowUpload(false);
      navigate(`/finance/contracts/new?extracted=${result.documentId}`);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    // Reset so the same file can be selected again
    e.target.value = "";
  };

  // ── Item count helper ─────────────────────────────────────────────────────

  function getItemsCount(c: SalesContract): number {
    if (c.sales_contract_items) return c.sales_contract_items.length;
    // When fetched with count, supabase nests [{count: N}]
    const items = (c as any).sales_contract_items;
    if (Array.isArray(items) && items.length === 1 && typeof items[0]?.count === "number") {
      return items[0].count;
    }
    return 0;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-purple-400" />
            <h1 className="text-xl md:text-2xl font-bold">Sales Contracts</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage buyer contracts with amendment history
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            onClick={() => setShowUpload(true)}
          >
            <Upload className="h-4 w-4 mr-1.5" />
            <span className="hidden sm:inline">Upload PO</span>
            <span className="sm:hidden">PO</span>
          </Button>
          <Button
            onClick={() => navigate("/finance/contracts/new")}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            <span className="hidden sm:inline">New Contract</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Total" value={kpis.total}
          subtitle={`contract${kpis.total !== 1 ? "s" : ""}`}
          color="bg-purple-500/10 text-purple-500" icon={FileText}
          active={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
        />
        <KpiCard
          label="Active" value={kpis.active}
          subtitle="confirmed + in production"
          color="bg-blue-500/10 text-blue-500" icon={Clock}
          active={statusFilter === "confirmed" || statusFilter === "in_production"}
          onClick={() => setStatusFilter(statusFilter === "confirmed" ? "all" : "confirmed")}
        />
        <KpiCard
          label="Total Value" value={`$${fmt(kpis.totalValue)}`}
          subtitle="across all contracts"
          color="bg-emerald-500/10 text-emerald-500" icon={DollarSign}
          active={false}
          onClick={() => {}}
        />
        <KpiCard
          label="Shipped / Done" value={kpis.shippedCompleted}
          subtitle="shipped + completed"
          color="bg-amber-500/10 text-amber-500" icon={TruckIcon}
          active={statusFilter === "shipped" || statusFilter === "completed"}
          onClick={() => setStatusFilter(statusFilter === "shipped" ? "completed" : statusFilter === "completed" ? "all" : "shipped")}
        />
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search buyer, contract #, or style ref..."
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
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText className="h-12 w-12 text-muted-foreground/20 mb-4" />
          <p className="font-medium text-muted-foreground">
            {contracts.length === 0 ? "No contracts yet" : "No contracts match your filters"}
          </p>
          {contracts.length === 0 && (
            <Button variant="outline" className="mt-4" onClick={() => navigate("/finance/contracts/new")}>
              <Plus className="h-4 w-4 mr-2" />Create first contract
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
          <div className="hidden md:grid md:grid-cols-[1fr_1.2fr_100px_90px_100px_100px_80px_90px] gap-4 px-4 py-2.5 bg-muted/40 border-b border-border">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Contract #</span>
            <SortButton current={sort} asc="buyer_asc" desc="buyer_asc" onChange={setSort}>Buyer</SortButton>
            <SortButton current={sort} asc="date_asc" desc="date_desc" onChange={setSort}>Date</SortButton>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Qty</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Value</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Items</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Actions</span>
          </div>

          <AnimatePresence>
            {filtered.map((c, i) => (
              <ContractRow
                key={c.id}
                contract={c}
                itemsCount={getItemsCount(c)}
                isLast={i === filtered.length - 1}
                onView={() => navigate(`/finance/contracts/${c.id}`)}
                onEdit={() => navigate(`/finance/contracts/${c.id}/edit`)}
                onDelete={() => setDeleteTarget(c)}
              />
            ))}
          </AnimatePresence>

          {/* Footer row */}
          <div className="hidden md:flex items-center justify-end px-4 py-3 bg-muted/20 border-t border-border gap-4">
            <span className="text-xs text-muted-foreground">{filtered.length} contract{filtered.length !== 1 ? "s" : ""}</span>
          </div>
        </motion.div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete contract</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete contract{" "}
              <span className="font-semibold text-foreground">{deleteTarget?.contract_number}</span>
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

      {/* Upload PO dialog */}
      <Dialog open={showUpload} onOpenChange={(open) => { if (!uploading) setShowUpload(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileUp className="h-5 w-5 text-purple-400" />
              Upload Purchase Order
            </DialogTitle>
            <DialogDescription>
              Upload a PO document (PDF or image) to auto-extract contract details.
            </DialogDescription>
          </DialogHeader>

          {uploading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-8 w-8 text-purple-400 animate-spin" />
              <p className="text-sm text-muted-foreground">Extracting PO data...</p>
            </div>
          ) : (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
                dragOver
                  ? "border-purple-500 bg-purple-500/5"
                  : "border-border hover:border-purple-500/40 hover:bg-muted/30"
              )}
            >
              <Upload className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-medium">
                Drag & drop a file here, or click to browse
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PDF, PNG, JPG, or WEBP
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleFileInput}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Row component ────────────────────────────────────────────────────────────

function ContractRow({
  contract, itemsCount, isLast, onView, onEdit, onDelete,
}: {
  contract: SalesContract;
  itemsCount: number;
  isLast: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cfg = STATUS_CONFIG[contract.status];
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
        className="hidden md:grid md:grid-cols-[1fr_1.2fr_100px_90px_100px_100px_80px_90px] gap-4 px-4 py-3 items-center hover:bg-muted/20 transition-colors cursor-pointer"
        onClick={onView}
      >
        {/* Contract # */}
        <div className="min-w-0">
          <span className="font-mono text-sm font-bold text-purple-400 truncate">{contract.contract_number}</span>
        </div>

        {/* Buyer */}
        <p className="text-sm font-medium truncate">{contract.buyer_name}</p>

        {/* Date */}
        <p className="text-sm text-muted-foreground">{fmtDate(contract.contract_date)}</p>

        {/* Qty */}
        <p className="text-sm text-muted-foreground">
          {contract.total_quantity ? contract.total_quantity.toLocaleString() : "-"}
        </p>

        {/* Value */}
        <p className="text-sm font-semibold">
          {contract.total_value != null ? `$${fmt(contract.total_value)}` : "-"}
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

        {/* Items count */}
        <p className="text-sm text-muted-foreground">
          {itemsCount} item{itemsCount !== 1 ? "s" : ""}
        </p>

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
              <span className="font-mono text-sm font-bold text-purple-400">{contract.contract_number}</span>
              <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border", cfg.pill)}>
                <StatusIcon className="h-3 w-3" />
                {cfg.label}
              </span>
            </div>
            <p className="font-semibold truncate">{contract.buyer_name}</p>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />{fmtDate(contract.contract_date)}
              </span>
              {contract.total_quantity > 0 && (
                <span className="flex items-center gap-1">
                  <Package className="h-3 w-3" />Qty: {contract.total_quantity.toLocaleString()}
                </span>
              )}
              <span>{itemsCount} item{itemsCount !== 1 ? "s" : ""}</span>
            </div>
          </div>
          <div className="text-right shrink-0">
            {contract.total_value != null && contract.total_value > 0 ? (
              <p className="font-bold">${fmt(contract.total_value)}</p>
            ) : (
              <p className="text-xs text-muted-foreground italic">No value</p>
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
