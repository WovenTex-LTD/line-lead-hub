import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Search, ClipboardCheck, ChevronDown, ChevronRight, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// Card kept for collapsible leftover section and cumulative totals
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { isLateForCutoff, getTodayInTimezone } from "@/lib/date-utils";
import { useOfflineSubmission } from "@/hooks/useOfflineSubmission";
import { useHeadcountCost } from "@/hooks/useHeadcountCost";
import { EstimatedCostDisplay } from "@/components/EstimatedCostDisplay";

interface WorkOrder {
  id: string;
  po_number: string;
  buyer: string;
  style: string;
  item: string | null;
  order_qty: number;
  color: string | null;
  line_id: string | null;
}

interface Line {
  id: string;
  line_id: string;
  name: string | null;
}

interface ExistingActual {
  id: string;
  day_cutting: number;
  day_input: number;
  total_cutting: number | null;
  total_input: number | null;
  balance: number | null;
  man_power: number;
  marker_capacity: number;
  lay_capacity: number;
  cutting_capacity: number;
  under_qty: number | null;
  leftover_recorded: boolean | null;
  leftover_type: string | null;
  leftover_unit: string | null;
  leftover_quantity: number | null;
  leftover_notes: string | null;
  leftover_location: string | null;
  leftover_photo_urls: string[] | null;
  hours_actual: number | null;
  ot_hours_actual: number | null;
  ot_manpower_actual: number | null;
}

