import { searchNorm } from "@/lib/normalize-name";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ListChecks,
  Search,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus,
  User,
  Calendar,
  Activity,
  Send,
  Stamp,
  Sparkles,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatShortDate, getTodayInTimezone } from "@/lib/date-utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  useQCDailySheets,
  startDailySheet,
  type DailySheetRow,
} from "@/hooks/useQCDailySheets";
import {
  STATUS_VIS,
  StatusPill,
  CountChip,
  type SheetTrackerStatus,
} from "@/components/quality/status-vis";

const SHIFTS = [
  { value: "day", label: "Day" },
  { value: "night", label: "Night" },
  { value: "overtime", label: "Overtime" },
];

type FilterTab = "today" | "in_progress" | "awaiting_signoff" | "signed_off" | "all";

const TAB_ORDER: FilterTab[] = [
  "today",
  "in_progress",
  "awaiting_signoff",
  "signed_off",
  "all",
];

const TAB_META: Record<FilterTab, { label: string; activeCls: string }> = {
  today: {
    label: "Today",
    activeCls:
      "data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 dark:data-[state=active]:bg-indigo-950/40 dark:data-[state=active]:text-indigo-300",
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
  all: {
    label: "All",
    activeCls:
      "data-[state=active]:bg-slate-100 data-[state=active]:text-slate-700 dark:data-[state=active]:bg-slate-800/40 dark:data-[state=active]:text-slate-300",
  },
};

export default function QCDailySheetList() {
  const { factory, isQCUser, isAdminOrHigher } = useAuth();
  // Admins/owners can start sheets too (e.g. to demo or cover for an inspector).
  const canStart = isQCUser() || isAdminOrHigher();
  const { rows, loading, refetch } = useQCDailySheets({ sinceDays: 30 });
  const [search, setSearch] = useState("");
  // Default to Today — that's where the inspector's active work is
  const [tab, setTab] = useState<FilterTab>("today");
  const [picking, setPicking] = useState(false);

  const timezone = factory?.timezone || "Asia/Dhaka";
  const today = getTodayInTimezone(timezone);

  const counts = useMemo(() => {
    const c = {
      all: rows.length,
      today: 0,
      in_progress: 0,
      awaiting_signoff: 0,
      signed_off: 0,
      // Today-only roll-ups for the hint copy
      todayPass: 0,
      todayFail: 0,
    };
    for (const r of rows) {
      if (r.inspection_date === today) {
        c.today += 1;
        c.todayPass += r.items_pass;
        c.todayFail += r.items_fail;
      }
      c[r.status] += 1;
    }
    return c;
  }, [rows, today]);

  const filtered = useMemo(() => {
    let list = rows;
    if (tab === "today") list = list.filter((r) => r.inspection_date === today);
    else if (tab !== "all") list = list.filter((r) => r.status === tab);
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
  }, [rows, tab, today, search]);

  const todayLong = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-5 md:space-y-6">
      {/* ── Hero header ──────────────────────────────────────────────── */}
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
                  {canStart ? "QC Inspector" : "Quality Control"}
                </p>
                <span className="text-muted-foreground/60 text-xs">·</span>
                <p className="text-xs text-muted-foreground">{todayLong}</p>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                Daily QC Sheet
              </h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                One sheet per PO, line, date, and shift{factory?.name ? ` at ${factory.name}` : ""}.
                Failed items auto-create QC issues for the admin to review.
              </p>
            </div>
          </div>
          {canStart && (
            <Button
              onClick={() => setPicking((p) => !p)}
              className="gap-1.5 shrink-0 w-full sm:w-auto bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-md shadow-blue-500/25 text-white"
            >
              <Plus className="h-4 w-4" />
              {picking ? "Close" : "New sheet"}
            </Button>
          )}
        </div>
      </div>

      {/* ── Start-sheet picker modal (line → PO) ───────────────────────── */}
      {canStart && <StartSheetPicker open={picking} onOpenChange={setPicking} />}

      {/* ── KPI strip ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniKpi
          tone="indigo"
          icon={Calendar}
          label="Today"
          value={counts.today}
          sub={
            counts.today > 0
              ? `${counts.todayPass} pass · ${counts.todayFail} fail`
              : canStart
                ? "Tap 'New sheet' to begin"
                : "No sheets submitted yet"
          }
          onClick={() => setTab("today")}
          urgent={canStart && counts.today === 0}
        />
        <MiniKpi
          tone="blue"
          icon={Activity}
          label="In Progress"
          value={counts.in_progress}
          sub={counts.in_progress > 0 ? "Active sheets" : "Nothing in flight"}
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
              placeholder="Search by PO, buyer, style, line, or inspector…"
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

      {/* ── Sheet grid ───────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-44 bg-muted/40 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState count={rows.length} canStart={canStart} onNew={() => setPicking(true)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((r) => (
            <SheetCard key={r.id} row={r} />
          ))}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <p className="text-[11px] text-muted-foreground text-center">
          Showing {filtered.length} of {counts.all} sheet{counts.all === 1 ? "" : "s"} from the last 30 days
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
  tone: "indigo" | "blue" | "amber" | "emerald";
  icon: typeof ListChecks;
  label: string;
  value: number;
  sub: string;
  onClick: () => void;
  urgent?: boolean;
}) {
  const palette = {
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
            {urgent && value === 0 && (
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

function SheetCard({ row }: { row: DailySheetRow }) {
  const status: SheetTrackerStatus = row.status;
  const v = STATUS_VIS[status];
  const passPct =
    row.items_total > 0
      ? Math.round(((row.items_pass + row.items_na) / row.items_total) * 100)
      : 0;
  const barGradient =
    row.items_fail >= 3
      ? "bg-gradient-to-r from-red-500 to-rose-500"
      : row.items_fail >= 1
        ? "bg-gradient-to-r from-amber-500 to-orange-500"
        : passPct >= 90
          ? "bg-gradient-to-r from-emerald-500 to-teal-500"
          : passPct >= 50
            ? "bg-gradient-to-r from-blue-500 to-indigo-600"
            : "bg-gradient-to-r from-slate-400 to-slate-500";

  const hasFails = row.items_fail > 0;

  return (
    <Link
      to={`/quality/daily-sheet/${row.id}`}
      className={cn(
        "relative rounded-xl border border-border/60 bg-card overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 block",
        "border-l-[3px]",
        v.rowAccent
      )}
    >
      {/* Fail ping */}
      {hasFails && (
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
              <ListChecks className={cn("h-4 w-4", v.iconText)} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="font-mono font-bold text-sm truncate">{row.po_number}</p>
                <span className="text-xs text-muted-foreground">·</span>
                <p className="text-xs font-medium truncate">{row.line_name}</p>
              </div>
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                {row.buyer} · {row.style}
              </p>
            </div>
          </div>
          <StatusPill status={status} />
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <Stat icon={Calendar} label="Date" value={formatShortDate(row.inspection_date)} />
          <Stat icon={Clock} label="Shift" value={row.shift} capitalize />
          <Stat icon={User} label="Inspector" value={row.inspector_name ?? "—"} />
        </div>

        {/* Progress + counts */}
        {row.items_total > 0 && (
          <div className="mt-3.5">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                Progress
              </p>
              <p className="text-[11px] tabular-nums font-mono font-semibold text-foreground">
                {passPct}%
              </p>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden ring-1 ring-border/40">
              <div
                className={cn("h-full transition-all duration-500", barGradient)}
                style={{ width: `${passPct}%` }}
              />
            </div>
            <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
              <CountChip value={row.items_pass} icon={CheckCircle2} tone="emerald" />
              <CountChip
                value={row.items_fail}
                icon={AlertTriangle}
                tone={row.items_fail >= 3 ? "red" : "amber"}
              />
              <CountChip value={row.items_pending} icon={Clock} tone="slate" />
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-end text-[11px] text-blue-600 dark:text-blue-400 font-semibold gap-1 group/cta">
          Open sheet
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
  capitalize,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <div className="rounded-md bg-muted/40 px-2.5 py-1.5">
      <div className="flex items-center gap-1 mb-0.5">
        <Icon className="h-3 w-3 text-muted-foreground/70" />
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground/80 font-medium">
          {label}
        </p>
      </div>
      <p
        className={cn(
          "text-xs font-semibold tabular-nums truncate",
          capitalize && "capitalize"
        )}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function EmptyState({
  count,
  canStart,
  onNew,
}: {
  count: number;
  canStart: boolean;
  onNew: () => void;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 bg-card/40 py-16 text-center">
      <div className="inline-flex h-12 w-12 rounded-xl items-center justify-center mx-auto mb-3 bg-gradient-to-br from-blue-500/15 to-indigo-500/15 ring-1 ring-blue-500/20">
        <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400" />
      </div>
      <p className="text-sm font-medium">
        {count === 0
          ? "No daily sheets submitted yet."
          : "No sheets match this filter."}
      </p>
      {count === 0 && canStart ? (
        <Button onClick={onNew} size="sm" className="mt-3 gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Start your first sheet
        </Button>
      ) : (
        count > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            Try another tab or clear your search.
          </p>
        )
      )}
    </div>
  );
}

// ── Start-sheet picker: pick a LINE, then a PO on that line ────────────
// QC managers responsible for different phases all reach the same sheet by
// choosing the same line + PO (the sheet is keyed by line+PO+date+shift, so a
// second manager opens the existing sheet instead of creating a duplicate).
export function StartSheetPicker({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const { profile, user, factory } = useAuth();
  const timezone = factory?.timezone || "Asia/Dhaka";
  const today = getTodayInTimezone(timezone);

  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<LineOpt[]>([]);
  const [lineToPOs, setLineToPOs] = useState<Map<string, POOpt[]>>(new Map());
  const [pickedLine, setPickedLine] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => { if (open) setPickedLine(null); }, [open]);

  useEffect(() => {
    if (!open || !profile?.factory_id) return;
    (async () => {
      setLoading(true);
      const [{ data: lns }, { data: woData }, { data: assign }] = await Promise.all([
        supabase.from("lines").select("id, name, line_id").eq("factory_id", profile.factory_id).eq("is_active", true).order("line_id"),
        supabase.from("work_orders").select("id, po_number, buyer, style, line_id, item, construction, target_per_day").eq("factory_id", profile.factory_id).eq("is_active", true).order("po_number"),
        supabase.from("work_order_line_assignments").select("work_order_id, line_id").eq("factory_id", profile.factory_id),
      ]);
      // Resolve assignments to ACTIVE POs only, so the line's count matches the
      // POs actually shown (assignments can reference archived/inactive POs).
      const woById = new Map((woData as POOpt[] | null ?? []).map((w) => [w.id, w]));
      const map = new Map<string, POOpt[]>();
      const add = (lineId: string | null, woId: string) => {
        if (!lineId) return;
        const wo = woById.get(woId);
        if (!wo) return; // not an active PO — skip
        const a = map.get(lineId) || [];
        if (!a.some((x) => x.id === wo.id)) a.push(wo);
        map.set(lineId, a);
      };
      (assign as { work_order_id: string; line_id: string }[] | null)?.forEach((r) => add(r.line_id, r.work_order_id));
      (woData as POOpt[] | null)?.forEach((w) => add(w.line_id, w.id)); // legacy single-line POs
      setLines((lns as LineOpt[]) || []);
      setLineToPOs(map);
      setLoading(false);
    })();
  }, [open, profile?.factory_id]);

  async function start(wo: POOpt) {
    if (!profile?.factory_id || !user?.id || !pickedLine) return;
    setStarting(wo.id);
    try {
      const sheetId = await startDailySheet({
        factoryId: profile.factory_id,
        workOrderId: wo.id,
        lineId: pickedLine,
        inspectionDate: today,
        shift: "day",
        inspectorId: user.id,
        productType: wo.item ?? null,
        fabric: wo.construction ?? null,
        targetQty: wo.target_per_day ?? null,
      });
      toast.success("Daily QC sheet ready");
      navigate(`/quality/daily-sheet/${sheetId}`);
    } catch (err: any) {
      toast.error(err?.message || "Could not start sheet");
      setStarting(null);
    }
  }

  const line = pickedLine ? lines.find((l) => l.id === pickedLine) : null;
  const linePOs = pickedLine ? (lineToPOs.get(pickedLine) || []) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden flex flex-col top-4 translate-y-0 max-h-[calc(100dvh-2rem)] sm:top-[50%] sm:-translate-y-[50%] sm:max-h-[85vh]">
        <div className="h-[3px] bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-600 shrink-0" />
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-3 text-left">
            {pickedLine && (
              <button onClick={() => setPickedLine(null)} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline shrink-0">
                ← Lines
              </button>
            )}
            <div className="min-w-0">
              <DialogTitle className="text-base">
                {pickedLine ? `Pick a PO on ${line?.name || line?.line_id}` : "Start a QC sheet"}
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                {pickedLine ? "Choose the PO you're inspecting." : "Choose a line, then the PO you're inspecting."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !pickedLine ? (
          lines.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No active lines in this factory.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {lines.map((l) => {
                const count = lineToPOs.get(l.id)?.length || 0;
                return (
                  <button
                    key={l.id}
                    onClick={() => setPickedLine(l.id)}
                    className="group rounded-xl border border-border/60 bg-card hover:border-blue-400 hover:shadow-md transition-all p-3 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white grid place-items-center shrink-0 shadow">
                        <ListChecks className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{l.name || l.line_id}</p>
                        <p className="text-[11px] text-muted-foreground">{count} PO{count === 1 ? "" : "s"}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )
        ) : linePOs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No active POs on this line.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {linePOs.map((wo) => (
              <button
                key={wo.id}
                onClick={() => start(wo)}
                disabled={starting !== null}
                className="group rounded-xl border border-border/60 bg-card hover:border-blue-400 hover:shadow-md transition-all p-3 text-left disabled:opacity-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono font-bold text-sm truncate">{wo.po_number}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{wo.buyer} · {wo.style}</p>
                  </div>
                  {starting === wo.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600 shrink-0" />
                  ) : (
                    <ArrowRight className="h-4 w-4 text-blue-600 shrink-0 transition-transform group-hover:translate-x-0.5" />
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── New Sheet Dialog ───────────────────────────────────────────────────

interface POOpt {
  id: string;
  po_number: string;
  buyer: string;
  style: string;
  line_id: string | null;
  item: string | null;
  construction: string | null;
  target_per_day: number | null;
}
interface LineOpt {
  id: string;
  name: string | null;
  line_id: string;
}

export function NewSheetDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (sheetId: string) => void;
}) {
  const navigate = useNavigate();
  const { profile, user, factory } = useAuth();
  const timezone = factory?.timezone || "Asia/Dhaka";
  const today = getTodayInTimezone(timezone);

  const [workOrders, setWorkOrders] = useState<POOpt[]>([]);
  const [lines, setLines] = useState<LineOpt[]>([]);
  const [workOrderId, setWorkOrderId] = useState("");
  const [lineId, setLineId] = useState("");
  const [date, setDate] = useState(today);
  const [shift, setShift] = useState("day");
  const [productType, setProductType] = useState("");
  const [fabric, setFabric] = useState("");
  const [targetQty, setTargetQty] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !profile?.factory_id) return;
    setLoading(true);
    (async () => {
      const [{ data: wos }, { data: lns }] = await Promise.all([
        supabase
          .from("work_orders")
          .select("id, po_number, buyer, style, line_id, item, construction, target_per_day")
          .eq("factory_id", profile.factory_id)
          .eq("is_active", true)
          .order("po_number"),
        supabase
          .from("lines")
          .select("id, name, line_id")
          .eq("factory_id", profile.factory_id)
          .eq("is_active", true)
          .order("line_id"),
      ]);
      setWorkOrders((wos as POOpt[]) || []);
      setLines((lns as LineOpt[]) || []);
      setLoading(false);
    })();
  }, [open, profile?.factory_id]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setWorkOrderId("");
      setLineId("");
      setDate(today);
      setShift("day");
      setProductType("");
      setFabric("");
      setTargetQty("");
    }
  }, [open, today]);

  // Auto-fill line/product/fabric/target from the selected PO. User can still override.
  function handlePOChange(nextWorkOrderId: string) {
    setWorkOrderId(nextWorkOrderId);
    const wo = workOrders.find((w) => w.id === nextWorkOrderId);
    if (!wo) return;
    if (wo.line_id) setLineId(wo.line_id);
    setProductType(wo.item ?? "");
    setFabric(wo.construction ?? "");
    setTargetQty(wo.target_per_day != null ? String(wo.target_per_day) : "");
  }

  const canSubmit = workOrderId && lineId && date && shift && profile?.factory_id && user?.id;

  async function handleCreate() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const parsedQty = targetQty.trim() ? Number(targetQty) : null;
      const sheetId = await startDailySheet({
        factoryId: profile.factory_id!,
        workOrderId,
        lineId,
        inspectionDate: date,
        shift,
        inspectorId: user!.id,
        productType: productType.trim() || null,
        fabric: fabric.trim() || null,
        targetQty: parsedQty !== null && !Number.isNaN(parsedQty) ? parsedQty : null,
      });
      toast.success("Daily QC sheet ready");
      onCreated(sheetId);
      navigate(`/quality/daily-sheet/${sheetId}`);
    } catch (err: any) {
      toast.error(err?.message || "Could not create sheet");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "sm:max-w-lg p-0 gap-0 overflow-hidden flex flex-col",
          // Mobile: anchor near the top so the footer can't fall below the
          // browser chrome. iOS Safari's `100vh` includes hidden chrome and
          // overflows the visible viewport — `dvh` accounts for it.
          "top-4 translate-y-0 max-h-[calc(100dvh-2rem)]",
          // Desktop: standard center positioning + 90vh cap
          "sm:top-[50%] sm:-translate-y-[50%] sm:max-h-[90vh]"
        )}
      >
        {/* Blue accent strip — matches the daily sheet brand color */}
        <div className="h-[3px] bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-600 shrink-0" />

        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/60 shrink-0">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25 shrink-0">
              <ListChecks className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 text-left">
              <DialogTitle className="text-base">New Daily QC Sheet</DialogTitle>
              <DialogDescription className="text-xs mt-1">
                One sheet per PO, line, date, and shift. If a sheet already exists
                for this combination it'll open instead of creating a duplicate.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable form body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Section: PO */}
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                  Work Order <span className="text-red-500 normal-case">*</span>
                </Label>
                <Select value={workOrderId} onValueChange={handlePOChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a PO" />
                  </SelectTrigger>
                  <SelectContent>
                    {workOrders.map((wo) => (
                      <SelectItem key={wo.id} value={wo.id}>
                        <span className="font-mono">{wo.po_number}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {wo.buyer} · {wo.style}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {workOrderId && (
                  <p className="text-[11px] text-muted-foreground italic">
                    Line, product, fabric and target auto-fill from the PO. Edit
                    below if needed.
                  </p>
                )}
              </div>

              {/* Section: When / Where */}
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
                <p className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground">
                  When · Where
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold">
                      Line <span className="text-red-500">*</span>
                    </Label>
                    <Select value={lineId} onValueChange={setLineId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Line" />
                      </SelectTrigger>
                      <SelectContent>
                        {lines.map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.name || l.line_id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold">
                      Shift <span className="text-red-500">*</span>
                    </Label>
                    <Select value={shift} onValueChange={setShift}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SHIFTS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold">
                    Inspection Date <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={date}
                    max={today}
                    onChange={(e) => setDate(e.target.value)}
                    className="tabular-nums"
                  />
                </div>
              </div>

              {/* Section: Product details */}
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
                <p className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground">
                  Product Details
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold">Product Type</Label>
                    <Input
                      placeholder="e.g. Woven Pant"
                      value={productType}
                      onChange={(e) => setProductType(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold">Fabric</Label>
                    <Input
                      placeholder="e.g. Poly/Cotton"
                      value={fabric}
                      onChange={(e) => setFabric(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold">Target Qty</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="Daily target pieces"
                    value={targetQty}
                    onChange={(e) => setTargetQty(e.target.value)}
                    className="tabular-nums"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pinned footer — extra bottom padding for iOS home-indicator safe area */}
        <DialogFooter
          className="px-6 py-4 border-t border-border/60 bg-muted/30 shrink-0 sm:justify-end gap-2"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!canSubmit || submitting}
            className="gap-1.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-md shadow-blue-500/25 text-white disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Start sheet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
