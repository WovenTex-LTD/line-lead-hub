import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { formatShortDate, formatTimeInTimezone } from "@/lib/date-utils";
import { useAuth } from "@/contexts/AuthContext";
import { SewingSubmissionView } from "@/components/SewingSubmissionView";
import { FinishingSubmissionView } from "@/components/FinishingSubmissionView";
import { CuttingSubmissionView } from "@/components/CuttingSubmissionView";
import type { SewingTargetData, SewingActualData } from "@/components/SewingSubmissionView";
import type { FinishingTargetData, FinishingActualData } from "@/components/FinishingSubmissionView";
import type { CuttingTargetData, CuttingActualData } from "@/components/CuttingSubmissionView";
import type { POSubmissionRow, SubmissionType } from "./types";
import { resolveStageLabel } from "@/lib/resolve-stage-label";

// ── Types ─────────────────────────────────────────────────
type StageName = "sewing" | "cutting" | "finishing";

interface MergedRow {
  key: string;
  stage: StageName;
  label: string;
  date: string;
  lineName: string;
  submittedAt: string | null;
  targetRow: POSubmissionRow | null;
  actualRow: POSubmissionRow | null;
}

// ── Stage accent colors (left border + label) ─────────────
const STAGE_ACCENT: Record<StageName, string> = {
  sewing: "border-l-blue-500",
  cutting: "border-l-emerald-500",
  finishing: "border-l-violet-500",
};

const STAGE_TEXT: Record<StageName, string> = {
  sewing: "text-blue-600 dark:text-blue-400",
  cutting: "text-emerald-600 dark:text-emerald-400",
  finishing: "text-violet-600 dark:text-violet-400",
};

// ── Helpers ───────────────────────────────────────────────
function getStage(type: SubmissionType): StageName {
  if (type.startsWith("sewing")) return "sewing";
  if (type.startsWith("cutting")) return "cutting";
  return "finishing";
}

function mergeSubmissions(submissions: POSubmissionRow[]): MergedRow[] {
  const groups = new Map<string, { target: POSubmissionRow | null; actual: POSubmissionRow | null; stage: StageName }>();

  for (const row of submissions) {
    const stage = getStage(row.type);
    const key = `${stage}-${row.date}-${row.lineName}`;
    if (!groups.has(key)) groups.set(key, { target: null, actual: null, stage });
    const group = groups.get(key)!;
    if (row.type.endsWith("_target")) group.target = row;
    else group.actual = row;
  }

  const result: MergedRow[] = [];
  for (const [key, group] of groups) {
    const stageName = group.stage.charAt(0).toUpperCase() + group.stage.slice(1);
    const label = resolveStageLabel(stageName, !!group.target, !!group.actual);
    const times = [group.target?.submittedAt, group.actual?.submittedAt].filter(Boolean) as string[];
    const submittedAt = times.sort().pop() ?? null;
    const primaryRow = group.actual || group.target!;

    result.push({
      key, stage: group.stage, label, date: primaryRow.date,
      lineName: primaryRow.lineName, submittedAt,
      targetRow: group.target, actualRow: group.actual,
    });
  }

  result.sort((a, b) => b.date.localeCompare(a.date));
  return result;
}

// ── Status logic ──────────────────────────────────────────
function isOlderThan24h(dateStr: string): boolean {
  const submissionDate = new Date(dateStr + "T23:59:59");
  return Date.now() - submissionDate.getTime() > 24 * 60 * 60 * 1000;
}

function computeTargetHit(merged: MergedRow): boolean {
  if (!merged.targetRow || !merged.actualRow) return false;
  const target = merged.targetRow.raw as any;
  const actual = merged.actualRow.raw as any;
  if (merged.stage === "sewing") {
    const totalTarget = target.target_total_planned ?? Math.round((target.per_hour_target ?? 0) * (target.hours_planned ?? 8));
    return totalTarget > 0 && (actual.good_today ?? 0) >= totalTarget;
  }
  if (merged.stage === "cutting") {
    return (target.cutting_capacity ?? 0) > 0 && (actual.day_cutting ?? 0) >= (target.cutting_capacity ?? 0);
  }
  if (merged.stage === "finishing") {
    const plannedHrs = (target.planned_hours ?? 0) + (target.ot_hours_planned ?? 0);
    const totalTarget = (target.poly ?? 0) * (plannedHrs > 0 ? plannedHrs : 1);
    return totalTarget > 0 && (actual.poly ?? 0) >= totalTarget;
  }
  return false;
}

