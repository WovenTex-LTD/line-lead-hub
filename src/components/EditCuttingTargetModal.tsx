import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { VoiceNotes } from "@/components/voice/VoiceNotes";
import { Loader2, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CuttingTarget {
  id: string;
  man_power: number | null;
  marker_capacity: number | null;
  lay_capacity: number | null;
  cutting_capacity: number | null;
  under_qty: number | null;
  day_cutting: number | null;
  day_input: number | null;
  hours_planned: number | null;
  ot_hours_planned: number | null;
  ot_manpower_planned: number | null;
  remarks?: string | null;
}

interface EditCuttingTargetModalProps {
  target: CuttingTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditCuttingTargetModal({ target, open, onOpenChange, onSaved }: EditCuttingTargetModalProps) {
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
      const dayCutting = formData.day_cutting ?? 0;
      const hours = formData.hours_planned || 0;
      const { error } = await supabase
        .from('cutting_targets')
        .update({
          man_power: formData.man_power ?? 0,
          marker_capacity: formData.marker_capacity ?? 0,
          lay_capacity: formData.lay_capacity ?? 0,
          cutting_capacity: formData.cutting_capacity ?? 0,
          under_qty: formData.under_qty ?? 0,
          day_cutting: dayCutting,
          day_input: formData.day_input ?? 0,
          hours_planned: formData.hours_planned || null,
          target_per_hour: hours > 0 ? Math.round((dayCutting / hours) * 100) / 100 : null,
          ot_hours_planned: formData.ot_hours_planned || null,
          ot_manpower_planned: formData.ot_manpower_planned || null,
          remarks: formData.remarks || null,
        })
        .eq('id', target.id);

      if (error) throw error;

      toast.success(t('modals.targetUpdatedSuccess'));
      onOpenChange(false);
      onSaved();
    } catch (error: any) {
      console.error('Error updating cutting target:', error);
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
            <Target className="h-5 w-5 text-primary" />
            {t('cutting.editCuttingTarget')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="man_power">{t('cutting.manPower')}</Label>
              <Input
                id="man_power"
                type="number"
                value={formData.man_power ?? ''}
                onChange={(e) => handleNumberChange('man_power', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cutting_capacity">{t('cutting.cuttingCapacity')}</Label>
              <Input
                id="cutting_capacity"
                type="number"
                value={formData.cutting_capacity ?? ''}
                onChange={(e) => handleNumberChange('cutting_capacity', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="marker_capacity">{t('cutting.markerCapacity')}</Label>
              <Input
                id="marker_capacity"
                type="number"
                value={formData.marker_capacity ?? ''}
                onChange={(e) => handleNumberChange('marker_capacity', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lay_capacity">{t('cutting.layCapacity')}</Label>
              <Input
                id="lay_capacity"
                type="number"
                value={formData.lay_capacity ?? ''}
                onChange={(e) => handleNumberChange('lay_capacity', e.target.value)}
              />
            </div>
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

          <div className="space-y-2">
            <Label htmlFor="under_qty">{t('cutting.underQty')}</Label>
            <Input
              id="under_qty"
              type="number"
              value={formData.under_qty ?? ''}
              onChange={(e) => handleNumberChange('under_qty', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="hours_planned">{t('cutting.hoursPlanned')}</Label>
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
            <div className="space-y-2">
              <Label htmlFor="ot_hours_planned">{t('cutting.otHoursPlanned')}</Label>
              <Input
                id="ot_hours_planned"
                type="number"
                step="0.5"
                value={formData.ot_hours_planned ?? ''}
                onChange={(e) => handleNumberChange('ot_hours_planned', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ot_manpower_planned">{t('cutting.otManpowerPlanned')}</Label>
            <Input
              id="ot_manpower_planned"
              type="number"
              value={formData.ot_manpower_planned ?? ''}
              onChange={(e) => handleNumberChange('ot_manpower_planned', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="remarks">{t('cutting.remarks')}</Label>
            <Textarea
              id="remarks"
              value={formData.remarks ?? ''}
              onChange={(e) => handleChange('remarks', e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Voice note</Label>
            <VoiceNotes recordType="cutting_targets" recordId={target.id} />
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
