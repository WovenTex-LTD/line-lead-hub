import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getTodayInTimezone } from "@/lib/date-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, ArrowLeft, CheckCircle, Upload, X, Image as ImageIcon, Calendar as CalendarIcon, ClipboardList, TrendingUp, Package, AlertTriangle, Search, Factory } from "lucide-react";
import { SewingMachine } from "@/components/icons/SewingMachine";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { EmptyState } from "@/components/EmptyState";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useOfflineSubmission } from "@/hooks/useOfflineSubmission";
import { useHeadcountCost } from "@/hooks/useHeadcountCost";

interface Line {
  id: string;
  line_id: string;
  name: string | null;
  unit_id: string | null;
  floor_id: string | null;
}

interface Unit {
  id: string;
  name: string;
  code: string;
}

interface Floor {
  id: string;
  name: string;
  code: string;
}

interface WorkOrder {
  id: string;
  po_number: string;
  buyer: string;
  style: string;
  item: string | null;
  order_qty: number;
  color: string | null;
  smv: number | null;
  target_per_hour: number | null;
  target_per_day: number | null;
  line_id: string | null;
}

interface Stage {
  id: string;
  name: string;
  code: string;
}

interface DropdownOption {
  id: string;
  label: string;
  is_active: boolean | null;
}

interface FactoryType {
  id: string;
  name: string;
}

