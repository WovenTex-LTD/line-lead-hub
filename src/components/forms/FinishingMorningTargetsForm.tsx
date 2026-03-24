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

export default function FinishingMorningTargetsForm() {
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

  // Form state
  const [selectedLineId, setSelectedLineId] = useState("");
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState("");
  const [perHourTarget, setPerHourTarget] = useState("");
  const [mPowerPlanned, setMPowerPlanned] = useState("");
  const [otManpowerPlanned, setOtManpowerPlanned] = useState("0");
  const [dayHourPlanned, setDayHourPlanned] = useState("");
  const [dayOverTimePlanned, setDayOverTimePlanned] = useState("0");
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
      toast.error("Failed to load form data");
    } finally {
      setLoading(false);
    }
  }

  const formSchema = z.object({
    line: z.string().min(1, "Line is required"),
    workOrder: z.string().min(1, "PO is required"),
    perHourTarget: z.number().int().positive("Per hour target is required"),
    mPowerPlanned: z.number().int().positive("M Power is required"),
    otManpowerPlanned: z.number().int().min(0, "OT Manpower must be 0 or more"),
    dayHourPlanned: z.number().min(0, "Day hours is required"),
    dayOverTimePlanned: z.number().min(0, "OT hours must be 0 or more"),
  });

  function validateForm(): boolean {
    const result = formSchema.safeParse({
      line: selectedLineId,
      workOrder: selectedWorkOrderId,
      perHourTarget: parseInt(perHourTarget) || 0,
      mPowerPlanned: parseInt(mPowerPlanned) || 0,
      otManpowerPlanned: otManpowerPlanned === "" ? -1 : parseInt(otManpowerPlanned),
      dayHourPlanned: parseFloat(dayHourPlanned) || -1,
      dayOverTimePlanned: dayOverTimePlanned === "" ? -1 : parseFloat(dayOverTimePlanned),
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
        style_no: selectedWorkOrder?.style || "",
        item_name: selectedWorkOrder?.item || "",
        order_qty: selectedWorkOrder?.order_qty || 0,
        per_hour_target: parseInt(perHourTarget),
        m_power_planned: parseInt(mPowerPlanned),
        ot_manpower_planned: parseInt(otManpowerPlanned) || 0,
        day_hour_planned: parseFloat(dayHourPlanned),
        day_over_time_planned: parseFloat(dayOverTimePlanned),
        remarks: remarks || null,
        is_late: isLate,
      };

      const result = await offlineSubmit("finishing_targets", "finishing_targets", insertData as Record<string, unknown>, {
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

      toast.success("Finishing targets submitted successfully!");

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
              <Label>M Power Planned *</Label>
              <Input
                type="number"
                value={mPowerPlanned}
                onChange={(e) => setMPowerPlanned(e.target.value)}
                placeholder="0"
                className={errors.mPowerPlanned ? "border-destructive" : ""}
              />
              {errors.mPowerPlanned && <p className="text-sm text-destructive">{errors.mPowerPlanned}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Day Hours Planned *</Label>
              <Input
                type="number"
                step="0.5"
                value={dayHourPlanned}
                onChange={(e) => setDayHourPlanned(e.target.value)}
                placeholder="0"
                className={errors.dayHourPlanned ? "border-destructive" : ""}
              />
              {errors.dayHourPlanned && <p className="text-sm text-destructive">{errors.dayHourPlanned}</p>}
            </div>

            <div className="space-y-2">
              <Label>OT Hours Planned *</Label>
              <Input
                type="number"
                step="0.5"
                value={dayOverTimePlanned}
                onChange={(e) => setDayOverTimePlanned(e.target.value)}
                placeholder="0"
                className={errors.dayOverTimePlanned ? "border-destructive" : ""}
              />
              {errors.dayOverTimePlanned && <p className="text-sm text-destructive">{errors.dayOverTimePlanned}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>OT Manpower Planned</Label>
              <Input
                type="number"
                value={otManpowerPlanned}
                onChange={(e) => setOtManpowerPlanned(e.target.value)}
                placeholder="0"
              />
            </div>
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
            "Submit Finishing Targets"
          )}
        </Button>
      </div>
    </form>
  );
}
