import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useAuth } from "@/contexts/AuthContext";
import { getTodayInTimezone } from "@/lib/date-utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Search, ClipboardCheck } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useEditPermission } from "@/hooks/useEditPermission";

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

interface Stage {
  id: string;
  name: string;
  code: string;
}

interface DropdownOption {
  id: string;
  label: string;
}

const sewingActualsSchema = z.object({
  line_id: z.string().min(1, "Line is required"),
  work_order_id: z.string().min(1, "PO is required"),
  good_today: z.number().min(0, "Cannot be negative").max(100000, "Too high"),
  reject_today: z.number().min(0, "Cannot be negative").max(100000, "Too high"),
  rework_today: z.number().min(0, "Cannot be negative").max(100000, "Too high"),
  manpower_actual: z.number().min(1, "Must be at least 1").max(500, "Too high"),
  hours_actual: z.number().min(0.5, "Hours actual is required").max(24, "Max 24 hours"),
  ot_hours_actual: z.number().min(0, "Cannot be negative").max(24, "Max 24 hours"),
  ot_manpower_actual: z.number().min(0, "Cannot be negative").max(500, "Too high"),
  actual_stage_id: z.string().min(1, "Stage is required"),
  actual_stage_progress: z.string().min(1, "Progress is required"),
  remarks: z.string().max(1000, "Remarks too long").optional(),
});

