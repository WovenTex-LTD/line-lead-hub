import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Scissors } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useHeadcountCost } from "@/hooks/useHeadcountCost";
import { EstimatedCostDisplay } from "@/components/EstimatedCostDisplay";

interface CuttingActual {
  id: string;
  man_power: number | null;
  day_cutting: number;
  day_input: number;
  total_cutting: number | null;
  total_input: number | null;
  balance: number | null;
  hours_actual: number | null;
  ot_hours_actual: number | null;
  ot_manpower_actual: number | null;
  remarks?: string | null;
}

interface EditCuttingActualModalProps {
  submission: CuttingActual | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditCuttingActualModal({ submission, open, onOpenChange, onSaved }: EditCuttingActualModalProps) {
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
      const estimatedCost = calculateEstimatedCost(formData.man_power, formData.hours_actual);

      const { error } = await supabase
        .from('cutting_actuals')
        .update({
          man_power: formData.man_power ?? 0,
          day_cutting: formData.day_cutting ?? 0,
          day_input: formData.day_input ?? 0,
          total_cutting: formData.total_cutting || null,
          total_input: formData.total_input || null,
          balance: formData.balance || null,
          hours_actual: formData.hours_actual || null,
          ot_hours_actual: formData.ot_hours_actual || null,
          ot_manpower_actual: formData.ot_manpower_actual || null,
          remarks: formData.remarks || null,
          estimated_cost_value: estimatedCost.value,
          estimated_cost_currency: estimatedCost.value != null ? estimatedCost.currency : null,
        })
        .eq('id', submission.id);

      if (error) throw error;

      toast.success(t('modals.submissionUpdatedSuccess'));
      onOpenChange(false);
      onSaved();
    } catch (error: any) {
      console.error('Error updating cutting actual:', error);
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
            <Scissors className="h-5 w-5 text-primary" />
            {t('cutting.editCuttingActual')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="man_power">{t('cutting.manPower')}</Label>
            <Input
              id="man_power"
              type="number"
              value={formData.man_power ?? ''}
              onChange={(e) => handleNumberChange('man_power', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="day_cutting">{t('cutting.dayCutting')}</Label>
              <Input
                id="day_cutting"
                type="number"
                value={formData.day_cutting ?? ''}
                onChange={(e) => handleNumberChange('day_cutting', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="day_input">{t('cutting.dayInput')}</Label>
              <Input
                id="day_input"
                type="number"
                value={formData.day_input ?? ''}
                onChange={(e) => handleNumberChange('day_input', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="total_cutting">{t('cutting.totalCutting')}</Label>
              <Input
                id="total_cutting"
                type="number"
                value={formData.total_cutting ?? ''}
                onChange={(e) => handleNumberChange('total_cutting', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="total_input">{t('cutting.totalInput')}</Label>
              <Input
                id="total_input"
                type="number"
                value={formData.total_input ?? ''}
                onChange={(e) => handleNumberChange('total_input', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="balance">{t('cutting.balance')}</Label>
            <Input
              id="balance"
              type="number"
              value={formData.balance ?? ''}
              onChange={(e) => handleNumberChange('balance', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="hours_actual">{t('cutting.hoursActual')}</Label>
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
            <div className="space-y-2">
              <Label htmlFor="ot_hours_actual">{t('cutting.otHoursActual')}</Label>
              <Input
                id="ot_hours_actual"
                type="number"
                step="0.5"
                value={formData.ot_hours_actual ?? ''}
                onChange={(e) => handleNumberChange('ot_hours_actual', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ot_manpower_actual">{t('cutting.otManpowerActual')}</Label>
            <Input
              id="ot_manpower_actual"
              type="number"
              value={formData.ot_manpower_actual ?? ''}
              onChange={(e) => handleNumberChange('ot_manpower_actual', e.target.value)}
            />
          </div>

          <EstimatedCostDisplay
            manpower={String(formData.man_power ?? '')}
            hours={String(formData.hours_actual ?? '')}
          />

          <div className="space-y-2">
            <Label htmlFor="remarks">{t('cutting.remarks')}</Label>
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
