import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { VoiceNotes } from "@/components/voice/VoiceNotes";
import { Loader2, Crosshair } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SewingTarget {
  id: string;
  production_date: string;
  per_hour_target: number;
  manpower_planned: number;
  hours_planned: number | null;
  ot_hours_planned: number;
  remarks?: string | null;
}

interface EditSewingTargetModalProps {
  target: SewingTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditSewingTargetModal({ target, open, onOpenChange, onSaved }: EditSewingTargetModalProps) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});

  useEffect(() => {
    if (target) {
      setFormData({ ...target });
    }
  }, [target]);

  if (!target) return null;

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
      const perHour = formData.per_hour_target ?? 0;
      const hours = formData.hours_planned || 0;
      const { error } = await supabase
        .from('sewing_targets')
        .update({
          per_hour_target: perHour,
          manpower_planned: formData.manpower_planned ?? 0,
          hours_planned: formData.hours_planned || null,
          target_total_planned: hours > 0 ? Math.round(perHour * hours) : null,
          ot_hours_planned: formData.ot_hours_planned ?? 0,
          remarks: formData.remarks,
        })
        .eq('id', target.id);

      if (error) throw error;

      toast.success(t('modals.targetUpdatedSuccess'));
      onOpenChange(false);
      onSaved();
    } catch (error: any) {
      console.error('Error updating target:', error);
      toast.error(error?.message || t('modals.failedToUpdateTarget'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crosshair className="h-5 w-5 text-primary" />
            {t('modals.editSewingTarget')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="per_hour_target">{t('modals.perHourTarget')}</Label>
            <Input
              id="per_hour_target"
              type="number"
              value={formData.per_hour_target ?? ''}
              onChange={(e) => handleNumberChange('per_hour_target', e.target.value)}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="manpower_planned">{t('modals.manpowerPlanned')}</Label>
              <Input
                id="manpower_planned"
                type="number"
                value={formData.manpower_planned ?? ''}
                onChange={(e) => handleNumberChange('manpower_planned', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hours_planned">{t('modals.hoursPlanned')}</Label>
              <Input
                id="hours_planned"
                type="number"
                step="0.5"
                min="0"
                max="24"
                value={formData.hours_planned ?? ''}
                onChange={(e) => handleNumberChange('hours_planned', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ot_hours_planned">{t('modals.otHoursPlanned')}</Label>
            <Input
              id="ot_hours_planned"
              type="number"
              step="0.5"
              value={formData.ot_hours_planned ?? ''}
              onChange={(e) => handleNumberChange('ot_hours_planned', e.target.value)}
            />
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
            <VoiceNotes recordType="sewing_targets" recordId={target.id} />
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
