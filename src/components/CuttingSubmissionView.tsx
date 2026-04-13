import { useState } from "react";
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
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatDateTimeInTimezone } from "@/lib/date-utils";
import { useHeadcountCost } from "@/hooks/useHeadcountCost";
import { toast } from "sonner";
import {
  Scissors,
  Target,
  Crosshair,
  Package,
  ImageIcon,
  TrendingUp,
  TrendingDown,
  Minus,
  Pencil,
  Trash2,
  Loader2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

export interface CuttingTargetData {
  id: string;
  production_date: string;
  line_name: string;
  buyer: string | null;
  style: string | null;
  po_number: string | null;
  colour: string | null;
  order_qty: number | null;
  planned_ex_factory: string | null;
  submitted_at: string | null;
  man_power: number | null;
  marker_capacity: number | null;
  lay_capacity: number | null;
  cutting_capacity: number | null;
  under_qty: number | null;
  day_cutting: number | null;
  day_input: number | null;
  hours_planned: number | null;
  target_per_hour: number | null;
  ot_hours_planned: number | null;
  ot_manpower_planned: number | null;
}

export interface CuttingActualData {
  id: string;
  production_date: string;
  line_name: string;
  buyer: string | null;
  style: string | null;
  po_number: string | null;
  colour: string | null;
  order_qty: number | null;
  planned_ex_factory: string | null;
  submitted_at: string | null;
  man_power: number | null;
  marker_capacity: number | null;
  lay_capacity: number | null;
  cutting_capacity: number | null;
  under_qty: number | null;
  day_cutting: number;
  day_input: number;
  total_cutting: number | null;
  total_input: number | null;
  balance: number | null;
  hours_actual: number | null;
  actual_per_hour: number | null;
  ot_hours_actual: number | null;
  ot_manpower_actual: number | null;
  leftover_recorded: boolean | null;
  leftover_type: string | null;
  leftover_unit: string | null;
  leftover_quantity: number | null;
  leftover_notes: string | null;
  leftover_location: string | null;
  leftover_photo_urls?: string[] | null;
}

interface CuttingSubmissionViewProps {
  target?: CuttingTargetData | null;
  actual?: CuttingActualData | null;
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

function FieldDisplay({ label, value, className }: {
  label: string;
  value: string | number | null | undefined;
  className?: string;
}) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
      <p className={`font-semibold ${className || ""}`}>
        {value != null ? (typeof value === "number" ? value.toLocaleString() : value) : "-"}
      </p>
    </div>
  );
}

