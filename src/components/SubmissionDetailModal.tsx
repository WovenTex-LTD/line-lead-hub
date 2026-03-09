import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Clock, Package, Scissors, Warehouse, AlertTriangle, User, CalendarDays, Pencil, Trash2, Loader2 } from "lucide-react";
import { SewingMachine } from "@/components/icons/SewingMachine";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { EditSubmissionModal } from "./EditSubmissionModal";
import { formatDate, formatDateTimeInTimezone } from "@/lib/date-utils";
import { useHeadcountCost } from "@/hooks/useHeadcountCost";

interface SewingSubmission {
  id: string;
  type: 'sewing';
  line_name: string;
  po_number: string | null;
  buyer: string | null;
  style: string | null;
  output_qty: number;
  target_qty: number | null;
  manpower: number | null;
  reject_qty: number | null;
  rework_qty: number | null;
  stage_name?: string | null;
  stage_progress: number | null;
  next_milestone?: string | null;
  ot_hours: number | null;
  ot_manpower: number | null;
  estimated_cost_value: number | null;
  estimated_cost_currency: string | null;
  has_blocker: boolean;
  blocker_description: string | null;
  blocker_impact: string | null;
  blocker_owner: string | null;
  blocker_status: string | null;
  notes: string | null;
  submitted_at: string;
  production_date: string;
}

interface FinishingSubmission {
  id: string;
  type: 'finishing';
  line_name: string;
  po_number: string | null;
  buyer_name: string | null;
  style_no: string | null;
  item_name: string | null;
  order_quantity: number | null;
  unit_name: string | null;
  floor_name: string | null;
  m_power: number | null;
  per_hour_target: number | null;
  day_qc_pass: number | null;
  total_qc_pass: number | null;
  day_poly: number | null;
  total_poly: number | null;
  average_production: number | null;
  day_over_time: number | null;
  total_over_time: number | null;
  day_hour: number | null;
  total_hour: number | null;
  day_carton: number | null;
  total_carton: number | null;
  ot_manpower_actual: number | null;
  estimated_cost_value: number | null;
  estimated_cost_currency: string | null;
  remarks: string | null;
  has_blocker: boolean;
  blocker_description: string | null;
  blocker_impact: string | null;
  blocker_owner: string | null;
  blocker_status: string | null;
  submitted_at: string;
  production_date: string;
}

type Submission = SewingSubmission | FinishingSubmission;

interface SubmissionDetailModalProps {
  submission: Submission | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
  onUpdated?: () => void;
}

