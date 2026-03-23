import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import { CheckSquare, Clock, ChevronRight, Package, Timer, Search, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { usePendingApprovals } from "@/hooks/useDispatchRequests";
import type { DispatchRequest } from "@/types/dispatch";

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

// ── Summary KPIs ────────────────────────────────────────────────────────────
function SummaryKpis({ requests }: { requests: DispatchRequest[] }) {
  const totalPieces = requests.reduce((sum, d) => sum + d.dispatch_quantity, 0);
  const oldest = requests[requests.length - 1];
  const oldestWait = oldest
    ? formatDistanceToNow(new Date(oldest.submitted_at), { addSuffix: false })
    : "—";

  return (
    <div className="grid grid-cols-3 gap-3 md:gap-4">
      <div className="relative overflow-hidden rounded-xl border border-amber-200/60 dark:border-amber-800/40 bg-gradient-to-br from-amber-50 via-white to-orange-50/50 dark:from-amber-950/40 dark:via-card dark:to-orange-950/20 p-4 md:p-5 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group">
        <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-bl from-amber-500/8 to-transparent rounded-bl-full pointer-events-none" />
        <div className="relative flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-amber-600/70 dark:text-amber-400/70">Awaiting Review</p>
            <p className="font-mono text-2xl md:text-3xl font-bold tracking-tight text-amber-900 dark:text-amber-100">{requests.length}</p>
            <p className="text-[10px] md:text-xs text-muted-foreground">{requests.length === 1 ? "request" : "requests"} pending</p>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 p-2.5 shadow-lg shadow-amber-500/25 group-hover:shadow-amber-500/40 transition-shadow">
            <CheckSquare className="h-5 w-5 text-white" />
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-orange-200/60 dark:border-orange-800/40 bg-gradient-to-br from-orange-50 via-white to-amber-50/50 dark:from-orange-950/40 dark:via-card dark:to-amber-950/20 p-4 md:p-5 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group">
        <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-bl from-orange-500/8 to-transparent rounded-bl-full pointer-events-none" />
        <div className="relative flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-orange-600/70 dark:text-orange-400/70">Total Pieces</p>
            <p className="font-mono text-2xl md:text-3xl font-bold tracking-tight text-orange-900 dark:text-orange-100">{totalPieces.toLocaleString()}</p>
            <p className="text-[10px] md:text-xs text-muted-foreground">Pending approval</p>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 p-2.5 shadow-lg shadow-orange-500/25 group-hover:shadow-orange-500/40 transition-shadow">
            <Package className="h-5 w-5 text-white" />
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-slate-200/60 dark:border-slate-700/40 bg-gradient-to-br from-slate-50 via-white to-slate-50/50 dark:from-slate-900/40 dark:via-card dark:to-slate-900/20 p-4 md:p-5 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group">
        <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-bl from-slate-500/8 to-transparent rounded-bl-full pointer-events-none" />
        <div className="relative flex items-start justify-between">
          <div className="space-y-1 min-w-0 pr-2">
            <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-slate-500/70 dark:text-slate-400/70">Oldest Request</p>
            <p className="font-mono text-lg md:text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 leading-tight">{oldestWait}</p>
            <p className="text-[10px] md:text-xs text-muted-foreground">Waiting the longest</p>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-slate-500 to-slate-600 p-2.5 shadow-lg shadow-slate-500/25 group-hover:shadow-slate-500/40 transition-shadow shrink-0">
            <Timer className="h-5 w-5 text-white" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Pending card ────────────────────────────────────────────────────────────
function PendingCard({ request }: { request: DispatchRequest }) {
  const navigate = useNavigate();
  const waitTime = formatDistanceToNow(new Date(request.submitted_at), { addSuffix: false });

  return (
    <Card
      className="cursor-pointer hover:shadow-sm transition-all duration-200 group"
      onClick={() => navigate(`/dispatch/review/${request.id}`)}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-semibold tracking-tight">{request.reference_number}</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800">
                <Clock className="h-3 w-3" />
                Pending
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
              <span>By <span className="text-foreground font-medium">{request.submitter?.full_name ?? "Gate Officer"}</span></span>
              {request.work_order?.po_number && (
                <><span>·</span><span>PO: <span className="text-foreground font-medium">{request.work_order.po_number}</span></span></>
              )}
              {request.style_name && <><span>·</span><span>{request.style_name}</span></>}
              {request.destination && <><span>·</span><span>{request.destination}</span></>}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{format(new Date(request.submitted_at), "MMM d, yyyy 'at' h:mm a")}</span>
              <span className="font-medium text-amber-600 dark:text-amber-400">· {waitTime} ago</span>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div className="text-sm font-semibold">{request.dispatch_quantity.toLocaleString()} pcs</div>
              {request.carton_count && (
                <div className="text-xs text-muted-foreground">{request.carton_count} ctns</div>
              )}
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function PendingApprovals() {
  const { data: pending, isLoading } = usePendingApprovals();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!pending) return [];
    if (!search.trim()) return pending;
    return pending.filter((d) => matchesSearch(d, search));
  }, [pending, search]);

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
          <CheckSquare className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Dispatch Approvals</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? "Loading..."
              : pending && pending.length > 0
              ? `${pending.length} request${pending.length !== 1 ? "s" : ""} waiting for review`
              : "No pending requests"}
          </p>
        </div>
      </div>

      {/* KPI summary */}
      {isLoading ? (
        <div className="grid grid-cols-3 gap-3 md:gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-[88px] w-full rounded-xl" />)}
        </div>
      ) : pending && pending.length > 0 ? (
        <SummaryKpis requests={pending} />
      ) : null}

      {/* Search */}
      {!isLoading && pending && pending.length > 0 && (
        <div className="relative max-w-sm">
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
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-[84px] w-full rounded-xl" />)}
        </div>
      ) : !pending || pending.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="No pending approvals"
          description="All dispatch requests have been reviewed. New requests from the gate officer will appear here."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No results"
          description={`No pending requests match "${search}".`}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => <PendingCard key={d.id} request={d} />)}
        </div>
      )}
    </div>
  );
}
