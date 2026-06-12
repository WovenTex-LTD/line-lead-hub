import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  Search,
  Loader2,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus,
  Activity,
  PlayCircle,
  Send,
  Stamp,
  Sparkles,
  Calendar,
  Package,
  ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatShortDate } from "@/lib/date-utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  useQCOrderTrackers,
  startOrderTracker,
  effectiveTrackerStatus,
  type POWithTracker,
} from "@/hooks/useQCOrderTrackers";
import {
  STATUS_VIS,
  StatusPill,
  CountChip,
  type SheetTrackerStatus,
} from "@/components/quality/status-vis";

type FilterTab =
  | "in_progress"
  | "not_started"
  | "awaiting_signoff"
  | "signed_off"
  | "all";

const TAB_ORDER: FilterTab[] = [
  "in_progress",
  "not_started",
  "awaiting_signoff",
  "signed_off",
  "all",
];

const TAB_META: Record<FilterTab, { label: string; activeCls: string }> = {
  in_progress: {
    label: "In Progress",
    activeCls:
      "data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 dark:data-[state=active]:bg-blue-950/40 dark:data-[state=active]:text-blue-300",
  },
  not_started: {
    label: "Not Started",
    activeCls:
      "data-[state=active]:bg-slate-100 data-[state=active]:text-slate-700 dark:data-[state=active]:bg-slate-800/40 dark:data-[state=active]:text-slate-300",
  },
  awaiting_signoff: {
    label: "Awaiting Sign-off",
    activeCls:
      "data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700 dark:data-[state=active]:bg-amber-950/40 dark:data-[state=active]:text-amber-300",
  },
  signed_off: {
    label: "Signed Off",
    activeCls:
      "data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700 dark:data-[state=active]:bg-emerald-950/40 dark:data-[state=active]:text-emerald-300",
  },
  all: {
    label: "All",
    activeCls:
      "data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 dark:data-[state=active]:bg-indigo-950/40 dark:data-[state=active]:text-indigo-300",
  },
};

