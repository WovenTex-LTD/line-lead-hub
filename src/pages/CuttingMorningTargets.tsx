import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Search, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { format } from "date-fns";
import { useOfflineSubmission } from "@/hooks/useOfflineSubmission";
import { isLateForCutoff, getTodayInTimezone } from "@/lib/date-utils";

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

interface ExistingTarget {
  id: string;
  man_power: number;
  marker_capacity: number;
  lay_capacity: number;
  cutting_capacity: number;
  under_qty: number | null;
  day_cutting: number;
  day_input: number;
  hours_planned: number | null;
  ot_hours_planned: number | null;
  ot_manpower_planned: number | null;
}

export default function CuttingMorningTargets() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, i18n } = useTranslation();
  const { user, profile, factory, isAdminOrHigher } = useAuth();
  const { submit: offlineSubmit } = useOfflineSubmission();
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

  // Target Capacities fields (from original form)
  const [manPower, setManPower] = useState("");
  const [markerCapacity, setMarkerCapacity] = useState("");
  const [layCapacity, setLayCapacity] = useState("");
  const [cuttingCapacity, setCuttingCapacity] = useState("");
  const [underQty, setUnderQty] = useState("0");

  // Hours fields
  const [hoursPlanned, setHoursPlanned] = useState("");
  const [otHoursPlanned, setOtHoursPlanned] = useState("0");
  const [otManpowerPlanned, setOtManpowerPlanned] = useState("0");

  // Target Daily Actuals fields
  const [dayCutting, setDayCutting] = useState("");
  const [dayInput, setDayInput] = useState("");

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [existingTarget, setExistingTarget] = useState<ExistingTarget | null>(null);

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

  // Check for existing target when line + work order are selected
  useEffect(() => {
    if (selectedLine && selectedWorkOrder && profile?.factory_id) {
      checkExistingTarget();
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

  async function checkExistingTarget() {
    if (!profile?.factory_id || !selectedLine || !selectedWorkOrder) return;

    const today = getTodayInTimezone(factory?.timezone || "Asia/Dhaka");

    try {
      const { data, error } = await supabase
        .from("cutting_targets")
        .select("id, man_power, marker_capacity, lay_capacity, cutting_capacity, under_qty, day_cutting, day_input, hours_planned, ot_hours_planned, ot_manpower_planned")
        .eq("factory_id", profile.factory_id)
        .eq("line_id", selectedLine.id)
        .eq("work_order_id", selectedWorkOrder.id)
        .eq("production_date", today)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setIsEditing(true);
        setExistingTarget({
          ...data,
          day_cutting: data.day_cutting || 0,
          day_input: data.day_input || 0,
        });
        setManPower(String(data.man_power || 0));
        setMarkerCapacity(String(data.marker_capacity || 0));
        setLayCapacity(String(data.lay_capacity || 0));
        setCuttingCapacity(String(data.cutting_capacity || 0));
        setUnderQty(String(data.under_qty || 0));
        setDayCutting(String(data.day_cutting || 0));
        setDayInput(String(data.day_input || 0));
        setHoursPlanned(data.hours_planned ? String(data.hours_planned) : "");
        setOtHoursPlanned(String(data.ot_hours_planned || 0));
        setOtManpowerPlanned(String(data.ot_manpower_planned || 0));
      } else {
        setIsEditing(false);
        setExistingTarget(null);
        // Reset fields if not already filled
        if (!manPower && !markerCapacity && !layCapacity && !cuttingCapacity) {
          setManPower("");
          setMarkerCapacity("");
          setLayCapacity("");
          setCuttingCapacity("");
          setUnderQty("0");
          setDayCutting("");
          setDayInput("");
          setHoursPlanned("");
          setOtHoursPlanned("0");
          setOtManpowerPlanned("0");
        }
      }
    } catch (error) {
      console.error("Error checking existing target:", error);
    }
  }

  const getSearchableValue = (wo: WorkOrder) => {
    return [wo.po_number, wo.buyer, wo.style, wo.item].filter(Boolean).join(" ").toLowerCase();
  };

  function validateForm(): boolean {
    const newErrors: Record<string, string> = {};

    if (!selectedLine) newErrors.line = t('cutting.lineRequired');
    if (!selectedWorkOrder) newErrors.workOrder = t('cutting.poRequired');
    if (!manPower || parseInt(manPower) < 0) newErrors.manPower = t('cutting.manPowerRequired');
    if (!markerCapacity || parseInt(markerCapacity) < 0) newErrors.markerCapacity = t('cutting.markerCapacityRequired');
    if (!layCapacity || parseInt(layCapacity) < 0) newErrors.layCapacity = t('cutting.layCapacityRequired');
    if (!cuttingCapacity || parseInt(cuttingCapacity) < 0) newErrors.cuttingCapacity = t('cutting.cuttingCapacityRequired');
    if (!hoursPlanned || parseFloat(hoursPlanned) < 0.5) newErrors.hoursPlanned = t('cutting.hoursRequired');
    if (!dayCutting || parseInt(dayCutting) < 0) newErrors.dayCutting = t('cutting.dayCuttingRequired');
    if (!dayInput || parseInt(dayInput) < 0) newErrors.dayInput = t('cutting.dayInputRequired');

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
      toast.error(t('cutting.submissionFailed'));
      return;
    }

    setSubmitting(true);

    try {
      // Check if submission is late (using factory timezone)
      const timezone = factory?.timezone || "Asia/Dhaka";
      const today = getTodayInTimezone(timezone);
      const isLate = factory?.morning_target_cutoff
        ? isLateForCutoff(factory.morning_target_cutoff, timezone)
        : false;

      const targetData = {
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
        man_power: parseInt(manPower),
        marker_capacity: parseInt(markerCapacity),
        lay_capacity: parseInt(layCapacity),
        cutting_capacity: parseInt(cuttingCapacity),
        under_qty: parseInt(underQty) || 0,
        hours_planned: parseFloat(hoursPlanned),
        target_per_hour: parseFloat(hoursPlanned) > 0 ? Math.round((parseInt(dayCutting) / parseFloat(hoursPlanned)) * 100) / 100 : null,
        ot_hours_planned: parseFloat(otHoursPlanned) || 0,
        ot_manpower_planned: parseInt(otManpowerPlanned) || 0,
        day_cutting: parseInt(dayCutting),
        day_input: parseInt(dayInput),
        is_late: isLate,
      };

      if (isEditing && existingTarget) {
        const { error } = await supabase
          .from("cutting_targets")
          .update(targetData)
          .eq("id", existingTarget.id);

        if (error) throw error;
        toast.success(t('cutting.cuttingTargetsUpdated'));
      } else {
        const result = await offlineSubmit("cutting_targets", "cutting_targets", targetData as Record<string, unknown>, {
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
            toast.error(t('cutting.targetsAlreadySubmitted'));
            return;
          }
          throw new Error(result.error);
        }
        toast.success(t('cutting.cuttingTargetsSubmitted'));
      }
      
      if (isAdminOrHigher()) {
        navigate("/dashboard");
      } else {
        navigate("/cutting/submissions");
      }
    } catch (error: any) {
      console.error("Error submitting:", error);
      toast.error(error?.message || t('cutting.submissionFailed'));
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
          <Crosshair className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold">{t('cutting.cuttingDailyTargets')}</h1>
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
                      : selectedLine ? t('cutting.searchPO') : "Select a line first"}
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

        {/* Target Capacities */}
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground">{t('cutting.targetCapacities')}</p>
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
              <Label className="text-xs font-medium">{t('cutting.hoursPlanned')} *</Label>
              <Input type="number" step="0.5" min="0" max="24" value={hoursPlanned} onChange={(e) => setHoursPlanned(e.target.value)} placeholder="0" className={`h-10 ${errors.hoursPlanned ? "border-destructive" : ""}`} />
              {errors.hoursPlanned && <p className="text-xs text-destructive">{errors.hoursPlanned}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t('cutting.otHoursPlanned')}</Label>
              <Input type="number" step="0.5" value={otHoursPlanned} onChange={(e) => setOtHoursPlanned(e.target.value)} placeholder="0" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t('cutting.otManpowerPlanned')}</Label>
              <Input type="number" value={otManpowerPlanned} onChange={(e) => setOtManpowerPlanned(e.target.value)} placeholder="0" className="h-10" />
            </div>
          </div>
        </div>

        <div className="border-t border-border/40" />

        {/* Target Daily Output */}
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground">{t('cutting.targetDailyOutput')}</p>
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

        {/* Submit */}
        <Button type="submit" className="w-full h-11 font-semibold mt-5" disabled={submitting}>
          {submitting ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('cutting.submitting')}</>
          ) : isEditing ? (
            t('cutting.updateCuttingTargets')
          ) : (
            t('cutting.submitCuttingTargets')
          )}
        </Button>
      </form>
    </div>
  );
}
