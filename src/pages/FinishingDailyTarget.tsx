import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Search, Scissors, CheckCircle, Shirt, CircleDot, Flame, Package, Box, Archive, Clock, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
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

interface WorkOrder {
  id: string;
  po_number: string;
  buyer: string;
  style: string;
  item: string | null;
  order_qty: number;
  line_id: string | null;
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

export default function FinishingDailyTarget() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const { user, profile, factory, isAdminOrHigher } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [existingLog, setExistingLog] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Master data
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);

  // Form state - date is automatically set to today on submission
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState("");
  const [remarks, setRemarks] = useState("");
  const [plannedHours, setPlannedHours] = useState("");

  // Manpower
  const [mPowerPlanned, setMPowerPlanned] = useState("");

  // OT fields
  const [otHoursPlanned, setOtHoursPlanned] = useState("0");
  const [otManpowerPlanned, setOtManpowerPlanned] = useState("0");

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

  // Check for existing log when work order changes
  useEffect(() => {
    if (selectedWorkOrderId && profile?.factory_id) {
      checkExistingLog();
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

  async function checkExistingLog() {
    if (!profile?.factory_id || !selectedWorkOrderId) return;

    try {
      const today = getTodayInTimezone(factory?.timezone || "Asia/Dhaka");
      const query = supabase
        .from("finishing_daily_logs")
        .select("*")
        .eq("factory_id", profile.factory_id)
        .eq("production_date", today)
        .is("line_id", null)
        .eq("work_order_id", selectedWorkOrderId)
        .eq("log_type", "TARGET");

      const { data, error } = await query.maybeSingle();

      if (error) throw error;

      if (data) {
        setExistingLog(data);
        // Pre-fill form with existing data
        setRemarks(data.remarks || "");
        setPlannedHours(data.planned_hours != null ? data.planned_hours.toString() : "");
        setMPowerPlanned(data.m_power_planned?.toString() || "");
        setOtHoursPlanned(data.ot_hours_planned?.toString() || "0");
        setOtManpowerPlanned(data.ot_manpower_planned?.toString() || "0");
        setProcessValues({
          thread_cutting: data.thread_cutting?.toString() || "",
          inside_check: data.inside_check?.toString() || "",
          top_side_check: data.top_side_check?.toString() || "",
          buttoning: data.buttoning?.toString() || "",
          iron: data.iron?.toString() || "",
          get_up: data.get_up?.toString() || "",
          poly: data.poly?.toString() || "",
          carton: data.carton?.toString() || "",
        });
        setIsEditing(true);
      } else {
        setExistingLog(null);
        setIsEditing(false);
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
    } catch (error) {
      console.error("Error checking existing log:", error);
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
      newErrors.processes = "Enter at least one target value";
    }

    if (!mPowerPlanned || parseInt(mPowerPlanned) <= 0) {
      newErrors.mPowerPlanned = "M Power is required";
    }

    if (!plannedHours || parseFloat(plannedHours) <= 0) {
      newErrors.plannedHours = "Planned hours must be greater than 0";
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
        log_type: "TARGET" as const,
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
        submitted_by: user.id,
        m_power_planned: parseInt(mPowerPlanned) || 0,
        planned_hours: parseFloat(plannedHours),
        ot_hours_planned: parseFloat(otHoursPlanned) || 0,
        ot_manpower_planned: parseInt(otManpowerPlanned) || 0,
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
        toast.success("Daily targets updated successfully!");
      } else {
        // Insert new log
        const { error } = await supabase.from("finishing_daily_logs").insert(logData);

        if (error) {
          if (error.code === "23505") {
            toast.error("Target already submitted for this date and PO. You can edit the existing entry.");
            checkExistingLog();
            return;
          }
          throw error;
        }
        toast.success("Daily targets submitted successfully!");
      }
      
      if (isAdminOrHigher()) {
        navigate("/dashboard");
      } else {
        navigate("/finishing/my-submissions");
      }
    } catch (error: any) {
      console.error("Error submitting targets:", error);
      toast.error(error?.message || "Failed to submit targets");
    } finally {
      setSubmitting(false);
    }
  }

  const calculateTotal = () => {
    // Total = Poly (primary finishing metric)
    const poly = parseInt(processValues.poly) || 0;
    return poly;
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
          <Crosshair className="h-5 w-5 text-violet-600 dark:text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">{t("nav.finishingDailyTarget")}</h1>
          <p className="text-sm text-muted-foreground">Set daily production targets for each process</p>
        </div>
      </div>

      {isEditing && existingLog && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
          <p className="text-sm text-amber-800 dark:text-amber-200">Editing existing target for today</p>
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

        <div className="border-t border-border/40" />

        {/* Process Category Targets */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground">Daily Target by Process</p>
            <span className="text-xs font-mono text-muted-foreground">Total: {calculateTotal().toLocaleString()} pcs</span>
          </div>
          {errors.processes && <p className="text-xs text-destructive mb-3">{errors.processes}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PROCESS_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <div key={cat.key} className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    {cat.label}
                  </Label>
                  <Input type="number" min="0" value={processValues[cat.key]} onChange={(e) => handleProcessValueChange(cat.key, e.target.value)} placeholder="0" className="h-10" />
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
              <Label className="text-xs font-medium">M Power Planned *</Label>
              <Input type="number" min="1" value={mPowerPlanned} onChange={(e) => setMPowerPlanned(e.target.value)} placeholder="0" className={`h-10 ${errors.mPowerPlanned ? "border-destructive" : ""}`} />
              {errors.mPowerPlanned && <p className="text-xs text-destructive">{errors.mPowerPlanned}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Total Hours Planned *</Label>
              <Input type="number" step="0.5" min="0.5" max="24" value={plannedHours} onChange={(e) => setPlannedHours(e.target.value)} placeholder="e.g. 10" className={`h-10 ${errors.plannedHours ? "border-destructive" : ""}`} />
              {errors.plannedHours && <p className="text-xs text-destructive">{errors.plannedHours}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">OT Hours Planned</Label>
              <Input type="number" step="0.5" value={otHoursPlanned} onChange={(e) => setOtHoursPlanned(e.target.value)} placeholder="0" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">OT Manpower Planned</Label>
              <Input type="number" value={otManpowerPlanned} onChange={(e) => setOtManpowerPlanned(e.target.value)} placeholder="0" className="h-10" />
            </div>
          </div>
        </div>

        <div className="border-t border-border/40" />

        {/* Remarks */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Remarks</Label>
          <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Any additional notes or instructions..." rows={2} />
        </div>
      </div>

        {/* Submit */}
        <Button type="submit" className="w-full h-11 font-semibold mt-5" disabled={submitting}>
          {submitting ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {isEditing ? "Updating..." : "Submitting..."}</>
          ) : (
            isEditing ? "Update Daily Targets" : "Submit Daily Targets"
          )}
        </Button>
      </form>
    </div>
  );
}
