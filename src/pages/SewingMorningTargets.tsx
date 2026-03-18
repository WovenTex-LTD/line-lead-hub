import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Search, Crosshair } from "lucide-react";
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

interface Stage {
  id: string;
  name: string;
  code: string;
}

interface DropdownOption {
  id: string;
  label: string;
}

const sewingTargetSchema = z.object({
  line_id: z.string().min(1, "Line is required"),
  work_order_id: z.string().min(1, "PO is required"),
  per_hour_target: z.number().min(1, "Must be at least 1").max(10000, "Too high"),
  manpower_planned: z.number().min(1, "Must be at least 1").max(500, "Too high"),
  hours_planned: z.number().min(0.5, "Hours planned is required").max(24, "Max 24 hours"),
  ot_hours_planned: z.number().min(0, "Cannot be negative").max(24, "Max 24 hours"),
  planned_stage_id: z.string().min(1, "Stage is required"),
  planned_stage_progress: z.string().min(1, "Progress is required"),
  next_milestone: z.string().min(1, "Milestone is required"),
  estimated_ex_factory: z.string().optional(),
  remarks: z.string().max(1000, "Remarks too long").optional(),
});

export default function SewingMorningTargets() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { user, profile, factory, isAdminOrHigher } = useAuth();
  const { canEditSubmission } = useEditPermission();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const dateLocale = i18n.language === 'bn' ? 'bn-BD' : 'en-US';

  // Master data
  const [lines, setLines] = useState<Line[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [milestoneOptions, setMilestoneOptions] = useState<DropdownOption[]>([]);
  const [progressOptions, setProgressOptions] = useState<DropdownOption[]>([]);

  // Form state
  const [selectedLineId, setSelectedLineId] = useState("");
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState("");
  const [perHourTarget, setPerHourTarget] = useState("");
  const [manpowerPlanned, setManpowerPlanned] = useState("");
  const [hoursPlanned, setHoursPlanned] = useState("");
  const [otHoursPlanned, setOtHoursPlanned] = useState("0");
  const [plannedStageId, setPlannedStageId] = useState("");
  const [plannedStageProgress, setPlannedStageProgress] = useState("");
  const [nextMilestone, setNextMilestone] = useState("");
  const [estimatedExFactory, setEstimatedExFactory] = useState("");
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
      const [linesRes, workOrdersRes, unitsRes, floorsRes, stagesRes, milestonesRes, progressRes, assignmentsRes] = await Promise.all([
        supabase.from("lines").select("*").eq("factory_id", profile.factory_id).eq("is_active", true),
        supabase.from("work_orders").select("*").eq("factory_id", profile.factory_id).eq("is_active", true),
        supabase.from("units").select("*").eq("factory_id", profile.factory_id).eq("is_active", true),
        supabase.from("floors").select("*").eq("factory_id", profile.factory_id).eq("is_active", true),
        supabase.from("stages").select("*").eq("factory_id", profile.factory_id).eq("is_active", true).order("sequence"),
        supabase.from("next_milestone_options").select("*").eq("factory_id", profile.factory_id).eq("is_active", true).order("sort_order"),
        supabase.from("stage_progress_options").select("*").eq("factory_id", profile.factory_id).eq("is_active", true).order("sort_order"),
        supabase.from("user_line_assignments").select("line_id").eq("user_id", user?.id || ""),
      ]);

      let availableLines = linesRes.data || [];
      
      // Filter lines by assignment for non-admins
      if (!isAdminOrHigher() && assignmentsRes.data && assignmentsRes.data.length > 0) {
        const assignedLineIds = assignmentsRes.data.map(a => a.line_id);
        availableLines = availableLines.filter(l => assignedLineIds.includes(l.id));
      }

      setLines(availableLines);
      setWorkOrders(workOrdersRes.data || []);
      setUnits(unitsRes.data || []);
      setFloors(floorsRes.data || []);
      setStages(stagesRes.data || []);
      setMilestoneOptions(milestonesRes.data || []);
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
      per_hour_target: parseInt(perHourTarget) || 0,
      manpower_planned: parseInt(manpowerPlanned) || 0,
      hours_planned: hoursPlanned === "" ? 0 : parseFloat(hoursPlanned),
      ot_hours_planned: parseFloat(otHoursPlanned) || 0,
      planned_stage_id: plannedStageId,
      planned_stage_progress: plannedStageProgress,
      next_milestone: nextMilestone,
      estimated_ex_factory: estimatedExFactory || undefined,
      remarks: remarks || undefined,
    };

    const result = sewingTargetSchema.safeParse(formData);

    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      const newErrors: Record<string, string> = {};
      if (fieldErrors.line_id) newErrors.line = t("forms.lineRequired");
      if (fieldErrors.work_order_id) newErrors.workOrder = t("forms.poRequired");
      if (fieldErrors.per_hour_target) newErrors.perHourTarget = t("forms.targetRequired");
      if (fieldErrors.manpower_planned) newErrors.manpowerPlanned = t("forms.manpowerRequired");
      if (fieldErrors.hours_planned) newErrors.hoursPlanned = "Hours planned is required";
      if (fieldErrors.ot_hours_planned) newErrors.otHoursPlanned = t("forms.otHoursRequired");
      if (fieldErrors.planned_stage_id) newErrors.plannedStage = t("forms.stageRequired");
      if (fieldErrors.planned_stage_progress) newErrors.plannedStageProgress = t("forms.progressRequired");
      if (fieldErrors.next_milestone) newErrors.nextMilestone = t("forms.milestoneRequired");
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
      // Check if submission is late based on morning_target_cutoff (using factory timezone)
      const timezone = factory?.timezone || "Asia/Dhaka";
      const isLate = factory?.morning_target_cutoff
        ? isLateForCutoff(factory.morning_target_cutoff, timezone)
        : false;

      const productionDate = getTodayInTimezone(timezone);

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
        per_hour_target: parseInt(perHourTarget),
        manpower_planned: parseInt(manpowerPlanned),
        hours_planned: parseFloat(hoursPlanned),
        target_total_planned: Math.round(parseInt(perHourTarget) * parseFloat(hoursPlanned)),
        ot_hours_planned: parseFloat(otHoursPlanned),
        planned_stage_id: plannedStageId,
        planned_stage_progress: parseInt(plannedStageProgress),
        next_milestone: nextMilestone,
        estimated_ex_factory: estimatedExFactory || null,
        remarks: remarks || null,
        is_late: isLate,
      };

      // If a submission already exists for today+line+PO, update it (only if still within edit window)
      const { data: existing, error: existingError } = await supabase
        .from("sewing_targets")
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
          .from("sewing_targets")
          .update(insertData)
          .eq("id", existing.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from("sewing_targets")
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
        <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
          <Crosshair className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">{t("forms.sewingMorningTargets")}</h1>
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
                    <SelectItem key={line.id} value={line.id}>
                      {line.name || line.line_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.line && <p className="text-xs text-destructive">{errors.line}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t("forms.poNumber")} *</Label>
              <Popover open={poSearchOpen} onOpenChange={setPoSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    disabled={!selectedLineId}
                    className={`w-full h-10 justify-start ${errors.workOrder ? 'border-destructive' : ''}`}
                  >
                    <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm">
                      {selectedWorkOrderId
                        ? (() => {
                            const wo = filteredWorkOrders.find(w => w.id === selectedWorkOrderId);
                            return wo ? `${wo.po_number} - ${wo.style}` : t("forms.selectPO");
                          })()
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
                          <CommandItem
                            key={wo.id}
                            value={`${wo.po_number} ${wo.buyer} ${wo.style} ${wo.item || ''}`}
                            onSelect={() => { setSelectedWorkOrderId(wo.id); setPoSearchOpen(false); }}
                          >
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
              <Label className="text-xs font-medium">{t("forms.manpowerPlanned")} *</Label>
              <Input type="number" value={manpowerPlanned} onChange={(e) => setManpowerPlanned(e.target.value)} placeholder="0" className={`h-10 ${errors.manpowerPlanned ? "border-destructive" : ""}`} />
              {errors.manpowerPlanned && <p className="text-xs text-destructive">{errors.manpowerPlanned}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Hours Planned *</Label>
              <Input type="number" step="0.5" min="0" max="24" value={hoursPlanned} onChange={(e) => setHoursPlanned(e.target.value)} placeholder="0" className={`h-10 ${errors.hoursPlanned ? "border-destructive" : ""}`} />
              {errors.hoursPlanned && <p className="text-xs text-destructive">{errors.hoursPlanned}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t("forms.otHoursPlanned")} *</Label>
              <Input type="number" step="0.5" value={otHoursPlanned} onChange={(e) => setOtHoursPlanned(e.target.value)} placeholder="0" className={`h-10 ${errors.otHoursPlanned ? "border-destructive" : ""}`} />
              {errors.otHoursPlanned && <p className="text-xs text-destructive">{errors.otHoursPlanned}</p>}
            </div>
          </div>
        </div>

        <div className="border-t border-border/40" />

        {/* ── Stage & Progress ── */}
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground">{t("forms.stageProgress")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t("forms.plannedStage")} *</Label>
              <Select value={plannedStageId} onValueChange={setPlannedStageId}>
                <SelectTrigger className={`h-10 ${errors.plannedStage ? "border-destructive" : ""}`}>
                  <SelectValue placeholder={t("forms.selectStage")} />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.plannedStage && <p className="text-xs text-destructive">{errors.plannedStage}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t("forms.stageProgressLabel")} *</Label>
              <Select value={plannedStageProgress} onValueChange={setPlannedStageProgress}>
                <SelectTrigger className={`h-10 ${errors.plannedStageProgress ? "border-destructive" : ""}`}>
                  <SelectValue placeholder={t("forms.selectProgress")} />
                </SelectTrigger>
                <SelectContent>
                  {progressOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.label}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.plannedStageProgress && <p className="text-xs text-destructive">{errors.plannedStageProgress}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t("forms.nextMilestone")} *</Label>
              <Select value={nextMilestone} onValueChange={setNextMilestone}>
                <SelectTrigger className={`h-10 ${errors.nextMilestone ? "border-destructive" : ""}`}>
                  <SelectValue placeholder={t("forms.selectMilestone")} />
                </SelectTrigger>
                <SelectContent>
                  {milestoneOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.label}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.nextMilestone && <p className="text-xs text-destructive">{errors.nextMilestone}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t("forms.estimatedExFactory")}</Label>
              <Input type="date" value={estimatedExFactory} onChange={(e) => setEstimatedExFactory(e.target.value)} className="h-10" />
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
