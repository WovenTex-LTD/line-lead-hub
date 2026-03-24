import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatDateTimeInTimezone } from "@/lib/date-utils";
import { toast } from "sonner";
import {
  Crosshair,
  AlertTriangle,
  User,
  TrendingUp,
  TrendingDown,
  Minus,
  Pencil,
  Trash2,
  Loader2,
} from "lucide-react";
import { SewingMachine } from "@/components/icons/SewingMachine";
import { useHeadcountCost } from "@/hooks/useHeadcountCost";

export interface SewingTargetData {
  id: string;
  production_date: string;
  line_name: string;
  po_number: string | null;
  buyer: string | null;
  style: string | null;
  order_qty: number | null;
  submitted_at: string | null;
  per_hour_target: number;
  manpower_planned: number | null;
  hours_planned: number | null;
  target_total_planned: number | null;
  ot_hours_planned: number | null;
  stage_name: string | null;
  planned_stage_progress: number | null;
  next_milestone: string | null;
  estimated_ex_factory: string | null;
  remarks: string | null;
}

export interface SewingActualData {
  id: string;
  production_date: string;
  line_name: string;
  po_number: string | null;
  buyer: string | null;
  style: string | null;
  order_qty: number | null;
  submitted_at: string | null;
  good_today: number;
  reject_today: number;
  rework_today: number;
  cumulative_good_total: number;
  manpower_actual: number;
  hours_actual: number | null;
  actual_per_hour: number | null;
  ot_hours_actual: number;
  ot_manpower_actual: number | null;
  stage_name: string | null;
  actual_stage_progress: number | null;
  remarks: string | null;
  has_blocker: boolean | null;
  blocker_description: string | null;
  blocker_impact: string | null;
  blocker_owner: string | null;
  blocker_status: string | null;
  estimated_cost_value: number | null;
  estimated_cost_currency: string | null;
}

interface SewingSubmissionViewProps {
  target?: SewingTargetData | null;
  actual?: SewingActualData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditTarget?: () => void;
  onEditActual?: () => void;
  onDeleteTarget?: () => void;
  onDeleteActual?: () => void;
}

function VarianceIndicator({ actual, target }: { actual: number; target: number }) {
  if (target === 0) return <span className="text-muted-foreground flex items-center gap-1 text-xs"><Minus className="h-3 w-3" />—</span>;
  const pct = Math.round(((actual - target) / target) * 100);
  if (pct > 0) return <span className="text-green-600 dark:text-green-400 flex items-center gap-1 text-xs"><TrendingUp className="h-3 w-3" />+{pct}%</span>;
  if (pct < 0) return <span className="text-destructive flex items-center gap-1 text-xs"><TrendingDown className="h-3 w-3" />{pct}%</span>;
  return <span className="text-muted-foreground flex items-center gap-1 text-xs"><Minus className="h-3 w-3" />0%</span>;
}

function FieldDisplay({ label, value, className, suffix }: {
  label: string;
  value: string | number | null | undefined;
  className?: string;
  suffix?: string;
}) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
      <p className={`font-semibold ${className || ""}`}>
        {value != null ? (typeof value === "number" ? `${value.toLocaleString()}${suffix || ""}` : value) : "-"}
      </p>
    </div>
  );
}

