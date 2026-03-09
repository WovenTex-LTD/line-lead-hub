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

export default function FinishingEndOfDayForm() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, profile, factory, isAdminOrHigher } = useAuth();
  const { submit: offlineSubmit } = useOfflineSubmission();
  const { calculateEstimatedCost } = useHeadcountCost();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Master data
  const [lines, setLines] = useState<Line[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);

  // Form state
  const [selectedLineId, setSelectedLineId] = useState("");
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState("");
  const [dayQcPass, setDayQcPass] = useState("");
  const [totalQcPass, setTotalQcPass] = useState("");
  const [dayPoly, setDayPoly] = useState("");
  const [totalPoly, setTotalPoly] = useState("");
  const [dayCarton, setDayCarton] = useState("");
  const [totalCarton, setTotalCarton] = useState("");
  const [averageProduction, setAverageProduction] = useState("");
  const [mPowerActual, setMPowerActual] = useState("");
  const [otManpowerActual, setOtManpowerActual] = useState("0");
  const [dayHourActual, setDayHourActual] = useState("");
  const [dayOverTimeActual, setDayOverTimeActual] = useState("0");
  const [totalHour, setTotalHour] = useState("");
  const [totalOverTime, setTotalOverTime] = useState("");
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
        linesRes, workOrdersRes, unitsRes, floorsRes, assignmentsRes
      ] = await Promise.all([
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
    const formSchema = z.object({
      line: z.string().min(1, t("forms.lineRequired")),
      workOrder: z.string().min(1, t("forms.poRequired")),
      dayQcPass: z.number().int().min(0, t("forms.dayQcPassRequired")),
      totalQcPass: z.number().int().min(0, t("forms.totalQcPassRequired")),
      dayPoly: z.number().int().min(0, t("forms.dayPolyRequired")),
      totalPoly: z.number().int().min(0, t("forms.totalPolyRequired")),
      dayCarton: z.number().int().min(0, t("forms.dayCartonRequired")),
      totalCarton: z.number().int().min(0, t("forms.totalCartonRequired")),
      mPowerActual: z.number().int().positive(t("forms.mPowerRequired")),
      otManpowerActual: z.number().int().min(0, t("forms.otManpowerRequired") || "OT Manpower must be 0 or more"),
      dayHourActual: z.number().min(0, t("forms.dayHoursRequired")),
      dayOverTimeActual: z.number().min(0, t("forms.otHoursRequired")),
    });

    const result = formSchema.safeParse({
      line: selectedLineId,
      workOrder: selectedWorkOrderId,
      dayQcPass: dayQcPass ? parseInt(dayQcPass) : -1,
      totalQcPass: totalQcPass ? parseInt(totalQcPass) : -1,
      dayPoly: dayPoly ? parseInt(dayPoly) : -1,
      totalPoly: totalPoly ? parseInt(totalPoly) : -1,
      dayCarton: dayCarton ? parseInt(dayCarton) : -1,
      totalCarton: totalCarton ? parseInt(totalCarton) : -1,
      mPowerActual: parseInt(mPowerActual) || 0,
      otManpowerActual: otManpowerActual === "" ? -1 : parseInt(otManpowerActual),
      dayHourActual: dayHourActual ? parseFloat(dayHourActual) : -1,
      dayOverTimeActual: dayOverTimeActual === "" ? -1 : parseFloat(dayOverTimeActual),
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
      const estimatedCost = calculateEstimatedCost(parseInt(mPowerActual), parseFloat(dayHourActual));

      const insertData = {
        factory_id: profile.factory_id,
        production_date: getTodayInTimezone(factory?.timezone || "Asia/Dhaka"),
        submitted_by: user.id,
        line_id: selectedLineId,
        work_order_id: selectedWorkOrderId,
        unit_name: unitName,
        floor_name: floorName,
        buyer_name: selectedWorkOrder?.buyer || "",
        style_no: selectedWorkOrder?.style || "",
        item_name: selectedWorkOrder?.item || "",
        order_qty: selectedWorkOrder?.order_qty || 0,
        day_qc_pass: parseInt(dayQcPass),
        total_qc_pass: parseInt(totalQcPass),
        day_poly: parseInt(dayPoly),
        total_poly: parseInt(totalPoly),
        day_carton: parseInt(dayCarton),
        total_carton: parseInt(totalCarton),
        average_production: averageProduction ? parseInt(averageProduction) : 0,
        m_power_actual: parseInt(mPowerActual),
        ot_manpower_actual: parseInt(otManpowerActual) || 0,
        day_hour_actual: parseFloat(dayHourActual),
        day_over_time_actual: parseFloat(dayOverTimeActual),
        total_hour: totalHour ? parseFloat(totalHour) : 0,
        total_over_time: totalOverTime ? parseFloat(totalOverTime) : 0,
        remarks: remarks || null,
        estimated_cost_value: estimatedCost.value,
        estimated_cost_currency: estimatedCost.value != null ? estimatedCost.currency : null,
      };

      const result = await offlineSubmit("finishing_actuals", "finishing_actuals", insertData as Record<string, unknown>, {
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

      {/* QC & Production Output */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("forms.qcProductionOutput")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("forms.dayQcPass")} *</Label>
              <Input
                type="number"
                value={dayQcPass}
                onChange={(e) => setDayQcPass(e.target.value)}
                placeholder="0"
                className={errors.dayQcPass ? "border-destructive" : ""}
              />
              {errors.dayQcPass && <p className="text-sm text-destructive">{errors.dayQcPass}</p>}
            </div>

            <div className="space-y-2">
              <Label>{t("forms.totalQcPass")} *</Label>
              <Input
                type="number"
                value={totalQcPass}
                onChange={(e) => setTotalQcPass(e.target.value)}
                placeholder="0"
                className={errors.totalQcPass ? "border-destructive" : ""}
              />
              {errors.totalQcPass && <p className="text-sm text-destructive">{errors.totalQcPass}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("forms.dayPoly")} *</Label>
              <Input
                type="number"
                value={dayPoly}
                onChange={(e) => setDayPoly(e.target.value)}
                placeholder="0"
                className={errors.dayPoly ? "border-destructive" : ""}
              />
              {errors.dayPoly && <p className="text-sm text-destructive">{errors.dayPoly}</p>}
            </div>

            <div className="space-y-2">
              <Label>{t("forms.totalPoly")} *</Label>
              <Input
                type="number"
                value={totalPoly}
                onChange={(e) => setTotalPoly(e.target.value)}
                placeholder="0"
                className={errors.totalPoly ? "border-destructive" : ""}
              />
              {errors.totalPoly && <p className="text-sm text-destructive">{errors.totalPoly}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("forms.dayCarton")} *</Label>
              <Input
                type="number"
                value={dayCarton}
                onChange={(e) => setDayCarton(e.target.value)}
                placeholder="0"
                className={errors.dayCarton ? "border-destructive" : ""}
              />
              {errors.dayCarton && <p className="text-sm text-destructive">{errors.dayCarton}</p>}
            </div>

            <div className="space-y-2">
              <Label>{t("forms.totalCarton")} *</Label>
              <Input
                type="number"
                value={totalCarton}
                onChange={(e) => setTotalCarton(e.target.value)}
                placeholder="0"
                className={errors.totalCarton ? "border-destructive" : ""}
              />
              {errors.totalCarton && <p className="text-sm text-destructive">{errors.totalCarton}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("forms.averageProduction")}</Label>
            <Input
              type="number"
              value={averageProduction}
              onChange={(e) => setAverageProduction(e.target.value)}
              placeholder="0"
            />
          </div>
        </CardContent>
      </Card>

      {/* Manpower & Hours */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("forms.manpowerHours")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("forms.mPowerActual")} *</Label>
              <Input
                type="number"
                value={mPowerActual}
                onChange={(e) => setMPowerActual(e.target.value)}
                placeholder="0"
                className={errors.mPowerActual ? "border-destructive" : ""}
              />
              {errors.mPowerActual && <p className="text-sm text-destructive">{errors.mPowerActual}</p>}
            </div>

            <div className="space-y-2">
              <Label>{t("forms.otManpowerActual") || "OT Manpower Actual"}</Label>
              <Input
                type="number"
                value={otManpowerActual}
                onChange={(e) => setOtManpowerActual(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("forms.dayHoursActual")} *</Label>
              <Input
                type="number"
                step="0.5"
                value={dayHourActual}
                onChange={(e) => setDayHourActual(e.target.value)}
                placeholder="0"
                className={errors.dayHourActual ? "border-destructive" : ""}
              />
              {errors.dayHourActual && <p className="text-sm text-destructive">{errors.dayHourActual}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("forms.otHoursActual")} *</Label>
              <Input
                type="number"
                step="0.5"
                value={dayOverTimeActual}
                onChange={(e) => setDayOverTimeActual(e.target.value)}
                placeholder="0"
                className={errors.dayOverTimeActual ? "border-destructive" : ""}
              />
              {errors.dayOverTimeActual && <p className="text-sm text-destructive">{errors.dayOverTimeActual}</p>}
            </div>

            <div className="space-y-2">
              <Label>{t("forms.totalHour")}</Label>
              <Input
                type="number"
                step="0.5"
                value={totalHour}
                onChange={(e) => setTotalHour(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("forms.totalOverTime")}</Label>
            <Input
              type="number"
              step="0.5"
              value={totalOverTime}
              onChange={(e) => setTotalOverTime(e.target.value)}
              placeholder="0"
            />
          </div>

          <EstimatedCostDisplay manpower={mPowerActual} hours={dayHourActual} />
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
