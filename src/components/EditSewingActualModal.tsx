import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { SewingMachine } from "@/components/icons/SewingMachine";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useHeadcountCost } from "@/hooks/useHeadcountCost";
import { EstimatedCostDisplay } from "@/components/EstimatedCostDisplay";

interface SewingActual {
  id: string;
  production_date: string;
  good_today: number;
  reject_today: number;
  rework_today: number;
  manpower_actual: number;
  hours_actual: number | null;
  ot_hours_actual: number;
  ot_manpower_actual: number | null;
  cumulative_good_total: number;
  remarks?: string | null;
}

interface EditSewingActualModalProps {
  submission: SewingActual | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditSewingActualModal({ submission, open, onOpenChange, onSaved }: EditSewingActualModalProps) {
  const { t } = useTranslation();
  const { calculateEstimatedCost } = useHeadcountCost();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});

  useEffect(() => {
    if (submission) {
      setFormData({ ...submission });
    }
  }, [submission]);

  if (!submission) return null;

  const handleNumberChange = (field: string, value: string) => {
    const num = value === '' ? 0 : parseFloat(value);
    setFormData(prev => ({ ...prev, [field]: num }));
  };

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const estimatedCost = calculateEstimatedCost(formData.manpower_actual, formData.hours_actual);

      const { error } = await supabase
        .from('sewing_actuals')
        .update({
          good_today: formData.good_today ?? 0,
          reject_today: formData.reject_today ?? 0,
          rework_today: formData.rework_today ?? 0,
          manpower_actual: formData.manpower_actual ?? 0,
          hours_actual: formData.hours_actual || null,
          ot_hours_actual: formData.ot_hours_actual ?? 0,
          ot_manpower_actual: formData.ot_manpower_actual ?? 0,
          remarks: formData.remarks,
          estimated_cost_value: estimatedCost.value,
          estimated_cost_currency: estimatedCost.value != null ? estimatedCost.currency : null,
        })
        .eq('id', submission.id);

      if (error) throw error;

      toast.success(t('modals.submissionUpdatedSuccess'));
      onOpenChange(false);
      onSaved();
    } catch (error: any) {
      console.error('Error updating submission:', error);
      toast.error(error?.message || t('modals.failedToUpdateSubmission'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SewingMachine className="h-5 w-5 text-primary" />
            {t('modals.editSewingSubmission')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="good_today">{t('modals.goodToday')}</Label>
              <Input
                id="good_today"
                type="number"
                value={formData.good_today ?? ''}
                onChange={(e) => handleNumberChange('good_today', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reject_today">{t('modals.rejectToday')}</Label>
              <Input
                id="reject_today"
                type="number"
                value={formData.reject_today ?? ''}
                onChange={(e) => handleNumberChange('reject_today', e.target.value)}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rework_today">{t('modals.reworkToday')}</Label>
              <Input
                id="rework_today"
                type="number"
                value={formData.rework_today ?? ''}
                onChange={(e) => handleNumberChange('rework_today', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="manpower_actual">{t('modals.manpower')}</Label>
              <Input
                id="manpower_actual"
                type="number"
                value={formData.manpower_actual ?? ''}
                onChange={(e) => handleNumberChange('manpower_actual', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hours_actual">{t('modals.hoursActual')}</Label>
            <Input
              id="hours_actual"
              type="number"
              step="0.5"
              min="0"
              max="24"
              value={formData.hours_actual ?? ''}
              onChange={(e) => handleNumberChange('hours_actual', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ot_hours_actual">{t('modals.otHours')}</Label>
              <Input
                id="ot_hours_actual"
                type="number"
                step="0.5"
                value={formData.ot_hours_actual ?? ''}
                onChange={(e) => handleNumberChange('ot_hours_actual', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ot_manpower_actual">{t('modals.otManpower')}</Label>
              <Input
                id="ot_manpower_actual"
                type="number"
                value={formData.ot_manpower_actual ?? ''}
                onChange={(e) => handleNumberChange('ot_manpower_actual', e.target.value)}
              />
            </div>
          </div>

          <EstimatedCostDisplay
            manpower={String(formData.manpower_actual ?? '')}
            hours={String(formData.hours_actual ?? '')}
          />

          <div className="space-y-2">
            <Label htmlFor="remarks">{t('modals.remarks')}</Label>
            <Textarea
              id="remarks"
              value={formData.remarks ?? ''}
              onChange={(e) => handleChange('remarks', e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('modals.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t('modals.saving')}</>
            ) : (
              t('modals.saveChanges')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