export default function QCOrderManagerList() {
  const navigate = useNavigate();
  const { profile, user, factory, isQCUser } = useAuth();
  const canStart = isQCUser();
  const { rows, loading, refetch } = useQCOrderTrackers();
  const [search, setSearch] = useState("");
  // Land on In Progress — that's the active work
  const [tab, setTab] = useState<FilterTab>("in_progress");
  const [creatingFor, setCreatingFor] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c = {
      all: rows.length,
      not_started: 0,
      in_progress: 0,
      awaiting_signoff: 0,
      signed_off: 0,
      issuesTotal: 0,
    };
    for (const r of rows) {
      const eff = effectiveTrackerStatus(r);
      c[eff] += 1;
      c.issuesTotal += r.items_issue;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (tab !== "all") list = list.filter((r) => effectiveTrackerStatus(r) === tab);
    if (search) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.po_number.toLowerCase().includes(q) ||
          r.buyer.toLowerCase().includes(q) ||
          r.style.toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, tab, search]);

  async function handleStart(workOrderId: string) {
    if (!profile?.factory_id || !user?.id) {
      toast.error("Cannot start tracker — missing factory or user");
      return;
    }
    setCreatingFor(workOrderId);
    try {
      const trackerId = await startOrderTracker({
        factoryId: profile.factory_id,
        workOrderId,
        createdBy: user.id,
      });
      // Tracker exists in DB but no items touched → still shows as Not Started
      // in the UI until the inspector actually marks something.
      toast.success("Order tracker ready");
      navigate(`/quality/order-manager/${trackerId}`);
    } catch (err: any) {
      toast.error(err?.message || "Could not create tracker");
    } finally {
      setCreatingFor(null);
      refetch();
    }
  }

  const todayLong = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-5 md:space-y-6">
      {/* ── Hero header ──────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/60 dark:border-indigo-800/40 bg-gradient-to-br from-indigo-50 via-white to-violet-50/60 dark:from-indigo-950/40 dark:via-card dark:to-violet-950/20 shadow-sm">
        <div
          aria-hidden
          className="absolute top-0 right-0 w-64 h-64 rounded-bl-full pointer-events-none bg-gradient-to-bl from-indigo-500/15 to-transparent"
        />
        <div
          aria-hidden
          className="absolute bottom-0 left-0 w-40 h-40 rounded-tr-full pointer-events-none bg-gradient-to-tr from-violet-500/10 to-transparent"
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
            backgroundSize: "16px 16px",
          }}
        />

        <div className="relative p-5 md:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/25 shrink-0">
              <ShieldCheck className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-600 dark:text-indigo-400">
                  {canStart ? "QC Inspector" : "Quality Control"}
                </p>
                <span className="text-muted-foreground/60 text-xs">·</span>
                <p className="text-xs text-muted-foreground">{todayLong}</p>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                Order Manager
              </h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                Pre-shipment checklist — one tracker per PO, maintained through the
                order lifecycle{factory?.name ? ` at ${factory.name}` : ""}.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI strip ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniKpi
          tone="blue"
          icon={Activity}
          label="In Progress"
          value={counts.in_progress}
          sub={counts.in_progress > 0 ? "Active worklists" : "Nothing in flight"}
          onClick={() => setTab("in_progress")}
        />
        <MiniKpi
          tone="slate"
          icon={PlayCircle}
          label="Not Started"
          value={counts.not_started}
          sub={
            canStart && counts.not_started > 0
              ? "Tap to start a tracker"
              : "POs without a tracker yet"
          }
          onClick={() => setTab("not_started")}
          urgent={canStart && counts.not_started > 0}
        />
        <MiniKpi
          tone="amber"
          icon={Send}
          label="Awaiting Sign-off"
          value={counts.awaiting_signoff}
          sub={counts.awaiting_signoff > 0 ? "Pending admin" : "All caught up"}
          onClick={() => setTab("awaiting_signoff")}
        />
        <MiniKpi
          tone="emerald"
          icon={Stamp}
          label="Signed Off"
          value={counts.signed_off}
          sub="Closed records"
          onClick={() => setTab("signed_off")}
        />
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border/60 bg-card p-3 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by PO, buyer, or style…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <div className="flex flex-wrap gap-1 lg:ml-auto">
            {TAB_ORDER.map((key) => {
              const meta = TAB_META[key];
              const count =
                key === "all"
                  ? counts.all
                  : counts[key as Exclude<FilterTab, "all">];
              return (
                <button
                  key={key}
                  data-state={tab === key ? "active" : "inactive"}
                  onClick={() => setTab(key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors text-muted-foreground hover:text-foreground hover:bg-muted/60",
                    meta.activeCls,
                    "data-[state=active]:shadow-sm"
                  )}
                >
                  {meta.label}
                  <span className="text-[10px] tabular-nums font-mono text-muted-foreground/70 data-[state=active]:text-current">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── PO grid ──────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-44 bg-muted/40 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState count={rows.length} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((r) => (
            <POCard
              key={r.work_order_id}
              row={r}
              onStart={() => handleStart(r.work_order_id)}
              creating={creatingFor === r.work_order_id}
              canStart={canStart}
            />
          ))}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <p className="text-[11px] text-muted-foreground text-center">
          Showing {filtered.length} of {counts.all} PO{counts.all === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function MiniKpi({
  tone,
  icon: Icon,
  label,
  value,
  sub,
  onClick,
  urgent,
}: {
  tone: "blue" | "slate" | "amber" | "emerald";
  icon: typeof Activity;
  label: string;
  value: number;
  sub: string;
  onClick: () => void;
  urgent?: boolean;
}) {
  const palette = {
    blue: {
      bg: "bg-gradient-to-br from-blue-50 via-white to-sky-50/60 dark:from-blue-950/40 dark:via-card dark:to-sky-950/20",
      border: "border-blue-200/60 dark:border-blue-800/40",
      glow: "bg-gradient-to-bl from-blue-500/10 to-transparent",
      iconBg: "bg-gradient-to-br from-blue-500 to-indigo-600",
      iconShadow: "shadow-blue-500/25",
      text: "text-blue-700 dark:text-blue-300",
    },
    slate: {
      bg: "bg-gradient-to-br from-slate-50 via-white to-slate-100/60 dark:from-slate-900/40 dark:via-card dark:to-slate-800/20",
      border: "border-slate-200/60 dark:border-slate-700/40",
      glow: "bg-gradient-to-bl from-slate-500/8 to-transparent",
      iconBg: "bg-gradient-to-br from-slate-500 to-slate-700",
      iconShadow: "shadow-slate-500/20",
      text: "text-slate-700 dark:text-slate-300",
    },
    amber: {
      bg: "bg-gradient-to-br from-amber-50 via-white to-orange-50/60 dark:from-amber-950/40 dark:via-card dark:to-orange-950/20",
      border: "border-amber-200/60 dark:border-amber-800/40",
      glow: "bg-gradient-to-bl from-amber-500/12 to-transparent",
      iconBg: "bg-gradient-to-br from-amber-500 to-orange-500",
      iconShadow: "shadow-amber-500/25",
      text: "text-amber-700 dark:text-amber-300",
    },
    emerald: {
      bg: "bg-gradient-to-br from-emerald-50 via-white to-teal-50/60 dark:from-emerald-950/40 dark:via-card dark:to-teal-950/20",
      border: "border-emerald-200/60 dark:border-emerald-800/40",
      glow: "bg-gradient-to-bl from-emerald-500/10 to-transparent",
      iconBg: "bg-gradient-to-br from-emerald-500 to-teal-600",
      iconShadow: "shadow-emerald-500/25",
      text: "text-emerald-700 dark:text-emerald-300",
    },
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-xl border p-3 md:p-3.5 text-left transition-all duration-300",
        "hover:shadow-lg hover:-translate-y-0.5",
        palette.bg,
        palette.border
      )}
    >
      <div
        aria-hidden
        className={cn(
          "absolute top-0 right-0 w-24 h-24 rounded-bl-full pointer-events-none",
          palette.glow
        )}
      />
      <div className="relative flex items-start gap-3">
        <div
          className={cn(
            "h-9 w-9 rounded-lg flex items-center justify-center shadow-lg shrink-0",
            palette.iconBg,
            palette.iconShadow
          )}
        >
          <Icon className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p
              className={cn(
                "font-mono text-2xl md:text-3xl font-bold tabular-nums leading-none tracking-tight",
                value > 0 ? palette.text : "text-foreground"
              )}
            >
              {value.toLocaleString()}
            </p>
            {urgent && value > 0 && (
              <span className="relative flex h-2 w-2 mt-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping bg-indigo-500" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
              </span>
            )}
          </div>
          <p className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground mt-1.5">
            {label}
          </p>
          <p className="text-[11px] text-muted-foreground/80 mt-0.5 truncate">{sub}</p>
        </div>
      </div>
    </button>
  );
}

function POCard({
  row,
  onStart,
  creating,
  canStart,
}: {
  row: POWithTracker;
  onStart: () => void;
  creating: boolean;
  canStart: boolean;
}) {
  // Effective UI status — un-touched in_progress trackers display as Not Started.
  const status: SheetTrackerStatus = effectiveTrackerStatus(row);
  const v = STATUS_VIS[status];
  const progressPct =
    row.items_total > 0
      ? Math.round(((row.items_done + row.items_na) / row.items_total) * 100)
      : 0;
  const barGradient = !row.tracker_id
    ? "bg-gradient-to-r from-slate-400 to-slate-500"
    : progressPct >= 90
      ? "bg-gradient-to-r from-emerald-500 to-teal-500"
      : progressPct >= 50
        ? "bg-gradient-to-r from-violet-500 to-purple-600"
        : progressPct >= 25
          ? "bg-gradient-to-r from-amber-500 to-orange-500"
          : "bg-gradient-to-r from-slate-400 to-slate-500";

  const hasIssues = row.items_issue > 0;
  // "Open vs Start" — once a tracker exists (even with zero items touched),
  // the CTA is "Open" so the inspector resumes inside it. The effective
  // status keeps it visible under Not Started until something is marked.
  const trackerExists = row.tracker_id !== null;

  return (
    <div
      className={cn(
        "relative rounded-xl border border-border/60 bg-card overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5",
        "border-l-[3px]",
        v.rowAccent
      )}
    >
      {/* Issue ping when present */}
      {hasIssues && (
        <span className="absolute top-3 right-3 flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping bg-amber-500" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
        </span>
      )}

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <div
              className={cn(
                "h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ring-1",
                v.iconBg,
                v.iconRing
              )}
            >
              <ClipboardList className={cn("h-4 w-4", v.iconText)} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-mono font-bold text-sm truncate">{row.po_number}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {row.buyer} · {row.style}
              </p>
            </div>
          </div>
          <StatusPill status={status} />
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Stat
            icon={Package}
            label="Total Qty"
            value={row.order_qty.toLocaleString() + " pcs"}
          />
          <Stat
            icon={Calendar}
            label="Ex-Factory"
            value={row.planned_ex_factory ? formatShortDate(row.planned_ex_factory) : "—"}
          />
        </div>

        {/* Progress + counts. Show progress block only if items have been
            touched (otherwise the row reads as "Not Started" with a hint). */}
        {trackerExists && status !== "not_started" ? (
          <div className="mt-3.5">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                Progress
              </p>
              <p className="text-[11px] tabular-nums font-mono font-semibold text-foreground">
                {progressPct}%
              </p>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden ring-1 ring-border/40">
              <div
                className={cn("h-full transition-all duration-500", barGradient)}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
              <CountChip value={row.items_done} icon={CheckCircle2} tone="emerald" />
              <CountChip
                value={row.items_issue}
                icon={AlertTriangle}
                tone={row.items_issue >= 3 ? "red" : "amber"}
              />
              <CountChip value={row.items_pending} icon={Clock} tone="slate" />
            </div>
          </div>
        ) : (
          <div className="mt-3.5 rounded-lg bg-slate-50/60 dark:bg-slate-900/30 border border-dashed border-border/60 px-3 py-2.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <PlayCircle className="h-3.5 w-3.5 text-slate-500" />
            {trackerExists
              ? "Tracker created — mark your first item to begin"
              : canStart
                ? "Tracker not started yet"
                : "Awaiting QC inspector to start"}
          </div>
        )}

        {/* CTA */}
        <div className="mt-4">
          {trackerExists ? (
            <Button
              asChild
              size="sm"
              variant="outline"
              className="w-full gap-1.5 group/btn"
            >
              <Link to={`/quality/order-manager/${row.tracker_id}`}>
                Open tracker
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/btn:translate-x-0.5" />
              </Link>
            </Button>
          ) : canStart ? (
            <Button
              size="sm"
              className="w-full gap-1.5 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-500/20 text-white"
              onClick={onStart}
              disabled={creating}
            >
              {creating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Start tracker
            </Button>
          ) : (
            <p className="text-[11px] text-muted-foreground text-center py-1.5 italic">
              Awaiting QC inspector to start
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md bg-muted/40 px-2.5 py-1.5">
      <div className="flex items-center gap-1 mb-0.5">
        <Icon className="h-3 w-3 text-muted-foreground/70" />
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground/80 font-medium">
          {label}
        </p>
      </div>
      <p className="text-xs font-semibold tabular-nums truncate" title={value}>
        {value}
      </p>
    </div>
  );
}

function EmptyState({ count }: { count: number }) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 bg-card/40 py-16 text-center">
      <div className="inline-flex h-12 w-12 rounded-xl items-center justify-center mx-auto mb-3 bg-gradient-to-br from-indigo-500/15 to-violet-500/15 ring-1 ring-indigo-500/20">
        <Sparkles className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
      </div>
      <p className="text-sm font-medium">
        {count === 0
          ? "No work orders in this factory yet."
          : "No POs match this filter."}
      </p>
      {count > 0 && (
        <p className="text-xs text-muted-foreground mt-1">
          Try another tab or clear your search.
        </p>
      )}
    </div>
  );
}