export function SewingSubmissionView({ target, actual, open, onOpenChange, onEditTarget, onEditActual, onDeleteTarget, onDeleteActual }: SewingSubmissionViewProps) {
  const { factory } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { calculateEstimatedCost, getCurrencySymbol, isConfigured } = useHeadcountCost();
  const [deleteType, setDeleteType] = useState<"target" | "actual" | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (!target && !actual) return null;

  const handleDelete = async () => {
    if (!deleteType) return;
    setDeleting(true);
    try {
      const tableName = deleteType === "target" ? "sewing_targets" : "sewing_actuals";
      const id = deleteType === "target" ? target?.id : actual?.id;
      if (!id) return;

      const { error } = await supabase.from(tableName).delete().eq("id", id);
      if (error) throw error;

      toast.success(`${deleteType === "target" ? t('modals.target') : t('modals.output')} ${t('modals.deletedSuccess')}`);
      setDeleteType(null);
      onOpenChange(false);
      if (deleteType === "target") onDeleteTarget?.();
      else onDeleteActual?.();
    } catch (error: any) {
      toast.error(error?.message || t('modals.failedToDelete'));
    } finally {
      setDeleting(false);
    }
  };

  const formatDateTime = (dateString: string) => {
    const timezone = factory?.timezone || "Asia/Dhaka";
    return formatDateTimeInTimezone(dateString, timezone);
  };

  const hasTarget = !!target;
  const hasActual = !!actual;
  const isComparison = hasTarget && hasActual;

  // Primary record for header info (prefer actual since it's submitted later)
  const primary = actual || target!;

  // Title and icon based on mode
  const title = isComparison
    ? t('modals.sewingSubmission')
    : hasActual
      ? t('modals.sewingEndOfDay')
      : t('modals.sewingTarget');

  const Icon = hasActual ? SewingMachine : Crosshair;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        {/* Header bar */}
        <div className="px-6 pt-6 pb-4 border-b border-border/40">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm shadow-blue-500/20 flex items-center justify-center">
                <Icon className="h-4 w-4 text-white" />
              </div>
              {title}
            </DialogTitle>
          </DialogHeader>

          {/* Order info */}
          <div className="flex flex-wrap items-start gap-x-5 gap-y-1 mt-3 text-sm">
            <FieldDisplay label={t('modals.date')} value={formatDate(primary.production_date)} />
            <FieldDisplay label={t('modals.line')} value={primary.line_name} />
            <FieldDisplay label={t('modals.buyer')} value={primary.buyer} />
            <FieldDisplay label={t('modals.style')} value={primary.style} />
            <div>
              <p className="text-[11px] text-muted-foreground mb-0.5">{t('modals.poNumber')}</p>
              {primary.po_number ? (
                <button
                  className="font-semibold text-primary underline underline-offset-2 hover:text-primary/80 transition-colors cursor-pointer"
                  onClick={() => { onOpenChange(false); navigate(`/work-orders?po=${encodeURIComponent(primary.po_number!)}`); }}
                >
                  {primary.po_number}
                </button>
              ) : (
                <p className="font-semibold">-</p>
              )}
            </div>
            <FieldDisplay label={t('modals.orderQty')} value={primary.order_qty} />
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Two-column Target & Actual display */}
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            {/* Left Column: Target (blue) or placeholder */}
            {hasTarget && target ? (
              <div className="rounded-lg border-l-2 border-l-blue-500 border border-border/50 bg-blue-50/30 dark:bg-blue-950/10 p-4 space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-400 flex items-center gap-2">
                  <Crosshair className="h-3.5 w-3.5" />
                  {t('modals.morningTarget')}
                </h4>

                {/* Targets */}
                <div>
                  <div className="grid grid-cols-2 gap-3">
                    <FieldDisplay label={t('modals.perHourTarget')} value={target.per_hour_target} suffix=" /hr" className="text-lg text-primary" />
                    <FieldDisplay
                      label={t('modals.targetTotalOutput')}
                      value={
                        target.target_total_planned != null
                          ? target.target_total_planned
                          : target.hours_planned != null && target.hours_planned > 0
                            ? Math.round(target.per_hour_target * target.hours_planned)
                            : null
                      }
                      className="text-lg text-primary"
                    />
                  </div>
                </div>

                {/* Resources */}
                <div>
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">{t('modals.resources')}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FieldDisplay label={t('modals.manpowerPlanned')} value={target.manpower_planned} />
                    <FieldDisplay label={t('modals.hoursPlanned')} value={target.hours_planned} />
                    <FieldDisplay label={t('modals.otHoursPlanned')} value={target.ot_hours_planned} />
                  </div>
                </div>

                {/* Stage & Progress */}
                {(target.stage_name || target.planned_stage_progress != null || target.next_milestone) && (
                  <div>
                    <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">{t('modals.stageAndProgress')}</p>
                    <div className="grid grid-cols-2 gap-3">
                      {target.stage_name && (
                        <FieldDisplay label={t('modals.plannedStage')} value={target.stage_name} />
                      )}
                      {target.planned_stage_progress != null && (
                        <FieldDisplay label={t('modals.stageProgress')} value={target.planned_stage_progress} suffix="%" />
                      )}
                      {target.next_milestone && (
                        <FieldDisplay label={t('modals.nextMilestone')} value={target.next_milestone} />
                      )}
                      {target.estimated_ex_factory && (
                        <FieldDisplay label={t('modals.estExFactory')} value={formatDate(target.estimated_ex_factory)} />
                      )}
                    </div>
                  </div>
                )}

                {/* Remarks */}
                {target.remarks && (
                  <div>
                    <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-1">{t('modals.remarks')}</p>
                    <p className="text-sm text-muted-foreground">{target.remarks}</p>
                  </div>
                )}

                {/* Target Timestamp */}
                {target.submitted_at && (
                  <p className="text-xs text-muted-foreground pt-2 border-t border-border/40">
                    {t('modals.submitted')}: {formatDateTime(target.submitted_at)}
                  </p>
                )}

                {/* Admin Actions */}
                {(onEditTarget || onDeleteTarget) && (
                  <div className="flex gap-2 pt-2 border-t border-border/40">
                    {onEditTarget && (
                      <Button variant="outline" size="sm" onClick={onEditTarget}>
                        <Pencil className="h-4 w-4 mr-1" />
                        {t('modals.edit')}
                      </Button>
                    )}
                    {onDeleteTarget && (
                      <Button variant="destructive" size="sm" onClick={() => setDeleteType("target")}>
                        <Trash2 className="h-4 w-4 mr-1" />
                        {t('modals.delete')}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-4 flex flex-col items-center justify-center text-center min-h-[200px]">
                <Crosshair className="h-8 w-8 mb-2 opacity-40 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t('modals.morningTargetNotSubmitted')}</p>
              </div>
            )}

            {/* Right Column: Actual (green) or placeholder */}
            {hasActual && actual ? (
              <div className="rounded-lg border-l-2 border-l-emerald-500 border border-border/50 bg-emerald-50/30 dark:bg-emerald-950/10 p-4 space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                  <SewingMachine className="h-3.5 w-3.5" />
                  {t('modals.endOfDayActual')}
                </h4>

                {/* Output */}
                <div>
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">{t('modals.output')}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FieldDisplay
                      label={t('modals.outputPerHour')}
                      value={
                        actual.actual_per_hour != null
                          ? actual.actual_per_hour
                          : actual.hours_actual != null && actual.hours_actual > 0
                            ? Math.round((actual.good_today / actual.hours_actual) * 100) / 100
                            : null
                      }
                      suffix=" /hr"
                      className="text-lg text-success"
                    />
                    <FieldDisplay label={t('modals.goodOutput')} value={actual.good_today} className="text-lg text-success" />
                    <FieldDisplay label={t('modals.reject')} value={actual.reject_today} />
                    <FieldDisplay label={t('modals.rework')} value={actual.rework_today} />
                    <FieldDisplay label={t('modals.cumulativeGoodTotal')} value={actual.cumulative_good_total} className="text-lg" />
                  </div>
                </div>

                {/* Resources */}
                <div>
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">{t('modals.resources')}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FieldDisplay label={t('modals.manpowerActual')} value={actual.manpower_actual} />
                    <FieldDisplay label={t('modals.hoursActual')} value={actual.hours_actual} />
                    <FieldDisplay label={t('modals.otHoursActual')} value={actual.ot_hours_actual} />
                    {actual.ot_manpower_actual != null && actual.ot_manpower_actual > 0 && (
                      <FieldDisplay label={t('modals.otManpowerActual')} value={actual.ot_manpower_actual} />
                    )}
                  </div>
                </div>

                {/* Stage & Progress */}
                {(actual.stage_name || actual.actual_stage_progress != null) && (
                  <div>
                    <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">{t('modals.stageAndProgress')}</p>
                    <div className="grid grid-cols-2 gap-3">
                      {actual.stage_name && (
                        <FieldDisplay label={t('modals.actualStage')} value={actual.stage_name} />
                      )}
                      {actual.actual_stage_progress != null && (
                        <FieldDisplay label={t('modals.stageProgress')} value={actual.actual_stage_progress} suffix="%" />
                      )}
                    </div>
                  </div>
                )}

                {/* Blocker */}
                {actual.has_blocker && (
                  <div className={`p-3 rounded-lg border ${
                    actual.blocker_impact === 'critical' ? 'border-destructive/30 bg-destructive/5' :
                    actual.blocker_impact === 'high' ? 'border-orange-500/30 bg-orange-500/5' :
                    actual.blocker_impact === 'medium' ? 'border-warning/30 bg-warning/5' :
                    'border-success/30 bg-success/5'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-warning" />
                      <span className="font-semibold text-xs uppercase tracking-wide">{t('modals.blocker')}</span>
                      {actual.blocker_impact && (
                        <StatusBadge variant={actual.blocker_impact as any} size="sm">
                          {actual.blocker_impact}
                        </StatusBadge>
                      )}
                      {actual.blocker_status && (
                        <StatusBadge variant={actual.blocker_status === 'resolved' ? 'success' : 'default'} size="sm">
                          {actual.blocker_status}
                        </StatusBadge>
                      )}
                    </div>
                    <p className="text-sm">{actual.blocker_description || t('modals.noDescription')}</p>
                    {actual.blocker_owner && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <User className="h-3 w-3" />
                        {t('modals.owner')}: {actual.blocker_owner}
                      </p>
                    )}
                  </div>
                )}

                {/* Estimated Cost */}
                {(() => {
                  const sym = getCurrencySymbol();
                  const fmt = (v: number) => `${sym}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                  let regularCost: number | null = null;
                  let otCost: number | null = null;
                  let currency = 'BDT';
                  let isLive = false;

                  if (actual.estimated_cost_value != null) {
                    regularCost = actual.estimated_cost_value;
                    currency = actual.estimated_cost_currency || 'BDT';
                  } else if (isConfigured) {
                    const live = calculateEstimatedCost(actual.manpower_actual, actual.hours_actual);
                    if (live.value != null) {
                      regularCost = live.value;
                      currency = live.currency;
                      isLive = true;
                    }
                  }

                  if (isConfigured && actual.ot_hours_actual && actual.ot_manpower_actual) {
                    const ot = calculateEstimatedCost(actual.ot_manpower_actual, actual.ot_hours_actual);
                    if (ot.value != null) otCost = ot.value;
                  }

                  if (regularCost == null && otCost == null) return null;

                  const currSym = currency === 'USD' ? '$' : '৳';
                  const fmtCost = (v: number) => `${currSym}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

                  return (
                    <div className="p-3 rounded-lg border border-border/50 bg-muted/20">
                      <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">
                        Cost Estimate{isLive ? ' (current rate)' : ''}
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        {regularCost != null && (
                          <FieldDisplay label="Regular Cost" value={`${fmtCost(regularCost)} ${currency}`} />
                        )}
                        {otCost != null && (
                          <FieldDisplay label="OT Cost" value={`${fmt(otCost)} ${currency}`} />
                        )}
                      </div>
                      {regularCost != null && otCost != null && (
                        <div className="mt-2 pt-2 border-t border-border/40">
                          <FieldDisplay label="Total Cost" value={`${fmtCost(regularCost + otCost)} ${currency}`} className="text-lg font-bold" />
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Remarks */}
                {actual.remarks && (
                  <div>
                    <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-1">{t('modals.remarks')}</p>
                    <p className="text-sm text-muted-foreground">{actual.remarks}</p>
                  </div>
                )}

                {/* Actual Timestamp */}
                {actual.submitted_at && (
                  <p className="text-xs text-muted-foreground pt-2 border-t border-border/40">
                    {t('modals.submitted')}: {formatDateTime(actual.submitted_at)}
                  </p>
                )}

                {/* Admin Actions */}
                {(onEditActual || onDeleteActual) && (
                  <div className="flex gap-2 pt-2 border-t border-border/40">
                    {onEditActual && (
                      <Button variant="outline" size="sm" onClick={onEditActual}>
                        <Pencil className="h-4 w-4 mr-1" />
                        {t('modals.edit')}
                      </Button>
                    )}
                    {onDeleteActual && (
                      <Button variant="destructive" size="sm" onClick={() => setDeleteType("actual")}>
                        <Trash2 className="h-4 w-4 mr-1" />
                        {t('modals.delete')}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-4 flex flex-col items-center justify-center text-center min-h-[200px]">
                <SewingMachine className="h-8 w-8 mb-2 opacity-40 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t('modals.endOfDayNotSubmitted')}</p>
              </div>
            )}
          </div>

          {/* Comparison table (full width, below columns) */}
          {isComparison && target && actual && (
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/30 border-b border-border/40">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">{t('modals.targetVsActual')}</h4>
              </div>
              <div className="p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b">
                      <th className="text-left py-2 pr-4 font-medium">{t('modals.metric')}</th>
                      <th className="text-right py-2 px-3 font-medium">{t('modals.target')}</th>
                      <th className="text-right py-2 px-3 font-medium">{t('modals.actual')}</th>
                      <th className="text-right py-2 pl-3 font-medium">{t('modals.variance')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const rows: { label: string; tgt: number | null | undefined; act: number | null | undefined; suffix?: string; decimals?: number }[] = [
                        { label: t('modals.outputPerHour'), tgt: target.per_hour_target, act: actual.actual_per_hour, decimals: 2 },
                        { label: t('modals.totalOutput'), tgt: target.target_total_planned, act: actual.good_today },
                        { label: t('modals.hours'), tgt: target.hours_planned, act: actual.hours_actual },
                        { label: t('modals.manpower'), tgt: target.manpower_planned, act: actual.manpower_actual },
                        { label: t('modals.otHours'), tgt: target.ot_hours_planned, act: actual.ot_hours_actual },
                        { label: t('modals.stageProgress'), tgt: target.planned_stage_progress, act: actual.actual_stage_progress, suffix: "%" },
                      ];
                      return rows.map(({ label, tgt, act, suffix, decimals }) => (
                        <tr key={label} className="border-b border-muted/50 last:border-0">
                          <td className="py-2 pr-4 text-muted-foreground">{label}</td>
                          <td className="py-2 px-3 text-right text-muted-foreground">
                            {tgt != null ? `${decimals != null ? Number(tgt).toFixed(decimals) : tgt.toLocaleString()}${suffix || ""}` : "—"}
                          </td>
                          <td className="py-2 px-3 text-right font-medium">
                            {act != null ? `${decimals != null ? Number(act).toFixed(decimals) : act.toLocaleString()}${suffix || ""}` : "—"}
                          </td>
                          <td className="py-2 pl-3 text-right">
                            {tgt != null && act != null
                              ? <VarianceIndicator actual={act} target={tgt} />
                              : <span className="text-muted-foreground text-xs">—</span>
                            }
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteType} onOpenChange={(open) => !open && setDeleteType(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('modals.delete')} {deleteType === "target" ? t('modals.target') : t('modals.output')}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteType === "target" ? t('modals.deleteTargetConfirm') : t('modals.deleteSubmissionConfirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('modals.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t('modals.deleting')}</> : t('modals.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