export default function SewingEndOfDay() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { user, profile, factory, isAdminOrHigher } = useAuth();
  const { canEditSubmission } = useEditPermission();
  const [loading, setLoading] = useState(true);
  
  const dateLocale = i18n.language === 'bn' ? 'bn-BD' : 'en-US';
  const [submitting, setSubmitting] = useState(false);

  // Master data
  const [lines, setLines] = useState<Line[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [progressOptions, setProgressOptions] = useState<DropdownOption[]>([]);

  // Form state
  const [selectedLineId, setSelectedLineId] = useState("");
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState("");
  const [goodToday, setGoodToday] = useState("");
  const [rejectToday, setRejectToday] = useState("");
  const [reworkToday, setReworkToday] = useState("");
  const [previousCumulativeTotal, setPreviousCumulativeTotal] = useState(0);
  const [manpowerActual, setManpowerActual] = useState("");
  const [hoursActual, setHoursActual] = useState("");
  const [otHoursActual, setOtHoursActual] = useState("0");
  const [otManpowerActual, setOtManpowerActual] = useState("0");
  const [actualStageId, setActualStageId] = useState("");
  const [actualStageProgress, setActualStageProgress] = useState("");
  const [remarks, setRemarks] = useState("");

  // Auto-filled
  const [unitName, setUnitName] = useState("");
  const [floorName, setFloorName] = useState("");

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [poSearchOpen, setPoSearchOpen] = useState(false);

  const filteredWorkOrders = useMemo(() => {
    if (!selectedLineId) return workOrders;
    return workOrders.filter(wo => wo.line_id === selectedLineId || !wo.line_id);
  }, [workOrders, selectedLineId]);

  const selectedWorkOrder = useMemo(() => {
    return workOrders.find(wo => wo.id === selectedWorkOrderId);
  }, [workOrders, selectedWorkOrderId]);

  // Auto-calculate cumulative good total: previous cumulative + today's good + today's rework
  const cumulativeGoodTotal = useMemo(() => {
    const good = parseInt(goodToday) || 0;
    const rework = parseInt(reworkToday) || 0;
    return previousCumulativeTotal + good + rework;
  }, [previousCumulativeTotal, goodToday, reworkToday]);

  // Fetch previous cumulative total when line/work order changes
  useEffect(() => {
    async function fetchPreviousCumulative() {
      if (!profile?.factory_id || !selectedLineId || !selectedWorkOrderId) {
        setPreviousCumulativeTotal(0);
        return;
      }

      try {
        const today = getTodayInTimezone(factory?.timezone || "Asia/Dhaka");

        // Get the most recent submission for this line/work order (before today)
        const { data, error } = await supabase
          .from("sewing_actuals")
          .select("cumulative_good_total")
          .eq("factory_id", profile.factory_id)
          .eq("line_id", selectedLineId)
          .eq("work_order_id", selectedWorkOrderId)
          .lt("production_date", today)
          .order("production_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error("Error fetching previous cumulative:", error);
          setPreviousCumulativeTotal(0);
          return;
        }

        setPreviousCumulativeTotal(data?.cumulative_good_total || 0);
      } catch (error) {
        console.error("Error fetching previous cumulative:", error);
        setPreviousCumulativeTotal(0);
      }
    }

    fetchPreviousCumulative();
  }, [profile?.factory_id, selectedLineId, selectedWorkOrderId]);

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

  // Clear PO selection when line changes
  useEffect(() => {
    if (selectedLineId && selectedWorkOrderId) {
      const selectedWO = workOrders.find(wo => wo.id === selectedWorkOrderId);
      if (selectedWO && selectedWO.line_id && selectedWO.line_id !== selectedLineId) {
        setSelectedWorkOrderId("");
      }
    }
  }, [selectedLineId, selectedWorkOrderId, workOrders]);

  async function fetchFormData() {
    if (!profile?.factory_id) return;

    try {
      const [
        linesRes, workOrdersRes, unitsRes, floorsRes, stagesRes,
        progressRes, assignmentsRes
      ] = await Promise.all([
        supabase.from("lines").select("*").eq("factory_id", profile.factory_id).eq("is_active", true),
        supabase.from("work_orders").select("*").eq("factory_id", profile.factory_id).eq("is_active", true),
        supabase.from("units").select("*").eq("factory_id", profile.factory_id).eq("is_active", true),
        supabase.from("floors").select("*").eq("factory_id", profile.factory_id).eq("is_active", true),
        supabase.from("stages").select("*").eq("factory_id", profile.factory_id).eq("is_active", true).order("sequence"),
        supabase.from("stage_progress_options").select("*").eq("factory_id", profile.factory_id).eq("is_active", true).order("sort_order"),
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
      setStages(stagesRes.data || []);
      setProgressOptions(progressRes.data || []);
    } catch (error) {
      console.error("Error fetching form data:", error);
      toast.error(t("common.submissionFailed"));
    } finally {
      setLoading(false);
    }
  }

  function validateForm(): boolean {
    const formData = {
      line_id: selectedLineId,
      work_order_id: selectedWorkOrderId,
      good_today: parseInt(goodToday) || 0,
      reject_today: parseInt(rejectToday) || 0,
      rework_today: parseInt(reworkToday) || 0,
      manpower_actual: parseInt(manpowerActual) || 0,
      hours_actual: hoursActual === "" ? 0 : parseFloat(hoursActual),
      ot_hours_actual: parseFloat(otHoursActual) || 0,
      ot_manpower_actual: parseInt(otManpowerActual) || 0,
      actual_stage_id: actualStageId,
      actual_stage_progress: actualStageProgress,
      remarks: remarks || undefined,
    };

    const result = sewingActualsSchema.safeParse(formData);

    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      const newErrors: Record<string, string> = {};
      if (fieldErrors.line_id) newErrors.line = t("forms.lineRequired");
      if (fieldErrors.work_order_id) newErrors.workOrder = t("forms.poRequired");
      if (fieldErrors.good_today) newErrors.goodToday = t("forms.goodOutputRequired");
      if (fieldErrors.reject_today) newErrors.rejectToday = t("forms.rejectRequired");
      if (fieldErrors.rework_today) newErrors.reworkToday = t("forms.reworkRequired");
      if (fieldErrors.manpower_actual) newErrors.manpowerActual = t("forms.manpowerRequired");
      if (fieldErrors.hours_actual) newErrors.hoursActual = "Hours actual is required";
      if (fieldErrors.ot_hours_actual) newErrors.otHoursActual = t("forms.otHoursRequired");
      if (fieldErrors.ot_manpower_actual) newErrors.otManpowerActual = "OT Manpower is invalid";
      if (fieldErrors.actual_stage_id) newErrors.actualStage = t("forms.stageRequired");
      if (fieldErrors.actual_stage_progress) newErrors.actualStageProgress = t("forms.progressRequired");
      if (fieldErrors.remarks) newErrors.remarks = fieldErrors.remarks[0];
      setErrors(newErrors);
      return false;
    }

    setErrors({});
    return true;
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
      const productionDate = getTodayInTimezone(factory?.timezone || "Asia/Dhaka");

      const insertData = {
        factory_id: profile.factory_id,
        production_date: productionDate,
        submitted_by: user.id,
        line_id: selectedLineId,
        work_order_id: selectedWorkOrderId,
        unit_name: unitName,
        floor_name: floorName,
        buyer_name: selectedWorkOrder?.buyer || "",
        style_code: selectedWorkOrder?.style || "",
        item_name: selectedWorkOrder?.item || "",
        order_qty: selectedWorkOrder?.order_qty || 0,
        good_today: parseInt(goodToday),
        reject_today: parseInt(rejectToday),
        rework_today: parseInt(reworkToday),
        cumulative_good_total: cumulativeGoodTotal,
        manpower_actual: parseInt(manpowerActual),
        hours_actual: parseFloat(hoursActual),
        actual_per_hour: parseFloat(hoursActual) > 0 ? Math.round((parseInt(goodToday) / parseFloat(hoursActual)) * 100) / 100 : null,
        ot_hours_actual: parseFloat(otHoursActual),
        ot_manpower_actual: parseInt(otManpowerActual) || 0,
        actual_stage_id: actualStageId,
        actual_stage_progress: parseInt(actualStageProgress),
        remarks: remarks || null,
      };

      // If a submission already exists for today+line+PO, update it (only if still within edit window)
      const { data: existing, error: existingError } = await supabase
        .from("sewing_actuals")
        .select("id")
        .eq("factory_id", profile.factory_id)
        .eq("production_date", productionDate)
        .eq("line_id", selectedLineId)
        .eq("work_order_id", selectedWorkOrderId)
        .maybeSingle();

      if (existingError) throw existingError;

      if (existing?.id) {
        const { canEdit, reason } = canEditSubmission(productionDate, user.id);
        if (!canEdit) {
          toast.error(reason || t("common.submissionFailed"));
          setSubmitting(false);
          return;
        }

        const { error: updateError } = await supabase
          .from("sewing_actuals")
          .update(insertData)
          .eq("id", existing.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from("sewing_actuals")
          .insert(insertData);

        if (insertError) throw insertError;
      }
      toast.success(t("common.submissionSuccess"));
      
      if (isAdminOrHigher()) {
        navigate("/dashboard");
      } else {
        navigate("/sewing/my-submissions");
      }
    } catch (error: any) {
      console.error("Error submitting actuals:", error);
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
    <div className="container max-w-2xl py-3 md:py-4 lg:py-6 px-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
          <ClipboardCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">{t("forms.sewing")} {t("forms.endOfDayOutput")}</h1>
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
              <Popover open={poSearchOpen} onOpenChange={setPoSearchOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" disabled={!selectedLineId} className={`w-full h-10 justify-start ${errors.workOrder ? 'border-destructive' : ''}`}>
                    <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm">
                      {selectedWorkOrderId
                        ? (() => { const wo = filteredWorkOrders.find(w => w.id === selectedWorkOrderId); return wo ? `${wo.po_number} - ${wo.style}` : t("forms.selectPO"); })()
                        : (selectedLineId ? t("forms.selectPO") : "Select a line first")}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[min(350px,calc(100vw-2rem))] p-0" align="start">
                  <Command shouldFilter={true}>
                    <CommandInput placeholder={t("forms.selectPO")} />
                    <CommandList>
                      <CommandEmpty>No PO found.</CommandEmpty>
                      <CommandGroup>
                        {filteredWorkOrders.map((wo) => (
                          <CommandItem key={wo.id} value={`${wo.po_number} ${wo.buyer} ${wo.style} ${wo.item || ''}`} onSelect={() => { setSelectedWorkOrderId(wo.id); setPoSearchOpen(false); }}>
                            <div className="flex flex-col">
                              <span className="font-medium">{wo.po_number} - {wo.style}</span>
                              <span className="text-xs text-muted-foreground">{wo.buyer}{wo.item ? ` / ${wo.item}` : ''}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
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

        {/* ── Output ── */}
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground">{t("forms.todaysOutput")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t("forms.goodOutput")} *</Label>
              <Input type="number" value={goodToday} onChange={(e) => setGoodToday(e.target.value)} placeholder="0" className={`h-10 ${errors.goodToday ? "border-destructive" : ""}`} />
              {errors.goodToday && <p className="text-xs text-destructive">{errors.goodToday}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t("forms.reject")} *</Label>
              <Input type="number" value={rejectToday} onChange={(e) => setRejectToday(e.target.value)} placeholder="0" className={`h-10 ${errors.rejectToday ? "border-destructive" : ""}`} />
              {errors.rejectToday && <p className="text-xs text-destructive">{errors.rejectToday}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t("forms.rework")} *</Label>
              <Input type="number" value={reworkToday} onChange={(e) => setReworkToday(e.target.value)} placeholder="0" className={`h-10 ${errors.reworkToday ? "border-destructive" : ""}`} />
              {errors.reworkToday && <p className="text-xs text-destructive">{errors.reworkToday}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t("forms.cumulativeGoodTotal")}</Label>
              <Input type="number" value={cumulativeGoodTotal} readOnly disabled className="h-10 bg-muted" />
              <p className="text-[11px] text-muted-foreground">{t("forms.autoCalculated")}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t("forms.manpowerActual")} *</Label>
              <Input type="number" value={manpowerActual} onChange={(e) => setManpowerActual(e.target.value)} placeholder="0" className={`h-10 ${errors.manpowerActual ? "border-destructive" : ""}`} />
              {errors.manpowerActual && <p className="text-xs text-destructive">{errors.manpowerActual}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Hours Actual *</Label>
              <Input type="number" step="0.5" min="0" max="24" value={hoursActual} onChange={(e) => setHoursActual(e.target.value)} placeholder="0" className={`h-10 ${errors.hoursActual ? "border-destructive" : ""}`} />
              {errors.hoursActual && <p className="text-xs text-destructive">{errors.hoursActual}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t("forms.otHoursActual")} *</Label>
              <Input type="number" step="0.5" value={otHoursActual} onChange={(e) => setOtHoursActual(e.target.value)} placeholder="0" className={`h-10 ${errors.otHoursActual ? "border-destructive" : ""}`} />
              {errors.otHoursActual && <p className="text-xs text-destructive">{errors.otHoursActual}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">OT Manpower</Label>
              <Input type="number" value={otManpowerActual} onChange={(e) => setOtManpowerActual(e.target.value)} placeholder="0" className="h-10" />
            </div>
          </div>
        </div>

        <div className="border-t border-border/40" />

        {/* ── Stage & Progress ── */}
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground">{t("forms.stageProgress")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t("forms.actualStage")} *</Label>
              <Select value={actualStageId} onValueChange={setActualStageId}>
                <SelectTrigger className={`h-10 ${errors.actualStage ? "border-destructive" : ""}`}>
                  <SelectValue placeholder={t("forms.selectStage")} />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.actualStage && <p className="text-xs text-destructive">{errors.actualStage}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t("forms.stageProgressLabel")} *</Label>
              <Select value={actualStageProgress} onValueChange={setActualStageProgress}>
                <SelectTrigger className={`h-10 ${errors.actualStageProgress ? "border-destructive" : ""}`}>
                  <SelectValue placeholder={t("forms.selectProgress")} />
                </SelectTrigger>
                <SelectContent>
                  {progressOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.label}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.actualStageProgress && <p className="text-xs text-destructive">{errors.actualStageProgress}</p>}
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
            t("forms.submitActuals")
          )}
        </Button>
      </form>
    </div>
  );
}