export default function SewingUpdate() {
  const { t, i18n } = useTranslation();
  const { profile, user, factory, hasRole, isAdminOrHigher } = useAuth();
  const navigate = useNavigate();
  const { submit: offlineSubmit } = useOfflineSubmission();
  const { calculateEstimatedCost } = useHeadcountCost();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  // Master data
  const [lines, setLines] = useState<Line[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [stageProgressOptions, setStageProgressOptions] = useState<DropdownOption[]>([]);
  const [nextMilestoneOptions, setNextMilestoneOptions] = useState<DropdownOption[]>([]);
  

  // SECTION A - Selection fields
  const [selectedLine, setSelectedLine] = useState("");
  const [selectedPO, setSelectedPO] = useState("");

  // SECTION B - Auto-filled from PO/Line (read-only display)
  const [buyerName, setBuyerName] = useState("");
  const [styleCode, setStyleCode] = useState("");
  const [itemName, setItemName] = useState("");
  const [orderQty, setOrderQty] = useState(0);
  const [color, setColor] = useState("");
  const [smv, setSmv] = useState("");
  const [unitName, setUnitName] = useState("");
  const [floorName, setFloorName] = useState("");

  // SECTION C - Worker-entered production numbers
  const [perHourTarget, setPerHourTarget] = useState("");
  const [dayProduction, setDayProduction] = useState("");
  const [rejectToday, setRejectToday] = useState("");
  const [reworkToday, setReworkToday] = useState("");
  const [totalProduction, setTotalProduction] = useState("");
  const [overTime, setOverTime] = useState("");
  const [mPower, setMPower] = useState("");

  // SECTION D - Tracking fields
  const [currentStage, setCurrentStage] = useState("");
  const [stageProgress, setStageProgress] = useState("");
  const [estimatedExFactory, setEstimatedExFactory] = useState<Date | undefined>();
  const [nextMilestone, setNextMilestone] = useState("");

  // SECTION E - Photos and Notes
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);
  const [remarks, setRemarks] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // KPI stats
  const [kpiStats, setKpiStats] = useState({ submissions: 0, avgOutput: 0, totalOutput: 0, totalRejects: 0 });

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [poSearchOpen, setPoSearchOpen] = useState(false);

  useEffect(() => {
    if (profile?.factory_id) {
      fetchFormData();
    } else if (profile !== undefined) {
      setLoading(false);
    }
  }, [profile?.factory_id, profile]);

  // Filter work orders by selected line
  const filteredWorkOrders = selectedLine 
    ? workOrders.filter(wo => wo.line_id === selectedLine)
    : [];

  // Auto-fill PO details when PO is selected
  useEffect(() => {
    if (selectedPO) {
      const po = workOrders.find(w => w.id === selectedPO);
      if (po) {
        setBuyerName(po.buyer || "");
        setStyleCode(po.style || "");
        setItemName(po.item || "");
        setOrderQty(po.order_qty || 0);
        setColor(po.color || "");
        setSmv(po.smv?.toString() || "");
        // Auto-fill per hour target from work order if available
        if (po.target_per_hour) {
          setPerHourTarget(po.target_per_hour.toString());
        }
      }
    } else {
      setBuyerName("");
      setStyleCode("");
      setItemName("");
      setOrderQty(0);
      setColor("");
      setSmv("");
    }
  }, [selectedPO, workOrders]);

  // Auto-fill Unit/Floor when Line is selected
  useEffect(() => {
    if (selectedLine) {
      const line = lines.find(l => l.id === selectedLine);
      if (line) {
        const unit = units.find(u => u.id === line.unit_id);
        const floor = floors.find(f => f.id === line.floor_id);
        setUnitName(unit?.name || "");
        setFloorName(floor?.name || "");
      }
      // Reset PO when line changes
      if (!filteredWorkOrders.find(wo => wo.id === selectedPO)) {
        setSelectedPO("");
      }
    } else {
      setUnitName("");
      setFloorName("");
      setSelectedPO("");
    }
  }, [selectedLine, lines, units, floors]);

  async function fetchFormData() {
    if (!profile?.factory_id || !user?.id) return;

    try {
      const [
        linesRes, 
        lineAssignmentsRes,
        workOrdersRes, 
        unitsRes, 
        floorsRes, 
        stagesRes, 
        stageProgressRes,
        nextMilestoneRes,
      ] = await Promise.all([
        supabase.from('lines').select('id, line_id, name, unit_id, floor_id').eq('factory_id', profile.factory_id).eq('is_active', true).order('line_id'),
        supabase.from('user_line_assignments').select('line_id').eq('user_id', user.id).eq('factory_id', profile.factory_id),
        supabase.from('work_orders').select('id, po_number, buyer, style, item, order_qty, color, smv, target_per_hour, target_per_day, line_id').eq('factory_id', profile.factory_id).eq('is_active', true).order('po_number'),
        supabase.from('units').select('id, name, code').eq('factory_id', profile.factory_id).eq('is_active', true),
        supabase.from('floors').select('id, name, code').eq('factory_id', profile.factory_id).eq('is_active', true),
        supabase.from('stages').select('id, name, code').eq('factory_id', profile.factory_id).eq('is_active', true).order('sequence'),
        supabase.from('stage_progress_options').select('id, label, is_active').eq('factory_id', profile.factory_id).eq('is_active', true).order('sort_order'),
        supabase.from('next_milestone_options').select('id, label, is_active').eq('factory_id', profile.factory_id).eq('is_active', true).order('sort_order'),
      ]);

      const allLines = linesRes.data || [];
      const assignedLineIds = (lineAssignmentsRes.data || []).map(a => a.line_id);
      
      // If user has line assignments, filter to only those lines. Otherwise show all (for admins).
      const filteredLines = assignedLineIds.length > 0 
        ? allLines.filter(line => assignedLineIds.includes(line.id))
        : allLines;

      // Sort lines numerically by extracting number from line_id
      const sortedLines = [...filteredLines].sort((a, b) => {
        const numA = parseInt(a.line_id.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.line_id.replace(/\D/g, '')) || 0;
        return numA - numB;
      });

      setLines(sortedLines);
      setWorkOrders(workOrdersRes.data || []);
      setUnits(unitsRes.data || []);
      setFloors(floorsRes.data || []);
      setStages(stagesRes.data || []);
      setStageProgressOptions(stageProgressRes.data || []);
      setNextMilestoneOptions(nextMilestoneRes.data || []);

      // Fetch today's KPI stats
      const today = getTodayInTimezone(factory?.timezone || "Asia/Dhaka");
      const { data: todayData } = await supabase
        .from('production_updates_sewing')
        .select('output_qty, reject_qty')
        .eq('factory_id', profile.factory_id)
        .eq('production_date', today);

      if (todayData && todayData.length > 0) {
        const totalOutput = todayData.reduce((sum, r) => sum + (r.output_qty || 0), 0);
        const totalRejects = todayData.reduce((sum, r) => sum + (r.reject_qty || 0), 0);
        setKpiStats({
          submissions: todayData.length,
          avgOutput: Math.round(totalOutput / todayData.length),
          totalOutput,
          totalRejects,
        });
      }
    } catch (error) {
      console.error('Error fetching form data:', error);
    } finally {
      setLoading(false);
    }
  }

  function validateForm(): boolean {
    const newErrors: Record<string, string> = {};

    // Section A validations
    if (!selectedLine) newErrors.line = "Line No is required";
    if (!selectedPO) newErrors.po = "PO ID is required";

    // Section C validations
    if (!perHourTarget) newErrors.perHourTarget = "Per Hour Target is required";
    if (!dayProduction) newErrors.dayProduction = "Day Production is required";
    if (!rejectToday) newErrors.rejectToday = "Reject Today is required";
    if (!reworkToday) newErrors.reworkToday = "Rework Today is required";
    if (!totalProduction) newErrors.totalProduction = "Total Production is required";
    if (!overTime && overTime !== "0") newErrors.overTime = "Over Time is required";
    if (!mPower) newErrors.mPower = "M Power is required";

    // Section D validations
    if (!currentStage) newErrors.currentStage = "Current Stage is required";
    if (!stageProgress) newErrors.stageProgress = "Stage Progress is required";
    if (!nextMilestone) newErrors.nextMilestone = "Next Milestone is required";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!validateForm()) {
      toast.error("Please fill all required fields");
      return;
    }

    setIsSubmitting(true);

    try {
      // Get stage progress label for storage
      const stageProgressLabel = stageProgressOptions.find(s => s.id === stageProgress)?.label || "";
      const stageProgressValue = parseInt(stageProgressLabel.replace('%', '')) || 0;

      // Get next milestone label
      const nextMilestoneLabel = nextMilestoneOptions.find(n => n.id === nextMilestone)?.label || "";

      // SewingUpdate only has OT hours, no regular hours — cost stored using OT hours if available
      const estimatedCost = calculateEstimatedCost(parseInt(mPower), parseFloat(overTime));

      const insertData: any = {
        factory_id: profile?.factory_id,
        line_id: selectedLine,
        work_order_id: selectedPO || null,
        production_date: getTodayInTimezone(factory?.timezone || "Asia/Dhaka"),
        
        // Auto-filled from PO (stored for historical record)
        buyer_name: buyerName,
        po_number: workOrders.find(w => w.id === selectedPO)?.po_number || "",
        style_code: styleCode,
        item_name: itemName,
        color: color,
        order_qty: orderQty,
        smv: parseFloat(smv) || null,
        
        // Auto-filled from Line
        unit_name: unitName,
        floor_name: floorName,
        factory_name: factory?.name || "",
        
        // Worker-entered production numbers
        per_hour_target: parseInt(perHourTarget) || 0,
        output_qty: parseInt(dayProduction) || 0,
        reject_qty: parseInt(rejectToday) || 0,
        rework_qty: parseInt(reworkToday) || 0,
        cumulative_good_total: parseInt(totalProduction) || 0,
        ot_hours: parseFloat(overTime) || 0,
        manpower: parseInt(mPower) || 0,
        
        // Tracking fields
        stage_id: currentStage || null,
        stage_progress: stageProgressValue,
        estimated_ex_factory: estimatedExFactory ? format(estimatedExFactory, 'yyyy-MM-dd') : null,
        next_milestone: nextMilestoneLabel,
        
        // No blocker from production form - use separate blocker form
        has_blocker: false,
        
        // Notes
        notes: remarks || null,
        submitted_by: user?.id,
        estimated_cost_value: estimatedCost.value,
        estimated_cost_currency: estimatedCost.value != null ? estimatedCost.currency : null,
      };

      const result = await offlineSubmit("production_updates_sewing", "production_updates_sewing", insertData as Record<string, unknown>, {
        showSuccessToast: false,
        showQueuedToast: true,
      });

      if (result.queued) {
        const isWorker = hasRole('worker') && !isAdminOrHigher();
        navigate(isWorker ? '/my-submissions' : '/dashboard');
        return;
      }

      if (!result.success) {
        throw new Error(result.error);
      }

      toast.success("Update submitted!", { description: "Your daily production update has been recorded." });

      const isWorker = hasRole('worker') && !isAdminOrHigher();
      navigate(isWorker ? '/my-submissions' : '/dashboard');
    } catch (error: any) {
      console.error('Error submitting update:', error);
      toast.error("Submission failed", { description: error?.message || "Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile?.factory_id) {
    return (
      <EmptyState
        icon={Factory}
        title={t('common.noFactoryAssigned')}
        description={t('common.needFactoryAssigned')}
        action={{ label: t('common.goToDashboard'), onClick: () => navigate('/dashboard') }}
      />
    );
  }

  return (
    <div className="py-4 lg:py-6 max-w-2xl mx-auto pb-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <SewingMachine className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{t('sewing.title')}</h1>
            <p className="text-sm text-muted-foreground">
              {new Date(getTodayInTimezone(factory?.timezone || "Asia/Dhaka") + "T00:00:00").toLocaleDateString(i18n.language === 'bn' ? 'bn-BD' : 'en-US', { dateStyle: 'full' })}
            </p>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Today's Submissions</p>
            </div>
            <div className="text-2xl font-bold text-primary">{kpiStats.submissions}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Avg Output</p>
            </div>
            <div className="text-2xl font-bold text-blue-600">{kpiStats.avgOutput.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Total Output</p>
            </div>
            <div className="text-2xl font-bold text-green-600">{kpiStats.totalOutput.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Total Rejects</p>
            </div>
            <div className={`text-2xl font-bold ${kpiStats.totalRejects > 0 ? 'text-amber-500' : 'text-muted-foreground'}`}>
              {kpiStats.totalRejects.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* SECTION A - Select References */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('sewing.selectReferences')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Line No */}
            <div className="space-y-2">
              <Label htmlFor="line">{t('sewing.lineNo')} *</Label>
              <Select value={selectedLine} onValueChange={setSelectedLine}>
                <SelectTrigger className={`h-12 ${errors.line ? 'border-destructive' : ''}`}>
                  <SelectValue placeholder={t('common.selectLine')} />
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

            {/* PO ID */}
            <div className="space-y-2">
              <Label htmlFor="po">{t('sewing.poId')} *</Label>
              <Popover open={poSearchOpen} onOpenChange={setPoSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    disabled={!selectedLine || filteredWorkOrders.length === 0}
                    className={`w-full h-12 justify-start ${errors.po ? 'border-destructive' : ''}`}
                  >
                    <Search className="mr-2 h-4 w-4 shrink-0" />
                    <span className="truncate">
                      {selectedPO
                        ? (() => {
                            const wo = filteredWorkOrders.find(w => w.id === selectedPO);
                            return wo ? `${wo.po_number} - ${wo.style} (${wo.buyer})` : t('common.selectPO');
                          })()
                        : !selectedLine ? t('common.selectLineFirst') : filteredWorkOrders.length === 0 ? t('common.noPOsForLine') : t('common.selectPO')}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[350px] p-0" align="start">
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
                              setSelectedPO(wo.id);
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
              {errors.po && <p className="text-xs text-destructive">{errors.po}</p>}
            </div>
          </CardContent>
        </Card>

        {/* SECTION B - Auto-filled Details (Read-only) */}
        {selectedPO && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('sewing.autoFilledDetails')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t('sewing.buyer')}</Label>
                  <p className="font-medium text-sm">{buyerName || "-"}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t('sewing.style')}</Label>
                  <p className="font-medium text-sm">{styleCode || "-"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t('sewing.item')}</Label>
                  <p className="font-medium text-sm">{itemName || "-"}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t('sewing.orderQty')}</Label>
                  <p className="font-medium text-sm">{orderQty.toLocaleString()}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t('sewing.color')}</Label>
                  <p className="font-medium text-sm">{color || "-"}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t('sewing.smv')}</Label>
                  <p className="font-medium text-sm">{smv || "-"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* SECTION C - Production Numbers */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('sewing.productionNumbers')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Row 1: Per Hour Target & Day Production */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('sewing.perHourTarget')} *</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="0"
                  value={perHourTarget}
                  onChange={(e) => setPerHourTarget(e.target.value)}
                  className={`h-12 ${errors.perHourTarget ? 'border-destructive' : ''}`}
                />
                {errors.perHourTarget && <p className="text-xs text-destructive">{errors.perHourTarget}</p>}
              </div>
              <div className="space-y-2">
                <Label>{t('sewing.dayProduction')} *</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="0"
                  value={dayProduction}
                  onChange={(e) => setDayProduction(e.target.value)}
                  className={`h-12 ${errors.dayProduction ? 'border-destructive' : ''}`}
                />
                {errors.dayProduction && <p className="text-xs text-destructive">{errors.dayProduction}</p>}
              </div>
            </div>

            {/* Row 2: Reject Today & Rework Today */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('sewing.rejectToday')} *</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="0"
                  value={rejectToday}
                  onChange={(e) => setRejectToday(e.target.value)}
                  className={`h-12 ${errors.rejectToday ? 'border-destructive' : ''}`}
                />
                {errors.rejectToday && <p className="text-xs text-destructive">{errors.rejectToday}</p>}
              </div>
              <div className="space-y-2">
                <Label>{t('sewing.reworkToday')} *</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="0"
                  value={reworkToday}
                  onChange={(e) => setReworkToday(e.target.value)}
                  className={`h-12 ${errors.reworkToday ? 'border-destructive' : ''}`}
                />
                {errors.reworkToday && <p className="text-xs text-destructive">{errors.reworkToday}</p>}
              </div>
            </div>

            {/* Row 3: Total Production */}
            <div className="space-y-2">
              <Label>{t('sewing.totalProduction')} *</Label>
              <Input
                type="number"
                inputMode="numeric"
                min="0"
                placeholder="0"
                value={totalProduction}
                onChange={(e) => setTotalProduction(e.target.value)}
                className={`h-12 ${errors.totalProduction ? 'border-destructive' : ''}`}
              />
              {errors.totalProduction && <p className="text-xs text-destructive">{errors.totalProduction}</p>}
            </div>

            {/* Row 4: Over Time & M Power */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('sewing.overTime')} *</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.5"
                  placeholder="0"
                  value={overTime}
                  onChange={(e) => setOverTime(e.target.value)}
                  className={`h-12 ${errors.overTime ? 'border-destructive' : ''}`}
                />
                {errors.overTime && <p className="text-xs text-destructive">{errors.overTime}</p>}
              </div>
              <div className="space-y-2">
                <Label>{t('sewing.mPower')} *</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="0"
                  value={mPower}
                  onChange={(e) => setMPower(e.target.value)}
                  className={`h-12 ${errors.mPower ? 'border-destructive' : ''}`}
                />
                {errors.mPower && <p className="text-xs text-destructive">{errors.mPower}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SECTION D - Tracking */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('sewing.trackingFields')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Current Stage */}
            <div className="space-y-2">
              <Label>{t('sewing.currentStage')} *</Label>
              <Select value={currentStage} onValueChange={setCurrentStage}>
                <SelectTrigger className={`h-12 ${errors.currentStage ? 'border-destructive' : ''}`}>
                  <SelectValue placeholder={t('sewing.currentStage')} />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.currentStage && <p className="text-xs text-destructive">{errors.currentStage}</p>}
            </div>

            {/* Stage Progress */}
            <div className="space-y-2">
              <Label>{t('sewing.stageProgress')} *</Label>
              <Select value={stageProgress} onValueChange={setStageProgress}>
                <SelectTrigger className={`h-12 ${errors.stageProgress ? 'border-destructive' : ''}`}>
                  <SelectValue placeholder={t('sewing.stageProgress')} />
                </SelectTrigger>
                <SelectContent>
                  {stageProgressOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.stageProgress && <p className="text-xs text-destructive">{errors.stageProgress}</p>}
            </div>

            {/* Estimated ExFactory */}
            <div className="space-y-2">
              <Label>{t('sewing.estimatedExFactory')}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full h-12 justify-start text-left font-normal",
                      !estimatedExFactory && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {estimatedExFactory ? format(estimatedExFactory, "PPP") : t('common.optional')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={estimatedExFactory}
                    onSelect={setEstimatedExFactory}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Next Milestone */}
            <div className="space-y-2">
              <Label>{t('sewing.nextMilestone')} *</Label>
              <Select value={nextMilestone} onValueChange={setNextMilestone}>
                <SelectTrigger className={`h-12 ${errors.nextMilestone ? 'border-destructive' : ''}`}>
                  <SelectValue placeholder={t('sewing.nextMilestone')} />
                </SelectTrigger>
                <SelectContent>
                  {nextMilestoneOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.nextMilestone && <p className="text-xs text-destructive">{errors.nextMilestone}</p>}
            </div>
          </CardContent>
        </Card>

        {/* SECTION E - Photos & Remarks */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('sewing.photosNotes')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Photos */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                {t('sewing.uploadPhotos')} ({t('common.optional')})
              </Label>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (photos.length + files.length > 2) {
                    toast.error("Maximum 2 photos allowed");
                    return;
                  }
                  const newPhotos = [...photos, ...files].slice(0, 2);
                  setPhotos(newPhotos);
                  setPhotoPreviewUrls(newPhotos.map(file => URL.createObjectURL(file)));
                }}
              />
              
              {photoPreviewUrls.length > 0 && (
                <div className="flex gap-3 flex-wrap">
                  {photoPreviewUrls.map((url, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={url}
                        alt={`Preview ${index + 1}`}
                        className="h-24 w-24 object-cover rounded-lg border"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const newPhotos = photos.filter((_, i) => i !== index);
                          const newUrls = photoPreviewUrls.filter((_, i) => i !== index);
                          setPhotos(newPhotos);
                          setPhotoPreviewUrls(newUrls);
                        }}
                        className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {photos.length < 2 && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-12"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {photos.length === 0 ? t('sewing.uploadPhotos') : t('common.add')}
                </Button>
              )}
              
              <p className="text-xs text-muted-foreground">
                {t('sewing.uploadPhotos')} (2 max)
              </p>
            </div>

            {/* Remarks */}
            <div className="space-y-2">
              <Label>{t('sewing.remarks')} ({t('common.optional')})</Label>
              <Textarea
                placeholder={t('sewing.remarks')}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
          </CardContent>
        </Card>

        {/* Submit Button */}
        <div className="sticky bottom-0 bg-background border-t py-4">
          <Button
            type="submit"
            className="w-full h-14 text-lg"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                {t('common.loading')}
              </>
            ) : (
              <>
                <CheckCircle className="h-5 w-5 mr-2" />
                {t('common.submit')}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
