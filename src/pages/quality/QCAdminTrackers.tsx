import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  ArrowLeft,
  Search,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Send,
  Stamp,
  Sparkles,
  Activity,
  Plus,
  ClipboardList,
  Download,
  CheckSquare,
  X,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatShortDate, getTodayInTimezone, toISODate } from "@/lib/date-utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  useQCOrderTrackers,
  effectiveTrackerStatus,
  type POWithTracker,
} from "@/hooks/useQCOrderTrackers";
import {
  STATUS_VIS,
  StatusPill,
  CountChip,
  type SheetTrackerStatus,
} from "@/components/quality/status-vis";
import { DateFilter } from "@/components/quality/date-filter";
import { downloadBulkTrackersPDF } from "@/lib/qc-pdf";

type FilterTab = "all" | "awaiting_signoff" | "in_progress" | "signed_off" | "not_started";

const TAB_ORDER: FilterTab[] = [
  "in_progress",
  "all",
  "awaiting_signoff",
  "signed_off",
  "not_started",
];

const TAB_META: Record<FilterTab, { label: string; activeCls: string }> = {
  all: {
    label: "All",
    activeCls:
      "data-[state=active]:bg-violet-50 data-[state=active]:text-violet-700 dark:data-[state=active]:bg-violet-950/40 dark:data-[state=active]:text-violet-300",
  },
  awaiting_signoff: {
    label: "Awaiting Sign-off",
    activeCls:
      "data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700 dark:data-[state=active]:bg-amber-950/40 dark:data-[state=active]:text-amber-300",
  },
  in_progress: {
    label: "In Progress",
    activeCls:
      "data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 dark:data-[state=active]:bg-blue-950/40 dark:data-[state=active]:text-blue-300",
  },
  signed_off: {
    label: "Signed Off",
    activeCls:
      "data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700 dark:data-[state=active]:bg-emerald-950/40 dark:data-[state=active]:text-emerald-300",
  },
  not_started: {
    label: "Not Started",
    activeCls:
      "data-[state=active]:bg-slate-100 data-[state=active]:text-slate-700 dark:data-[state=active]:bg-slate-800/40 dark:data-[state=active]:text-slate-300",
  },
};

