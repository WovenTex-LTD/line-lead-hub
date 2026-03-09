import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useAuth } from "@/contexts/AuthContext";
import type { AppRole } from "@/lib/constants";
import { supabase } from "@/integrations/supabase/client";
import { getTodayInTimezone } from "@/lib/date-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Package, ArrowLeft, CheckCircle2, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { EmptyState } from "@/components/EmptyState";
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
  line_id: string | null;
}

interface Factory {
  id: string;
  name: string;
  timezone: string | null;
}

const finishingSchema = z.object({
  line_id: z.string().min(1, "Line is required"),
  work_order_id: z.string().min(1, "PO is required"),
  m_power: z.number().min(0, "Cannot be negative").max(1000, "Too high"),
  per_hour_target: z.number().min(0, "Cannot be negative").max(10000, "Too high"),
  day_qc_pass: z.number().min(0, "Cannot be negative").max(100000, "Too high"),
  total_qc_pass: z.number().min(0, "Cannot be negative").max(10000000, "Too high"),
  day_poly: z.number().min(0, "Cannot be negative").max(100000, "Too high"),
  total_poly: z.number().min(0, "Cannot be negative").max(10000000, "Too high"),
  average_production: z.number().min(0, "Cannot be negative").max(100000, "Too high"),
  day_over_time: z.number().min(0, "Cannot be negative").max(24, "Max 24 hours"),
  total_over_time: z.number().min(0, "Cannot be negative").max(10000, "Too high"),
  day_hour: z.number().min(0, "Cannot be negative").max(24, "Max 24 hours"),
  total_hour: z.number().min(0, "Cannot be negative").max(10000, "Too high"),
  day_carton: z.number().min(0, "Cannot be negative").max(10000, "Too high"),
  total_carton: z.number().min(0, "Cannot be negative").max(1000000, "Too high"),
  remarks: z.string().max(1000, "Remarks too long").optional(),
});