function getStatus(merged: MergedRow): { label: string; color: string } {
  // Blocker takes priority
  if (merged.actualRow) {
    const r = merged.actualRow.raw as any;
    if (r.has_blocker) return { label: "Blocker", color: "text-red-500" };
  }
  // Missing counterpart after 24h
  const stale = isOlderThan24h(merged.date);
  if (merged.targetRow && !merged.actualRow && stale) {
    return { label: "Missing EOD", color: "text-red-500" };
  }
  if (merged.actualRow && !merged.targetRow && stale) {
    return { label: "Missing Target", color: "text-red-500" };
  }
  // Target hit/missed when both exist
  if (merged.targetRow && merged.actualRow) {
    return computeTargetHit(merged)
      ? { label: "Target Hit", color: "text-emerald-500" }
      : { label: "Target Missed", color: "text-amber-500" };
  }
  // Only target or only actual within 24h
  if (merged.targetRow && !merged.actualRow) {
    return { label: "Awaiting EOD", color: "text-blue-500" };
  }
  if (merged.actualRow && !merged.targetRow) {
    return { label: "No Target", color: "text-muted-foreground" };
  }
  return { label: "On Time", color: "text-emerald-500" };
}

// ── Metric helpers ────────────────────────────────────────
function singleMetric(row: POSubmissionRow): string {
  const r = row.raw as any;
  switch (row.type) {
    case "sewing_target": {
      const total = r.target_total_planned ?? Math.round((r.per_hour_target ?? 0) * (r.hours_planned ?? 8));
      return total.toLocaleString();
    }
    case "sewing_actual": return (r.good_today ?? 0).toLocaleString();
    case "cutting_target": return (r.cutting_capacity ?? 0).toLocaleString();
    case "cutting_actual": return (r.total_cutting ?? 0).toLocaleString();
    case "finishing_target": return (r.poly ?? 0).toLocaleString();
    case "finishing_actual": return (r.poly ?? 0).toLocaleString();
    default: return "\u2014";
  }
}

// ── Component ─────────────────────────────────────────────
interface Props {
  submissions: POSubmissionRow[];
}

