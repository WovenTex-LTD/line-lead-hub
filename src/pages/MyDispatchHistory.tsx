import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ClipboardList, Truck, Plus, FileDown, Clock, CheckCircle2, XCircle, Ban, Pencil, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useMyDispatches, useDispatchMutations } from "@/hooks/useDispatchRequests";
import type { DispatchRequest, DispatchStatus } from "@/types/dispatch";

const STATUS_FILTERS: { value: DispatchStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_MAP: Record<DispatchStatus, { label: string; className: string; icon: React.ReactNode }> = {
  pending: {
    label: "Pending",
    className: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
    icon: <Clock className="h-3 w-3" />,
  },
  approved: {
    label: "Approved",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  rejected: {
    label: "Rejected",
    className: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800",
    icon: <XCircle className="h-3 w-3" />,
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-muted text-muted-foreground border-border",
    icon: <Ban className="h-3 w-3" />,
  },
  draft: {
    label: "Draft",
    className: "bg-muted text-muted-foreground border-border",
    icon: null,
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
    (d.buyer_name?.toLowerCase().includes(lower) ?? false)
  );
}

function DispatchCard({ request, onCancel }: { request: DispatchRequest; onCancel: (id: string) => void }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const s = STATUS_MAP[request.status];

  return (
    <Card
      className="cursor-pointer hover:shadow-sm transition-shadow"
      onClick={() => setExpanded((v) => !v)}
    >
      <CardContent className="p-4">
        {/* Top row */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold tracking-tight">{request.reference_number}</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${s.className}`}>
                {s.icon}
                {s.label}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
              {request.work_order?.po_number && (
                <span>PO: <span className="text-foreground font-medium">{request.work_order.po_number}</span></span>
              )}
              {request.style_name && <><span>·</span><span>{request.style_name}</span></>}
              {request.buyer_name && <><span>·</span><span>{request.buyer_name}</span></>}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm font-semibold">{request.dispatch_quantity.toLocaleString()} pcs</div>
            {request.carton_count && (
              <div className="text-xs text-muted-foreground">{request.carton_count} ctns</div>
            )}
          </div>
        </div>

        {/* Date */}
        <div className="mt-2 text-xs text-muted-foreground">
          {format(new Date(request.submitted_at), "MMM d, yyyy 'at' h:mm a")}
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div className="mt-3 pt-3 border-t border-border space-y-2">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <div><span className="text-muted-foreground">Truck</span><div className="font-medium">{request.truck_number}</div></div>
              <div><span className="text-muted-foreground">Driver</span><div className="font-medium">{request.driver_name}</div></div>
              <div><span className="text-muted-foreground">Destination</span><div className="font-medium">{request.destination}</div></div>
              {request.driver_nid && (
                <div><span className="text-muted-foreground">NID</span><div className="font-medium">{request.driver_nid}</div></div>
              )}
            </div>
            {request.remarks && (
              <div className="text-xs">
                <span className="text-muted-foreground">Remarks: </span>
                <span>{request.remarks}</span>
              </div>
            )}
            {request.status === "rejected" && request.rejection_reason && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                <span className="font-medium">Rejection reason: </span>{request.rejection_reason}
              </div>
            )}
            {/* Actions */}
            <div className="flex gap-2 pt-1">
              {request.status === "approved" && request.gate_pass_pdf_url && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/dispatch/pass/${request.id}`);
                  }}
                >
                  <FileDown className="h-3.5 w-3.5 mr-1.5" />
                  View Gate Pass
                </Button>
              )}
              {request.status === "pending" && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/dispatch/edit/${request.id}`);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCancel(request.id);
                    }}
                  >
                    Cancel Request
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function MyDispatchHistory() {
  const navigate = useNavigate();
  const { data: dispatches, isLoading } = useMyDispatches();
  const { cancelDispatch } = useDispatchMutations();
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<DispatchStatus | "all">("all");

  const filtered = useMemo(() => {
    if (!dispatches) return [];
    let result = dispatches;
    if (statusFilter !== "all") result = result.filter((d) => d.status === statusFilter);
    if (search.trim()) result = result.filter((d) => matchesSearch(d, search));
    return result;
  }, [dispatches, statusFilter, search]);

  async function handleCancel() {
    if (!cancelId) return;
    try {
      await cancelDispatch.mutateAsync(cancelId);
      toast.success("Dispatch request cancelled.");
    } catch {
      toast.error("Failed to cancel request.");
    } finally {
      setCancelId(null);
    }
  }

  const countByStatus = (s: DispatchStatus) => dispatches?.filter((d) => d.status === s).length ?? 0;

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
            <ClipboardList className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">My Dispatches</h1>
            <p className="text-sm text-muted-foreground">Your dispatch request history</p>
          </div>
        </div>
        <Button
          size="sm"
          className="bg-orange-600 hover:bg-orange-700 text-white shrink-0"
          onClick={() => navigate("/dispatch/new")}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          New Dispatch
        </Button>
      </div>

      {/* Search + status filter chips */}
      {!isLoading && dispatches && dispatches.length > 0 && (
        <div className="space-y-3">
          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Reference, truck, driver, destination…"
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

          {/* Status filter chips */}
          <div className="flex items-center gap-2 flex-wrap">
            {STATUS_FILTERS.map((f) => {
              const count = f.value === "all" ? (dispatches?.length ?? 0) : countByStatus(f.value as DispatchStatus);
              const active = statusFilter === f.value;
              return (
                <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150 ${
                    active
                      ? "bg-foreground text-background border-foreground"
                      : "bg-background text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground"
                  }`}
                >
                  {f.label}
                  <span className={`text-[10px] font-semibold tabular-nums ${active ? "opacity-70" : "opacity-50"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : !dispatches || dispatches.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No dispatch requests yet"
          description="Submit your first gate dispatch request and it will appear here."
          action={{ label: "New Dispatch", onClick: () => navigate("/dispatch/new") }}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No results"
          description={
            search
              ? `No dispatches match "${search}".`
              : `No ${statusFilter} dispatches found.`
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => (
            <DispatchCard key={d.id} request={d} onCancel={setCancelId} />
          ))}
        </div>
      )}

      {/* Cancel confirmation */}
      <AlertDialog open={!!cancelId} onOpenChange={(o) => !o && setCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel dispatch request?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the request and it will no longer be reviewed by the admin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleCancel}
            >
              Cancel request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
