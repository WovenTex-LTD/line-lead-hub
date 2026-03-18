import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Search, Scissors, CheckCircle, Shirt, CircleDot, Flame, Package, Box, Archive, TrendingUp, TrendingDown, Minus, Clock, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// Card kept for target comparison section only
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface WorkOrder {
  id: string;
  po_number: string;
  buyer: string;
  style: string;
  item: string | null;
  order_qty: number;
  line_id: string | null;
}

interface TargetLog {
  id: string;
  thread_cutting: number | null;
  inside_check: number | null;
  top_side_check: number | null;
  buttoning: number | null;
  iron: number | null;
  get_up: number | null;
  poly: number | null;
  carton: number | null;
  planned_hours: number | null;
}

// Process categories matching the hourly grid
const PROCESS_CATEGORIES = [
  { key: "thread_cutting", label: "Thread Cutting", icon: Scissors },
  { key: "inside_check", label: "Inside Check", icon: CheckCircle },
  { key: "top_side_check", label: "Top Side Check", icon: Shirt },
  { key: "buttoning", label: "Buttoning", icon: CircleDot },
  { key: "iron", label: "Iron", icon: Flame },
  { key: "get_up", label: "Get-up", icon: Package },
  { key: "poly", label: "Poly", icon: Box },
  { key: "carton", label: "Carton", icon: Archive },
] as const;

type ProcessKey = typeof PROCESS_CATEGORIES[number]["key"];