export default function QCAdminTrackers() {
  const navigate = useNavigate();
  const { factory } = useAuth();
  const { rows, loading } = useQCOrderTrackers();
  const [search, setSearch] = useState("");
  // Default landing on In Progress — that's the active work admin actually
  // reviews. "All" is one click away.
  const [tab, setTab] = useState<FilterTab>("in_progress");
  const [dateFilter, setDateFilter] = useState<string>("");
  // Bulk export selection state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  const tz = factory?.timezone || "Asia/Dhaka";
  const today = getTodayInTimezone(tz);

  // Resolve inspector (created_by) display names
  const creatorIds = useMemo(
    () => Array.from(new Set(rows.map((r) => r.created_by).filter(Boolean) as string[])),
    [rows]
  );
  const [creatorNames, setCreatorNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (creatorIds.length === 0) {
      setCreatorNames(new Map());
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", creatorIds);
      const m = new Map<string, string>();
      for (const p of data || []) m.set(p.id, p.full_name ?? "");
      setCreatorNames(m);
    })();
  }, [creatorIds]);

  const counts = useMemo(() => {
    const c = {
      all: rows.length,
      not_started: 0,
      in_progress: 0,
      awaiting_signoff: 0,
      signed_off: 0,
      activeToday: 0,
      issuesTotal: 0,
    };
    for (const r of rows) {
      const eff = effectiveTrackerStatus(r);
      c[eff] += 1;
      if (r.last_activity_at && toISODate(new Date(r.last_activity_at), tz) === today) {
        c.activeToday += 1;
      }
      c.issuesTotal += r.items_issue;
    }
    return c;
  }, [rows, tz, today]);

  const filtered = useMemo(() => {
    let list = rows;
    if (tab !== "all") list = list.filter((r) => effectiveTrackerStatus(r) === tab);
    if (dateFilter) {
      list = list.filter(
        (r) =>
          !!r.last_activity_at &&
          toISODate(new Date(r.last_activity_at), tz) === dateFilter
      );
    }
    if (search) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.po_number.toLowerCase().includes(q) ||
          r.buyer.toLowerCase().includes(q) ||
          r.style.toLowerCase().includes(q) ||
          (r.created_by ? (creatorNames.get(r.created_by) ?? "").toLowerCase().includes(q) : false)
      );
    }
    return list;
  }, [rows, tab, search, creatorNames, dateFilter, tz]);

  const todayLong = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  function toggleSelect(trackerId: string | null, isSignedOff: boolean) {
    if (!trackerId || !isSignedOff) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackerId)) next.delete(trackerId);
      else next.add(trackerId);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setSelectMode(false);
  }

  async function handleBulkExport() {
    if (selectedIds.size === 0) return;
    setExporting(true);
    try {
      await downloadBulkTrackersPDF(Array.from(selectedIds), {
        factoryName: factory?.name ?? "Factory",
        factoryTimezone: factory?.timezone ?? "Asia/Dhaka",
      });
      toast.success(`Exported ${selectedIds.size} tracker${selectedIds.size === 1 ? "" : "s"}`);
      clearSelection();
    } catch (err: any) {
      toast.error(err?.message || "Failed to generate PDF");
    } finally {
      setExporting(false);
    }
  }

  const signedOffInView = useMemo(
    () => filtered.filter((r) => r.tracker_status === "signed_off").length,
    [filtered]
  );

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-5 md:space-y-6">
      {/* Breadcrumb */}
      <div>
        <Link
          to="/quality"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to QC Dashboard
        </Link>
      </div>

      {/* ── Hero header ────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-violet-200/60 dark:border-violet-800/40 bg-gradient-to-br from-violet-50 via-white to-purple-50/60 dark:from-violet-950/40 dark:via-card dark:to-purple-950/20 shadow-sm">
        <div
          aria-hidden
          className="absolute top-0 right-0 w-64 h-64 rounded-bl-full pointer-events-none bg-gradient-to-bl from-violet-500/15 to-transparent"
        />
        <div
          aria-hidden
          className="absolute bottom-0 left-0 w-40 h-40 rounded-tr-full pointer-events-none bg-gradient-to-tr from-purple-500/10 to-transparent"
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
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25 shrink-0">
              <ShieldCheck className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-600 dark:text-violet-400">
                  Admin Review
                </p>
                <span className="text-muted-foreground/60 text-xs">·</span>
                <p className="text-xs text-muted-foreground">{todayLong}</p>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                Order Tracker Review
              </h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                Audit pre-shipment trackers, sign off completed PO inspections, and
                resolve open issues before shipment.
              </p>
            </div>
          </div>
          <div className="shrink-0 flex flex-col items-stretch sm:items-end gap-2 w-full sm:w-auto">
            <Button
              size="sm"
              variant={selectMode ? "default" : "outline"}
              className={cn(
                "gap-1.5 w-full sm:w-auto",
                selectMode && "bg-violet-600 hover:bg-violet-700 text-white"
              )}
              onClick={() => {
                setSelectMode((s) => !s);
                if (selectMode) setSelectedIds(new Set());
              }}
            >
              {selectMode ? <X className="h-3.5 w-3.5" /> : <CheckSquare className="h-3.5 w-3.5" />}
              {selectMode ? "Cancel export" : "Export PDFs"}
            </Button>
            {selectMode && (
              <p className="text-[11px] text-muted-foreground sm:text-right sm:max-w-[200px]">
                Tick any signed-off rows. Only signed-off trackers can be exported.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── KPI strip ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniKpi
          tone="amber"
          icon={Send}
          label="Awaiting Sign-off"
          value={counts.awaiting_signoff}
          sub={counts.awaiting_signoff > 0 ? "Action needed" : "All caught up"}
          onClick={() => setTab("awaiting_signoff")}
          urgent={counts.awaiting_signoff > 0}
        />
        <MiniKpi
          tone="blue"
          icon={Activity}
          label="In Progress"
          value={counts.in_progress}
          sub={
            counts.activeToday > 0
              ? `${counts.activeToday} active today`
              : "No activity today"
          }
          onClick={() => setTab("in_progress")}
        />
        <MiniKpi
          tone="violet"
          icon={AlertTriangle}
          label="Open Issues"
          value={counts.issuesTotal}
          sub="Across all trackers"
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
              placeholder="Search by PO, buyer, style, or inspector…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <DateFilter
            value={dateFilter}
            onChange={(v) => {
              setDateFilter(v);
              // Picking a date should expose every tracker active on that
              // day regardless of status. Snap to "All".
              if (v) setTab("all");
            }}
            today={today}
            label="Last activity date"
          />
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
        {dateFilter && (
          <div className="mt-2.5 pt-2.5 border-t border-border/40 flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">
              Filtering by last activity date{" "}
              <span className="font-mono font-semibold text-foreground tabular-nums">
                {formatShortDate(dateFilter)}
              </span>
            </p>
            <button
              type="button"
              onClick={() => setDateFilter("")}
              className="text-[11px] text-violet-600 dark:text-violet-400 hover:underline underline-offset-4 font-medium"
            >
              Clear date
            </button>
          </div>
        )}
      </div>

      {/* ── Table ──────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 bg-muted/40 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState count={rows.length} />
      ) : (
        <div className="relative rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-violet-500 to-purple-600 z-10" />
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[920px]">
            <thead className="bg-gradient-to-b from-violet-50/60 via-muted/30 to-muted/20 dark:from-violet-950/20 dark:via-muted/30 dark:to-muted/20 border-b border-border/60">
              <tr className="text-left text-[10px] uppercase tracking-[0.12em] text-muted-foreground/90 font-bold">
                {selectMode && <th className="pl-4 pr-1 py-3 w-8" />}
                <th className="px-4 py-3">PO / Buyer / Style</th>
                <th className="px-3 py-3">Inspector</th>
                <th className="px-3 py-3">Ex-Factory</th>
                <th className="px-3 py-3 text-center">Done</th>
                <th className="px-3 py-3 text-center">Issue</th>
                <th className="px-3 py-3 text-center">Pending</th>
                <th className="px-3 py-3 w-44">Progress</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <TrackerRow
                  key={r.work_order_id}
                  row={r}
                  inspectorName={r.created_by ? creatorNames.get(r.created_by) ?? null : null}
                  selectMode={selectMode}
                  selected={r.tracker_id ? selectedIds.has(r.tracker_id) : false}
                  onToggleSelect={() =>
                    toggleSelect(r.tracker_id, r.tracker_status === "signed_off")
                  }
                  onOpen={() => {
                    if (selectMode) {
                      toggleSelect(r.tracker_id, r.tracker_status === "signed_off");
                    } else if (r.tracker_id) {
                      navigate(`/quality/order-manager/${r.tracker_id}`);
                    }
                  }}
                />
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Floating bulk-export action bar — wraps gracefully on narrow screens */}
      {selectMode && selectedIds.size > 0 && (
        <div
          className="fixed bottom-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-auto z-50"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-violet-200/70 dark:border-violet-700/40 bg-card shadow-xl shadow-violet-500/10">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md shadow-violet-500/30 shrink-0">
              <CheckSquare className="h-4 w-4 text-white" />
            </div>
            <p className="text-xs flex-1 min-w-[120px]">
              <span className="font-bold tabular-nums">{selectedIds.size}</span>{" "}
              signed-off tracker{selectedIds.size === 1 ? "" : "s"} selected
              <span className="text-muted-foreground"> · of {signedOffInView} visible</span>
            </p>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                size="sm"
                variant="outline"
                onClick={clearSelection}
                disabled={exporting}
                className="gap-1.5 flex-1 sm:flex-initial"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleBulkExport}
                disabled={exporting}
                className="gap-1.5 flex-1 sm:flex-initial bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white shadow-md shadow-violet-500/25"
              >
                {exporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                <span className="hidden xs:inline">Export combined PDF</span>
                <span className="xs:hidden">Export PDF</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Result count */}
      {!loading && filtered.length > 0 && (
        <p className="text-[11px] text-muted-foreground text-center">
          Showing {filtered.length} of {counts.all} tracker
          {counts.all === 1 ? "" : "s"}
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
  tone: "amber" | "blue" | "violet" | "emerald";
  icon: typeof ClipboardList;
  label: string;
  value: number;
  sub: string;
  onClick?: () => void;
  urgent?: boolean;
}) {
  const palette = {
    amber: {
      bg: "bg-gradient-to-br from-amber-50 via-white to-orange-50/60 dark:from-amber-950/40 dark:via-card dark:to-orange-950/20",
      border: "border-amber-200/60 dark:border-amber-800/40",
      glow: "bg-gradient-to-bl from-amber-500/12 to-transparent",
      iconBg: "bg-gradient-to-br from-amber-500 to-orange-500",
      iconShadow: "shadow-amber-500/25",
      text: "text-amber-700 dark:text-amber-300",
    },
    blue: {
      bg: "bg-gradient-to-br from-blue-50 via-white to-sky-50/60 dark:from-blue-950/40 dark:via-card dark:to-sky-950/20",
      border: "border-blue-200/60 dark:border-blue-800/40",
      glow: "bg-gradient-to-bl from-blue-500/10 to-transparent",
      iconBg: "bg-gradient-to-br from-blue-500 to-indigo-600",
      iconShadow: "shadow-blue-500/25",
      text: "text-blue-700 dark:text-blue-300",
    },
    violet: {
      bg: "bg-gradient-to-br from-violet-50 via-white to-purple-50/60 dark:from-violet-950/40 dark:via-card dark:to-purple-950/20",
      border: "border-violet-200/60 dark:border-violet-800/40",
      glow: "bg-gradient-to-bl from-violet-500/10 to-transparent",
      iconBg: "bg-gradient-to-br from-violet-500 to-purple-600",
      iconShadow: "shadow-violet-500/25",
      text: "text-violet-700 dark:text-violet-300",
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

  const interactive = !!onClick;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      className={cn(
        "group relative overflow-hidden rounded-xl border p-3 md:p-3.5 text-left transition-all duration-300",
        interactive && "hover:shadow-lg hover:-translate-y-0.5 cursor-pointer",
        !interactive && "cursor-default",
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
                <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping bg-amber-500" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
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

function TrackerRow({
  row,
  inspectorName,
  onOpen,
  selectMode,
  selected,
  onToggleSelect,
}: {
  row: POWithTracker;
  inspectorName: string | null;
  onOpen: () => void;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const status: SheetTrackerStatus = effectiveTrackerStatus(row);
  const v = STATUS_VIS[status];
  // Exportable only when the underlying tracker is genuinely signed off.
  const exportable = row.tracker_status === "signed_off";
  const pct =
    row.items_total > 0
      ? Math.round(((row.items_done + row.items_na) / row.items_total) * 100)
      : 0;
  const barGradient =
    !row.tracker_id || status === "not_started"
      ? "bg-gradient-to-r from-slate-400 to-slate-500"
      : pct >= 90
        ? "bg-gradient-to-r from-emerald-500 to-teal-500"
        : pct >= 50
          ? "bg-gradient-to-r from-violet-500 to-purple-600"
          : pct >= 25
            ? "bg-gradient-to-r from-amber-500 to-orange-500"
            : "bg-gradient-to-r from-slate-400 to-slate-500";

  return (
    <tr
      onClick={row.tracker_id ? onOpen : undefined}
      className={cn(
        "border-b border-border/40 last:border-b-0 border-l-[3px] transition-colors group",
        v.rowAccent,
        row.tracker_id ? "hover:bg-muted/40 cursor-pointer" : "opacity-70",
        selectMode && !exportable && "opacity-50",
        selected && "bg-violet-50/40 dark:bg-violet-950/20"
      )}
    >
      {selectMode && (
        <td className="pl-4 pr-1 py-3 w-8" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            disabled={!exportable}
            checked={selected}
            onChange={onToggleSelect}
            aria-label={exportable ? "Select for export" : "Not signed off — cannot export"}
            className="h-4 w-4 rounded border-border accent-violet-600 disabled:cursor-not-allowed disabled:opacity-40"
          />
        </td>
      )}
      <td className="px-4 py-3 min-w-0">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ring-1",
              v.iconBg,
              v.iconRing
            )}
          >
            <ClipboardList className={cn("h-4 w-4", v.iconText)} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-mono font-semibold truncate">{row.po_number}</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {row.buyer} · {row.style}
            </p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 min-w-0 max-w-[160px]">
        {inspectorName ? (
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-6 w-6 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm shrink-0">
              <span className="text-[10px] font-bold text-white">
                {inspectorName
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((s) => s[0]?.toUpperCase())
                  .join("")}
              </span>
            </div>
            <span className="text-xs truncate">{inspectorName}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground/60">—</span>
        )}
      </td>
      <td className="px-3 py-3 text-xs tabular-nums whitespace-nowrap">
        {row.planned_ex_factory ? formatShortDate(row.planned_ex_factory) : "—"}
      </td>
      <td className="px-3 py-3 text-center">
        {row.tracker_id ? (
          <CountChip value={row.items_done} icon={CheckCircle2} tone="emerald" />
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </td>
      <td className="px-3 py-3 text-center">
        {row.tracker_id ? (
          <CountChip
            value={row.items_issue}
            icon={AlertTriangle}
            tone={row.items_issue >= 3 ? "red" : "amber"}
          />
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </td>
      <td className="px-3 py-3 text-center">
        {row.tracker_id ? (
          <CountChip value={row.items_pending} icon={Clock} tone="slate" />
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </td>
      <td className="px-3 py-3">
        {row.tracker_id ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden ring-1 ring-border/40">
              <div
                className={cn("h-full transition-all duration-500", barGradient)}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[11px] tabular-nums font-mono font-semibold text-foreground w-9 text-right">
              {pct}%
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground/60 italic">Awaiting QC start</span>
        )}
      </td>
      <td className="px-3 py-3">
        <StatusPill status={status} />
      </td>
      <td className="px-3 py-3 text-right">
        {row.tracker_id && (
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 group-hover:bg-foreground/5"
            onClick={(e) => e.stopPropagation()}
          >
            <Link to={`/quality/order-manager/${row.tracker_id}`}>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
        )}
      </td>
    </tr>
  );
}

function EmptyState({ count }: { count: number }) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 bg-card/40 py-16 text-center">
      <div className="inline-flex h-12 w-12 rounded-xl items-center justify-center mx-auto mb-3 bg-gradient-to-br from-violet-500/15 to-purple-500/15 ring-1 ring-violet-500/20">
        <Sparkles className="h-5 w-5 text-violet-600 dark:text-violet-400" />
      </div>
      <p className="text-sm font-medium">
        {count === 0
          ? "No order trackers in this factory yet."
          : "No trackers match this filter."}
      </p>
      {count > 0 && (
        <p className="text-xs text-muted-foreground mt-1">
          Try another tab or clear your search.
        </p>
      )}
    </div>
  );
}