export default function FinishingUpdate() {
  const { t, i18n } = useTranslation();
  const { profile, user, hasRole, isAdminOrHigher } = useAuth();
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
  const [factory, setFactory] = useState<Factory | null>(null);

  // SECTION A - Selection fields
  const [selectedPO, setSelectedPO] = useState("");
  const [selectedLine, setSelectedLine] = useState("");

  // SECTION B - Auto-filled from PO/Line (read-only display)
  const [styleNo, setStyleNo] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [itemName, setItemName] = useState("");
  const [orderQuantity, setOrderQuantity] = useState(0);
  const [unitName, setUnitName] = useState("");
  const [floorName, setFloorName] = useState("");

  // SECTION C - Worker-entered finishing metrics
  const [mPower, setMPower] = useState("");
  const [perHourTarget, setPerHourTarget] = useState("");
  const [dayQcPass, setDayQcPass] = useState("");
  const [totalQcPass, setTotalQcPass] = useState("");
  const [dayPoly, setDayPoly] = useState("");
  const [totalPoly, setTotalPoly] = useState("");
  const [averageProduction, setAverageProduction] = useState("");
  const [dayOverTime, setDayOverTime] = useState("");
  const [totalOverTime, setTotalOverTime] = useState("");
  const [dayHour, setDayHour] = useState("");
  const [totalHour, setTotalHour] = useState("");
  const [dayCarton, setDayCarton] = useState("");
  const [totalCarton, setTotalCarton] = useState("");
  const [remarks, setRemarks] = useState("");

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

  // Auto-fill PO details when PO is selected
  useEffect(() => {
    if (selectedPO) {
      const po = workOrders.find(w => w.id === selectedPO);
      if (po) {
        setStyleNo(po.style || "");
        setBuyerName(po.buyer || "");
        setItemName(po.item || "");
        setOrderQuantity(po.order_qty || 0);
      }
    } else {
      setStyleNo("");
      setBuyerName("");
      setItemName("");
      setOrderQuantity(0);
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
    } else {
      setUnitName("");
      setFloorName("");
    }
  }, [selectedLine, lines, units, floors]);

  // Filter work orders by selected line
  const filteredWorkOrders = selectedLine 
    ? workOrders.filter(wo => wo.line_id === selectedLine)
    : [];

  // Auto-select PO when line is selected and only one PO exists
  useEffect(() => {
    if (selectedLine) {
      const lineWorkOrders = workOrders.filter(wo => wo.line_id === selectedLine);
      if (lineWorkOrders.length === 1) {
        setSelectedPO(lineWorkOrders[0].id);
      } else if (!lineWorkOrders.find(wo => wo.id === selectedPO)) {
        setSelectedPO("");
      }
    } else {
      setSelectedPO("");
    }
  }, [selectedLine, workOrders]);

  async function fetchFormData() {
    if (!profile?.factory_id || !user?.id) return;

    try {
      const [linesRes, lineAssignmentsRes, workOrdersRes, unitsRes, floorsRes, factoryRes] = await Promise.all([
        supabase
          .from('lines')
          .select('id, line_id, name, unit_id, floor_id')
          .eq('factory_id', profile.factory_id)
          .eq('is_active', true)
          .order('line_id'),
        supabase
          .from('user_line_assignments')
          .select('line_id')
          .eq('user_id', user.id)
          .eq('factory_id', profile.factory_id),
        supabase
          .from('work_orders')
          .select('id, po_number, buyer, style, item, order_qty, color, line_id')
          .eq('factory_id', profile.factory_id)
          .eq('is_active', true)
          .order('po_number'),
        supabase
          .from('units')
          .select('id, name, code')
          .eq('factory_id', profile.factory_id)
          .eq('is_active', true),
        supabase
          .from('floors')
          .select('id, name, code')
          .eq('factory_id', profile.factory_id)
          .eq('is_active', true),
        supabase
          .from('factory_accounts')
          .select('id, name, timezone')
          .eq('id', profile.factory_id)
          .maybeSingle(),
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
      setFactory(factoryRes.data);
    } catch (error) {
      console.error('Error fetching form data:', error);
    } finally {
      setLoading(false);
    }
  }

  function validateForm(): boolean {
    const formData = {
      line_id: selectedLine,
      work_order_id: selectedPO,
      m_power: parseInt(mPower) || 0,
      per_hour_target: parseInt(perHourTarget) || 0,
      day_qc_pass: parseInt(dayQcPass) || 0,
      total_qc_pass: parseInt(totalQcPass) || 0,
      day_poly: parseInt(dayPoly) || 0,
      total_poly: parseInt(totalPoly) || 0,
      average_production: parseInt(averageProduction) || 0,
      day_over_time: parseFloat(dayOverTime) || 0,
      total_over_time: parseFloat(totalOverTime) || 0,
      day_hour: parseFloat(dayHour) || 0,
      total_hour: parseFloat(totalHour) || 0,
      day_carton: parseInt(dayCarton) || 0,
      total_carton: parseInt(totalCarton) || 0,
      remarks: remarks || undefined,
    };

    const result = finishingSchema.safeParse(formData);

    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      const newErrors: Record<string, string> = {};
      if (fieldErrors.line_id) newErrors.line = "Line No. is required";
      if (fieldErrors.work_order_id) newErrors.po = "PO ID is required";
      if (fieldErrors.m_power) newErrors.mPower = fieldErrors.m_power[0];
      if (fieldErrors.per_hour_target) newErrors.perHourTarget = fieldErrors.per_hour_target[0];
      if (fieldErrors.day_qc_pass) newErrors.dayQcPass = fieldErrors.day_qc_pass[0];
      if (fieldErrors.total_qc_pass) newErrors.totalQcPass = fieldErrors.total_qc_pass[0];
      if (fieldErrors.day_poly) newErrors.dayPoly = fieldErrors.day_poly[0];
      if (fieldErrors.total_poly) newErrors.totalPoly = fieldErrors.total_poly[0];
      if (fieldErrors.average_production) newErrors.averageProduction = fieldErrors.average_production[0];
      if (fieldErrors.day_over_time) newErrors.dayOverTime = fieldErrors.day_over_time[0];
      if (fieldErrors.total_over_time) newErrors.totalOverTime = fieldErrors.total_over_time[0];
      if (fieldErrors.day_hour) newErrors.dayHour = fieldErrors.day_hour[0];
      if (fieldErrors.total_hour) newErrors.totalHour = fieldErrors.total_hour[0];
      if (fieldErrors.day_carton) newErrors.dayCarton = fieldErrors.day_carton[0];
      if (fieldErrors.total_carton) newErrors.totalCarton = fieldErrors.total_carton[0];
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
      toast.error("Please fix the errors below");
      return;
    }

    setIsSubmitting(true);

    try {
      const estimatedCost = calculateEstimatedCost(parseInt(mPower), parseFloat(dayHour));

      const insertData = {
        factory_id: profile?.factory_id,
        line_id: selectedLine,
        work_order_id: selectedPO,
        production_date: getTodayInTimezone(factory?.timezone || "Asia/Dhaka"),
        submitted_by: user?.id,
        
        // Stored snapshots from PO/Line
        style_no: styleNo,
        buyer_name: buyerName,
        item_name: itemName,
        order_quantity: orderQuantity,
        unit_name: unitName,
        floor_name: floorName,
        factory_name: factory?.name || "",
        
        // Worker-entered finishing metrics
        m_power: parseInt(mPower) || 0,
        per_hour_target: parseInt(perHourTarget) || 0,
        day_qc_pass: parseInt(dayQcPass) || 0,
        total_qc_pass: parseInt(totalQcPass) || 0,
        day_poly: parseInt(dayPoly) || 0,
        total_poly: parseInt(totalPoly) || 0,
        average_production: parseInt(averageProduction) || 0,
        day_over_time: parseFloat(dayOverTime) || 0,
        total_over_time: parseFloat(totalOverTime) || 0,
        day_hour: parseFloat(dayHour) || 0,
        total_hour: parseFloat(totalHour) || 0,
        day_carton: parseInt(dayCarton) || 0,
        total_carton: parseInt(totalCarton) || 0,
        remarks: remarks || null,
        
        // Legacy fields (set defaults)
        qc_pass_qty: parseInt(dayQcPass) || 0,
        manpower: parseInt(mPower) || 0,
        estimated_cost_value: estimatedCost.value,
        estimated_cost_currency: estimatedCost.value != null ? estimatedCost.currency : null,
      };

      const result = await offlineSubmit("production_updates_finishing", "production_updates_finishing", insertData as Record<string, unknown>, {
        showSuccessToast: false,
        showQueuedToast: true,
      });

      if (result.queued) {
        const isWorker = hasRole('worker') && !isAdminOrHigher();
        if (isWorker) {
          navigate('/my-submissions');
        } else {
          resetForm();
        }
        return;
      }

      if (!result.success) {
        throw new Error(result.error);
      }

      toast.success("Update submitted!", { description: "Your finishing daily update has been recorded." });

      const isWorker = hasRole('worker') && !isAdminOrHigher();
      if (isWorker) {
        navigate('/my-submissions');
      } else {
        resetForm();
      }
    } catch (error: any) {
      console.error('Error submitting update:', error);
      toast.error("Submission failed", { description: error?.message || "Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetForm() {
    setSelectedPO("");
    setSelectedLine("");
    setMPower("");
    setPerHourTarget("");
    setDayQcPass("");
    setTotalQcPass("");
    setDayPoly("");
    setTotalPoly("");
    setAverageProduction("");
    setDayOverTime("");
    setTotalOverTime("");
    setDayHour("");
    setTotalHour("");
    setDayCarton("");
    setTotalCarton("");
    setRemarks("");
    setErrors({});
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
        icon={Package}
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
          <div className="h-10 w-10 rounded-lg bg-info/10 flex items-center justify-center">
            <Package className="h-5 w-5 text-info" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{t('finishing.title')}</h1>
            <p className="text-sm text-muted-foreground">
              {new Date(getTodayInTimezone(factory?.timezone || "Asia/Dhaka") + "T00:00:00").toLocaleDateString(i18n.language === 'bn' ? 'bn-BD' : 'en-US', { dateStyle: 'full' })}
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* SECTION A - Select References */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('sewing.selectReferences')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Line No. - First so PO can filter by it */}
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

        {/* SECTION B - Auto-filled Details (Read-Only) */}
        {(selectedPO || selectedLine) && (
          <Card className="bg-muted/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                {t('sewing.autoFilledDetails')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t('finishing.styleNo')}</Label>
                  <div className="p-2 bg-background rounded border text-sm font-medium">
                    {styleNo || "-"}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t('sewing.buyer')}</Label>
                  <div className="p-2 bg-background rounded border text-sm font-medium">
                    {buyerName || "-"}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t('sewing.item')}</Label>
                  <div className="p-2 bg-background rounded border text-sm font-medium">
                    {itemName || "-"}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t('finishing.orderQuantity')}</Label>
                  <div className="p-2 bg-background rounded border text-sm font-medium font-mono">
                    {orderQuantity > 0 ? orderQuantity.toLocaleString() : "-"}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t('sewing.unit')}</Label>
                  <div className="p-2 bg-background rounded border text-sm font-medium">
                    {unitName || "-"}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t('sewing.floor')}</Label>
                  <div className="p-2 bg-background rounded border text-sm font-medium">
                    {floorName || "-"}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* SECTION C - Finishing Metrics */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('finishing.finishingMetrics')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Row 1: M Power & Per Hour Target */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('finishing.mPower')} *</Label>
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
              <div className="space-y-2">
                <Label>{t('finishing.perHourTarget')} *</Label>
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
            </div>

            {/* Row 2: Day QC Pass & Total QC Pass */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('finishing.dayQcPass')} *</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="0"
                  value={dayQcPass}
                  onChange={(e) => setDayQcPass(e.target.value)}
                  className={`h-12 ${errors.dayQcPass ? 'border-destructive' : ''}`}
                />
                {errors.dayQcPass && <p className="text-xs text-destructive">{errors.dayQcPass}</p>}
              </div>
              <div className="space-y-2">
                <Label>{t('finishing.totalQcPass')} *</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="0"
                  value={totalQcPass}
                  onChange={(e) => setTotalQcPass(e.target.value)}
                  className={`h-12 ${errors.totalQcPass ? 'border-destructive' : ''}`}
                />
                {errors.totalQcPass && <p className="text-xs text-destructive">{errors.totalQcPass}</p>}
              </div>
            </div>

            {/* Row 3: Day Poly & Total Poly */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('finishing.dayPoly')} *</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="0"
                  value={dayPoly}
                  onChange={(e) => setDayPoly(e.target.value)}
                  className={`h-12 ${errors.dayPoly ? 'border-destructive' : ''}`}
                />
                {errors.dayPoly && <p className="text-xs text-destructive">{errors.dayPoly}</p>}
              </div>
              <div className="space-y-2">
                <Label>{t('finishing.totalPoly')} *</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="0"
                  value={totalPoly}
                  onChange={(e) => setTotalPoly(e.target.value)}
                  className={`h-12 ${errors.totalPoly ? 'border-destructive' : ''}`}
                />
                {errors.totalPoly && <p className="text-xs text-destructive">{errors.totalPoly}</p>}
              </div>
            </div>

            {/* Row 4: Average Production */}
            <div className="space-y-2">
              <Label>{t('finishing.averageProduction')} *</Label>
              <Input
                type="number"
                inputMode="numeric"
                min="0"
                placeholder="0"
                value={averageProduction}
                onChange={(e) => setAverageProduction(e.target.value)}
                className={`h-12 ${errors.averageProduction ? 'border-destructive' : ''}`}
              />
              {errors.averageProduction && <p className="text-xs text-destructive">{errors.averageProduction}</p>}
            </div>

            {/* Row 5: Day Over Time & Total Over Time */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('finishing.dayOverTime')} *</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.5"
                  placeholder="0"
                  value={dayOverTime}
                  onChange={(e) => setDayOverTime(e.target.value)}
                  className={`h-12 ${errors.dayOverTime ? 'border-destructive' : ''}`}
                />
                {errors.dayOverTime && <p className="text-xs text-destructive">{errors.dayOverTime}</p>}
              </div>
              <div className="space-y-2">
                <Label>{t('finishing.totalOverTime')} *</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.5"
                  placeholder="0"
                  value={totalOverTime}
                  onChange={(e) => setTotalOverTime(e.target.value)}
                  className={`h-12 ${errors.totalOverTime ? 'border-destructive' : ''}`}
                />
                {errors.totalOverTime && <p className="text-xs text-destructive">{errors.totalOverTime}</p>}
              </div>
            </div>

            {/* Row 6: Day Hour & Total Hour */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('finishing.dayHour')} *</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.5"
                  placeholder="0"
                  value={dayHour}
                  onChange={(e) => setDayHour(e.target.value)}
                  className={`h-12 ${errors.dayHour ? 'border-destructive' : ''}`}
                />
                {errors.dayHour && <p className="text-xs text-destructive">{errors.dayHour}</p>}
              </div>
              <div className="space-y-2">
                <Label>{t('finishing.totalHour')} *</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.5"
                  placeholder="0"
                  value={totalHour}
                  onChange={(e) => setTotalHour(e.target.value)}
                  className={`h-12 ${errors.totalHour ? 'border-destructive' : ''}`}
                />
                {errors.totalHour && <p className="text-xs text-destructive">{errors.totalHour}</p>}
              </div>
            </div>

            <EstimatedCostDisplay manpower={mPower} hours={dayHour} />

            {/* Row 7: Day Carton & Total Carton */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('finishing.dayCarton')} *</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="0"
                  value={dayCarton}
                  onChange={(e) => setDayCarton(e.target.value)}
                  className={`h-12 ${errors.dayCarton ? 'border-destructive' : ''}`}
                />
                {errors.dayCarton && <p className="text-xs text-destructive">{errors.dayCarton}</p>}
              </div>
              <div className="space-y-2">
                <Label>{t('finishing.totalCarton')} *</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="0"
                  value={totalCarton}
                  onChange={(e) => setTotalCarton(e.target.value)}
                  className={`h-12 ${errors.totalCarton ? 'border-destructive' : ''}`}
                />
                {errors.totalCarton && <p className="text-xs text-destructive">{errors.totalCarton}</p>}
              </div>
            </div>

            {/* Remarks (Optional) */}
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
              t('common.submit')
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
