import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  FolderOpen,
  Search,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldCheck,
  ListChecks,
  Calendar,
  Activity,
  Send,
  Stamp,
  Sparkles,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatShortDate } from "@/lib/date-utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  STATUS_VIS,
  StatusPill,
  CountChip,
  type SheetTrackerStatus,
} from "@/components/quality/status-vis";

type RecordKind = "tracker" | "sheet";
type RecordStatus = "in_progress" | "awaiting_signoff" | "signed_off";

interface MyRecord {
  kind: RecordKind;
  id: string;
  status: RecordStatus;
  po_number: string;
  buyer: string;
  style: string;
  line_name: string | null;
  inspection_date: string | null; // sheets only
  shift: string | null; // sheets only
  last_activity_at: string;
  items_total: number;
  items_done: number; // for tracker: done+na; for sheet: pass+na
  items_issue: number; // for tracker: issue; for sheet: fail
  items_pending: number;
}

type FilterTab =
  | "all"
  | "tracker"
  | "sheet"
  | "in_progress"
  | "awaiting_signoff"
  | "signed_off";

const TAB_ORDER: FilterTab[] = [
  "all",
  "tracker",
  "sheet",
  "in_progress",
  "awaiting_signoff",
  "signed_off",
];

const TAB_META: Record<FilterTab, { label: string; activeCls: string }> = {
  all: {
    label: "All",
    activeCls:
      "data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700 dark:data-[state=active]:bg-teal-950/40 dark:data-[state=active]:text-teal-300",
  },
  tracker: {
    label: "Order Trackers",
    activeCls:
      "data-[state=active]:bg-violet-50 data-[state=active]:text-violet-700 dark:data-[state=active]:bg-violet-950/40 dark:data-[state=active]:text-violet-300",
  },
  sheet: {
    label: "Daily Sheets",
    activeCls:
      "data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 dark:data-[state=active]:bg-blue-950/40 dark:data-[state=active]:text-blue-300",
  },
  in_progress: {
    label: "In Progress",
    activeCls:
      "data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 dark:data-[state=active]:bg-blue-950/40 dark:data-[state=active]:text-blue-300",
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
};

export default function QCMyRecords() {
  const { user, profile } = useAuth();
  const [rows, setRows] = useState<MyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<FilterTab>("all");

  useEffect(() => {
    if (!user?.id || !profile?.factory_id) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      const factoryId = profile.factory_id!;

      const [trackersRes, sheetsRes] = await Promise.all([
        supabase
          .from("qc_order_trackers")
          .select(
            `id, status, last_activity_at,
             work_orders(po_number, buyer, style)`
          )
          .eq("factory_id", factoryId)
          .eq("created_by", user.id)
          .order("last_activity_at", { ascending: false }),
        supabase
          .from("qc_daily_sheets")
          .select(
            `id, status, inspection_date, shift, last_activity_at,
             work_orders(po_number, buyer, style),
             lines(name, line_id)`
          )
          .eq("factory_id", factoryId)
          .or(`inspector_id.eq.${user.id},created_by.eq.${user.id}`)
          .order("last_activity_at", { ascending: false }),
      ]);

      if (cancelled) return;

      const trackerIds = (trackersRes.data || []).map((r: any) => r.id);
      const sheetIds = (sheetsRes.data || []).map((r: any) => r.id);

      const trackerCounts = new Map<
        string,
        { total: number; done: number; issue: number; pending: number }
      >();
      if (trackerIds.length > 0) {
        const { data: tItems } = await supabase
          .from("qc_order_tracker_items")
          .select("tracker_id, status")
          .in("tracker_id", trackerIds);
        for (const i of tItems || []) {
          const c =
            trackerCounts.get(i.tracker_id) ??
            { total: 0, done: 0, issue: 0, pending: 0 };
          c.total += 1;
          if (i.status === "done" || i.status === "na") c.done += 1;
          else if (i.status === "issue") c.issue += 1;
          else c.pending += 1;
          trackerCounts.set(i.tracker_id, c);
        }
      }

      const sheetCounts = new Map<
        string,
        { total: number; done: number; issue: number; pending: number }
      >();
      if (sheetIds.length > 0) {
        const { data: sItems } = await supabase
          .from("qc_daily_sheet_items")
          .select("sheet_id, status")
          .in("sheet_id", sheetIds);
        for (const i of sItems || []) {
          const c =
            sheetCounts.get(i.sheet_id) ??
            { total: 0, done: 0, issue: 0, pending: 0 };
          c.total += 1;
          if (i.status === "pass" || i.status === "na") c.done += 1;
          else if (i.status === "fail") c.issue += 1;
          else c.pending += 1;
          sheetCounts.set(i.sheet_id, c);
        }
      }

      const trackerRows: MyRecord[] = (trackersRes.data || []).map((r: any) => {
        const c =
          trackerCounts.get(r.id) ?? { total: 0, done: 0, issue: 0, pending: 0 };
        return {
          kind: "tracker",
          id: r.id,
          status: r.status,
          po_number: r.work_orders?.po_number ?? "",
          buyer: r.work_orders?.buyer ?? "",
          style: r.work_orders?.style ?? "",
          line_name: null,
          inspection_date: null,
          shift: null,
          last_activity_at: r.last_activity_at,
          items_total: c.total,
          items_done: c.done,
          items_issue: c.issue,
          items_pending: c.pending,
        };
      });

      const sheetRows: MyRecord[] = (sheetsRes.data || []).map((r: any) => {
        const c =
          sheetCounts.get(r.id) ?? { total: 0, done: 0, issue: 0, pending: 0 };
        return {
          kind: "sheet",
          id: r.id,
          status: r.status,
          po_number: r.work_orders?.po_number ?? "",
          buyer: r.work_orders?.buyer ?? "",
          style: r.work_orders?.style ?? "",
          line_name: r.lines?.name ?? r.lines?.line_id ?? null,
          inspection_date: r.inspection_date,
          shift: r.shift,
          last_activity_at: r.last_activity_at,
          items_total: c.total,
          items_done: c.done,
          items_issue: c.issue,
          items_pending: c.pending,
        };
      });

      const merged = [...trackerRows, ...sheetRows].sort((a, b) =>
        b.last_activity_at.localeCompare(a.last_activity_at)
      );
      setRows(merged);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, profile?.factory_id]);

  const counts = useMemo(() => {
    const c = {
      all: rows.length,
      tracker: 0,
      sheet: 0,
      in_progress: 0,
      awaiting_signoff: 0,
      signed_off: 0,
      issuesTotal: 0,
    };
    for (const r of rows) {
      c[r.kind] += 1;
      c[r.status] += 1;
      c.issuesTotal += r.items_issue;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (tab === "tracker" || tab === "sheet") list = list.filter((r) => r.kind === tab);
    else if (tab !== "all") list = list.filter((r) => r.status === tab);
    if (search) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.po_number.toLowerCase().includes(q) ||
          r.buyer.toLowerCase().includes(q) ||
          r.style.toLowerCase().includes(q) ||
          (r.line_name ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, tab, search]);

  const todayLong = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-5 md:space-y-6">
      {/* ── Hero header ──────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-teal-200/60 dark:border-teal-800/40 bg-gradient-to-br from-teal-50 via-white to-emerald-50/60 dark:from-teal-950/40 dark:via-card dark:to-emerald-950/20 shadow-sm">
        <div
          aria-hidden
          className="absolute top-0 right-0 w-64 h-64 rounded-bl-full pointer-events-none bg-gradient-to-bl from-teal-500/15 to-transparent"
        />
        <div
          aria-hidden
          className="absolute bottom-0 left-0 w-40 h-40 rounded-tr-full pointer-events-none bg-gradient-to-tr from-emerald-500/10 to-transparent"
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
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-teal-500/25 shrink-0">
              <FolderOpen className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-600 dark:text-teal-400">
                  QC Inspector
                </p>
                <span className="text-muted-foreground/60 text-xs">·</span>
                <p className="text-xs text-muted-foreground">{todayLong}</p>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                My QC Records
              </h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                Your submitted trackers and daily sheets across every PO and line.
                Tap any record to open it.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI strip ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniKpi
          tone="teal"
          icon={FolderOpen}
          label="Total Records"
          value={counts.all}
          sub={
            counts.all === 0
              ? "No submissions yet"
              : `${counts.tracker} tracker · ${counts.sheet} sheet`
          }
          onClick={() => setTab("all")}
        />
        <MiniKpi
          tone="blue"
          icon={Activity}
          label="In Progress"
          value={counts.in_progress}
          sub={counts.in_progress > 0 ? "Active worklists" : "Nothing in flight"}
          onClick={() => setTab("in_progress")}
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
              placeholder="Search by PO, buyer, style, or line…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <div className="flex flex-wrap gap-1 lg:ml-auto">
            {TAB_ORDER.map((key) => {
              const meta = TAB_META[key];
              const count = counts[key as keyof typeof counts] as number;
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

      {/* ── Record grid ──────────────────────────────────────────────── */}
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
            <RecordCard key={`${r.kind}-${r.id}`} row={r} />
          ))}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <p className="text-[11px] text-muted-foreground text-center">
          Showing {filtered.length} of {counts.all} record{counts.all === 1 ? "" : "s"}
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
}: {
  tone: "teal" | "blue" | "amber" | "emerald";
  icon: typeof FolderOpen;
  label: string;
  value: number;
  sub: string;
  onClick: () => void;
}) {
  const palette = {
    teal: {
      bg: "bg-gradient-to-br from-teal-50 via-white to-cyan-50/60 dark:from-teal-950/40 dark:via-card dark:to-cyan-950/20",
      border: "border-teal-200/60 dark:border-teal-800/40",
      glow: "bg-gradient-to-bl from-teal-500/10 to-transparent",
      iconBg: "bg-gradient-to-br from-teal-500 to-emerald-600",
      iconShadow: "shadow-teal-500/25",
      text: "text-teal-700 dark:text-teal-300",
    },
    blue: {
      bg: "bg-gradient-to-br from-blue-50 via-white to-sky-50/60 dark:from-blue-950/40 dark:via-card dark:to-sky-950/20",
      border: "border-blue-200/60 dark:border-blue-800/40",
      glow: "bg-gradient-to-bl from-blue-500/10 to-transparent",
      iconBg: "bg-gradient-to-br from-blue-500 to-indigo-600",
      iconShadow: "shadow-blue-500/25",
      text: "text-blue-700 dark:text-blue-300",
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
          <p
            className={cn(
              "font-mono text-2xl md:text-3xl font-bold tabular-nums leading-none tracking-tight",
              value > 0 ? palette.text : "text-foreground"
            )}
          >
            {value.toLocaleString()}
          </p>
          <p className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground mt-1.5">
            {label}
          </p>
          <p className="text-[11px] text-muted-foreground/80 mt-0.5 truncate">{sub}</p>
        </div>
      </div>
    </button>
  );
}

function RecordCard({ row }: { row: MyRecord }) {
  const status: SheetTrackerStatus = row.status;
  const v = STATUS_VIS[status];
  const passPct =
    row.items_total > 0
      ? Math.round((row.items_done / row.items_total) * 100)
      : 0;
  const barGradient =
    row.items_issue >= 3
      ? "bg-gradient-to-r from-red-500 to-rose-500"
      : row.items_issue >= 1
        ? "bg-gradient-to-r from-amber-500 to-orange-500"
        : passPct >= 90
          ? "bg-gradient-to-r from-emerald-500 to-teal-500"
          : passPct >= 50
            ? "bg-gradient-to-r from-blue-500 to-indigo-600"
            : "bg-gradient-to-r from-slate-400 to-slate-500";

  const href =
    row.kind === "tracker"
      ? `/quality/order-manager/${row.id}`
      : `/quality/daily-sheet/${row.id}`;

  // Kind-themed colors: tracker = violet, sheet = blue
  const kindPalette =
    row.kind === "tracker"
      ? {
          icon: ShieldCheck,
          label: "Order Tracker",
          iconBg: "bg-gradient-to-br from-violet-500 to-purple-600",
          eyebrow: "text-violet-600 dark:text-violet-400",
        }
      : {
          icon: ListChecks,
          label: "Daily Sheet",
          iconBg: "bg-gradient-to-br from-blue-500 to-indigo-600",
          eyebrow: "text-blue-600 dark:text-blue-400",
        };
  const KindIcon = kindPalette.icon;

  const hasIssues = row.items_issue > 0;

  return (
    <Link
      to={href}
      className={cn(
        "relative rounded-xl border border-border/60 bg-card overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 block",
        "border-l-[3px]",
        v.rowAccent
      )}
    >
      {/* Issue ping */}
      {hasIssues && (
        <span className="absolute top-3 right-3 flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping bg-amber-500" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
        </span>
      )}

      <div className="p-4">
        {/* Kind eyebrow */}
        <div className="flex items-center gap-1.5 mb-2">
          <div
            className={cn(
              "h-5 w-5 rounded-md flex items-center justify-center shadow-sm",
              kindPalette.iconBg
            )}
          >
            <KindIcon className="h-3 w-3 text-white" />
          </div>
          <span
            className={cn(
              "text-[10px] font-semibold uppercase tracking-[0.1em]",
              kindPalette.eyebrow
            )}
          >
            {kindPalette.label}
          </span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-mono font-bold text-sm truncate">{row.po_number}</p>
              {row.line_name && (
                <>
                  <span className="text-xs text-muted-foreground">·</span>
                  <p className="text-xs font-medium truncate">{row.line_name}</p>
                </>
              )}
              {row.shift && (
                <Badge variant="outline" className="text-[10px] capitalize">
                  {row.shift}
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
              {row.buyer} · {row.style}
            </p>
          </div>
          <StatusPill status={status} />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Stat
            icon={Calendar}
            label={row.kind === "sheet" ? "Date" : "Last activity"}
            value={formatShortDate(row.inspection_date ?? row.last_activity_at)}
          />
          <Stat
            icon={Activity}
            label="Progress"
            value={row.items_total > 0 ? `${passPct}%` : "—"}
          />
        </div>

        {/* Progress + counts */}
        {row.items_total > 0 && (
          <div className="mt-3.5">
            <div className="h-2 rounded-full bg-muted overflow-hidden ring-1 ring-border/40">
              <div
                className={cn("h-full transition-all duration-500", barGradient)}
                style={{ width: `${passPct}%` }}
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
        )}

        <div
          className={cn(
            "mt-4 flex items-center justify-end text-[11px] font-semibold gap-1 group/cta",
            kindPalette.eyebrow
          )}
        >
          Open {row.kind === "tracker" ? "tracker" : "sheet"}
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/cta:translate-x-0.5" />
        </div>
      </div>
    </Link>
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
      <div className="inline-flex h-12 w-12 rounded-xl items-center justify-center mx-auto mb-3 bg-gradient-to-br from-teal-500/15 to-emerald-500/15 ring-1 ring-teal-500/20">
        <Sparkles className="h-5 w-5 text-teal-600 dark:text-teal-400" />
      </div>
      <p className="text-sm font-medium">
        {count === 0
          ? "You haven't submitted any QC records yet."
          : "No records match this filter."}
      </p>
      {count === 0 ? (
        <p className="text-xs text-muted-foreground mt-1.5 max-w-sm mx-auto">
          Start a tracker or daily sheet from the Order Manager or Daily QC Sheet
          pages — your work will appear here.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground mt-1">
          Try another tab or clear your search.
        </p>
      )}
    </div>
  );
}