export default function CuttingEndOfDay() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, i18n } = useTranslation();
  const { user, profile, factory, isAdminOrHigher } = useAuth();
  const { submit: offlineSubmit } = useOfflineSubmission();
  const { calculateEstimatedCost } = useHeadcountCost();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const dateLocale = i18n.language === 'bn' ? 'bn-BD' : i18n.language === 'zh' ? 'zh-CN' : 'en-US';

  // Master data
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [lineSearchOpen, setLineSearchOpen] = useState(false);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null);
  const [selectedLine, setSelectedLine] = useState<Line | null>(null);

  // Daily Actuals fields (same as original form)
  const [dayCutting, setDayCutting] = useState("");
  const [dayInput, setDayInput] = useState("");

  // Actual Capacities fields
  const [manPower, setManPower] = useState("");
  const [markerCapacity, setMarkerCapacity] = useState("");
  const [layCapacity, setLayCapacity] = useState("");
  const [cuttingCapacity, setCuttingCapacity] = useState("");
  const [underQty, setUnderQty] = useState("0");

  // Hours fields
  const [hoursActual, setHoursActual] = useState("");
  const [otHoursActual, setOtHoursActual] = useState("0");
  const [otManpowerActual, setOtManpowerActual] = useState("0");

  // Computed totals (only for actuals)
  const [totalCutting, setTotalCutting] = useState(0);
  const [totalInput, setTotalInput] = useState(0);
  const [balance, setBalance] = useState(0);

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [existingActual, setExistingActual] = useState<ExistingActual | null>(null);

  // Left Over / Fabric Saved section
  const [leftoverOpen, setLeftoverOpen] = useState(false);
  const [leftoverRecorded, setLeftoverRecorded] = useState(false);
  const [leftoverType, setLeftoverType] = useState("");
  const [leftoverUnit, setLeftoverUnit] = useState("");
  const [leftoverQuantity, setLeftoverQuantity] = useState("");
  const [leftoverNotes, setLeftoverNotes] = useState("");
  const [leftoverLocation, setLeftoverLocation] = useState("");

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Filter work orders by selected line
  const filteredWorkOrders = workOrders.filter(wo => {
    if (!selectedLine) return true;
    return wo.line_id === selectedLine.id || !wo.line_id;
  });

  useEffect(() => {
    if (profile?.factory_id) {
      fetchFormData();
    }
  }, [profile?.factory_id]);

  // Check for existing data when line + work order are selected
  useEffect(() => {
    if (selectedLine && selectedWorkOrder && profile?.factory_id) {
      checkExistingData();
      calculateTotals();
    }
  }, [selectedLine?.id, selectedWorkOrder?.id, profile?.factory_id]);

  // Clear PO selection when line changes
  useEffect(() => {
    if (selectedLine && selectedWorkOrder) {
      if (selectedWorkOrder.line_id && selectedWorkOrder.line_id !== selectedLine.id) {
        setSelectedWorkOrder(null);
      }
    }
  }, [selectedLine?.id, selectedWorkOrder?.id, workOrders]);

  // Recalculate totals when day values change
  useEffect(() => {
    if (selectedWorkOrder && profile?.factory_id) {
      calculateTotals();
    }
  }, [dayCutting, dayInput]);

  async function fetchFormData() {
    if (!profile?.factory_id) return;

    try {
      const [workOrdersRes, linesRes] = await Promise.all([
        supabase
          .from("work_orders")
          .select("id, po_number, buyer, style, item, order_qty, color, line_id")
          .eq("factory_id", profile.factory_id)
          .eq("is_active", true)
          .order("po_number", { ascending: true }),
        supabase
          .from("lines")
          .select("id, line_id, name")
          .eq("factory_id", profile.factory_id)
          .eq("is_active", true)
          .order("line_id", { ascending: true }),
      ]);

      setWorkOrders(workOrdersRes.data || []);
      
      // Sort lines numerically
      const sortedLines = (linesRes.data || []).sort((a, b) => {
        const numA = parseInt(a.line_id.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.line_id.replace(/\D/g, '')) || 0;
        return numA - numB;
      });
      setLines(sortedLines);

      // Pre-select from URL params if editing
      const lineParam = searchParams.get('line');
      const woParam = searchParams.get('wo');
      if (lineParam) {
        const line = sortedLines.find(l => l.id === lineParam);
        if (line) setSelectedLine(line);
      }
      if (woParam && workOrdersRes.data) {
        const wo = workOrdersRes.data.find(w => w.id === woParam);
        if (wo) setSelectedWorkOrder(wo);
      }
    } catch (error) {
      console.error("Error fetching form data:", error);
      toast.error(t('cutting.failedToLoadSubmission'));
    } finally {
      setLoading(false);
    }
  }

  async function checkExistingData() {
    if (!profile?.factory_id || !selectedLine || !selectedWorkOrder) return;

    const today = getTodayInTimezone(factory?.timezone || "Asia/Dhaka");

    try {
      // Check for today's actual
      const { data: actualData, error } = await supabase
        .from("cutting_actuals")
        .select("id, day_cutting, day_input, total_cutting, total_input, balance, man_power, marker_capacity, lay_capacity, cutting_capacity, under_qty, leftover_recorded, leftover_type, leftover_unit, leftover_quantity, leftover_notes, leftover_location, leftover_photo_urls, hours_actual, ot_hours_actual, ot_manpower_actual")
        .eq("factory_id", profile.factory_id)
        .eq("line_id", selectedLine.id)
        .eq("work_order_id", selectedWorkOrder.id)
        .eq("production_date", today)
        .maybeSingle();

      if (error) throw error;

      if (actualData) {
        setIsEditing(true);
        setExistingActual(actualData as ExistingActual);
        setDayCutting(String(actualData.day_cutting));
        setDayInput(String(actualData.day_input));
        setManPower(String(actualData.man_power || 0));
        setMarkerCapacity(String(actualData.marker_capacity || 0));
        setLayCapacity(String(actualData.lay_capacity || 0));
        setCuttingCapacity(String(actualData.cutting_capacity || 0));
        setUnderQty(String(actualData.under_qty || 0));
        setHoursActual(actualData.hours_actual ? String(actualData.hours_actual) : "");
        setOtHoursActual(String(actualData.ot_hours_actual || 0));
        setOtManpowerActual(String(actualData.ot_manpower_actual || 0));
        // Load leftover data if it exists
        if (actualData.leftover_recorded) {
          setLeftoverOpen(true);
          setLeftoverRecorded(true);
          setLeftoverType(actualData.leftover_type || "");
          setLeftoverUnit(actualData.leftover_unit || "");
          setLeftoverQuantity(actualData.leftover_quantity ? String(actualData.leftover_quantity) : "");
          setLeftoverNotes(actualData.leftover_notes || "");
          setLeftoverLocation(actualData.leftover_location || "");
          
        }
      } else {
        setIsEditing(false);
        setExistingActual(null);
        if (!dayCutting && !dayInput) {
          setDayCutting("");
          setDayInput("");
          setManPower("");
          setMarkerCapacity("");
          setLayCapacity("");
          setCuttingCapacity("");
          setUnderQty("0");
          setOtHoursActual("0");
          setOtManpowerActual("0");
        }
        // Reset leftover state
        setLeftoverOpen(false);
        setLeftoverRecorded(false);
        setLeftoverType("");
        setLeftoverUnit("");
        setLeftoverQuantity("");
        setLeftoverNotes("");
        setLeftoverLocation("");
      }
    } catch (error) {
      console.error("Error checking existing data:", error);
    }
  }

  async function calculateTotals() {
    if (!profile?.factory_id || !selectedWorkOrder) return;

    try {
      const today = getTodayInTimezone(factory?.timezone || "Asia/Dhaka");

      // Get all previous actuals for this work order (excluding today if editing)
      const { data: previousActuals } = await supabase
        .from("cutting_actuals")
        .select("day_cutting, day_input")
        .eq("factory_id", profile.factory_id)
        .eq("work_order_id", selectedWorkOrder.id)
        .lt("production_date", today);

      const prevTotalCutting = previousActuals?.reduce((sum, a) => sum + (a.day_cutting || 0), 0) || 0;
      const prevTotalInput = previousActuals?.reduce((sum, a) => sum + (a.day_input || 0), 0) || 0;

      const todayCutting = parseInt(dayCutting) || 0;
      const todayInput = parseInt(dayInput) || 0;

      const newTotalCutting = prevTotalCutting + todayCutting;
      const newTotalInput = prevTotalInput + todayInput;
      const orderQty = selectedWorkOrder?.order_qty || 0;
      const newBalance = orderQty - newTotalInput;

      setTotalCutting(newTotalCutting);
      setTotalInput(newTotalInput);
      setBalance(newBalance);
    } catch (error) {
      console.error("Error calculating totals:", error);
    }
  }

  const getSearchableValue = (wo: WorkOrder) => {
    return [wo.po_number, wo.buyer, wo.style, wo.item].filter(Boolean).join(" ").toLowerCase();
  };

  function validateForm(): boolean {
    const newErrors: Record<string, string> = {};

    if (!selectedLine) newErrors.line = t('cutting.lineRequired');
    if (!selectedWorkOrder) newErrors.workOrder = t('cutting.poRequired');
    if (!dayCutting || parseInt(dayCutting) < 0) newErrors.dayCutting = t('cutting.dayCuttingRequired');
    if (!dayInput || parseInt(dayInput) < 0) newErrors.dayInput = t('cutting.dayInputRequired');
    if (!manPower || parseInt(manPower) < 0) newErrors.manPower = t('cutting.manPowerRequired');
    if (!markerCapacity || parseInt(markerCapacity) < 0) newErrors.markerCapacity = t('cutting.markerCapacityRequired');
    if (!layCapacity || parseInt(layCapacity) < 0) newErrors.layCapacity = t('cutting.layCapacityRequired');
    if (!cuttingCapacity || parseInt(cuttingCapacity) < 0) newErrors.cuttingCapacity = t('cutting.cuttingCapacityRequired');
    if (!hoursActual || parseFloat(hoursActual) < 0.5) newErrors.hoursActual = t('cutting.hoursRequired');

    // Leftover validation: if leftover is recorded, unit and quantity are required
    if (leftoverRecorded) {
      if (!leftoverUnit) newErrors.leftoverUnit = "Unit is required when recording leftover";
      if (!leftoverQuantity || parseFloat(leftoverQuantity) < 0) newErrors.leftoverQuantity = "Quantity is required when recording leftover";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!validateForm()) {
      toast.error(t('cutting.fillAllRequired'));
      return;
    }

    if (!profile?.factory_id || !user?.id || !selectedWorkOrder || !selectedLine) {
      toast.error("Submission failed");
      return;
    }

    setSubmitting(true);

    try {
      // Check if submission is late (using factory timezone)
      const timezone = factory?.timezone || "Asia/Dhaka";
      const today = getTodayInTimezone(timezone);
      const isLate = factory?.evening_actual_cutoff
        ? isLateForCutoff(factory.evening_actual_cutoff, timezone)
        : false;

      const estimatedCost = calculateEstimatedCost(parseInt(manPower), parseFloat(hoursActual));

      const actualData = {
        factory_id: profile.factory_id,
        production_date: today,
        submitted_by: user.id,
        submitted_at: new Date().toISOString(),
        line_id: selectedLine.id,
        work_order_id: selectedWorkOrder.id,
        buyer: selectedWorkOrder.buyer,
        style: selectedWorkOrder.style,
        po_no: selectedWorkOrder.po_number,
        colour: selectedWorkOrder.color || "",
        order_qty: selectedWorkOrder.order_qty,
        day_cutting: parseInt(dayCutting),
        day_input: parseInt(dayInput),
        total_cutting: totalCutting,
        total_input: totalInput,
        balance: balance,
        man_power: parseInt(manPower),
        marker_capacity: parseInt(markerCapacity),
        lay_capacity: parseInt(layCapacity),
        cutting_capacity: parseInt(cuttingCapacity),
        under_qty: parseInt(underQty) || 0,
        hours_actual: parseFloat(hoursActual),
        actual_per_hour: parseFloat(hoursActual) > 0 ? Math.round((parseInt(dayCutting) / parseFloat(hoursActual)) * 100) / 100 : null,
        ot_hours_actual: parseFloat(otHoursActual) || 0,
        ot_manpower_actual: parseInt(otManpowerActual) || 0,
        is_late: isLate,
        transfer_to_line_id: selectedLine.id,
        // Leftover fields
        leftover_recorded: leftoverRecorded,
        leftover_type: leftoverRecorded ? leftoverType || null : null,
        leftover_unit: leftoverRecorded ? leftoverUnit || null : null,
        leftover_quantity: leftoverRecorded && leftoverQuantity ? parseFloat(leftoverQuantity) : null,
        leftover_notes: leftoverRecorded ? leftoverNotes || null : null,
        leftover_location: leftoverRecorded ? leftoverLocation || null : null,
        leftover_photo_urls: null,
        estimated_cost_value: estimatedCost.value,
        estimated_cost_currency: estimatedCost.value != null ? estimatedCost.currency : null,
      };

      if (isEditing && existingActual) {
        const { error } = await supabase
          .from("cutting_actuals")
          .update(actualData)
          .eq("id", existingActual.id);

        if (error) throw error;
        toast.success("Cutting actuals updated successfully!");
      } else {
        const result = await offlineSubmit("cutting_actuals", "cutting_actuals", actualData as Record<string, unknown>, {
          showSuccessToast: false,
          showQueuedToast: true,
        });

        if (result.queued) {
          if (isAdminOrHigher()) {
            navigate("/dashboard");
          } else {
            navigate("/cutting/submissions");
          }
          return;
        }

        if (!result.success) {
          if (result.error?.includes("duplicate") || result.error?.includes("23505")) {
            toast.error("Actuals already submitted for this line/PO today");
            return;
          }
          throw new Error(result.error);
        }
        toast.success("Cutting end-of-day actuals submitted successfully!");
      }
      
      if (isAdminOrHigher()) {
        navigate("/dashboard");
      } else {
        navigate("/cutting/submissions");
      }
    } catch (error: any) {
      console.error("Error submitting:", error);
      toast.error(error?.message || "Submission failed");
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
        <p className="text-muted-foreground">{t('cutting.noFactoryAssigned')}</p>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-3 md:py-4 lg:py-6 px-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
          <ClipboardCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold">{t('cutting.cuttingEndOfDay')}</h1>
            {isEditing && <Badge variant="secondary">{t('cutting.editing')}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {new Date(getTodayInTimezone(factory?.timezone || "Asia/Dhaka") + "T00:00:00").toLocaleDateString(dateLocale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
      <div className="rounded-xl border border-border/50 bg-card p-5 md:p-6 space-y-6">
        {/* Line & PO */}
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground">{t('cutting.lineNo')} & PO</p>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">{t('cutting.lineNo')} *</Label>
            <Popover open={lineSearchOpen} onOpenChange={setLineSearchOpen}>
              <PopoverTrigger asChild>
                <Button 
                  variant="outline" 
                  className={`w-full justify-start ${errors.line ? 'border-destructive' : ''}`}
                >
                  <Search className="mr-2 h-4 w-4" />
                  {selectedLine
                    ? (selectedLine.name || selectedLine.line_id)
                    : t('cutting.selectALine')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[min(350px,calc(100vw-2rem))] p-0" align="start">
                <Command shouldFilter={true}>
                  <CommandInput placeholder={t('cutting.searchLines')} />
                  <CommandList>
                    <CommandEmpty>{t('cutting.noLinesFound')}</CommandEmpty>
                    <CommandGroup>
                      {lines.map(line => (
                        <CommandItem 
                          key={line.id} 
                          value={line.name || line.line_id}
                          onSelect={() => {
                            setSelectedLine(line);
                            setLineSearchOpen(false);
                            setErrors(prev => ({ ...prev, line: "" }));
                          }}
                        >
                          <span className="font-medium">{line.name || line.line_id}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {errors.line && <p className="text-xs text-destructive mt-1">{errors.line}</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">{t('cutting.selectPO')} *</Label>
            <Popover open={searchOpen} onOpenChange={setSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={`w-full justify-start min-w-0 ${errors.workOrder ? 'border-destructive' : ''}`}
                  disabled={!selectedLine}
                >
                  <Search className="mr-2 h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {selectedWorkOrder
                      ? `${selectedWorkOrder.po_number} - ${selectedWorkOrder.buyer} / ${selectedWorkOrder.style}`
                      : selectedLine ? t('cutting.searchPO') : t('cutting.selectALine')}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[min(350px,calc(100vw-2rem))] p-0" align="start">
                <Command shouldFilter={true}>
                  <CommandInput placeholder={t('cutting.searchPOLong')} />
                  <CommandList>
                    <CommandEmpty>{t('cutting.noWorkOrdersFound')}</CommandEmpty>
                    <CommandGroup>
                      {filteredWorkOrders.map(wo => (
                        <CommandItem
                          key={wo.id}
                          value={getSearchableValue(wo)}
                          onSelect={() => {
                            setSelectedWorkOrder(wo);
                            setSearchOpen(false);
                            setErrors(prev => ({ ...prev, workOrder: "" }));
                          }}
                        >
                          <div className="flex flex-col">
                            <span className="font-medium">{wo.po_number}</span>
                            <span className="text-xs text-muted-foreground">
                              {wo.buyer} / {wo.style} {wo.item ? `/ ${wo.item}` : ""}
                            </span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {errors.workOrder && <p className="text-xs text-destructive mt-1">{errors.workOrder}</p>}
          </div>
        </div>

        {/* Order Details */}
        {selectedWorkOrder && (
          <div className="rounded-lg bg-muted/30 border border-border/40 px-4 py-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
              <div><span className="text-[11px] text-muted-foreground">{t('cutting.buyer')}</span><p className="font-medium">{selectedWorkOrder.buyer}</p></div>
              <div><span className="text-[11px] text-muted-foreground">{t('cutting.style')}</span><p className="font-medium">{selectedWorkOrder.style}</p></div>
              <div><span className="text-[11px] text-muted-foreground">{t('cutting.orderQtyLabel')}</span><p className="font-medium font-mono">{selectedWorkOrder.order_qty.toLocaleString()}</p></div>
            </div>
          </div>
        )}

        <div className="border-t border-border/40" />

        {/* Actual Capacities */}
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground">{t('cutting.actualCapacities')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t('cutting.manPower')} *</Label>
              <Input type="number" value={manPower} onChange={(e) => setManPower(e.target.value)} placeholder="0" className={`h-10 ${errors.manPower ? "border-destructive" : ""}`} />
              {errors.manPower && <p className="text-xs text-destructive">{errors.manPower}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t('cutting.markerCapacity')} *</Label>
              <Input type="number" value={markerCapacity} onChange={(e) => setMarkerCapacity(e.target.value)} placeholder="0" className={`h-10 ${errors.markerCapacity ? "border-destructive" : ""}`} />
              {errors.markerCapacity && <p className="text-xs text-destructive">{errors.markerCapacity}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t('cutting.layCapacity')} *</Label>
              <Input type="number" value={layCapacity} onChange={(e) => setLayCapacity(e.target.value)} placeholder="0" className={`h-10 ${errors.layCapacity ? "border-destructive" : ""}`} />
              {errors.layCapacity && <p className="text-xs text-destructive">{errors.layCapacity}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t('cutting.cuttingCapacity')} *</Label>
              <Input type="number" value={cuttingCapacity} onChange={(e) => setCuttingCapacity(e.target.value)} placeholder="0" className={`h-10 ${errors.cuttingCapacity ? "border-destructive" : ""}`} />
              {errors.cuttingCapacity && <p className="text-xs text-destructive">{errors.cuttingCapacity}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t('cutting.underQty')}</Label>
              <Input type="number" value={underQty} onChange={(e) => setUnderQty(e.target.value)} placeholder="0" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t('cutting.hoursActual')} *</Label>
              <Input type="number" step="0.5" min="0" max="24" value={hoursActual} onChange={(e) => setHoursActual(e.target.value)} placeholder="0" className={`h-10 ${errors.hoursActual ? "border-destructive" : ""}`} />
              {errors.hoursActual && <p className="text-xs text-destructive">{errors.hoursActual}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t('cutting.otHoursActual')}</Label>
              <Input type="number" step="0.5" value={otHoursActual} onChange={(e) => setOtHoursActual(e.target.value)} placeholder="0" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t('cutting.otManpowerActual')}</Label>
              <Input type="number" value={otManpowerActual} onChange={(e) => setOtManpowerActual(e.target.value)} placeholder="0" className="h-10" />
            </div>
          </div>
          <EstimatedCostDisplay manpower={manPower} hours={hoursActual} />
        </div>

        <div className="border-t border-border/40" />

        {/* Actual Daily Output */}
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground">{t('cutting.actualDailyOutput')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t('cutting.dayCutting')} *</Label>
              <Input type="number" value={dayCutting} onChange={(e) => setDayCutting(e.target.value)} placeholder="0" className={`h-10 ${errors.dayCutting ? "border-destructive" : ""}`} />
              {errors.dayCutting && <p className="text-xs text-destructive">{errors.dayCutting}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t('cutting.dayInput')} *</Label>
              <Input type="number" value={dayInput} onChange={(e) => setDayInput(e.target.value)} placeholder="0" className={`h-10 ${errors.dayInput ? "border-destructive" : ""}`} />
              {errors.dayInput && <p className="text-xs text-destructive">{errors.dayInput}</p>}
            </div>
          </div>
        </div>

      </div>

        {/* Computed Totals (only on End of Day form) */}
        {selectedWorkOrder && (
          <Card className="bg-muted/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('cutting.cumulativeTotals')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-3 rounded-lg bg-background">
                  <p className="text-2xl font-bold text-primary">{totalCutting.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{t('cutting.totalCutting')}</p>
                </div>
                <div className="p-3 rounded-lg bg-background">
                  <p className="text-2xl font-bold text-primary">{totalInput.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{t('cutting.totalInput')}</p>
                </div>
                <div className="p-3 rounded-lg bg-background">
                  <p className={`text-2xl font-bold ${balance < 0 ? 'text-destructive' : 'text-primary'}`}>
                    {balance.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">{t('cutting.balance')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Left Over / Fabric Saved Section */}
        <Card>
          <Collapsible open={leftoverOpen} onOpenChange={setLeftoverOpen}>
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    {t('cutting.addLeftOverFabric')}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {leftoverRecorded && (
                      <Badge variant="secondary" className="text-xs">
                        Recorded
                      </Badge>
                    )}
                    {leftoverOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4 pt-0">
                {/* Left Over Recorded Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                  <div className="space-y-0.5">
                    <Label>Left Over Recorded?</Label>
                    <p className="text-xs text-muted-foreground">Enable to record leftover fabric</p>
                  </div>
                  <Switch
                    checked={leftoverRecorded}
                    onCheckedChange={setLeftoverRecorded}
                  />
                </div>

                {leftoverRecorded && (
                  <>
                    {/* Left Over Type */}
                    <div className="space-y-2">
                      <Label>{t('cutting.leftOverType')} *</Label>
                      <Select value={leftoverType} onValueChange={setLeftoverType}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('cutting.selectType')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Left Over Fabric">Left Over Fabric</SelectItem>
                          <SelectItem value="Saved Fabric">Saved Fabric</SelectItem>
                          <SelectItem value="Left Over Cutting Panels">Left Over Cutting Panels</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Unit and Quantity */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Unit *</Label>
                        <Select value={leftoverUnit} onValueChange={setLeftoverUnit}>
                          <SelectTrigger className={errors.leftoverUnit ? "border-destructive" : ""}>
                            <SelectValue placeholder="Select unit..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="kg">kg</SelectItem>
                            <SelectItem value="meter">meter</SelectItem>
                            <SelectItem value="yard">yard</SelectItem>
                            <SelectItem value="roll">roll</SelectItem>
                            <SelectItem value="pcs">pcs</SelectItem>
                          </SelectContent>
                        </Select>
                        {errors.leftoverUnit && <p className="text-sm text-destructive">{errors.leftoverUnit}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>Quantity *</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={leftoverQuantity}
                          onChange={(e) => setLeftoverQuantity(e.target.value)}
                          placeholder="0.00"
                          className={errors.leftoverQuantity ? "border-destructive" : ""}
                        />
                        {errors.leftoverQuantity && <p className="text-sm text-destructive">{errors.leftoverQuantity}</p>}
                      </div>
                    </div>

                    {/* Stored Location */}
                    <div className="space-y-2">
                      <Label>Stored Location (optional)</Label>
                      <Input
                        value={leftoverLocation}
                        onChange={(e) => setLeftoverLocation(e.target.value)}
                        placeholder="e.g., Fabric store rack A3"
                      />
                    </div>

                    {/* Reason / Notes */}
                    <div className="space-y-2">
                      <Label>Reason / Notes (optional)</Label>
                      <Textarea
                        value={leftoverNotes}
                        onChange={(e) => setLeftoverNotes(e.target.value)}
                        placeholder="Additional notes..."
                        rows={2}
                      />
                    </div>

                  </>
                )}
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Submit */}
        <Button type="submit" className="w-full h-11 font-semibold mt-5" disabled={submitting}>
          {submitting ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('cutting.submitting')}</>
          ) : isEditing ? (
            t('cutting.updateEndOfDayActuals')
          ) : (
            t('cutting.submitEndOfDayActuals')
          )}
        </Button>
      </form>
    </div>
  );
}