export function CuttingSubmissionView({ target, actual, open, onOpenChange, onEditTarget, onEditActual, onDeleteTarget, onDeleteActual }: CuttingSubmissionViewProps) {
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
      const tableName = deleteType === "target" ? "cutting_targets" : "cutting_actuals";
      const id = deleteType === "target" ? target?.id : actual?.id;
      if (!id) return;

      const { error } = await supabase.from(tableName).delete().eq("id", id);
      if (error) throw error;

      toast.success(`${deleteType === "target" ? t('cutting.target') : t('cutting.actual')} deleted successfully`);
      setDeleteType(null);
      onOpenChange(false);
      if (deleteType === "target") onDeleteTarget?.();
      else onDeleteActual?.();
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete");
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
    ? t('cutting.cuttingSubmission')
    : hasActual
      ? t('cutting.cuttingEndOfDay')
      : t('cutting.cuttingTarget');

  const Icon = hasActual ? Scissors : Target;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        <div className="px-6 py-4 border-b border-border/40">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 shadow-sm shadow-emerald-500/20 flex items-center justify-center">
                <Icon className="h-4 w-4 text-white" />
              </div>
              {title}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3 text-sm">
            <FieldDisplay label={t('cutting.date')} value={formatDate(primary.production_date)} />
            <FieldDisplay label={t('cutting.line')} value={primary.line_name} />
            <FieldDisplay label={t('cutting.buyer')} value={primary.buyer} />
            <FieldDisplay label={t('cutting.style')} value={primary.style} />
            <div>
              <p className="text-[11px] text-muted-foreground mb-0.5">{t('cutting.po')}</p>
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
            <FieldDisplay label={t('cutting.colour')} value={primary.colour} />
            <FieldDisplay label={t('cutting.orderQtyLabel')} value={primary.order_qty} />
            {primary.planned_ex_factory && <FieldDisplay label={t('forms.estimatedExFactory')} value={formatDate(primary.planned_ex_factory)} />}
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Part A: Two-column Target & Actual display */}
          <div className={`grid gap-4 ${isComparison ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2'}`}>
            {/* Left Column: Target (blue) or placeholder */}
            {hasTarget && target ? (
              <div className="rounded-lg border-l-2 border-l-emerald-500 border border-border/50 bg-emerald-50/30 dark:bg-emerald-950/10 p-4 space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                  <Crosshair className="h-4 w-4" />
                  {t('cutting.morningTarget')}
                </h4>

                {/* Target Capacities */}
                <div>
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">{t('cutting.capacities')}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FieldDisplay label={t('cutting.manPower')} value={target.man_power} />
                    <FieldDisplay label={t('cutting.markerCapacity')} value={target.marker_capacity} />
                    <FieldDisplay label={t('cutting.layCapacity')} value={target.lay_capacity} />
                    <FieldDisplay label={t('cutting.cuttingCapacity')} value={target.cutting_capacity} />
                    <FieldDisplay label={t('cutting.underQty')} value={target.under_qty} />
                    {target.hours_planned != null && (
                      <FieldDisplay label={t('cutting.hoursPlanned')} value={target.hours_planned} />
                    )}
                    {target.ot_hours_planned != null && (
                      <FieldDisplay label={t('cutting.otHoursPlanned')} value={target.ot_hours_planned} />
                    )}
                    {target.ot_manpower_planned != null && (
                      <FieldDisplay label={t('cutting.otManpowerPlanned')} value={target.ot_manpower_planned} />
                    )}
                  </div>
                </div>

                {/* Target Daily Output */}
                <div>
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">{t('cutting.dailyOutput')}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FieldDisplay label={t('cutting.dayCutting')} value={target.day_cutting ?? 0} className="text-lg text-success" />
                    <FieldDisplay label={t('cutting.dayInput')} value={target.day_input ?? 0} className="text-lg text-primary" />
                  </div>
                </div>

                {/* Target Timestamp */}
                {target.submitted_at && (
                  <p className="text-xs text-muted-foreground pt-2 border-t border-border/40">
                    {t('cutting.submitted')}: {formatDateTime(target.submitted_at)}
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
                <Target className="h-8 w-8 mb-2 opacity-40 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t('cutting.morningTargetNotSubmitted')}</p>
              </div>
            )}

            {/* Right Column: Actual (green) or placeholder */}
            {hasActual && actual ? (
              <div className="rounded-lg border-l-2 border-l-emerald-500 border border-border/50 bg-emerald-50/30 dark:bg-emerald-950/10 p-4 space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                  <Scissors className="h-4 w-4" />
                  {t('cutting.endOfDayActual')}
                </h4>

                {/* Actual Capacities */}
                <div>
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">{t('cutting.capacities')}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FieldDisplay label={t('cutting.manPower')} value={actual.man_power} />
                    <FieldDisplay label={t('cutting.markerCapacity')} value={actual.marker_capacity} />
                    <FieldDisplay label={t('cutting.layCapacity')} value={actual.lay_capacity} />
                    <FieldDisplay label={t('cutting.cuttingCapacity')} value={actual.cutting_capacity} />
                    <FieldDisplay label={t('cutting.underQty')} value={actual.under_qty} />
                    {actual.hours_actual != null && (
                      <FieldDisplay label={t('cutting.hoursActual')} value={actual.hours_actual} />
                    )}
                    {actual.ot_hours_actual != null && (
                      <FieldDisplay label={t('cutting.otHoursActual')} value={actual.ot_hours_actual} />
                    )}
                    {actual.ot_manpower_actual != null && (
                      <FieldDisplay label={t('cutting.otManpowerActual')} value={actual.ot_manpower_actual} />
                    )}
                  </div>
                </div>

                {/* Actual Daily Output */}
                <div>
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">{t('cutting.dailyOutput')}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FieldDisplay label={t('cutting.dayCutting')} value={actual.day_cutting} className="text-lg text-success" />
                    <FieldDisplay label={t('cutting.dayInput')} value={actual.day_input} className="text-lg text-primary" />
                  </div>
                </div>

                {/* Leftover / Fabric Saved */}
                {actual.leftover_recorded && (
                  <div className="border-t border-border/40 pt-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      {t('cutting.addLeftOverFabric')}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <FieldDisplay label={t('cutting.type')} value={actual.leftover_type} />
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Quantity</p>
                        <p className="font-semibold">
                          {actual.leftover_quantity?.toLocaleString() || "—"} {actual.leftover_unit || ""}
                        </p>
                      </div>
                      {actual.leftover_location && (
                        <div className="col-span-2">
                          <FieldDisplay label="Stored Location" value={actual.leftover_location} />
                        </div>
                      )}
                      {actual.leftover_notes && (
                        <div className="col-span-2">
                          <FieldDisplay label={t('cutting.remarks')} value={actual.leftover_notes} className="text-sm" />
                        </div>
                      )}
                    </div>
                    {actual.leftover_photo_urls && actual.leftover_photo_urls.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                          <ImageIcon className="h-3 w-3" />
                          Photos
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {actual.leftover_photo_urls.map((url, index) => (
                            <a
                              key={index}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-16 h-16 rounded-lg overflow-hidden border hover:opacity-80 transition-opacity"
                            >
                              <img src={url} alt={`Leftover ${index + 1}`} className="w-full h-full object-cover" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}


                {/* Actual Timestamp */}
                {actual.submitted_at && (
                  <p className="text-xs text-muted-foreground pt-2 border-t border-border/40">
                    {t('cutting.submitted')}: {formatDateTime(actual.submitted_at)}
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
                <Scissors className="h-8 w-8 mb-2 opacity-40 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t('cutting.endOfDayNotSubmitted')}</p>
              </div>
            )}
          </div>

          {/* Cumulative Totals (full width, below columns) */}
          {hasActual && actual && (
            <div className="rounded-lg border border-border/50 bg-muted/20 p-4 text-center">
              <h4 className="font-semibold text-sm mb-3 text-[#7e22ce] dark:text-[#c084fc]">{t('cutting.cumulativeTotals')}</h4>
              <div className="flex justify-center gap-8 md:gap-12">
                <FieldDisplay label={t('cutting.totalCutting')} value={actual.total_cutting} />
                <FieldDisplay label={t('cutting.totalInput')} value={actual.total_input} className="text-success" />
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('cutting.balance')}</p>
                  <p className={`text-xl font-bold ${actual.balance != null && actual.balance < 0 ? "text-destructive" : ""}`}>
                    {actual.balance?.toLocaleString() || "—"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Part B: Comparison table (full width, below columns) */}
          {isComparison && target && actual && (
            <div className="border rounded-lg p-4 bg-muted/30">
              <h4 className="font-semibold text-sm mb-3 flex items-center justify-between">
                <span>{t('cutting.targetVsActual')}</span>
                <Badge variant="outline" className="text-xs">{t('cutting.variance')}</Badge>
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b">
                      <th className="text-left py-2 pr-4 font-medium">{t('cutting.metric')}</th>
                      <th className="text-right py-2 px-3 font-medium">{t('cutting.target')}</th>
                      <th className="text-right py-2 px-3 font-medium">{t('cutting.actual')}</th>
                      <th className="text-right py-2 pl-3 font-medium">{t('cutting.variance')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const rows: { label: string; tgt: number | null | undefined; act: number | null | undefined; decimals?: number }[] = [
                        { label: t('cutting.outputPerHour'), tgt: target.target_per_hour, act: actual.actual_per_hour, decimals: 2 },
                        { label: t('cutting.dayCutting'), tgt: target.day_cutting, act: actual.day_cutting },
                        { label: t('cutting.dayInput'), tgt: target.day_input, act: actual.day_input },
                        { label: t('cutting.hours'), tgt: target.hours_planned, act: actual.hours_actual },
                        { label: t('cutting.manPower'), tgt: target.man_power, act: actual.man_power },
                        { label: t('cutting.cuttingCapacity'), tgt: target.cutting_capacity, act: actual.cutting_capacity },
                        { label: t('cutting.markerCapacity'), tgt: target.marker_capacity, act: actual.marker_capacity },
                        { label: t('cutting.layCapacity'), tgt: target.lay_capacity, act: actual.lay_capacity },
                        { label: t('cutting.underQty'), tgt: target.under_qty, act: actual.under_qty },
                        ...(target.ot_hours_planned != null || actual.ot_hours_actual != null
                          ? [{ label: t('cutting.otHours'), tgt: target.ot_hours_planned, act: actual.ot_hours_actual }]
                          : []),
                        ...(target.ot_manpower_planned != null || actual.ot_manpower_actual != null
                          ? [{ label: t('cutting.otManpower'), tgt: target.ot_manpower_planned, act: actual.ot_manpower_actual }]
                          : []),
                      ];
                      return rows.map(({ label, tgt, act, decimals }) => (
                        <tr key={label} className="border-b border-muted/50 last:border-0">
                          <td className="py-2 pr-4 text-muted-foreground">{label}</td>
                          <td className="py-2 px-3 text-right text-muted-foreground">
                            {tgt != null ? (decimals != null ? Number(tgt).toFixed(decimals) : tgt.toLocaleString()) : "—"}
                          </td>
                          <td className="py-2 px-3 text-right font-medium">
                            {act != null ? (decimals != null ? Number(act).toFixed(decimals) : act.toLocaleString()) : "—"}
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
          )}
        </div>
      </DialogContent>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteType} onOpenChange={(open) => !open && setDeleteType(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('modals.delete')} {deleteType === "target" ? t('cutting.target') : t('cutting.actual')}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the {deleteType === "target" ? "target" : "end of day"} submission.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('modals.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting...</> : t('modals.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
