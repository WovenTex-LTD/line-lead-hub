import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format, isWithinInterval, subDays } from "date-fns";
import {
  Clock, CheckCircle2, XCircle, Ban, ChevronRight, FileDown,
  Package, TrendingUp, Truck, Search, X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { useAllDispatches } from "@/hooks/useDispatchRequests";
import type { DispatchRequest, DispatchStatus } from "@/types/dispatch";

const STATUS_TABS: { value: DispatchStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const STATUS_CONFIG: Record<DispatchStatus, { label: string; icon: React.ReactNode; className: string }> = {
  pending: {
    label: "Pending",
    icon: <Clock className="h-3 w-3" />,
    className: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
  },
  approved: {
    label: "Approved",
    icon: <CheckCircle2 className="h-3 w-3" />,
    className: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
  },
  rejected: {
    label: "Rejected",
    icon: <XCircle className="h-3 w-3" />,
    className: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800",
  },
  cancelled: {
    label: "Cancelled",
    icon: <Ban className="h-3 w-3" />,
    className: "bg-muted text-muted-foreground border-border",
  },
  draft: {
    label: "Draft",
    icon: null,
    className: "bg-muted text-muted-foreground border-border",
  },
};

function matchesSearch(d: DispatchRequest, q: string) {
  const lower = q.toLowerCase();
  return (
    d.reference_number.toLowerCase().includes(lower) ||
    d.truck_number.toLowerCase().includes(lower) ||
    d.driver_name.toLowerCase().includes(lower) ||
    d.destination.toLowerCase().includes(lower) ||
    (d.style_name?.toLowerCase().includes(lower) ?? false) ||
    (d.buyer_name?.toLowerCase().includes(lower) ?? false) ||
    (d.submitter?.full_name?.toLowerCase().includes(lower) ?? false)
  );
}

// ── KPI strip ──────────────────────────────────────────────────────────────
function KpiStrip({ dispatches }: { dispatches: DispatchRequest[] }) {
  const now = new Date();
  const windowStart = subDays(now, 30);

  const recent = dispatches.filter((d) =>
    isWithinInterval(new Date(d.submitted_at), { start: windowStart, end: now })
  );

  const pending = recent.filter((d) => d.status === "pending").length;
  const approved = recent.filter((d) => d.status === "approved").length;
  const rejected = recent.filter((d) => d.status === "rejected").length;
  const totalPieces = recent
    .filter((d) => d.status === "approved")
    .reduce((sum, d) => sum + d.dispatch_quantity, 0);

  return (
    <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
      <div className="relative overflow-hidden rounded-xl border border-amber-200/60 dark:border-amber-800/40 bg-gradient-to-br from-amber-50 via-white to-orange-50/50 dark:from-amber-950/40 dark:via-card dark:to-orange-950/20 p-4 md:p-5 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group">
        <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-bl from-amber-500/8 to-transparent rounded-bl-full pointer-events-none" />
        <div className="relative flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-amber-600/70 dark:text-amber-400/70">Pending Review</p>
            <p className="font-mono text-2xl md:text-3xl font-bold tracking-tight text-amber-900 dark:text-amber-100">{pending}</p>
            <p className="text-[10px] md:text-xs text-muted-foreground">Last 30 days</p>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 p-2.5 shadow-lg shadow-amber-500/25 group-hover:shadow-amber-500/40 transition-shadow">
            <Clock className="h-5 w-5 text-white" />
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-emerald-200/60 dark:border-emerald-800/40 bg-gradient-to-br from-emerald-50 via-white to-teal-50/50 dark:from-emerald-950/40 dark:via-card dark:to-teal-950/20 p-4 md:p-5 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group">
        <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-bl from-emerald-500/8 to-transparent rounded-bl-full pointer-events-none" />
        <div className="relative flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-emerald-600/70 dark:text-emerald-400/70">Approved</p>
            <p className="font-mono text-2xl md:text-3xl font-bold tracking-tight text-emerald-900 dark:text-emerald-100">{approved}</p>
            <p className="text-[10px] md:text-xs text-muted-foreground">Last 30 days</p>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 p-2.5 shadow-lg shadow-emerald-500/25 group-hover:shadow-emerald-500/40 transition-shadow">
            <CheckCircle2 className="h-5 w-5 text-white" />
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-red-200/60 dark:border-red-800/40 bg-gradient-to-br from-red-50 via-white to-rose-50/50 dark:from-red-950/40 dark:via-card dark:to-rose-950/20 p-4 md:p-5 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group">
        <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-bl from-red-500/8 to-transparent rounded-bl-full pointer-events-none" />
        <div className="relative flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-red-600/70 dark:text-red-400/70">Rejected</p>
            <p className="font-mono text-2xl md:text-3xl font-bold tracking-tight text-red-900 dark:text-red-100">{rejected}</p>
            <p className="text-[10px] md:text-xs text-muted-foreground">Last 30 days</p>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-red-500 to-rose-600 p-2.5 shadow-lg shadow-red-500/25 group-hover:shadow-red-500/40 transition-shadow">
            <XCircle className="h-5 w-5 text-white" />
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-orange-200/60 dark:border-orange-800/40 bg-gradient-to-br from-orange-50 via-white to-amber-50/50 dark:from-orange-950/40 dark:via-card dark:to-amber-950/20 p-4 md:p-5 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group">
        <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-bl from-orange-500/8 to-transparent rounded-bl-full pointer-events-none" />
        <div className="relative flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-orange-600/70 dark:text-orange-400/70">Pieces Dispatched</p>
            <p className="font-mono text-2xl md:text-3xl font-bold tracking-tight text-orange-900 dark:text-orange-100">{totalPieces.toLocaleString()}</p>
            <p className="text-[10px] md:text-xs text-muted-foreground">Approved, last 30 days</p>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 p-2.5 shadow-lg shadow-orange-500/25 group-hover:shadow-orange-500/40 transition-shadow">
            <Package className="h-5 w-5 text-white" />
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiStripSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
      {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[88px] w-full rounded-xl" />)}
    </div>
  );
}

// ── Dispatch row ────────────────────────────────────────────────────────────
function DispatchRow({ request }: { request: DispatchRequest }) {
  const navigate = useNavigate();
  const s = STATUS_CONFIG[request.status];

  return (
    <Card
      className="cursor-pointer hover:shadow-sm transition-all duration-200 group"
      onClick={() =>
        request.status === "pending"
          ? navigate(`/dispatch/review/${request.id}`)
          : navigate(`/dispatch/pass/${request.id}`)
      }
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-semibold tracking-tight">{request.reference_number}</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${s.className}`}>
                {s.icon}{s.label}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
              {request.submitter?.full_name && (
                <span>By <span className="text-foreground font-medium">{request.submitter.full_name}</span></span>
              )}
              {request.work_order?.po_number && (
                <><span>·</span><span>PO: <span className="text-foreground font-medium">{request.work_order.po_number}</span></span></>
              )}
              {request.style_name && <><span>·</span><span>{request.style_name}</span></>}
              {request.destination && <><span>·</span><span>{request.destination}</span></>}
            </div>
            <div className="text-xs text-muted-foreground">
              {format(new Date(request.submitted_at), "MMM d, yyyy 'at' h:mm a")}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div className="text-sm font-semibold">{request.dispatch_quantity.toLocaleString()} pcs</div>
              {request.carton_count && (
                <div className="text-xs text-muted-foreground">{request.carton_count} ctns</div>
              )}
            </div>
            {request.status === "approved" && request.gate_pass_pdf_url
              ? <FileDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            }
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DispatchList({ statusFilter, search }: { statusFilter?: DispatchStatus; search: string }) {
  const { data: dispatches, isLoading } = useAllDispatches(statusFilter);

  const filtered = useMemo(() => {
    if (!dispatches) return [];
    if (!search.trim()) return dispatches;
    return dispatches.filter((d) => matchesSearch(d, search));
  }, [dispatches, search]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-[84px] w-full rounded-xl" />)}
      </div>
    );
  }

  if (!dispatches || dispatches.length === 0) {
    return (
      <EmptyState
        icon={Truck}
        title="No dispatches found"
        description="Dispatch requests will appear here once submitted by the gate officer."
      />
    );
  }

  if (filtered.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="No results"
        description={`No dispatches match "${search}". Try a different search.`}
      />
    );
  }

  return (
    <div className="space-y-3">
      {filtered.map((d) => <DispatchRow key={d.id} request={d} />)}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function AllDispatches() {
  const [tab, setTab] = useState<DispatchStatus | "all">("all");
  const [search, setSearch] = useState("");
  const { data: allDispatches, isLoading: kpiLoading } = useAllDispatches();

  const countByStatus = (status: DispatchStatus) =>
    allDispatches?.filter((d) => d.status === status).length ?? 0;

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
          <TrendingUp className="h-5 w-5 text-orange-600 dark:text-orange-400" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">All Dispatches</h1>
          <p className="text-sm text-muted-foreground">Full dispatch history for your factory</p>
        </div>
      </div>

      {/* KPI strip */}
      {kpiLoading ? (
        <KpiStripSkeleton />
      ) : allDispatches && allDispatches.length > 0 ? (
        <KpiStrip dispatches={allDispatches} />
      ) : null}

      {/* Tabs + search */}
      <Tabs value={tab} onValueChange={(v) => { setTab(v as typeof tab); setSearch(""); }}>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <TabsList className="w-full sm:w-auto grid grid-cols-4 sm:flex h-auto p-1 rounded-xl bg-muted/60 border border-border/50 shrink-0">
            {STATUS_TABS.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-3 py-2 rounded-lg data-[state=active]:shadow-sm"
              >
                {t.label}
                {t.value !== "all" && !kpiLoading && (
                  <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px] font-semibold tabular-nums">
                    {countByStatus(t.value as DispatchStatus)}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Search */}
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Reference, driver, destination…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-9 h-10"
            />
            {search && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setSearch("")}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {STATUS_TABS.map((t) => (
          <TabsContent key={t.value} value={t.value} className="pt-4">
            <DispatchList
              statusFilter={t.value === "all" ? undefined : t.value}
              search={search}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