export default function FinishingDailyOutput() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const { user, profile, factory, isAdminOrHigher } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [existingLog, setExistingLog] = useState<any>(null);
  const [targetLog, setTargetLog] = useState<TargetLog | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [previousCartonTotal, setPreviousCartonTotal] = useState(0);

  // Master data
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);

  // Form state - date is automatically set to today on submission
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState("");
  const [remarks, setRemarks] = useState("");
  const [actualHours, setActualHours] = useState("");

  // Manpower
  const [mPowerActual, setMPowerActual] = useState("");

  // OT fields
  const [otHoursActual, setOtHoursActual] = useState("0");
  const [otManpowerActual, setOtManpowerActual] = useState("0");

  // Process category values
  const [processValues, setProcessValues] = useState<Record<ProcessKey, string>>({
    thread_cutting: "",
    inside_check: "",
    top_side_check: "",
    buttoning: "",
    iron: "",
    get_up: "",
    poly: "",
    carton: "",
  });

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [poSearchOpen, setPoSearchOpen] = useState(false);

  const selectedWorkOrder = useMemo(() => {
    return workOrders.find(wo => wo.id === selectedWorkOrderId);
  }, [workOrders, selectedWorkOrderId]);

  useEffect(() => {
    if (profile?.factory_id) {
      fetchFormData();
    }
  }, [profile?.factory_id]);

  // Check for existing log and target when work order changes
  useEffect(() => {
    if (selectedWorkOrderId && profile?.factory_id) {
      checkExistingLogs();
    } else {
      setPreviousCartonTotal(0);
    }
  }, [selectedWorkOrderId, profile?.factory_id]);

  async function fetchFormData() {
    if (!profile?.factory_id) return;

    try {
      const { data: workOrdersData } = await supabase
        .from("work_orders")
        .select("id, po_number, buyer, style, item, order_qty, line_id")
        .eq("factory_id", profile.factory_id)
        .eq("is_active", true);

      setWorkOrders(workOrdersData || []);

      // Pre-select from URL params
      const woParam = searchParams.get("wo");
      if (woParam && (workOrdersData || []).find(w => w.id === woParam)) {
        setSelectedWorkOrderId(woParam);
      }
    } catch (error) {
      console.error("Error fetching form data:", error);
      toast.error("Failed to load form data");
    } finally {
      setLoading(false);
    }
  }

  async function checkExistingLogs() {
    if (!profile?.factory_id || !selectedWorkOrderId) return;

    try {
      const today = getTodayInTimezone(factory?.timezone || "Asia/Dhaka");

      // Build query for existing output and target
      const outputQuery = supabase
        .from("finishing_daily_logs")
        .select("*")
        .eq("factory_id", profile.factory_id)
        .eq("production_date", today)
        .is("line_id", null)
        .eq("work_order_id", selectedWorkOrderId)
        .eq("log_type", "OUTPUT");

      const targetQuery = supabase
        .from("finishing_daily_logs")
        .select("*")
        .eq("factory_id", profile.factory_id)
        .eq("production_date", today)
        .is("line_id", null)
        .eq("work_order_id", selectedWorkOrderId)
        .eq("log_type", "TARGET");

      const [outputRes, targetRes] = await Promise.all([
        outputQuery.maybeSingle(),
        targetQuery.maybeSingle()
      ]);

      if (outputRes.error) throw outputRes.error;
      if (targetRes.error) throw targetRes.error;

      // Set target for comparison
      if (targetRes.data) {
        setTargetLog(targetRes.data);
      } else {
        setTargetLog(null);
      }

      if (outputRes.data) {
        setExistingLog(outputRes.data);
        // Pre-fill form with existing data
        setRemarks(outputRes.data.remarks || "");
        setActualHours(outputRes.data.actual_hours?.toString() || "");
        setMPowerActual(outputRes.data.m_power_actual?.toString() || "");
        setOtHoursActual(outputRes.data.ot_hours_actual?.toString() || "0");
        setOtManpowerActual(outputRes.data.ot_manpower_actual?.toString() || "0");
        setProcessValues({
          thread_cutting: outputRes.data.thread_cutting?.toString() || "",
          inside_check: outputRes.data.inside_check?.toString() || "",
          top_side_check: outputRes.data.top_side_check?.toString() || "",
          buttoning: outputRes.data.buttoning?.toString() || "",
          iron: outputRes.data.iron?.toString() || "",
          get_up: outputRes.data.get_up?.toString() || "",
          poly: outputRes.data.poly?.toString() || "",
          carton: outputRes.data.carton?.toString() || "",
        });
        setIsEditing(true);
      } else {
        setExistingLog(null);
        setIsEditing(false);
        // Prefill actual hours from target's planned_hours
        setActualHours(targetRes.data?.planned_hours?.toString() || "");
        setMPowerActual(targetRes.data?.m_power_planned?.toString() || "");
        setOtHoursActual(targetRes.data?.ot_hours_planned?.toString() || "0");
        setOtManpowerActual(targetRes.data?.ot_manpower_planned?.toString() || "0");
        // Reset form
        setProcessValues({
          thread_cutting: "",
          inside_check: "",
          top_side_check: "",
          buttoning: "",
          iron: "",
          get_up: "",
          poly: "",
          carton: "",
        });
      }

      // Fetch previous carton total, passing existing log ID directly to avoid stale state
      fetchPreviousPolyTotal(outputRes.data?.id || null);
    } catch (error) {
      console.error("Error checking existing logs:", error);
    }
  }

  async function fetchPreviousPolyTotal(existingLogId: string | null) {
    if (!profile?.factory_id || !selectedWorkOrderId) return;

    try {
      // Fetch all poly values for this work order (poly is primary finishing metric)
      const { data, error } = await supabase
        .from("finishing_daily_logs")
        .select("id, poly")
        .eq("factory_id", profile.factory_id)
        .eq("work_order_id", selectedWorkOrderId)
        .eq("log_type", "OUTPUT");

      if (error) throw error;

      // Sum all poly values, excluding the current log if editing
      const total = (data || []).reduce((sum, log) => {
        if (existingLogId && log.id === existingLogId) {
          return sum;
        }
        return sum + (log.poly || 0);
      }, 0);

      setPreviousCartonTotal(total);
    } catch (error) {
      console.error("Error fetching previous poly total:", error);
    }
  }

  function handleProcessValueChange(key: ProcessKey, value: string) {
    setProcessValues(prev => ({ ...prev, [key]: value }));
  }

  function validateForm(): boolean {
    const newErrors: Record<string, string> = {};

    if (!selectedWorkOrderId) newErrors.workOrder = "PO Number is required";
    
    // At least one process value should be entered
    const hasAnyValue = PROCESS_CATEGORIES.some(cat => {
      const val = processValues[cat.key];
      return val !== "" && parseInt(val) >= 0;
    });
    
    if (!hasAnyValue) {
      newErrors.processes = "Enter at least one output value";
    }

    if (!mPowerActual || parseInt(mPowerActual) <= 0) {
      newErrors.mPowerActual = "M Power is required";
    }

    if (!actualHours || parseFloat(actualHours) <= 0) {
      newErrors.actualHours = "Actual hours must be greater than 0";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!validateForm()) {
      toast.error("Please fill in required fields");
      return;
    }

    if (!profile?.factory_id || !user?.id) {
      toast.error("Missing user or factory information");
      return;
    }

    setSubmitting(true);

    try {
      const today = getTodayInTimezone(factory?.timezone || "Asia/Dhaka");
      const logData = {
        factory_id: profile.factory_id,
        production_date: today,
        line_id: undefined,
        work_order_id: selectedWorkOrderId,
        log_type: "OUTPUT" as const,
        shift: undefined,
        thread_cutting: processValues.thread_cutting ? parseInt(processValues.thread_cutting) : 0,
        inside_check: processValues.inside_check ? parseInt(processValues.inside_check) : 0,
        top_side_check: processValues.top_side_check ? parseInt(processValues.top_side_check) : 0,
        buttoning: processValues.buttoning ? parseInt(processValues.buttoning) : 0,
        iron: processValues.iron ? parseInt(processValues.iron) : 0,
        get_up: processValues.get_up ? parseInt(processValues.get_up) : 0,
        poly: processValues.poly ? parseInt(processValues.poly) : 0,
        carton: processValues.carton ? parseInt(processValues.carton) : 0,
        remarks: remarks || null,
        m_power_actual: parseInt(mPowerActual) || 0,
        actual_hours: parseFloat(actualHours),
        ot_hours_actual: parseFloat(otHoursActual) || 0,
        ot_manpower_actual: parseInt(otManpowerActual) || 0,
        submitted_by: user.id,
      };

      if (isEditing && existingLog) {
        // Save old values to history
        const historyData = {
          log_id: existingLog.id,
          changed_by: user.id,
          old_values: existingLog,
          new_values: logData,
        };

        await supabase.from("finishing_daily_log_history").insert(historyData);

        // Update existing log
        const { error } = await supabase
          .from("finishing_daily_logs")
          .update({
            ...logData,
            updated_at: new Date().toISOString(),
            updated_by: user.id,
          })
          .eq("id", existingLog.id);

        if (error) throw error;
        toast.success("End-of-day output updated successfully!");
      } else {
        // Insert new log
        const { error } = await supabase.from("finishing_daily_logs").insert(logData);

        if (error) {
          if (error.code === "23505") {
            toast.error("Output already submitted for this date and PO. You can edit the existing entry.");
            checkExistingLogs();
            return;
          }
          throw error;
        }
        toast.success("End-of-day output submitted successfully!");
      }
      
      if (isAdminOrHigher()) {
        navigate("/dashboard");
      } else {
        navigate("/finishing/my-submissions");
      }
    } catch (error: any) {
      console.error("Error submitting output:", error);
      toast.error(error?.message || "Failed to submit output");
    } finally {
      setSubmitting(false);
    }
  }

  const calculateTotal = () => {
    // Total output = Poly (primary finishing metric)
    return parseInt(processValues.poly) || 0;
  };

  const calculateTargetTotal = () => {
    // Total target = Poly (primary finishing metric)
    if (!targetLog) return 0;
    return (targetLog as any).poly || 0;
  };

  const getVariance = (key: ProcessKey): number => {
    if (!targetLog) return 0;
    const output = parseInt(processValues[key]) || 0;
    const target = (targetLog as any)[key] || 0;
    return output - target;
  };

  const VarianceIndicator = ({ variance }: { variance: number }) => {
    if (variance > 0) {
      return <span className="text-green-600 dark:text-green-400 flex items-center gap-1"><TrendingUp className="h-3 w-3" />+{variance}</span>;
    } else if (variance < 0) {
      return <span className="text-destructive flex items-center gap-1"><TrendingDown className="h-3 w-3" />{variance}</span>;
    }
    return <span className="text-muted-foreground flex items-center gap-1"><Minus className="h-3 w-3" />0</span>;
  };

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
        <p className="text-muted-foreground">No factory assigned to your account.</p>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-3 md:py-4 lg:py-6 px-4 pb-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
          <ClipboardCheck className="h-5 w-5 text-violet-600 dark:text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">{t("nav.finishingDailyOutput")}</h1>
          <p className="text-sm text-muted-foreground">Record end-of-day production output</p>
        </div>
      </div>

      {isEditing && existingLog && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
          <p className="text-sm text-amber-800 dark:text-amber-200">Editing existing output for today</p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
      <div className="rounded-xl border border-border/50 bg-card p-5 md:p-6 space-y-6">
        {/* PO Selection */}
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground">Select PO</p>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">PO Number *</Label>
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
                            const wo = workOrders.find(w => w.id === selectedWorkOrderId);
                            return wo ? `${wo.po_number} - ${wo.style}` : "Select PO";
                          })()
                        : "Select PO"}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[min(350px,calc(100vw-2rem))] p-0" align="start">
                  <Command shouldFilter={true}>
                    <CommandInput placeholder="Search PO, buyer, style..." />
                    <CommandList>
                      <CommandEmpty>No PO found.</CommandEmpty>
                      <CommandGroup>
                        {workOrders.map((wo) => (
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
              {errors.workOrder && <p className="text-xs text-destructive">{errors.workOrder}</p>}
          </div>
        </div>

        {/* Order Details */}
        {selectedWorkOrder && (
          <div className="rounded-lg bg-muted/30 border border-border/40 px-4 py-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
              <div><span className="text-[11px] text-muted-foreground">Buyer</span><p className="font-medium">{selectedWorkOrder.buyer}</p></div>
              <div><span className="text-[11px] text-muted-foreground">Style</span><p className="font-medium">{selectedWorkOrder.style}</p></div>
              <div><span className="text-[11px] text-muted-foreground">Order Qty</span><p className="font-medium font-mono">{selectedWorkOrder.order_qty.toLocaleString()}</p></div>
            </div>
          </div>
        )}

        {/* Target vs Output Comparison (if target exists) */}
        {targetLog && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>Target vs Output Comparison</span>
                <Badge variant="outline">Target exists</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-2 text-xs mb-3 font-medium text-muted-foreground">
                <div>Process</div>
                <div className="text-right">Target</div>
                <div className="text-right">Output</div>
                <div className="text-right">Variance</div>
              </div>
              <div className="space-y-2">
                {PROCESS_CATEGORIES.map((cat) => {
                  const target = (targetLog as any)[cat.key] || 0;
                  const output = parseInt(processValues[cat.key]) || 0;
                  const variance = output - target;
                  
                  return (
                    <div key={cat.key} className="grid grid-cols-4 gap-2 text-sm">
                      <div className="truncate">{cat.label}</div>
                      <div className="text-right text-muted-foreground">{target}</div>
                      <div className="text-right font-medium">{output}</div>
                      <div className="text-right">
                        <VarianceIndicator variance={variance} />
                      </div>
                    </div>
                  );
                })}
                <div className="border-t pt-2 mt-2 grid grid-cols-4 gap-2 text-sm font-medium">
                  <div>Total</div>
                  <div className="text-right text-muted-foreground">{calculateTargetTotal()}</div>
                  <div className="text-right">{calculateTotal()}</div>
                  <div className="text-right">
                    <VarianceIndicator variance={calculateTotal() - calculateTargetTotal()} />
                  </div>
                </div>
                {(targetLog?.planned_hours != null || actualHours) && (
                  <div className="border-t pt-2 mt-2 grid grid-cols-4 gap-2 text-sm">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      Hours
                    </div>
                    <div className="text-right text-muted-foreground">{targetLog?.planned_hours ?? "—"}</div>
                    <div className="text-right font-medium">{actualHours || "—"}</div>
                    <div className="text-right">
                      {targetLog?.planned_hours != null && actualHours ? (
                        <VarianceIndicator variance={parseFloat(actualHours) - targetLog.planned_hours} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="border-t border-border/40" />

        {/* Process Category Outputs */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground">End-of-Day Output by Process</p>
            <span className="text-xs font-mono text-muted-foreground">Total: {calculateTotal().toLocaleString()} pcs</span>
          </div>
          {errors.processes && <p className="text-xs text-destructive mb-3">{errors.processes}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PROCESS_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const variance = getVariance(cat.key);
              const hasTarget = targetLog !== null;
              return (
                <div key={cat.key} className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      {cat.label}
                    </span>
                    {hasTarget && processValues[cat.key] && (
                      <span className="text-[11px]"><VarianceIndicator variance={variance} /></span>
                    )}
                  </Label>
                  <Input type="number" min="0" value={processValues[cat.key]} onChange={(e) => handleProcessValueChange(cat.key, e.target.value)} placeholder={targetLog ? `Target: ${(targetLog as any)[cat.key] || 0}` : "0"} className="h-10" />
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t border-border/40" />

        {/* Manpower & Hours */}
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground">Manpower & Hours</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">M Power Actual *</Label>
              <Input type="number" min="1" value={mPowerActual} onChange={(e) => setMPowerActual(e.target.value)} placeholder="0" className={`h-10 ${errors.mPowerActual ? "border-destructive" : ""}`} />
              {errors.mPowerActual && <p className="text-xs text-destructive">{errors.mPowerActual}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Actual Hours Worked *</Label>
              <Input type="number" step="0.5" min="0.5" max="24" value={actualHours} onChange={(e) => setActualHours(e.target.value)} placeholder={targetLog?.planned_hours ? `Planned: ${targetLog.planned_hours}h` : "e.g. 8"} className={`h-10 ${errors.actualHours ? "border-destructive" : ""}`} />
              {errors.actualHours && <p className="text-xs text-destructive">{errors.actualHours}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">OT Hours Actual</Label>
              <Input type="number" step="0.5" value={otHoursActual} onChange={(e) => setOtHoursActual(e.target.value)} placeholder="0" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">OT Manpower Actual</Label>
              <Input type="number" value={otManpowerActual} onChange={(e) => setOtManpowerActual(e.target.value)} placeholder="0" className="h-10" />
            </div>
          </div>
        </div>

        {/* Order Progress - appears when Carton has value */}
        {selectedWorkOrder && processValues.carton && parseInt(processValues.carton) > 0 && (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Archive className="h-4 w-4" />
                Order Progress (Finished Goods)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Order Qty:</span>
                    <p className="text-lg font-bold">{selectedWorkOrder.order_qty.toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Previous Total Carton:</span>
                    <p className="text-lg font-bold font-mono">{previousCartonTotal.toLocaleString()}</p>
                  </div>
                </div>
                <div className="border-t pt-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Today's Poly Entry:</span>
                      <p className="text-lg font-bold text-primary font-mono">+{parseInt(processValues.poly).toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">New Total Poly:</span>
                      <p className="text-lg font-bold font-mono">{(previousCartonTotal + parseInt(processValues.poly)).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
                <div className="border-t pt-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Remaining:</span>
                    {(() => {
                      const newTotal = previousCartonTotal + parseInt(processValues.poly);
                      const remaining = selectedWorkOrder.order_qty - newTotal;
                      return (
                        <span className={cn("text-lg font-bold font-mono", remaining > 0 ? "text-amber-600" : remaining < 0 ? "text-green-600" : "text-green-600")}>
                          {remaining > 0 ? remaining.toLocaleString() : remaining === 0 ? "✓ Complete" : `+${Math.abs(remaining).toLocaleString()} extras`}
                        </span>
                      );
                    })()}
                  </div>
                  {/* Progress bar */}
                  <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={cn(
                        "h-full rounded-full transition-all",
                        (previousCartonTotal + parseInt(processValues.poly)) >= selectedWorkOrder.order_qty 
                          ? "bg-green-500" 
                          : "bg-primary"
                      )}
                      style={{ 
                        width: `${Math.min(100, ((previousCartonTotal + parseInt(processValues.poly)) / selectedWorkOrder.order_qty) * 100)}%` 
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 text-right">
                    {((previousCartonTotal + parseInt(processValues.poly)) / selectedWorkOrder.order_qty * 100).toFixed(1)}% of order
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="border-t border-border/40" />

        {/* Remarks */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Remarks</Label>
          <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Any notes about today's production..." rows={2} />
        </div>
      </div>

        {/* Submit */}
        <Button type="submit" className="w-full h-11 font-semibold mt-5" disabled={submitting}>
          {submitting ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {isEditing ? "Updating..." : "Submitting..."}</>
          ) : (
            isEditing ? "Update End-of-Day Output" : "Submit End-of-Day Output"
          )}
        </Button>
      </form>
    </div>
  );
}
