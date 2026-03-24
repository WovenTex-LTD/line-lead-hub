import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getTodayInTimezone } from "@/lib/date-utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, AlertTriangle, CalendarIcon, Search, Factory } from "lucide-react";
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
}

interface Floor {
  id: string;
  name: string;
}

interface WorkOrder {
  id: string;
  po_number: string;
  buyer: string;
  style: string;
  line_id: string | null;
}

interface BlockerType {
  id: string;
  name: string;
  code: string;
  default_owner: string | null;
  default_impact: string | null;
}

interface DropdownOption {
  id: string;
  label: string;
  is_active: boolean | null;
}

export default function ReportBlocker() {
  const { t, i18n } = useTranslation();
  const { profile, user, factory, hasRole, isAdminOrHigher } = useAuth();
  const navigate = useNavigate();

  const { submit: offlineSubmit } = useOfflineSubmission();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  // Master data
  const [lines, setLines] = useState<Line[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [blockerTypes, setBlockerTypes] = useState<BlockerType[]>([]);
  const [blockerOwnerOptions, setBlockerOwnerOptions] = useState<DropdownOption[]>([]);

  // Form fields
  const [selectedLine, setSelectedLine] = useState("");
  const [selectedPO, setSelectedPO] = useState("");
  const [blockerType, setBlockerType] = useState("");
  const [blockerOwner, setBlockerOwner] = useState("");
  const [blockerSeverity, setBlockerSeverity] = useState("");
  const [blockerResolution, setBlockerResolution] = useState<Date | undefined>(new Date());
  const [blockerDescription, setBlockerDescription] = useState("");

  // Check if user is Cutting or Storage role (no line selection needed)
  const isCuttingOrStorage = hasRole("cutting") || hasRole("storage");
  const showLineSelection = !isCuttingOrStorage;
  
  // Determine update type based on role or legacy department
  type Department = "sewing" | "finishing" | "cutting" | "storage";
  const defaultDept: Department = hasRole("cutting") ? "cutting" : hasRole("storage") ? "storage" : hasRole("finishing") ? "finishing" : "sewing";
  const [updateType, setUpdateType] = useState<Department>(defaultDept);

  // Auto-filled
  const [unitName, setUnitName] = useState("");
  const [floorName, setFloorName] = useState("");

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [poSearchOpen, setPoSearchOpen] = useState(false);

  // Set update type based on role when profile loads
  useEffect(() => {
    if (hasRole("cutting")) setUpdateType("cutting");
    else if (hasRole("storage")) setUpdateType("storage");
    else if (hasRole("finishing")) setUpdateType("finishing");
    else if (hasRole("sewing")) setUpdateType("sewing");
  }, [hasRole]);

  useEffect(() => {
    if (profile?.factory_id) {
      fetchFormData();
    } else if (profile !== undefined) {
      setLoading(false);
    }
  }, [profile?.factory_id, profile]);

  // Auto-fill Unit/Floor when Line or PO is selected
  useEffect(() => {
    // For cutting/storage: use PO's line_id
    // For workers: use selectedLine
    const lineId = isCuttingOrStorage
      ? workOrders.find((w) => w.id === selectedPO)?.line_id
      : selectedLine;

    if (lineId) {
      const line = lines.find((l) => l.id === lineId);
      if (line) {
        const unit = units.find((u) => u.id === line.unit_id);
        const floor = floors.find((f) => f.id === line.floor_id);
        setUnitName(unit?.name || "");
        setFloorName(floor?.name || "");
      } else {
        setUnitName("");
        setFloorName("");
      }
    } else {
      setUnitName("");
      setFloorName("");
    }
  }, [selectedLine, selectedPO, workOrders, lines, units, floors, isCuttingOrStorage]);

  // Auto-fill blocker owner/severity when blocker type is selected
  useEffect(() => {
    if (blockerType) {
      const bt = blockerTypes.find((b) => b.id === blockerType);
      if (bt) {
        if (bt.default_owner) {
          const ownerOption = blockerOwnerOptions.find(
            (o) => o.label.toLowerCase() === bt.default_owner?.toLowerCase()
          );
          if (ownerOption) setBlockerOwner(ownerOption.id);
        }
        if (bt.default_impact) {
          // Map default_impact to severity values
          const impactLower = bt.default_impact.toLowerCase();
          if (impactLower === 'low' || impactLower === 'medium' || impactLower === 'high' || impactLower === 'critical') {
            setBlockerSeverity(impactLower);
          }
        }
      }
    }
  }, [blockerType, blockerTypes, blockerOwnerOptions]);

  async function fetchFormData() {
    if (!profile?.factory_id || !user?.id) return;

    try {
      const [
        linesRes,
        lineAssignmentsRes,
        workOrdersRes,
        unitsRes,
        floorsRes,
        blockerTypesRes,
        blockerOwnerRes,
      ] = await Promise.all([
        supabase
          .from("lines")
          .select("id, line_id, name, unit_id, floor_id")
          .eq("factory_id", profile.factory_id)
          .eq("is_active", true)
          .order("line_id"),
        supabase
          .from("user_line_assignments")
          .select("line_id")
          .eq("user_id", user.id)
          .eq("factory_id", profile.factory_id),
        supabase
          .from("work_orders")
          .select("id, po_number, buyer, style, line_id")
          .eq("factory_id", profile.factory_id)
          .eq("is_active", true)
          .order("po_number"),
        supabase
          .from("units")
          .select("id, name")
          .eq("factory_id", profile.factory_id)
          .eq("is_active", true),
        supabase
          .from("floors")
          .select("id, name")
          .eq("factory_id", profile.factory_id)
          .eq("is_active", true),
        supabase
          .from("blocker_types")
          .select("id, name, code, default_owner, default_impact")
          .eq("factory_id", profile.factory_id)
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("blocker_owner_options")
          .select("id, label, is_active")
          .eq("factory_id", profile.factory_id)
          .eq("is_active", true)
          .order("sort_order"),
      ]);

      const allLines = linesRes.data || [];
      const assignedLineIds = (lineAssignmentsRes.data || []).map((a) => a.line_id);

      // If user has line assignments, filter to only those lines. Otherwise show all (for admins).
      const filteredLines =
        assignedLineIds.length > 0
          ? allLines.filter((line) => assignedLineIds.includes(line.id))
          : allLines;

      // Sort lines numerically
      const sortedLines = [...filteredLines].sort((a, b) => {
        const numA = parseInt(a.line_id.replace(/\D/g, "")) || 0;
        const numB = parseInt(b.line_id.replace(/\D/g, "")) || 0;
        return numA - numB;
      });

      setLines(sortedLines);
      setWorkOrders(workOrdersRes.data || []);
      setUnits(unitsRes.data || []);
      setFloors(floorsRes.data || []);
      setBlockerTypes(blockerTypesRes.data || []);
      setBlockerOwnerOptions(blockerOwnerRes.data || []);
    } catch (error) {
      console.error("Error fetching form data:", error);
    } finally {
      setLoading(false);
    }
  }

  function validateForm(): boolean {
    const newErrors: Record<string, string> = {};

    // Line is optional — user can leave it blank
    if (!selectedPO) newErrors.po = "PO is required";
    if (!blockerType) newErrors.blockerType = "Blocker Type is required";
    if (!blockerOwner) newErrors.blockerOwner = "Blocker Owner is required";
    if (!blockerSeverity) newErrors.blockerSeverity = "Severity is required";
    if (!blockerResolution) newErrors.blockerResolution = "Expected Resolution date is required";
    if (!blockerDescription.trim()) newErrors.blockerDescription = "Description is required";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!validateForm()) {
      toast.error(t('common.fillRequiredFields'));
      return;
    }

    setIsSubmitting(true);

    try {
      const blockerOwnerLabel = blockerOwnerOptions.find((o) => o.id === blockerOwner)?.label || "";

      // Use selected severity directly
      const severityValue = blockerSeverity as "low" | "medium" | "high" | "critical";

      const workOrder = workOrders.find((w) => w.id === selectedPO);
      // Use selectedLine if set, otherwise fall back to PO's line_id
      const lineId = selectedLine || workOrder?.line_id || lines[0]?.id;

      const insertData: Record<string, unknown> = {
        factory_id: profile?.factory_id,
        line_id: lineId,
        work_order_id: selectedPO,
        production_date: getTodayInTimezone(factory?.timezone || "Asia/Dhaka"),
        submitted_by: user?.id,
        submitted_at: new Date().toISOString(),

        // Blocker fields
        has_blocker: true,
        blocker_type_id: blockerType,
        blocker_owner: blockerOwnerLabel,
        blocker_impact: severityValue,
        blocker_description: blockerDescription,
        blocker_status: "open",

        // Auto-filled context
        unit_name: unitName,
        floor_name: floorName,
        factory_name: factory?.name || "",
      };

      // Route: finishing → finishing table, everything else → sewing table
      // (cutting/storage tables don't have blocker fields)
      const useFinishingTable = updateType === "finishing";

      if (!useFinishingTable) {
        insertData.blocker_resolution_date = blockerResolution ? format(blockerResolution, "yyyy-MM-dd") : null;
        Object.assign(insertData, {
          buyer_name: workOrder?.buyer || "",
          po_number: workOrder?.po_number || "",
          style_code: workOrder?.style || "",
          output_qty: 0,
          action_taken_today: blockerDescription,
        });
      } else {
        Object.assign(insertData, {
          buyer_name: workOrder?.buyer || "",
          style_no: workOrder?.style || "",
          qc_pass_qty: 0,
        });
      }

      const table = useFinishingTable ? "production_updates_finishing" : "production_updates_sewing";
      const formType = useFinishingTable ? "production_updates_finishing" as const : "production_updates_sewing" as const;

      const result = await offlineSubmit(formType, table, insertData as Record<string, unknown>, {
        showSuccessToast: false,
        showQueuedToast: true,
      });

      if (result.queued) {
        // Navigate away - notification won't fire for offline submissions
        if (isAdminOrHigher()) {
          navigate("/blockers");
        } else if (hasRole("cutting")) {
          navigate("/cutting/submissions");
        } else if (hasRole("storage")) {
          navigate("/submissions?department=storage");
        } else if (hasRole("finishing") || updateType === "finishing" || profile?.department === "finishing") {
          navigate("/finishing/my-submissions");
        } else {
          navigate("/my-submissions");
        }
        return;
      }

      if (!result.success) {
        throw new Error(result.error);
      }

      // Get the blocker type name for notification
      const blockerTypeName = blockerTypes.find(bt => bt.id === blockerType)?.name || "Unknown";

      // Get the line name for notification
      const lineName = isCuttingOrStorage
        ? (lines.find(l => l.id === workOrder?.line_id)?.name || lines.find(l => l.id === workOrder?.line_id)?.line_id || "Unknown")
        : (lines.find(l => l.id === selectedLine)?.name || lines.find(l => l.id === selectedLine)?.line_id || "Unknown");

      // Send notification to admins (fire and forget - don't block the user)
      supabase.functions.invoke("notify-blocker", {
        body: {
          factoryId: profile?.factory_id,
          lineName,
          poNumber: workOrder?.po_number || undefined,
          blockerType: blockerTypeName,
          blockerImpact: severityValue,
          blockerDescription,
          submittedBy: profile?.full_name || "Unknown",
          department: updateType,
        },
      }).then((res) => {
        if (res.error) {
          console.error("Failed to send blocker notifications:", res.error);
        } else {
          console.log("Blocker notifications sent:", res.data);
        }
      }).catch((err) => {
        console.error("Error calling notify-blocker function:", err);
      });

      toast.success(t('reportBlocker.blockerReported'), { description: t('reportBlocker.blockerReportedDesc') });

      // Navigate users to their respective submission pages based on role/department
      if (isAdminOrHigher()) {
        navigate("/blockers");
      } else if (hasRole("cutting")) {
        navigate("/cutting/submissions");
      } else if (hasRole("storage")) {
        navigate("/submissions?department=storage");
      } else if (hasRole("finishing") || updateType === "finishing" || profile?.department === "finishing") {
        navigate("/finishing/my-submissions");
      } else {
        // Default to sewing submissions for workers
        navigate("/my-submissions");
      }
    } catch (error: unknown) {
      console.error("Error submitting blocker:", error);
      toast.error(t('common.submissionFailed'), { description: error instanceof Error ? error.message : t('common.pleaseTryAgain') });
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
        action={{ label: t('reportBlocker.goBack'), onClick: () => navigate(-1) }}
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-3 md:py-4 lg:py-6 px-4 pb-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">{t('reportBlocker.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {new Date(getTodayInTimezone(factory?.timezone || "Asia/Dhaka") + "T00:00:00").toLocaleDateString(i18n.language === 'bn' ? 'bn-BD' : 'en-US', { dateStyle: "full" })}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
      <div className="rounded-xl border border-border/50 bg-card p-5 md:p-6 space-y-6">

        {/* Department & Location */}
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground">{t('reportBlocker.location')}</p>
          <div className={`grid grid-cols-1 ${showLineSelection ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-4`}>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t('reportBlocker.updateType')}</Label>
              <Select value={updateType} onValueChange={(v) => setUpdateType(v as Department)}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sewing">{t('dashboard.sewing')}</SelectItem>
                  <SelectItem value="finishing">{t('dashboard.finishing')}</SelectItem>
                  <SelectItem value="cutting">{t('dashboard.cutting')}</SelectItem>
                  <SelectItem value="storage">{t('dashboard.storage')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {showLineSelection && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t('sewing.lineNo')}</Label>
                <Select value={selectedLine} onValueChange={setSelectedLine}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder={lines.length === 0 ? t('common.noLinesAvailable') : t('common.selectLine')} />
                  </SelectTrigger>
                  <SelectContent>
                    {lines.map((line) => (
                      <SelectItem key={line.id} value={line.id}>{line.name || line.line_id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">PO *</Label>
              <Popover open={poSearchOpen} onOpenChange={setPoSearchOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className={`w-full h-10 justify-start ${errors.po ? "border-destructive" : ""}`}>
                    <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm">
                      {selectedPO
                        ? (() => { const wo = workOrders.find(w => w.id === selectedPO); return wo ? `${wo.po_number} - ${wo.style}` : t('common.selectPO'); })()
                        : workOrders.length === 0 ? t('common.noPOsAvailable') : t('common.selectPO')}
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
                          <CommandItem key={wo.id} value={`${wo.po_number} ${wo.buyer} ${wo.style}`} onSelect={() => { setSelectedPO(wo.id); setPoSearchOpen(false); }}>
                            <div className="flex flex-col">
                              <span className="font-medium">{wo.po_number} - {wo.style}</span>
                              <span className="text-xs text-muted-foreground">{wo.buyer}</span>
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
          </div>
        </div>

        <div className="border-t border-border/40" />

        {/* Blocker Details */}
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground">{t('reportBlocker.blockerDetails')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t('sewing.blockerType')} *</Label>
              <Select value={blockerType} onValueChange={setBlockerType}>
                <SelectTrigger className={`h-10 ${errors.blockerType ? "border-destructive" : ""}`}>
                  <SelectValue placeholder={t('reportBlocker.selectBlockerType')} />
                </SelectTrigger>
                <SelectContent>
                  {blockerTypes.map((bt) => (
                    <SelectItem key={bt.id} value={bt.id}>{bt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.blockerType && <p className="text-xs text-destructive">{errors.blockerType}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t('sewing.blockerOwner')} *</Label>
              <Select value={blockerOwner} onValueChange={setBlockerOwner}>
                <SelectTrigger className={`h-10 ${errors.blockerOwner ? "border-destructive" : ""}`}>
                  <SelectValue placeholder={t('reportBlocker.selectBlockerOwner')} />
                </SelectTrigger>
                <SelectContent>
                  {blockerOwnerOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.blockerOwner && <p className="text-xs text-destructive">{errors.blockerOwner}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t('sewing.blockerImpact')} *</Label>
              <Select value={blockerSeverity} onValueChange={setBlockerSeverity}>
                <SelectTrigger className={`h-10 ${errors.blockerSeverity ? "border-destructive" : ""}`}>
                  <SelectValue placeholder={t('reportBlocker.selectSeverity')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t('reportBlocker.severityLow')}</SelectItem>
                  <SelectItem value="medium">{t('reportBlocker.severityMedium')}</SelectItem>
                  <SelectItem value="high">{t('reportBlocker.severityHigh')}</SelectItem>
                  <SelectItem value="critical">{t('reportBlocker.severityCritical')}</SelectItem>
                </SelectContent>
              </Select>
              {errors.blockerSeverity && <p className="text-xs text-destructive">{errors.blockerSeverity}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t('reportBlocker.expectedResolution')} *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full h-10 justify-start text-left font-normal text-sm", !blockerResolution && "text-muted-foreground", errors.blockerResolution && "border-destructive")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {blockerResolution ? format(blockerResolution, "PPP") : t('common.selectDate')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={blockerResolution} onSelect={setBlockerResolution} initialFocus />
                </PopoverContent>
              </Popover>
              {errors.blockerResolution && <p className="text-xs text-destructive">{errors.blockerResolution}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">{t('blockers.description_label')} *</Label>
            <Textarea
              placeholder={t('sewing.actionTakenToday')}
              value={blockerDescription}
              onChange={(e) => setBlockerDescription(e.target.value)}
              className={`min-h-[80px] ${errors.blockerDescription ? "border-destructive" : ""}`}
            />
            {errors.blockerDescription && <p className="text-xs text-destructive">{errors.blockerDescription}</p>}
          </div>
        </div>
      </div>

        {/* Submit */}
        <Button type="submit" className="w-full h-11 font-semibold mt-5" disabled={isSubmitting}>
          {isSubmitting ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('common.loading')}</>
          ) : (
            <><AlertTriangle className="mr-2 h-4 w-4" /> {t('reportBlocker.title')}</>
          )}
        </Button>
      </form>
    </div>
  );
}
