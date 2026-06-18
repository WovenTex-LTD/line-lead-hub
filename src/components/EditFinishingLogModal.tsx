import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { VoiceNotes } from "@/components/voice/VoiceNotes";
import { Loader2, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface FinishingLog {
  id: string;
  log_type: "TARGET" | "OUTPUT";
  thread_cutting: number;
  inside_check: number;
  top_side_check: number;
  buttoning: number;
  iron: number;
  get_up: number;
  poly: number;
  carton: number;
  planned_hours: number | null;
  actual_hours: number | null;
  remarks: string | null;
}

interface EditFinishingLogModalProps {
  log: FinishingLog | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditFinishingLogModal({ log, open, onOpenChange, onSaved }: EditFinishingLogModalProps) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});

  useEffect(() => {
    if (log) {
      setFormData({ ...log });
    }
  }, [log]);

  if (!log) return null;

  const isTarget = log.log_type === "TARGET";

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
      const updateData: Record<string, any> = {
        thread_cutting: formData.thread_cutting ?? 0,
        inside_check: formData.inside_check ?? 0,
        top_side_check: formData.top_side_check ?? 0,
        buttoning: formData.buttoning ?? 0,
        iron: formData.iron ?? 0,
        get_up: formData.get_up ?? 0,
        poly: formData.poly ?? 0,
        carton: formData.carton ?? 0,
        remarks: formData.remarks || null,
      };

      if (isTarget) {
        updateData.m_power_planned = formData.m_power_planned || null;
        updateData.planned_hours = formData.planned_hours || null;
      } else {
        updateData.m_power_actual = formData.m_power_actual || null;
        updateData.actual_hours = formData.actual_hours || null;
      }

      const { error } = await supabase
        .from('finishing_daily_logs')
        .update(updateData)
        .eq('id', log.id);

      if (error) throw error;

      toast.success(t('modals.submissionUpdatedSuccess'));
      onOpenChange(false);
      onSaved();
    } catch (error: any) {
      console.error('Error updating finishing log:', error);
      toast.error(error?.message || t('modals.failedToUpdateSubmission'));
    } finally {
      setSaving(false);
    }
  };

  const processFields = [
    { key: "thread_cutting", label: "threadCutting" },
    { key: "inside_check", label: "insideCheck" },
    { key: "top_side_check", label: "topSideCheck" },
    { key: "buttoning", label: "buttoning" },
    { key: "iron", label: "iron" },
    { key: "get_up", label: "getUp" },
    { key: "poly", label: "poly" },
    { key: "carton", label: "carton" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            {isTarget ? t('modals.editFinishingTarget') : t('modals.editFinishingOutput')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            {processFields.map(({ key, label }) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={key}>{t('modals.' + label)}</Label>
                <Input
                  id={key}
                  type="number"
                  value={formData[key] ?? ''}
                  onChange={(e) => handleNumberChange(key, e.target.value)}
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="m_power">
                {isTarget ? t('modals.mPowerPlanned') : t('modals.mPowerActual')}
              </Label>
              <Input
                id="m_power"
                type="number"
                min="0"
                value={isTarget ? (formData.m_power_planned ?? '') : (formData.m_power_actual ?? '')}
                onChange={(e) => handleNumberChange(isTarget ? 'm_power_planned' : 'm_power_actual', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hours">
                {isTarget ? t('modals.plannedHours') : t('modals.actualHours')}
              </Label>
              <Input
                id="hours"
                type="number"
                step="0.5"
                min="0"
                max="24"
                value={isTarget ? (formData.planned_hours ?? '') : (formData.actual_hours ?? '')}
                onChange={(e) => handleNumberChange(isTarget ? 'planned_hours' : 'actual_hours', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="remarks">{t('modals.remarks')}</Label>
            <Textarea
              id="remarks"
              value={formData.remarks ?? ''}
              onChange={(e) => handleChange('remarks', e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Voice note</Label>
            <VoiceNotes recordType="finishing_daily_logs" recordId={log.id} />
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
