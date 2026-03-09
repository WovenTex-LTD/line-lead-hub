import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { getTodayInTimezone } from "@/lib/date-utils";
import { useOfflineSubmission } from "@/hooks/useOfflineSubmission";
import { useHeadcountCost } from "@/hooks/useHeadcountCost";
import { EstimatedCostDisplay } from "@/components/EstimatedCostDisplay";

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

export default function SewingEndOfDayForm() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, profile, factory, isAdminOrHigher } = useAuth();
  const { submit: offlineSubmit } = useOfflineSubmission();
  const { calculateEstimatedCost, headcountCost } = useHeadcountCost();
  const [loading, setLoading] = useState(true);
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
  const [cumulativeGoodTotal, setCumulativeGoodTotal] = useState("");
  const [manpowerActual, setManpowerActual] = useState("");
  const [hoursActual, setHoursActual] = useState("");
  const [otHoursActual, setOtHoursActual] = useState("0");
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
    const formSchema = z.object({
      line: z.string().min(1, t("forms.lineRequired")),
      workOrder: z.string().min(1, t("forms.poRequired")),
      goodToday: z.number().int().min(0, t("forms.goodOutputRequired")),
      rejectToday: z.number().int().min(0, t("forms.rejectRequired")),
      reworkToday: z.number().int().min(0, t("forms.reworkRequired")),
      cumulativeGoodTotal: z.number().int().min(0, t("forms.cumulativeRequired")),
      manpowerActual: z.number().int().positive(t("forms.manpowerRequired")),
      hoursActual: z.number().min(0.5, "Hours actual is required").max(24, "Max 24 hours"),
      otHoursActual: z.number().min(0, t("forms.otHoursRequired")),
      actualStage: z.string().min(1, t("forms.stageRequired")),
      actualStageProgress: z.string().min(1, t("forms.progressRequired")),
    });

    const result = formSchema.safeParse({
      line: selectedLineId,
      workOrder: selectedWorkOrderId,
      goodToday: goodToday ? parseInt(goodToday) : -1,
      rejectToday: rejectToday ? parseInt(rejectToday) : -1,
      reworkToday: reworkToday ? parseInt(reworkToday) : -1,
      cumulativeGoodTotal: cumulativeGoodTotal ? parseInt(cumulativeGoodTotal) : -1,
      manpowerActual: parseInt(manpowerActual) || 0,
      hoursActual: hoursActual === "" ? 0 : parseFloat(hoursActual),
      otHoursActual: otHoursActual === "" ? -1 : parseFloat(otHoursActual),
      actualStage: actualStageId,
      actualStageProgress: actualStageProgress,
    });

    if (!result.success) {
      const newErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) newErrors[err.path[0] as string] = err.message;
      });
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
      const estimatedCost = calculateEstimatedCost(parseInt(manpowerActual), parseFloat(hoursActual));

      const insertData = {
        factory_id: profile.factory_id,
        production_date: getTodayInTimezone(factory?.timezone || "Asia/Dhaka"),
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
        cumulative_good_total: parseInt(cumulativeGoodTotal),
        manpower_actual: parseInt(manpowerActual),
        hours_actual: parseFloat(hoursActual),
        actual_per_hour: parseFloat(hoursActual) > 0 ? Math.round((parseInt(goodToday) / parseFloat(hoursActual)) * 100) / 100 : null,
        ot_hours_actual: parseFloat(otHoursActual),
        ot_manpower_actual: 0,
        actual_stage_id: actualStageId,
        actual_stage_progress: parseInt(actualStageProgress),
        remarks: remarks || null,
        estimated_cost_value: estimatedCost.value,
        estimated_cost_currency: estimatedCost.value != null ? estimatedCost.currency : null,
      };

      const result = await offlineSubmit("sewing_actuals", "sewing_actuals", insertData as Record<string, unknown>, {
        showSuccessToast: false,
        showQueuedToast: true,
      });

      if (result.queued) {
        if (isAdminOrHigher()) {
          navigate("/dashboard");
        } else {
          navigate("/my-submissions");
        }
        return;
      }

      if (!result.success) {
        if (result.error?.includes("duplicate") || result.error?.includes("23505")) {
          toast.error(t("common.submissionFailed"));
        } else {
          throw new Error(result.error);
        }
        return;
      }

      toast.success(t("common.submissionSuccess"));

      if (isAdminOrHigher()) {
        navigate("/dashboard");
      } else {
        navigate("/my-submissions");
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
      <div className="flex min-h-[30vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile?.factory_id) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center p-4">
        <p className="text-muted-foreground">{t("common.noFactoryAssigned")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Line & PO Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("forms.selectLinePO")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("forms.lineNo")} *</Label>
            <Select value={selectedLineId} onValueChange={setSelectedLineId}>
              <SelectTrigger className={errors.line ? "border-destructive" : ""}>
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
            {errors.line && <p className="text-sm text-destructive">{errors.line}</p>}
          </div>

          <div className="space-y-2">
            <Label>{t("forms.poNumber")} *</Label>
            <Popover open={poSearchOpen} onOpenChange={setPoSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className={`w-full justify-start ${errors.workOrder ? 'border-destructive' : ''}`}
                >
                  <Search className="mr-2 h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {selectedWorkOrderId
                      ? (() => {
                          const wo = filteredWorkOrders.find(w => w.id === selectedWorkOrderId);
                          return wo ? `${wo.po_number} - ${wo.style}` : t("forms.selectPO");
                        })()
                      : t("forms.selectPO")}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[350px] p-0" align="start">
                <Command shouldFilter={true}>
                  <CommandInput placeholder={t("forms.selectPO")} />
                  <CommandList>
                    <CommandEmpty>No PO found.</CommandEmpty>
                    <CommandGroup>
                      {filteredWorkOrders.map((wo) => (
                        <CommandItem
                          key={wo.id}
                          value={`${wo.po_number} ${wo.buyer} ${wo.style} ${wo.item || ''}`}
                          onSelect={() => {
                            setSelectedWorkOrderId(wo.id);
                            setPoSearchOpen(false);
                          }}
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
            {errors.workOrder && <p className="text-sm text-destructive">{errors.workOrder}</p>}
          </div>
        </CardContent>
      </Card>

      {/* Auto-filled Details */}
      {selectedWorkOrder && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("forms.orderDetailsAuto")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">{t("forms.buyer")}:</span>
                <p className="font-medium">{selectedWorkOrder.buyer}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t("forms.style")}:</span>
                <p className="font-medium">{selectedWorkOrder.style}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t("forms.item")}:</span>
                <p className="font-medium">{selectedWorkOrder.item || "-"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t("forms.orderQty")}:</span>
                <p className="font-medium">{selectedWorkOrder.order_qty.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t("forms.unit")}:</span>
                <p className="font-medium">{unitName || "-"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t("forms.floor")}:</span>
                <p className="font-medium">{floorName || "-"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actual Output */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("forms.todaysOutput")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("forms.goodOutput")} *</Label>
              <Input
                type="number"
                value={goodToday}
                onChange={(e) => setGoodToday(e.target.value)}
                placeholder="0"
                className={errors.goodToday ? "border-destructive" : ""}
              />
              {errors.goodToday && <p className="text-sm text-destructive">{errors.goodToday}</p>}
            </div>

            <div className="space-y-2">
              <Label>{t("forms.reject")} *</Label>
              <Input
                type="number"
                value={rejectToday}
                onChange={(e) => setRejectToday(e.target.value)}
                placeholder="0"
                className={errors.rejectToday ? "border-destructive" : ""}
              />
              {errors.rejectToday && <p className="text-sm text-destructive">{errors.rejectToday}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("forms.rework")} *</Label>
              <Input
                type="number"
                value={reworkToday}
                onChange={(e) => setReworkToday(e.target.value)}
                placeholder="0"
                className={errors.reworkToday ? "border-destructive" : ""}
              />
              {errors.reworkToday && <p className="text-sm text-destructive">{errors.reworkToday}</p>}
            </div>

            <div className="space-y-2">
              <Label>{t("forms.cumulativeGoodTotal")} *</Label>
              <Input
                type="number"
                value={cumulativeGoodTotal}
                onChange={(e) => setCumulativeGoodTotal(e.target.value)}
                placeholder="0"
                className={errors.cumulativeGoodTotal ? "border-destructive" : ""}
              />
              {errors.cumulativeGoodTotal && <p className="text-sm text-destructive">{errors.cumulativeGoodTotal}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("forms.manpowerActual")} *</Label>
              <Input
                type="number"
                value={manpowerActual}
                onChange={(e) => setManpowerActual(e.target.value)}
                placeholder="0"
                className={errors.manpowerActual ? "border-destructive" : ""}
              />
              {errors.manpowerActual && <p className="text-sm text-destructive">{errors.manpowerActual}</p>}
            </div>

            <div className="space-y-2">
              <Label>Hours Actual *</Label>
              <Input
                type="number"
                step="0.5"
                min="0"
                max="24"
                value={hoursActual}
                onChange={(e) => setHoursActual(e.target.value)}
                placeholder="0"
                className={errors.hoursActual ? "border-destructive" : ""}
              />
              {errors.hoursActual && <p className="text-sm text-destructive">{errors.hoursActual}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("forms.otHoursActual")} *</Label>
              <Input
                type="number"
                step="0.5"
                value={otHoursActual}
                onChange={(e) => setOtHoursActual(e.target.value)}
                placeholder="0"
                className={errors.otHoursActual ? "border-destructive" : ""}
              />
              {errors.otHoursActual && <p className="text-sm text-destructive">{errors.otHoursActual}</p>}
            </div>
          </div>

          <EstimatedCostDisplay manpower={manpowerActual} hours={hoursActual} />
        </CardContent>
      </Card>

      {/* Stage & Progress */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("forms.stageProgress")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("forms.actualStage")} *</Label>
            <Select value={actualStageId} onValueChange={setActualStageId}>
              <SelectTrigger className={errors.actualStage ? "border-destructive" : ""}>
                <SelectValue placeholder={t("forms.selectStage")} />
              </SelectTrigger>
              <SelectContent>
                {stages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.actualStage && <p className="text-sm text-destructive">{errors.actualStage}</p>}
          </div>

          <div className="space-y-2">
            <Label>{t("forms.stageProgressLabel")} *</Label>
            <Select value={actualStageProgress} onValueChange={setActualStageProgress}>
              <SelectTrigger className={errors.actualStageProgress ? "border-destructive" : ""}>
                <SelectValue placeholder={t("forms.selectProgress")} />
              </SelectTrigger>
              <SelectContent>
                {progressOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.label}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.actualStageProgress && <p className="text-sm text-destructive">{errors.actualStageProgress}</p>}
          </div>
        </CardContent>
      </Card>

      {/* Optional Fields */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("forms.optional")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>{t("forms.remarks")}</Label>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder={t("forms.addAnyNotes")}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("forms.submitting")}
          </>
        ) : (
          t("forms.submitActuals")
        )}
      </Button>
    </form>
  );
}
