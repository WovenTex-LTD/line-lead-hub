import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
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
import { format } from "date-fns";
import { useOfflineSubmission } from "@/hooks/useOfflineSubmission";
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

export default function SewingMorningTargetsForm() {
  const navigate = useNavigate();
  const { user, profile, factory, isAdminOrHigher } = useAuth();
  const { submit: offlineSubmit } = useOfflineSubmission();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

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
      toast.error("Failed to load form data");
    } finally {
      setLoading(false);
    }
  }

  const formSchema = z.object({
    line: z.string().min(1, "Line is required"),
    workOrder: z.string().min(1, "PO is required"),
    perHourTarget: z.number().int().positive("Per hour target is required"),
    manpowerPlanned: z.number().int().positive("Manpower is required"),
    hoursPlanned: z.number().min(0.5, "Hours planned is required").max(24, "Max 24 hours"),
    otHoursPlanned: z.number().min(0, "OT hours must be 0 or more"),
    plannedStage: z.string().min(1, "Stage is required"),
    plannedStageProgress: z.string().min(1, "Stage progress is required"),
    nextMilestone: z.string().min(1, "Next milestone is required"),
  });

  function validateForm(): boolean {
    const result = formSchema.safeParse({
      line: selectedLineId,
      workOrder: selectedWorkOrderId,
      perHourTarget: parseInt(perHourTarget) || 0,
      manpowerPlanned: parseInt(manpowerPlanned) || 0,
      hoursPlanned: hoursPlanned === "" ? 0 : parseFloat(hoursPlanned),
      otHoursPlanned: otHoursPlanned === "" ? -1 : parseFloat(otHoursPlanned),
      plannedStage: plannedStageId,
      plannedStageProgress: plannedStageProgress,
      nextMilestone: nextMilestone,
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
      toast.error("Please fill in all required fields");
      return;
    }

    if (!profile?.factory_id || !user?.id) {
      toast.error("Missing user or factory information");
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

      const result = await offlineSubmit("sewing_targets", "sewing_targets", insertData as Record<string, unknown>, {
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
          toast.error("Target already submitted for this line and PO today");
        } else {
          throw new Error(result.error);
        }
        return;
      }

      toast.success("Sewing targets submitted successfully!");

      if (isAdminOrHigher()) {
        navigate("/dashboard");
      } else {
        navigate("/my-submissions");
      }
    } catch (error: any) {
      console.error("Error submitting targets:", error);
      toast.error(error?.message || "Failed to submit targets");
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
        <p className="text-muted-foreground">No factory assigned to your account.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Line & PO Selection */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Select Line & PO</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Line No. *</Label>
            <Select value={selectedLineId} onValueChange={setSelectedLineId}>
              <SelectTrigger className={errors.line ? "border-destructive" : ""}>
                <SelectValue placeholder="Select line" />
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
            <Label>PO Number *</Label>
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
        <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Order Details</p>
          <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">Buyer</span>
              <p className="font-medium">{selectedWorkOrder.buyer}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Style</span>
              <p className="font-medium">{selectedWorkOrder.style}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Order Qty</span>
              <p className="font-medium font-mono">{selectedWorkOrder.order_qty.toLocaleString()}</p>
            </div>
            {selectedWorkOrder.item && (
              <div>
                <span className="text-xs text-muted-foreground">Item</span>
                <p className="font-medium">{selectedWorkOrder.item}</p>
              </div>
            )}
            {unitName && (
              <div>
                <span className="text-xs text-muted-foreground">Unit</span>
                <p className="font-medium">{unitName}</p>
              </div>
            )}
            {floorName && (
              <div>
                <span className="text-xs text-muted-foreground">Floor</span>
                <p className="font-medium">{floorName}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Target Fields */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Today's Targets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Per Hour Target *</Label>
              <Input
                type="number"
                value={perHourTarget}
                onChange={(e) => setPerHourTarget(e.target.value)}
                placeholder="0"
                className={errors.perHourTarget ? "border-destructive" : ""}
              />
              {errors.perHourTarget && <p className="text-sm text-destructive">{errors.perHourTarget}</p>}
            </div>

            <div className="space-y-2">
              <Label>Manpower Planned *</Label>
              <Input
                type="number"
                value={manpowerPlanned}
                onChange={(e) => setManpowerPlanned(e.target.value)}
                placeholder="0"
                className={errors.manpowerPlanned ? "border-destructive" : ""}
              />
              {errors.manpowerPlanned && <p className="text-sm text-destructive">{errors.manpowerPlanned}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Hours Planned *</Label>
              <Input
                type="number"
                step="0.5"
                min="0"
                max="24"
                value={hoursPlanned}
                onChange={(e) => setHoursPlanned(e.target.value)}
                placeholder="0"
                className={errors.hoursPlanned ? "border-destructive" : ""}
              />
              {errors.hoursPlanned && <p className="text-sm text-destructive">{errors.hoursPlanned}</p>}
            </div>

            <div className="space-y-2">
              <Label>OT Hours Planned *</Label>
              <Input
                type="number"
                step="0.5"
                value={otHoursPlanned}
                onChange={(e) => setOtHoursPlanned(e.target.value)}
                placeholder="0"
                className={errors.otHoursPlanned ? "border-destructive" : ""}
              />
              {errors.otHoursPlanned && <p className="text-sm text-destructive">{errors.otHoursPlanned}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stage & Progress */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Stage & Progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Planned Stage *</Label>
            <Select value={plannedStageId} onValueChange={setPlannedStageId}>
              <SelectTrigger className={errors.plannedStage ? "border-destructive" : ""}>
                <SelectValue placeholder="Select stage" />
              </SelectTrigger>
              <SelectContent>
                {stages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.plannedStage && <p className="text-sm text-destructive">{errors.plannedStage}</p>}
          </div>

          <div className="space-y-2">
            <Label>Stage Progress *</Label>
            <Select value={plannedStageProgress} onValueChange={setPlannedStageProgress}>
              <SelectTrigger className={errors.plannedStageProgress ? "border-destructive" : ""}>
                <SelectValue placeholder="Select progress" />
              </SelectTrigger>
              <SelectContent>
                {progressOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.label}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.plannedStageProgress && <p className="text-sm text-destructive">{errors.plannedStageProgress}</p>}
          </div>

          <div className="space-y-2">
            <Label>Next Milestone (Tomorrow) *</Label>
            <Select value={nextMilestone} onValueChange={setNextMilestone}>
              <SelectTrigger className={errors.nextMilestone ? "border-destructive" : ""}>
                <SelectValue placeholder="Select milestone" />
              </SelectTrigger>
              <SelectContent>
                {milestoneOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.label}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.nextMilestone && <p className="text-sm text-destructive">{errors.nextMilestone}</p>}
          </div>

          <div className="space-y-2">
            <Label>Estimated Ex-Factory Date</Label>
            <Input
              type="date"
              value={estimatedExFactory}
              onChange={(e) => setEstimatedExFactory(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Optional Fields */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Optional</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>Remarks</Label>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Any additional notes..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Submit Button */}
      <div className="mt-6 pb-2">
        <Button type="submit" className="w-full h-11 text-sm font-semibold" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Submitting...
            </>
          ) : (
            "Submit Sewing Targets"
          )}
        </Button>
      </div>
    </form>
  );
}