export function POSubmissionsTab({ submissions }: Props) {
  const { factory } = useAuth();
  const tz = factory?.timezone || "Asia/Dhaka";
  const formatTime = (ts: string) => formatTimeInTimezone(ts, tz);

  const [sewingOpen, setSewingOpen] = useState(false);
  const [sewingTarget, setSewingTarget] = useState<SewingTargetData | null>(null);
  const [sewingActual, setSewingActual] = useState<SewingActualData | null>(null);
  const [finishingOpen, setFinishingOpen] = useState(false);
  const [finTarget, setFinTarget] = useState<FinishingTargetData | null>(null);
  const [finActual, setFinActual] = useState<FinishingActualData | null>(null);
  const [cuttingOpen, setCuttingOpen] = useState(false);
  const [cuttingTarget, setCuttingTarget] = useState<CuttingTargetData | null>(null);
  const [cuttingActual, setCuttingActual] = useState<CuttingActualData | null>(null);

  const mergedRows = useMemo(() => mergeSubmissions(submissions), [submissions]);

  if (submissions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No submissions yet
      </p>
    );
  }

  // ── Builders ──────────────────────────────────────────
  function buildSewingTarget(raw: Record<string, unknown>): SewingTargetData {
    const r = raw as any;
    return {
      id: r.id, production_date: r.production_date,
      line_name: r.lines?.name || r.lines?.line_id || "\u2014",
      po_number: r.work_orders?.po_number ?? null,
      buyer: r.buyer_name ?? r.work_orders?.buyer ?? null,
      style: r.style_code ?? r.work_orders?.style ?? null,
      order_qty: r.order_qty ?? r.work_orders?.order_qty ?? null,
      submitted_at: r.submitted_at ?? null,
      per_hour_target: r.per_hour_target ?? 0,
      manpower_planned: r.manpower_planned ?? null,
      hours_planned: r.hours_planned ?? null,
      target_total_planned: r.target_total_planned ?? null,
      ot_hours_planned: r.ot_hours_planned ?? null,
      stage_name: r.stages?.name ?? null,
      planned_stage_progress: r.planned_stage_progress ?? null,
      next_milestone: r.next_milestone ?? null,
      estimated_ex_factory: r.estimated_ex_factory ?? null,
      remarks: r.remarks ?? null,
    };
  }

  function buildSewingActual(raw: Record<string, unknown>): SewingActualData {
    const r = raw as any;
    return {
      id: r.id, production_date: r.production_date,
      line_name: r.lines?.name || r.lines?.line_id || "\u2014",
      po_number: r.work_orders?.po_number ?? null,
      buyer: r.buyer_name ?? r.work_orders?.buyer ?? null,
      style: r.style_code ?? r.work_orders?.style ?? null,
      order_qty: r.order_qty ?? r.work_orders?.order_qty ?? null,
      submitted_at: r.submitted_at ?? null,
      good_today: r.good_today ?? 0, reject_today: r.reject_today ?? 0,
      rework_today: r.rework_today ?? 0, cumulative_good_total: r.cumulative_good_total ?? 0,
      manpower_actual: r.manpower_actual ?? 0, hours_actual: r.hours_actual ?? null,
      actual_per_hour: r.actual_per_hour ?? null,
      ot_hours_actual: r.ot_hours_actual ?? 0, ot_manpower_actual: r.ot_manpower_actual ?? null,
      stage_name: r.stages?.name ?? null, actual_stage_progress: r.actual_stage_progress ?? null,
      remarks: r.remarks ?? null, has_blocker: r.has_blocker ?? false,
      blocker_description: r.blocker_description ?? null, blocker_impact: r.blocker_impact ?? null,
      blocker_owner: r.blocker_owner ?? null, blocker_status: null,
      estimated_cost_value: r.estimated_cost_value ?? null,
      estimated_cost_currency: r.estimated_cost_currency ?? null,
    };
  }

  function buildFinishingTarget(raw: Record<string, unknown>): FinishingTargetData {
    const r = raw as any;
    return {
      id: r.id, production_date: r.production_date, submitted_at: r.submitted_at ?? null,
      po_number: r.work_orders?.po_number ?? null, buyer: r.work_orders?.buyer ?? null,
      style: r.work_orders?.style ?? null,
      thread_cutting: r.thread_cutting ?? 0, inside_check: r.inside_check ?? 0,
      top_side_check: r.top_side_check ?? 0, buttoning: r.buttoning ?? 0,
      iron: r.iron ?? 0, get_up: r.get_up ?? 0, poly: r.poly ?? 0, carton: r.carton ?? 0,
      m_power_planned: r.m_power_planned ?? null, planned_hours: r.planned_hours ?? null,
      ot_hours_planned: r.ot_hours_planned ?? null, ot_manpower_planned: r.ot_manpower_planned ?? null,
      remarks: r.remarks ?? null,
    };
  }

  function buildFinishingActual(raw: Record<string, unknown>): FinishingActualData {
    const r = raw as any;
    return {
      id: r.id, production_date: r.production_date, submitted_at: r.submitted_at ?? null,
      po_number: r.work_orders?.po_number ?? null, buyer: r.work_orders?.buyer ?? null,
      style: r.work_orders?.style ?? null,
      thread_cutting: r.thread_cutting ?? 0, inside_check: r.inside_check ?? 0,
      top_side_check: r.top_side_check ?? 0, buttoning: r.buttoning ?? 0,
      iron: r.iron ?? 0, get_up: r.get_up ?? 0, poly: r.poly ?? 0, carton: r.carton ?? 0,
      m_power_actual: r.m_power_actual ?? null, actual_hours: r.actual_hours ?? null,
      ot_hours_actual: r.ot_hours_actual ?? null, ot_manpower_actual: r.ot_manpower_actual ?? null,
      remarks: r.remarks ?? null,
    };
  }

  function buildCuttingTarget(raw: Record<string, unknown>): CuttingTargetData {
    const r = raw as any;
    return {
      id: r.id, production_date: r.production_date,
      line_name: r.lines?.name || r.lines?.line_id || "\u2014",
      buyer: r.work_orders?.buyer ?? null,
      style: r.work_orders?.style ?? r.style ?? null,
      po_number: r.work_orders?.po_number ?? r.po_no ?? null,
      colour: r.colour ?? null, order_qty: r.work_orders?.order_qty ?? r.order_qty ?? null,
      submitted_at: r.submitted_at ?? null,
      man_power: r.man_power ?? null, marker_capacity: r.marker_capacity ?? null,
      lay_capacity: r.lay_capacity ?? null, cutting_capacity: r.cutting_capacity ?? null,
      under_qty: r.under_qty ?? null,
      day_cutting: r.day_cutting ?? null, day_input: r.day_input ?? null,
      hours_planned: r.hours_planned ?? null, target_per_hour: r.target_per_hour ?? null,
      ot_hours_planned: r.ot_hours_planned ?? null, ot_manpower_planned: r.ot_manpower_planned ?? null,
    };
  }

  function buildCuttingActual(raw: Record<string, unknown>): CuttingActualData {
    const r = raw as any;
    return {
      id: r.id, production_date: r.production_date,
      line_name: r.lines?.name || r.lines?.line_id || "\u2014",
      buyer: r.work_orders?.buyer ?? null,
      style: r.work_orders?.style ?? r.style ?? null,
      po_number: r.work_orders?.po_number ?? r.po_no ?? null,
      colour: r.colour ?? null, order_qty: r.work_orders?.order_qty ?? r.order_qty ?? null,
      submitted_at: r.submitted_at ?? null,
      man_power: r.man_power ?? null, marker_capacity: r.marker_capacity ?? null,
      lay_capacity: r.lay_capacity ?? null, cutting_capacity: r.cutting_capacity ?? null,
      under_qty: r.under_qty ?? null,
      day_cutting: r.day_cutting ?? 0, day_input: r.day_input ?? 0,
      total_cutting: r.total_cutting ?? null, total_input: r.total_input ?? null,
      balance: r.balance ?? null, hours_actual: r.hours_actual ?? null,
      actual_per_hour: r.actual_per_hour ?? null,
      ot_hours_actual: r.ot_hours_actual ?? null, ot_manpower_actual: r.ot_manpower_actual ?? null,
      leftover_recorded: r.leftover_recorded ?? null, leftover_type: r.leftover_type ?? null,
      leftover_unit: r.leftover_unit ?? null, leftover_quantity: r.leftover_quantity ?? null,
      leftover_notes: r.leftover_notes ?? null, leftover_location: r.leftover_location ?? null,
      leftover_photo_urls: r.leftover_photo_urls ?? null,
    };
  }

  function handleClick(merged: MergedRow) {
    if (merged.stage === "sewing") {
      setSewingTarget(merged.targetRow ? buildSewingTarget(merged.targetRow.raw) : null);
      setSewingActual(merged.actualRow ? buildSewingActual(merged.actualRow.raw) : null);
      setSewingOpen(true);
    } else if (merged.stage === "finishing") {
      setFinTarget(merged.targetRow ? buildFinishingTarget(merged.targetRow.raw) : null);
      setFinActual(merged.actualRow ? buildFinishingActual(merged.actualRow.raw) : null);
      setFinishingOpen(true);
    } else if (merged.stage === "cutting" && (merged.targetRow || merged.actualRow)) {
      setCuttingTarget(merged.targetRow ? buildCuttingTarget(merged.targetRow.raw) : null);
      setCuttingActual(merged.actualRow ? buildCuttingActual(merged.actualRow.raw) : null);
      setCuttingOpen(true);
    }
  }

  return (
    <>
      <div className="max-h-[420px] overflow-y-auto overflow-x-hidden">
        {mergedRows.map((merged, i) => {
          const status = getStatus(merged);
          const hasTarget = !!merged.targetRow;
          const hasActual = !!merged.actualRow;

          return (
            <div
              key={merged.key}
              onClick={() => handleClick(merged)}
              className={cn(
                "flex items-center gap-4 py-3 cursor-pointer transition-colors hover:bg-muted/30 rounded-md px-1",
                i < mergedRows.length - 1 && "border-b border-border/40"
              )}
            >
              {/* Date */}
              <div className="shrink-0 w-[68px]">
                <p className="text-sm font-medium tabular-nums">{formatShortDate(merged.date)}</p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {merged.submittedAt ? formatTime(merged.submittedAt) : ""}
                </p>
              </div>

              {/* Stage + Line */}
              <div className={cn("border-l-2 pl-3 min-w-0 flex-1", STAGE_ACCENT[merged.stage])}>
                <p className={cn("text-[11px] font-semibold uppercase tracking-wide leading-none mb-0.5", STAGE_TEXT[merged.stage])}>
                  {merged.label}
                </p>
                <p className="text-sm text-muted-foreground truncate">{merged.lineName}</p>
              </div>

              {/* Key metric */}
              <div className="shrink-0 text-right">
                {hasTarget && hasActual ? (
                  <div className="flex items-baseline gap-2.5 justify-end">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide leading-none mb-0.5">Target</p>
                      <p className="text-sm font-semibold font-mono tabular-nums text-muted-foreground">{singleMetric(merged.targetRow!)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide leading-none mb-0.5">Output</p>
                      <p className="text-sm font-bold font-mono tabular-nums">{singleMetric(merged.actualRow!)}</p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide leading-none mb-0.5">
                      {hasTarget ? "Target" : merged.stage === "cutting" ? "Total Cut" : "Output"}
                    </p>
                    <p className="text-sm font-bold font-mono tabular-nums">{singleMetric((merged.actualRow || merged.targetRow)!)}</p>
                  </div>
                )}
              </div>

              {/* Status dot + text */}
              <div className="hidden sm:flex items-center gap-1.5 shrink-0 justify-end">
                <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", status.color.replace("text-", "bg-"))} />
                <span className={cn("text-xs whitespace-nowrap", status.color)}>{status.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      <SewingSubmissionView open={sewingOpen} onOpenChange={setSewingOpen} target={sewingTarget} actual={sewingActual} />
      <FinishingSubmissionView open={finishingOpen} onOpenChange={setFinishingOpen} target={finTarget} actual={finActual} />
      <CuttingSubmissionView open={cuttingOpen} onOpenChange={setCuttingOpen} target={cuttingTarget} actual={cuttingActual} />
    </>
  );
}