export function SubmissionDetailModal({ submission, open, onOpenChange, onDeleted, onUpdated }: SubmissionDetailModalProps) {
  const { t } = useTranslation();
  const { isAdminOrHigher, factory } = useAuth();
  const { calculateEstimatedCost, getCurrencySymbol, isConfigured: costConfigured } = useHeadcountCost();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Helper to format datetime in factory timezone
  const formatDateTime = (dateString: string) => {
    const timezone = factory?.timezone || "Asia/Dhaka";
    return formatDateTimeInTimezone(dateString, timezone);
  };

  if (!submission) return null;

  const isSewing = submission.type === 'sewing';
  const isAdmin = isAdminOrHigher();

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const tableName = isSewing ? 'production_updates_sewing' : 'production_updates_finishing';
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', submission.id);

      if (error) throw error;

      toast.success(t('modals.submissionDeletedSuccess'));
      setDeleteDialogOpen(false);
      onOpenChange(false);
      onDeleted?.();
    } catch (error: any) {
      console.error('Error deleting submission:', error);
      toast.error(error?.message || t('modals.failedToDeleteSubmission'));
    } finally {
      setDeleting(false);
    }
  };

  const handleEditSaved = () => {
    setEditModalOpen(false);
    onUpdated?.();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {submission.type === 'sewing' ? (
                <SewingMachine className="h-5 w-5 text-primary" />
              ) : (
                <Package className="h-5 w-5 text-violet-600" />
              )}
              {submission.line_name}
              <StatusBadge variant={submission.type} size="sm">{submission.type}</StatusBadge>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Meta Info */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <CalendarDays className="h-4 w-4" />
                {formatDate(submission.production_date)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {formatDateTime(submission.submitted_at)}
              </span>
            </div>

            {/* Order Info */}
            {submission.po_number && (
              <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                <p className="text-sm font-medium">{t('modals.orderDetails')}</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">{t('modals.poNumber')}: </span>
                    <span className="font-mono">{submission.po_number}</span>
                  </div>
                  {isSewing && (submission as SewingSubmission).buyer && (
                    <div>
                      <span className="text-muted-foreground">{t('modals.buyer')}: </span>
                      <span>{(submission as SewingSubmission).buyer}</span>
                    </div>
                  )}
                  {!isSewing && (submission as FinishingSubmission).buyer_name && (
                    <div>
                      <span className="text-muted-foreground">{t('modals.buyer')}: </span>
                      <span>{(submission as FinishingSubmission).buyer_name}</span>
                    </div>
                  )}
                  {isSewing && (submission as SewingSubmission).style && (
                    <div>
                      <span className="text-muted-foreground">{t('modals.style')}: </span>
                      <span>{(submission as SewingSubmission).style}</span>
                    </div>
                  )}
                  {!isSewing && (submission as FinishingSubmission).style_no && (
                    <div>
                      <span className="text-muted-foreground">{t('modals.style')}: </span>
                      <span>{(submission as FinishingSubmission).style_no}</span>
                    </div>
                  )}
                  {!isSewing && (submission as FinishingSubmission).item_name && (
                    <div>
                      <span className="text-muted-foreground">Item: </span>
                      <span>{(submission as FinishingSubmission).item_name}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Production Metrics */}
            <div>
              <p className="text-sm font-medium mb-2">{t('modals.productionMetrics')}</p>
              <div className="grid grid-cols-2 gap-3">
                {isSewing ? (
                  <>
                    {((submission as SewingSubmission).stage_name || (submission as SewingSubmission).next_milestone) && (
                      <div className="col-span-2 p-2 bg-primary/10 rounded-lg flex gap-6">
                        {(submission as SewingSubmission).stage_name && (
                          <div>
                            <p className="text-xs text-muted-foreground">{t('modals.plannedStage')}</p>
                            <p className="font-semibold">{(submission as SewingSubmission).stage_name}</p>
                          </div>
                        )}
                        {(submission as SewingSubmission).next_milestone && (
                          <div>
                            <p className="text-xs text-muted-foreground">{t('modals.nextMilestone')}</p>
                            <p className="font-semibold">{(submission as SewingSubmission).next_milestone}</p>
                          </div>
                        )}
                      </div>
                    )}
                    <MetricCard label={t('modals.output')} value={(submission as SewingSubmission).output_qty} />
                    <MetricCard label={t('modals.target')} value={(submission as SewingSubmission).target_qty} />
                    <MetricCard label={t('modals.manpower')} value={(submission as SewingSubmission).manpower} />
                    <MetricCard label={t('modals.progress')} value={(submission as SewingSubmission).stage_progress} suffix="%" />
                    <MetricCard label={t('modals.reject')} value={(submission as SewingSubmission).reject_qty} />
                    <MetricCard label={t('modals.rework')} value={(submission as SewingSubmission).rework_qty} />
                    <MetricCard label={t('modals.otHoursActual')} value={(submission as SewingSubmission).ot_hours} />
                    <MetricCard label={t('modals.otManpowerActual')} value={(submission as SewingSubmission).ot_manpower} />
                  </>
                ) : (
                  <>
                    <MetricCard label={t('modals.mPower')} value={(submission as FinishingSubmission).m_power} />
                    <MetricCard label={t('modals.perHourTarget')} value={(submission as FinishingSubmission).per_hour_target} />
                    <MetricCard label={t('modals.dayQcPass')} value={(submission as FinishingSubmission).day_qc_pass} />
                    <MetricCard label={t('modals.totalQcPass')} value={(submission as FinishingSubmission).total_qc_pass} />
                    <MetricCard label={t('modals.dayPoly')} value={(submission as FinishingSubmission).day_poly} />
                    <MetricCard label={t('modals.totalPoly')} value={(submission as FinishingSubmission).total_poly} />
                    <MetricCard label={t('modals.avgProduction')} value={(submission as FinishingSubmission).average_production} />
                    <MetricCard label={t('modals.dayOT')} value={(submission as FinishingSubmission).day_over_time} />
                    <MetricCard label={t('modals.totalOT')} value={(submission as FinishingSubmission).total_over_time} />
                    <MetricCard label={t('modals.dayHour')} value={(submission as FinishingSubmission).day_hour} />
                    <MetricCard label={t('modals.totalHour')} value={(submission as FinishingSubmission).total_hour} />
                    <MetricCard label={t('modals.dayCarton')} value={(submission as FinishingSubmission).day_carton} />
                    <MetricCard label={t('modals.totalCarton')} value={(submission as FinishingSubmission).total_carton} />
                    <MetricCard label={t('modals.otManpowerActual')} value={(submission as FinishingSubmission).ot_manpower_actual} />
                    <MetricCard label={t('modals.orderQty')} value={(submission as FinishingSubmission).order_quantity} />
                  </>
                )}
              </div>
            </div>

            {/* Blocker Section */}
            {submission.has_blocker && (
              <div className={`p-3 rounded-lg border ${
                submission.blocker_impact === 'critical' ? 'border-destructive/30 bg-destructive/5' :
                submission.blocker_impact === 'high' ? 'border-orange-500/30 bg-orange-500/5' :
                submission.blocker_impact === 'medium' ? 'border-warning/30 bg-warning/5' :
                'border-success/30 bg-success/5'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <span className="font-medium text-sm">{t('modals.blocker')}</span>
                  {submission.blocker_impact && (
                    <StatusBadge variant={submission.blocker_impact as any} size="sm">
                      {submission.blocker_impact}
                    </StatusBadge>
                  )}
                  {submission.blocker_status && (
                    <StatusBadge variant={submission.blocker_status === 'resolved' ? 'success' : 'default'} size="sm">
                      {submission.blocker_status}
                    </StatusBadge>
                  )}
                </div>
                <p className="text-sm mb-2">{submission.blocker_description || t('modals.noDescription')}</p>
                {submission.blocker_owner && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {t('modals.owner')}: {submission.blocker_owner}
                  </p>
                )}
              </div>
            )}

            {/* Cost Estimate */}
            {(() => {
              const fmt = (v: number, sym: string) => `${sym}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              let regularCost: number | null = null;
              let otCost: number | null = null;
              let currency = 'BDT';
              let isLive = false;

              if (isSewing) {
                const s = submission as SewingSubmission;
                if (s.estimated_cost_value != null) {
                  regularCost = s.estimated_cost_value;
                  currency = s.estimated_cost_currency || 'BDT';
                } else if (costConfigured) {
                  const live = calculateEstimatedCost(s.manpower, s.ot_hours);
                  if (live.value != null) { regularCost = live.value; currency = live.currency; isLive = true; }
                }
                if (costConfigured && s.ot_hours && s.ot_manpower) {
                  const ot = calculateEstimatedCost(s.ot_manpower, s.ot_hours);
                  if (ot.value != null) otCost = ot.value;
                }
              } else {
                const f = submission as FinishingSubmission;
                if (f.estimated_cost_value != null) {
                  regularCost = f.estimated_cost_value;
                  currency = f.estimated_cost_currency || 'BDT';
                } else if (costConfigured) {
                  const live = calculateEstimatedCost(f.m_power, f.day_hour);
                  if (live.value != null) { regularCost = live.value; currency = live.currency; isLive = true; }
                }
                if (costConfigured && f.day_over_time && f.ot_manpower_actual) {
                  const ot = calculateEstimatedCost(f.ot_manpower_actual, f.day_over_time);
                  if (ot.value != null) otCost = ot.value;
                }
              }

              if (regularCost == null && otCost == null) return null;

              const sym = currency === 'USD' ? '$' : '৳';
              return (
                <div className="p-3 rounded-lg border border-primary/20 bg-primary/5">
                  <p className="text-sm font-medium mb-2">
                    Cost Estimate{isLive ? ' (current rate)' : ''}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {regularCost != null && (
                      <div>
                        <p className="text-xs text-muted-foreground">Regular Cost</p>
                        <p className="font-mono font-semibold">{fmt(regularCost, sym)} {currency}</p>
                      </div>
                    )}
                    {otCost != null && (
                      <div>
                        <p className="text-xs text-muted-foreground">OT Cost</p>
                        <p className="font-mono font-semibold">{fmt(otCost, sym)} {currency}</p>
                      </div>
                    )}
                  </div>
                  {regularCost != null && otCost != null && (
                    <div className="mt-2 pt-2 border-t border-primary/10">
                      <p className="text-xs text-muted-foreground">Total Cost</p>
                      <p className="font-mono font-semibold text-lg">{fmt(regularCost + otCost, sym)} {currency}</p>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Notes/Remarks */}
            {(isSewing ? (submission as SewingSubmission).notes : (submission as FinishingSubmission).remarks) && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-sm font-medium mb-1">{t('modals.notes')}</p>
                <p className="text-sm text-muted-foreground">
                  {isSewing ? (submission as SewingSubmission).notes : (submission as FinishingSubmission).remarks}
                </p>
              </div>
            )}
          </div>

          {/* Admin Actions */}
          {isAdmin && (
            <DialogFooter className="mt-4 pt-4 border-t">
              <Button variant="outline" size="sm" onClick={() => setEditModalOpen(true)}>
                <Pencil className="h-4 w-4 mr-1" />
                {t('modals.edit')}
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
                <Trash2 className="h-4 w-4 mr-1" />
                {t('modals.delete')}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('modals.deleteSubmission')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('modals.deleteSubmissionTypeConfirm', { type: isSewing ? t('forms.sewing') : t('forms.finishing') })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('modals.cancel')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t('modals.deleting')}</>
              ) : (
                t('modals.delete')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Modal */}
      <EditSubmissionModal
        submission={submission}
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        onSaved={handleEditSaved}
      />
    </>
  );
}

function MetricCard({ label, value, suffix = '' }: { label: string; value: number | null | undefined; suffix?: string }) {
  return (
    <div className="p-2 bg-muted/50 rounded-lg">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono font-semibold">
        {value != null ? `${value.toLocaleString()}${suffix}` : '-'}
      </p>
    </div>
  );
}
