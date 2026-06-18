import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ListChecks,
  ArrowLeft,
  Search,
  Loader2,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Calendar,
  Send,
  Stamp,
  Sparkles,
  Activity,
  Download,
  CheckSquare,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatShortDate, getTodayInTimezone } from "@/lib/date-utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  useQCDailySheets,
  type DailySheetRow,
} from "@/hooks/useQCDailySheets";
import {
  STATUS_VIS,
  StatusPill,
  CountChip,
  InspectorCell,
  type SheetTrackerStatus,
} from "@/components/quality/status-vis";
import { NewSheetDialog } from "./QCDailySheetList";
import { DateFilter } from "@/components/quality/date-filter";
import { downloadBulkSheetsPDF } from "@/lib/qc-pdf";
import { searchNorm } from "@/lib/normalize-name";

type FilterTab = "today" | "all" | "awaiting_signoff" | "in_progress" | "signed_off";

// Order here drives render order
const TAB_ORDER: FilterTab[] = ["today", "all", "awaiting_signoff", "in_progress", "signed_off"];

const TAB_META: Record<FilterTab, { label: string; activeCls: string }> = {
  today: {
    label: "Today",
    activeCls:
      "data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 dark:data-[state=active]:bg-indigo-950/40 dark:data-[state=active]:text-indigo-300",
  },
  all: {
    label: "All",
    activeCls:
      "data-[state=active]:bg-slate-100 data-[state=active]:text-slate-700 dark:data-[state=active]:bg-slate-800/40 dark:data-[state=active]:text-slate-300",
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
};

export default function QCAdminSheets() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { factory } = useAuth();
  const { rows, loading } = useQCDailySheets({ sinceDays: 30 });
  const initialSearch = searchParams.get("search") ?? "";
  const [search, setSearch] = useState(initialSearch);
  // When deep-linked with a search term (e.g. from /lines), default to All so
  // matches don't get filtered out by the Today tab.
  const [tab, setTab] = useState<FilterTab>(initialSearch ? "all" : "today");
  const [dateFilter, setDateFilter] = useState<string>("");
  // Bulk export selection state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [newSheetOpen, setNewSheetOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const tz = factory?.timezone || "Asia/Dhaka";
  const today = getTodayInTimezone(tz);

  const counts = useMemo(() => {
    const c = {
      all: rows.length,
      today: 0,
      in_progress: 0,
      awaiting_signoff: 0,
      signed_off: 0,
      // Aggregates for the KPI strip
      itemsPassToday: 0,
      itemsFailToday: 0,
      sheetsWithFailsToday: 0,
    };
    for (const r of rows) {
      if (r.inspection_date === today) {
        c.today += 1;
        c.itemsPassToday += r.items_pass;
        c.itemsFailToday += r.items_fail;
        if (r.items_fail > 0) c.sheetsWithFailsToday += 1;
      }
      c[r.status] += 1;
    }
    return c;
  }, [rows, today]);

  const filtered = useMemo(() => {
    let list = rows;
    if (tab === "today") list = list.filter((r) => r.inspection_date === today);
    else if (tab !== "all") list = list.filter((r) => r.status === tab);
    if (dateFilter) list = list.filter((r) => r.inspection_date === dateFilter);
    if (search) {
      const q = searchNorm(search);
      list = list.filter(
        (r) =>
          searchNorm(r.po_number).includes(q) ||
          searchNorm(r.buyer).includes(q) ||
          searchNorm(r.style).includes(q) ||
          searchNorm(r.line_name).includes(q) ||
          searchNorm(r.inspector_name ?? "").includes(q)
      );
    }
    return list;
  }, [rows, tab, today, search, dateFilter]);

  const lineGroups = useMemo(() => {
    const map = new Map<string, { lineName: string; rows: DailySheetRow[] }>();
    for (const r of filtered) {
      const key = r.line_id || r.line_name || "__unassigned__";
      const existing = map.get(key);
      if (existing) existing.rows.push(r);
      else map.set(key, { lineName: r.line_name || "Unassigned line", rows: [r] });
    }
    return Array.from(map.values()).sort((a, b) =>
      a.lineName.localeCompare(b.lineName, undefined, { numeric: true })
    );
  }, [filtered]);

  const todayLong = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  function toggleSelect(id: string, isSignedOff: boolean) {
    if (!isSignedOff) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
      await downloadBulkSheetsPDF(Array.from(selectedIds), {
        factoryName: factory?.name ?? "Factory",
        factoryTimezone: factory?.timezone ?? "Asia/Dhaka",
      });
      toast.success(`Exported ${selectedIds.size} sheet${selectedIds.size === 1 ? "" : "s"}`);
      clearSelection();
    } catch (err: any) {
      toast.error(err?.message || "Failed to generate PDF");
    } finally {
      setExporting(false);
    }
  }

  const signedOffInView = useMemo(
    () => filtered.filter((r) => r.status === "signed_off").length,
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
      <div className="relative overflow-hidden rounded-2xl border border-blue-200/60 dark:border-blue-800/40 bg-gradient-to-br from-blue-50 via-white to-indigo-50/60 dark:from-blue-950/40 dark:via-card dark:to-indigo-950/20 shadow-sm">
        <div
          aria-hidden
          className="absolute top-0 right-0 w-64 h-64 rounded-bl-full pointer-events-none bg-gradient-to-bl from-blue-500/15 to-transparent"
        />
        <div
          aria-hidden
          className="absolute bottom-0 left-0 w-40 h-40 rounded-tr-full pointer-events-none bg-gradient-to-tr from-indigo-500/10 to-transparent"
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
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25 shrink-0">
              <ListChecks className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600 dark:text-blue-400">
                  Admin Review
                </p>
                <span className="text-muted-foreground/60 text-xs">·</span>
                <p className="text-xs text-muted-foreground">{todayLong}</p>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                Daily Sheet Review
              </h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                Review inspector submissions, sign off completed shifts, and audit
                failed checkpoints across the factory.
              </p>
            </div>
          </div>
          <div className="shrink-0 flex flex-col items-stretch sm:items-end gap-2 w-full sm:w-auto">
            <Button
              size="sm"
              className="gap-1.5 w-full sm:w-auto bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-md shadow-blue-500/25"
              onClick={() => setNewSheetOpen(true)}
            >
              <ListChecks className="h-3.5 w-3.5" />
              Start QC Sheet
            </Button>
            <Button
              size="sm"
              variant={selectMode ? "default" : "outline"}
              className={cn(
                "gap-1.5 w-full sm:w-auto",
                selectMode && "bg-blue-600 hover:bg-blue-700 text-white"
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
                Tick any signed-off rows. Only signed-off sheets can be exported.
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
          tone="indigo"
          icon={Calendar}
          label="Today"
          value={counts.today}
          sub={
            counts.today > 0
              ? `${counts.itemsPassToday} pass · ${counts.itemsFailToday} fail`
              : "No sheets yet"
          }
          onClick={() => setTab("today")}
        />
        <MiniKpi
          tone="blue"
          icon={Activity}
          label="In Progress"
          value={counts.in_progress}
          sub="Across all dates"
          onClick={() => setTab("in_progress")}
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
              placeholder="Search by PO, buyer, style, line, or inspector…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <DateFilter
            value={dateFilter}
            onChange={(v) => {
              setDateFilter(v);
              // Picking a date should expose every sheet on that day,
              // regardless of status. Snap to "All".
              if (v) setTab("all");
            }}
            today={today}
            label="Inspection date"
          />
          <div className="flex flex-wrap gap-1 lg:ml-auto">
            {TAB_ORDER.map((key) => {
              const meta = TAB_META[key];
              const count =
                key === "all"
                  ? counts.all
                  : key === "today"
                    ? counts.today
                    : counts[key as Exclude<FilterTab, "all" | "today">];
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
              Filtering by inspection date{" "}
              <span className="font-mono font-semibold text-foreground tabular-nums">
                {formatShortDate(dateFilter)}
              </span>
            </p>
            <button
              type="button"
              onClick={() => setDateFilter("")}
              className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline underline-offset-4 font-medium"
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
        <div className="space-y-5">
          {lineGroups.map((group) => {
            const groupPass = group.rows.reduce((a, r) => a + r.items_pass, 0);
            const groupFail = group.rows.reduce((a, r) => a + r.items_fail, 0);
            return (
              <div key={group.lineName}>
                <div className="flex items-baseline justify-between px-1 mb-2">
                  <h3 className="text-sm font-semibold flex items-baseline gap-2">
                    <span>{group.lineName}</span>
                    <span className="text-[11px] tabular-nums font-mono font-medium text-muted-foreground">
                      {group.rows.length} sheet{group.rows.length === 1 ? "" : "s"}
                    </span>
                  </h3>
                  <div className="text-[11px] tabular-nums text-muted-foreground">
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{groupPass}</span> pass ·{" "}
                    <span
                      className={cn(
                        "font-semibold",
                        groupFail > 0
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-muted-foreground"
                      )}
                    >
                      {groupFail}
                    </span>{" "}
                    fail
                  </div>
                </div>
                <SheetsTable
                  rows={group.rows}
                  selectMode={selectMode}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                  onOpen={(s) => {
                    if (selectMode) toggleSelect(s.id, s.status === "signed_off");
                    else navigate(`/quality/daily-sheet/${s.id}`);
                  }}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Floating bulk-export action bar — wraps gracefully on narrow screens */}
      {selectMode && selectedIds.size > 0 && (
        <div
          className="fixed bottom-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-auto z-50"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-blue-200/70 dark:border-blue-700/40 bg-card shadow-xl shadow-blue-500/10">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/30 shrink-0">
              <CheckSquare className="h-4 w-4 text-white" />
            </div>
            <p className="text-xs flex-1 min-w-[120px]">
              <span className="font-bold tabular-nums">{selectedIds.size}</span>{" "}
              signed-off sheet{selectedIds.size === 1 ? "" : "s"} selected
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
                className="gap-1.5 flex-1 sm:flex-initial bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-md shadow-blue-500/25"
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
          Showing {filtered.length} of {rows.length} sheet
          {rows.length === 1 ? "" : "s"} from the last 30 days
        </p>
      )}

      <NewSheetDialog
        open={newSheetOpen}
        onOpenChange={setNewSheetOpen}
        onCreated={() => setNewSheetOpen(false)}
      />
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
  tone: "amber" | "indigo" | "blue" | "emerald";
  icon: typeof ListChecks;
  label: string;
  value: number;
  sub: string;
  onClick: () => void;
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
    indigo: {
      bg: "bg-gradient-to-br from-indigo-50 via-white to-violet-50/60 dark:from-indigo-950/40 dark:via-card dark:to-violet-950/20",
      border: "border-indigo-200/60 dark:border-indigo-800/40",
      glow: "bg-gradient-to-bl from-indigo-500/10 to-transparent",
      iconBg: "bg-gradient-to-br from-indigo-500 to-violet-600",
      iconShadow: "shadow-indigo-500/25",
      text: "text-indigo-700 dark:text-indigo-300",
    },
    blue: {
      bg: "bg-gradient-to-br from-blue-50 via-white to-sky-50/60 dark:from-blue-950/40 dark:via-card dark:to-sky-950/20",
      border: "border-blue-200/60 dark:border-blue-800/40",
      glow: "bg-gradient-to-bl from-blue-500/10 to-transparent",
      iconBg: "bg-gradient-to-br from-blue-500 to-indigo-600",
      iconShadow: "shadow-blue-500/25",
      text: "text-blue-700 dark:text-blue-300",
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
                <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping bg-amber-500" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
              </span>
            )}
          </div>
          <p className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground mt-1.5">
            {label}
          </p>
          <p className="text-[11px] text-muted-foreground/80 mt-0.5 truncate">
            {sub}
          </p>
        </div>
      </div>
    </button>
  );
}

function SheetsTable({
  rows,
  selectMode,
  selectedIds,
  onToggleSelect,
  onOpen,
}: {
  rows: DailySheetRow[];
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string, isSignedOff: boolean) => void;
  onOpen: (row: DailySheetRow) => void;
}) {
  return (
    <div className="relative rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
      <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-blue-500 to-indigo-600 z-10" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[880px]">
          <thead className="bg-gradient-to-b from-blue-50/60 via-muted/30 to-muted/20 dark:from-blue-950/20 dark:via-muted/30 dark:to-muted/20 border-b border-border/60">
            <tr className="text-left text-[10px] uppercase tracking-[0.12em] text-muted-foreground/90 font-bold">
              {selectMode && <th className="pl-4 pr-1 py-3 w-8" />}
              <th className="px-4 py-3">Date</th>
              <th className="px-3 py-3">PO / Line</th>
              <th className="px-3 py-3">Buyer / Style</th>
              <th className="px-3 py-3">Inspector</th>
              <th className="px-3 py-3 text-center">Pass</th>
              <th className="px-3 py-3 text-center">Fail</th>
              <th className="px-3 py-3 text-center">Pending</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <SheetRow
                key={s.id}
                row={s}
                selectMode={selectMode}
                selected={selectedIds.has(s.id)}
                onToggleSelect={() => onToggleSelect(s.id, s.status === "signed_off")}
                onOpen={() => onOpen(s)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SheetRow({
  row,
  onOpen,
  selectMode,
  selected,
  onToggleSelect,
}: {
  row: DailySheetRow;
  onOpen: () => void;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const status: SheetTrackerStatus = row.status;
  const v = STATUS_VIS[status];
  const exportable = status === "signed_off";
  return (
    <tr
      onClick={onOpen}
      className={cn(
        "border-b border-border/40 last:border-b-0 border-l-[3px] transition-colors hover:bg-muted/40 cursor-pointer group",
        v.rowAccent,
        selectMode && !exportable && "opacity-50",
        selected && "bg-blue-50/40 dark:bg-blue-950/20"
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
            className="h-4 w-4 rounded border-border accent-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
          />
        </td>
      )}
      <td className="px-4 py-3 tabular-nums">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ring-1",
              v.iconBg,
              v.iconRing
            )}
          >
            <Calendar className={cn("h-4 w-4", v.iconText)} />
          </div>
          <div>
            <p className="text-xs font-semibold whitespace-nowrap">
              {formatShortDate(row.inspection_date)}
            </p>
            <span className="inline-flex items-center mt-0.5 text-[10px] px-1.5 py-0.5 rounded-md bg-foreground/[0.04] text-muted-foreground capitalize font-medium">
              {row.shift}
            </span>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 min-w-0">
        <p className="text-xs font-mono font-semibold truncate">{row.po_number}</p>
        <p className="text-[11px] text-muted-foreground truncate">{row.line_name}</p>
      </td>
      <td className="px-3 py-3 min-w-0 max-w-[200px]">
        <p className="text-xs truncate">{row.buyer}</p>
        <p className="text-[11px] text-muted-foreground truncate">{row.style}</p>
      </td>
      <td className="px-3 py-3 min-w-0 max-w-[160px]">
        <InspectorCell name={row.inspector_name} />
      </td>
      <td className="px-3 py-3 text-center">
        <CountChip value={row.items_pass} icon={CheckCircle2} tone="emerald" />
      </td>
      <td className="px-3 py-3 text-center">
        <CountChip
          value={row.items_fail}
          icon={AlertTriangle}
          tone={row.items_fail >= 3 ? "red" : "amber"}
        />
      </td>
      <td className="px-3 py-3 text-center">
        <CountChip value={row.items_pending} icon={Clock} tone="slate" />
      </td>
      <td className="px-3 py-3">
        <StatusPill status={status} />
      </td>
      <td className="px-3 py-3 text-right">
        <Button
          asChild
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 group-hover:bg-foreground/5"
          onClick={(e) => e.stopPropagation()}
        >
          <Link to={`/quality/daily-sheet/${row.id}`}>
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Button>
      </td>
    </tr>
  );
}

function EmptyState({ count }: { count: number }) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 bg-card/40 py-16 text-center">
      <div className="inline-flex h-12 w-12 rounded-xl items-center justify-center mx-auto mb-3 bg-gradient-to-br from-blue-500/15 to-indigo-500/15 ring-1 ring-blue-500/20">
        <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400" />
      </div>
      <p className="text-sm font-medium">
        {count === 0
          ? "No daily sheets submitted yet in the last 30 days."
          : "No sheets match this filter."}
      </p>
      {count > 0 && (
        <p className="text-xs text-muted-foreground mt-1">
          Try another tab or clear your search.
        </p>
      )}
    </div>
  );
}
