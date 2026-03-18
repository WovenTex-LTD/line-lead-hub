import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { isLateForCutoff, getTodayInTimezone } from "@/lib/date-utils";

interface Line {
  id: string;
  line_id: string;
  name: string | null;
  unit_id: string | null;
  floor_id: string | null;
}

interface WorkOrder {
  id: string;
  po_number: string;
  buyer: string;
  style: string;
  item: string | null;
  order_qty: number;
  line_id: string | null;
}

interface Unit {
  id: string;
  name: string;
}

interface Floor {
  id: string;
  name: string;
  unit_id: string;
}

export default function FinishingMorningTargets() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { user, profile, factory, isAdminOrHigher } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const dateLocale = i18n.language === 'bn' ? 'bn-BD' : 'en-US';

  // Master data
  const [lines, setLines] = useState<Line[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);

  // Form state
  const [selectedLineId, setSelectedLineId] = useState("");
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState("");
  const [perHourTarget, setPerHourTarget] = useState("");
  const [mPowerPlanned, setMPowerPlanned] = useState("");
  const [dayHourPlanned, setDayHourPlanned] = useState("");
  const [dayOverTimePlanned, setDayOverTimePlanned] = useState("0");
  const [remarks, setRemarks] = useState("");

  // Auto-filled
  const [unitName, setUnitName] = useState("");
  const [floorName, setFloorName] = useState("");

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  const filteredWorkOrders = useMemo(() => {
    if (!selectedLineId) return workOrders;
    return workOrders.filter(wo => wo.line_id === selectedLineId || !wo.line_id);
  }, [workOrders, selectedLineId]);

  const selectedWorkOrder = useMemo(() => {
    return workOrders.find(wo => wo.id === selectedWorkOrderId);
  }, [workOrders, selectedWorkOrderId]);

  useEffect(() => {
    if (profile?.factory_id) {
      fetchFormData();
    }
  }, [profile?.factory_id]);

  useEffect(() => {
    if (selectedLineId) {
      const line = lines.find(l => l.id === selectedLineId);
      if (line) {
        const unit = units.find(u => u.id === line.unit_id);
        const floor = floors.find(f => f.id === line.floor_id);
        setUnitName(unit?.name || "");
        setFloorName(floor?.name || "");
      }
    } else {
      setUnitName("");
      setFloorName("");
    }
  }, [selectedLineId, lines, units, floors]);

  async function fetchFormData() {
    if (!profile?.factory_id) return;

    try {
      const [linesRes, workOrdersRes, unitsRes, floorsRes, assignmentsRes] = await Promise.all([
        supabase.from("lines").select("*").eq("factory_id", profile.factory_id).eq("is_active", true),
        supabase.from("work_orders").select("*").eq("factory_id", profile.factory_id).eq("is_active", true),
        supabase.from("units").select("*").eq("factory_id", profile.factory_id).eq("is_active", true),
        supabase.from("floors").select("*").eq("factory_id", profile.factory_id).eq("is_active", true),
        supabase.from("user_line_assignments").select("line_id").eq("user_id", user?.id || ""),
      ]);

      let availableLines = linesRes.data || [];
      
      if (!isAdminOrHigher() && assignmentsRes.data && assignmentsRes.data.length > 0) {
        const assignedLineIds = assignmentsRes.data.map(a => a.line_id);
        availableLines = availableLines.filter(l => assignedLineIds.includes(l.id));
      }

      setLines(availableLines);
      setWorkOrders(workOrdersRes.data || []);
      setUnits(unitsRes.data || []);
      setFloors(floorsRes.data || []);
    } catch (error) {
      console.error("Error fetching form data:", error);
      toast.error(t("common.submissionFailed"));
    } finally {
      setLoading(false);
    }
  }

  function validateForm(): boolean {
    const newErrors: Record<string, string> = {};

    if (!selectedLineId) newErrors.line = t("forms.lineRequired");
    if (!selectedWorkOrderId) newErrors.workOrder = t("forms.poRequired");
    if (!perHourTarget || parseInt(perHourTarget) <= 0) newErrors.perHourTarget = t("forms.targetRequired");
    if (!mPowerPlanned || parseInt(mPowerPlanned) <= 0) newErrors.mPowerPlanned = t("forms.mPowerRequired");
    if (!dayHourPlanned || parseFloat(dayHourPlanned) < 0) newErrors.dayHourPlanned = t("forms.dayHoursRequired");
    if (dayOverTimePlanned === "" || parseFloat(dayOverTimePlanned) < 0) newErrors.dayOverTimePlanned = t("forms.otHoursRequired");

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!validateForm()) {
      toast.error(t("common.fillRequiredFields"));
      return;
    }

    if (!profile?.factory_id || !user?.id) {
      toast.error(t("common.submissionFailed"));
      return;
    }

    setSubmitting(true);

    try {
      // Check if submission is late (using factory timezone)
      const timezone = factory?.timezone || "Asia/Dhaka";
      const isLate = factory?.morning_target_cutoff
        ? isLateForCutoff(factory.morning_target_cutoff, timezone)
        : false;

      const insertData = {
        factory_id: profile.factory_id,
        production_date: getTodayInTimezone(timezone),
        submitted_by: user.id,
        line_id: selectedLineId,
        work_order_id: selectedWorkOrderId,
        unit_name: unitName,
        floor_name: floorName,
        buyer_name: selectedWorkOrder?.buyer || "",
        style_no: selectedWorkOrder?.style || "",
        item_name: selectedWorkOrder?.item || "",
        order_qty: selectedWorkOrder?.order_qty || 0,
        per_hour_target: parseInt(perHourTarget),
        m_power_planned: parseInt(mPowerPlanned),
        day_hour_planned: parseFloat(dayHourPlanned),
        day_over_time_planned: parseFloat(dayOverTimePlanned),
        remarks: remarks || null,
        is_late: isLate,
      };

      const { error } = await supabase.from("finishing_targets").insert(insertData as any);

      if (error) {
        if (error.code === "23505") {
          toast.error(t("common.submissionFailed"));
        } else {
          throw error;
        }
        return;
      }

      toast.success(t("common.submissionSuccess"));
      
      if (isAdminOrHigher()) {
        navigate("/dashboard");
      } else {
        navigate("/finishing/my-submissions");
      }
    } catch (error: any) {
      console.error("Error submitting targets:", error);
      toast.error(t("common.submissionFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile?.factory_id) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-4">
        <p className="text-muted-foreground">{t("common.noFactoryAssigned")}</p>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-3 md:py-4 lg:py-6 px-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
          <Crosshair className="h-5 w-5 text-violet-600 dark:text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">{t("forms.finishingMorningTargets")}</h1>
          <p className="text-sm text-muted-foreground">
            {new Date(getTodayInTimezone(factory?.timezone || "Asia/Dhaka") + "T00:00:00").toLocaleDateString(dateLocale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
      <div className="rounded-xl border border-border/50 bg-card p-5 md:p-6 space-y-6">
        {/* ── Line & PO ── */}
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground">{t("forms.selectLinePO")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t("forms.lineNo")} *</Label>
              <Select value={selectedLineId} onValueChange={setSelectedLineId}>
                <SelectTrigger className={`h-10 ${errors.line ? "border-destructive" : ""}`}>
                  <SelectValue placeholder={t("forms.selectLine")} />
                </SelectTrigger>
                <SelectContent>
                  {lines.map((line) => (
                    <SelectItem key={line.id} value={line.id}>{line.name || line.line_id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.line && <p className="text-xs text-destructive">{errors.line}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t("forms.poNumber")} *</Label>
              <Select value={selectedWorkOrderId} onValueChange={setSelectedWorkOrderId}>
                <SelectTrigger className={`h-10 ${errors.workOrder ? "border-destructive" : ""}`}>
                  <SelectValue placeholder={t("forms.selectPO")} />
                </SelectTrigger>
                <SelectContent>
                  {filteredWorkOrders.map((wo) => (
                    <SelectItem key={wo.id} value={wo.id}>{wo.po_number} - {wo.style}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.workOrder && <p className="text-xs text-destructive">{errors.workOrder}</p>}
            </div>
          </div>
        </div>

        {/* Auto-filled Details */}
        {selectedWorkOrder && (
          <div className="rounded-lg bg-muted/30 border border-border/40 px-4 py-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
              <div>
                <span className="text-[11px] text-muted-foreground">{t("forms.buyer")}</span>
                <p className="font-medium">{selectedWorkOrder.buyer}</p>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground">{t("forms.style")}</span>
                <p className="font-medium">{selectedWorkOrder.style}</p>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground">{t("forms.orderQty")}</span>
                <p className="font-medium font-mono">{selectedWorkOrder.order_qty.toLocaleString()}</p>
              </div>
            </div>
          </div>
        )}

        <div className="border-t border-border/40" />

        {/* ── Targets ── */}
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground">{t("forms.todaysTargets")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t("forms.perHourTarget")} *</Label>
              <Input type="number" value={perHourTarget} onChange={(e) => setPerHourTarget(e.target.value)} placeholder="0" className={`h-10 ${errors.perHourTarget ? "border-destructive" : ""}`} />
              {errors.perHourTarget && <p className="text-xs text-destructive">{errors.perHourTarget}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t("forms.mPowerPlanned")} *</Label>
              <Input type="number" value={mPowerPlanned} onChange={(e) => setMPowerPlanned(e.target.value)} placeholder="0" className={`h-10 ${errors.mPowerPlanned ? "border-destructive" : ""}`} />
              {errors.mPowerPlanned && <p className="text-xs text-destructive">{errors.mPowerPlanned}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t("forms.dayHoursPlanned")} *</Label>
              <Input type="number" step="0.5" value={dayHourPlanned} onChange={(e) => setDayHourPlanned(e.target.value)} placeholder="0" className={`h-10 ${errors.dayHourPlanned ? "border-destructive" : ""}`} />
              {errors.dayHourPlanned && <p className="text-xs text-destructive">{errors.dayHourPlanned}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t("forms.otHoursPlannedLabel")} *</Label>
              <Input type="number" step="0.5" value={dayOverTimePlanned} onChange={(e) => setDayOverTimePlanned(e.target.value)} placeholder="0" className={`h-10 ${errors.dayOverTimePlanned ? "border-destructive" : ""}`} />
              {errors.dayOverTimePlanned && <p className="text-xs text-destructive">{errors.dayOverTimePlanned}</p>}
            </div>
          </div>
        </div>

        <div className="border-t border-border/40" />

        {/* ── Remarks ── */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">{t("forms.remarks")}</Label>
          <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder={t("forms.addAnyNotes")} rows={2} />
        </div>

      </div>

        {/* Submit */}
        <Button type="submit" className="w-full h-11 font-semibold mt-5" disabled={submitting}>
          {submitting ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("forms.submitting")}</>
          ) : (
            t("forms.submitTargets")
          )}
        </Button>
      </form>
    </div>
  );
}
