import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, parseISO } from "date-fns";
import { getTodayInTimezone, isTodayInTimezone } from "@/lib/date-utils";
import { toast } from "sonner";
import { Loader2, Download, RefreshCw, Scissors, Target, ClipboardCheck, Package, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CuttingSubmissionView } from "@/components/CuttingSubmissionView";

interface CuttingTarget {
  id: string;
  production_date: string;
  submitted_at: string | null;
  line_id: string;
  work_order_id: string;
  buyer: string | null;
  style: string | null;
  po_no: string | null;
  colour: string | null;
  order_qty: number | null;
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
  target_per_hour: number | null;
  lines?: { line_id: string; name: string | null };
  work_orders?: { po_number: string; buyer: string; style: string };
}

interface CuttingActual {
  id: string;
  production_date: string;
  submitted_at: string | null;
  line_id: string;
  work_order_id: string;
  buyer: string | null;
  style: string | null;
  po_no: string | null;
  colour: string | null;
  order_qty: number | null;
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
  ot_hours_actual: number | null;
  ot_manpower_actual: number | null;
  hours_actual: number | null;
  actual_per_hour: number | null;
  lines?: { line_id: string; name: string | null };
  work_orders?: { po_number: string; buyer: string; style: string };
}

interface Line {
  id: string;
  line_id: string;
  name: string | null;
}

export default function CuttingAllSubmissions() {
  const { profile, factory } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [targets, setTargets] = useState<CuttingTarget[]>([]);
  const [actuals, setActuals] = useState<CuttingActual[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [activeTab, setActiveTab] = useState("actuals");

  // Modals
  const [selectedTarget, setSelectedTarget] = useState<CuttingTarget | null>(null);
  const [selectedActual, setSelectedActual] = useState<CuttingActual | null>(null);

  // Filters
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedLine, setSelectedLine] = useState("all");
  const [selectedPO, setSelectedPO] = useState("all");

  useEffect(() => {
    if (profile?.factory_id) {
      fetchData();
    }
  }, [profile?.factory_id, dateFrom, dateTo]);

  async function fetchData() {
    if (!profile?.factory_id) return;
    setLoading(true);

    try {
      const [targetsRes, actualsRes, linesRes] = await Promise.all([
        supabase
          .from("cutting_targets")
          .select("*, lines(line_id, name), work_orders(po_number, buyer, style)")
          .eq("factory_id", profile.factory_id)
          .gte("production_date", dateFrom)
          .lte("production_date", dateTo)
          .order("production_date", { ascending: false }),
        supabase
          .from("cutting_actuals")
          .select("*, lines!cutting_actuals_line_id_fkey(line_id, name), work_orders(po_number, buyer, style)")
          .eq("factory_id", profile.factory_id)
          .gte("production_date", dateFrom)
          .lte("production_date", dateTo)
          .order("production_date", { ascending: false }),
        supabase
          .from("lines")
          .select("id, line_id, name")
          .eq("factory_id", profile.factory_id)
          .eq("is_active", true),
      ]);

      setTargets(targetsRes.data || []);
      setActuals(actualsRes.data || []);
      setLines(linesRes.data || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  // Get unique PO numbers for filter
  const uniquePOs = useMemo(() => {
    const pos = new Set<string>();
    [...targets, ...actuals].forEach(s => {
      const po = s.work_orders?.po_number || s.po_no;
      if (po) pos.add(po);
    });
    return Array.from(pos).sort();
  }, [targets, actuals]);

  const filteredTargets = useMemo(() => {
    return targets.filter(s => {
      if (selectedLine !== "all" && s.line_id !== selectedLine) return false;
      if (selectedPO !== "all") {
        const po = s.work_orders?.po_number || s.po_no;
        if (po !== selectedPO) return false;
      }
      return true;
    });
  }, [targets, selectedLine, selectedPO]);

  const filteredActuals = useMemo(() => {
    return actuals.filter(s => {
      if (selectedLine !== "all" && s.line_id !== selectedLine) return false;
      if (selectedPO !== "all") {
        const po = s.work_orders?.po_number || s.po_no;
        if (po !== selectedPO) return false;
      }
      return true;
    });
  }, [actuals, selectedLine, selectedPO]);

  // Aggregate leftover data by PO
  const leftoverByPO = useMemo(() => {
    const map = new Map<string, {
      po_number: string;
      buyer: string;
      style: string;
      entries: CuttingActual[];
      totalQuantity: number;
      unit: string;
    }>();

    actuals
      .filter(a => a.leftover_recorded && a.leftover_quantity && a.leftover_quantity > 0)
      .forEach(actual => {
        const po = actual.work_orders?.po_number || actual.po_no || "Unknown PO";
        const existing = map.get(po);
        if (existing) {
          existing.entries.push(actual);
          existing.totalQuantity += actual.leftover_quantity || 0;
        } else {
          map.set(po, {
            po_number: po,
            buyer: actual.work_orders?.buyer || actual.buyer || "—",
            style: actual.work_orders?.style || actual.style || "—",
            entries: [actual],
            totalQuantity: actual.leftover_quantity || 0,
            unit: actual.leftover_unit || "pcs",
          });
        }
      });

    return Array.from(map.values()).sort((a, b) => a.po_number.localeCompare(b.po_number));
  }, [actuals]);

  async function markLeftoverAsUsed(actualId: string) {
    if (!profile?.factory_id) return;
    
    try {
      const { error } = await supabase
        .from("cutting_actuals")
        .update({
          leftover_recorded: false,
          leftover_type: null,
          leftover_unit: null,
          leftover_quantity: null,
          leftover_notes: null,
          leftover_location: null,
        })
        .eq("id", actualId)
        .eq("factory_id", profile.factory_id);

      if (error) throw error;
      toast.success("Left over marked as used");
      fetchData();
    } catch (error) {
      console.error("Error marking leftover as used:", error);
      toast.error("Failed to update leftover status");
    }
  }

  const stats = useMemo(() => {
    const today = getTodayInTimezone(factory?.timezone || "Asia/Dhaka");
    const todayTargets = targets.filter(s => s.production_date === today);
    const todayActuals = actuals.filter(s => s.production_date === today);
    return {
      targetsToday: todayTargets.length,
      actualsToday: todayActuals.length,
      targetCuttingToday: todayTargets.reduce((sum, s) => sum + (s.cutting_capacity || 0), 0),
      actualCuttingToday: todayActuals.reduce((sum, s) => sum + (s.day_cutting || 0), 0),
      actualInputToday: todayActuals.reduce((sum, s) => sum + (s.day_input || 0), 0),
    };
  }, [targets, actuals]);

  function exportToCSV() {
    const headers = activeTab === "targets" 
      ? ["DATE", "LINE", "BUYER", "STYLE", "PO-NO", "ORDER QTY", "DAY CUTTING TARGET", "DAY INPUT TARGET"]
      : ["DATE", "LINE", "BUYER", "STYLE", "PO-NO", "ORDER QTY", "DAY CUTTING", "DAY INPUT", "TOTAL CUTTING", "TOTAL INPUT", "BALANCE"];
    
    const data = activeTab === "targets" ? filteredTargets : filteredActuals;
    const rows = data.map(s => activeTab === "targets" 
      ? [
          s.production_date,
          (s as CuttingTarget).lines?.name || (s as CuttingTarget).lines?.line_id || "",
          s.work_orders?.buyer || s.buyer || "",
          s.work_orders?.style || s.style || "",
          s.work_orders?.po_number || s.po_no || "",
          s.order_qty || 0,
          (s as CuttingTarget).cutting_capacity || 0,
          (s as CuttingTarget).lay_capacity || 0,
        ]
      : [
          s.production_date,
          (s as CuttingActual).lines?.name || (s as CuttingActual).lines?.line_id || "",
          s.work_orders?.buyer || s.buyer || "",
          s.work_orders?.style || s.style || "",
          s.work_orders?.po_number || s.po_no || "",
          s.order_qty || 0,
          (s as CuttingActual).day_cutting || 0,
          (s as CuttingActual).day_input || 0,
          (s as CuttingActual).total_cutting || 0,
          (s as CuttingActual).total_input || 0,
          (s as CuttingActual).balance || 0,
        ]
    );
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    downloadCSV(csv, `cutting-${activeTab}-${dateFrom}-to-${dateTo}.csv`);
  }

  async function downloadCSV(csv: string, filename: string) {
    const { downloadFile } = await import("@/lib/capacitor");
    const blob = new Blob([csv], { type: "text/csv" });
    await downloadFile(blob, filename);
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container py-4 px-4 pb-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Scissors className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{t('cutting.allCuttingSubmissions')}</h1>
            <p className="text-sm text-muted-foreground">{t('cutting.viewTargetsAndActuals')}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchData()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('cutting.refresh')}
          </Button>
          <Button variant="outline" size="sm" onClick={exportToCSV}>
            <Download className="h-4 w-4 mr-2" />
            {t('cutting.export')}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>{t('cutting.from')}</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('cutting.to')}</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('cutting.line')}</Label>
              <Select value={selectedLine} onValueChange={setSelectedLine}>
                <SelectTrigger>
                  <SelectValue placeholder={t('cutting.allLines')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('cutting.allLines')}</SelectItem>
                  {lines.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.name || l.line_id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('cutting.po')}</Label>
              <Select value={selectedPO} onValueChange={setSelectedPO}>
                <SelectTrigger>
                  <SelectValue placeholder={t('cutting.allPOs')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('cutting.allPOs')}</SelectItem>
                  {uniquePOs.map(po => (
                    <SelectItem key={po} value={po}>{po}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('cutting.targetsToday')}</p>
            <p className="text-2xl font-bold">{stats.targetsToday}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-success">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('cutting.actualsToday')}</p>
            <p className="text-2xl font-bold">{stats.actualsToday}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-info">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Target Cutting</p>
            <p className="text-2xl font-bold">{stats.targetCuttingToday.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-warning">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Actual Cutting</p>
            <p className="text-2xl font-bold">{stats.actualCuttingToday.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 max-w-lg">
          <TabsTrigger value="targets" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            {t('cutting.targets')} ({filteredTargets.length})
          </TabsTrigger>
          <TabsTrigger value="actuals" className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" />
            {t('cutting.actuals')} ({filteredActuals.length})
          </TabsTrigger>
          <TabsTrigger value="leftover" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            {t('cutting.leftOvers')} ({leftoverByPO.length})
          </TabsTrigger>
        </TabsList>

        {/* Targets Tab */}
        <TabsContent value="targets" className="mt-6">
          {filteredTargets.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No target submissions found for selected filters
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredTargets.map((target) => (
                <Card 
                  key={target.id} 
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelectedTarget(target)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="bg-primary/10">
                        <Target className="h-3 w-3 mr-1" />
                        {t('cutting.target')}
                      </Badge>
                      {isTodayInTimezone(target.production_date, factory?.timezone || "Asia/Dhaka") && (
                        <Badge variant="secondary" className="text-xs">Today</Badge>
                      )}
                    </div>
                    <CardTitle className="text-base mt-2">
                      {target.lines?.name || target.lines?.line_id || "—"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('cutting.date')}:</span>
                        <span className="font-medium">{format(parseISO(target.production_date), "MMM d, yyyy")}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('cutting.po')}:</span>
                        <span className="font-medium">{target.work_orders?.po_number || target.po_no || "—"}</span>
                      </div>
                      <div className="flex justify-between border-t pt-2 mt-2">
                        <span className="text-muted-foreground">{t('cutting.dayCutting')}:</span>
                        <span className="font-bold text-primary">{target.day_cutting?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('cutting.dayInput')}:</span>
                        <span className="font-bold text-success">{target.day_input?.toLocaleString()}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Actuals Tab */}
        <TabsContent value="actuals" className="mt-6">
          {filteredActuals.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No actual submissions found for selected filters
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredActuals.map((actual) => (
                <Card
                  key={actual.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelectedActual(actual)}
                >
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="bg-success/10 text-success">
                          <ClipboardCheck className="h-3 w-3 mr-1" />
                          {t('cutting.actual')}
                        </Badge>
                        {isTodayInTimezone(actual.production_date, factory?.timezone || "Asia/Dhaka") && (
                          <Badge variant="secondary" className="text-xs">Today</Badge>
                        )}
                      </div>
                      <CardTitle className="text-base mt-2">
                        {actual.lines?.name || actual.lines?.line_id || "—"}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('cutting.date')}:</span>
                          <span className="font-medium">{format(parseISO(actual.production_date), "MMM d, yyyy")}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('cutting.po')}:</span>
                          <span className="font-medium">{actual.work_orders?.po_number || actual.po_no || "—"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('cutting.dayCutting')}:</span>
                          <span className="font-bold">{actual.day_cutting?.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('cutting.dayInput')}:</span>
                          <span className="font-bold text-success">{actual.day_input?.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between border-t pt-2 mt-2">
                          <span className="text-muted-foreground">{t('cutting.balance')}:</span>
                          <span className={`font-bold ${actual.balance && actual.balance < 0 ? 'text-destructive' : ''}`}>
                            {actual.balance?.toLocaleString() || "—"}
                          </span>
                        </div>
                        {actual.leftover_recorded && (
                          <div className="flex items-center gap-2 pt-2 mt-2 border-t">
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
                              <Package className="h-3 w-3 mr-1" />
                              {t('cutting.leftOvers')}: {actual.leftover_quantity} {actual.leftover_unit}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          )}
        </TabsContent>

        {/* Left Over Tab */}
        <TabsContent value="leftover" className="mt-6">
          {leftoverByPO.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No leftover fabric records found
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {leftoverByPO.map((poData) => (
                <Card key={poData.po_number}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
                          <Package className="h-3 w-3 mr-1" />
                          {t('cutting.leftOvers')}
                        </Badge>
                        <CardTitle className="text-base">{poData.po_number}</CardTitle>
                      </div>
                      <Badge className="bg-amber-500 text-white">
                        Total: {poData.totalQuantity.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 2})} {poData.unit}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {poData.buyer} • {poData.style}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {poData.entries.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors"
                          onClick={() => setSelectedActual(entry)}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="font-medium">
                                {entry.lines?.name || entry.lines?.line_id || "—"}
                              </span>
                              <span className="text-muted-foreground">•</span>
                              <span className="text-muted-foreground">
                                {format(parseISO(entry.production_date), "MMM d, yyyy")}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-sm">
                              <span className="text-amber-600 font-semibold">
                                {entry.leftover_quantity} {entry.leftover_unit}
                              </span>
                              {entry.leftover_type && (
                                <span className="text-muted-foreground">
                                  {entry.leftover_type}
                                </span>
                              )}
                              {entry.leftover_location && (
                                <span className="text-muted-foreground">
                                  📍 {entry.leftover_location}
                                </span>
                              )}
                            </div>
                            {entry.leftover_notes && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {entry.leftover_notes}
                              </p>
                            )}
                          </div>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    markLeftoverAsUsed(entry.id);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                Mark as used / Remove
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Target Detail Modal */}
      {selectedTarget && (() => {
        const matchingActual = actuals.find(a =>
          a.production_date === selectedTarget.production_date &&
          a.line_id === selectedTarget.line_id &&
          a.work_order_id === selectedTarget.work_order_id
        );
        return (
          <CuttingSubmissionView
            target={{
              id: selectedTarget.id,
              production_date: selectedTarget.production_date,
              line_name: selectedTarget.lines?.name || selectedTarget.lines?.line_id || "—",
              buyer: selectedTarget.work_orders?.buyer || selectedTarget.buyer,
              style: selectedTarget.work_orders?.style || selectedTarget.style,
              po_number: selectedTarget.work_orders?.po_number || selectedTarget.po_no,
              colour: selectedTarget.colour,
              order_qty: selectedTarget.order_qty,
              submitted_at: selectedTarget.submitted_at,
              man_power: selectedTarget.man_power,
              marker_capacity: selectedTarget.marker_capacity,
              lay_capacity: selectedTarget.lay_capacity,
              cutting_capacity: selectedTarget.cutting_capacity,
              under_qty: selectedTarget.under_qty,
              day_cutting: selectedTarget.day_cutting,
              day_input: selectedTarget.day_input,
              ot_hours_planned: selectedTarget.ot_hours_planned ?? null,
              ot_manpower_planned: selectedTarget.ot_manpower_planned ?? null,
              hours_planned: selectedTarget.hours_planned ?? null,
              target_per_hour: selectedTarget.target_per_hour ?? null,
            }}
            actual={matchingActual ? {
              id: matchingActual.id,
              production_date: matchingActual.production_date,
              line_name: matchingActual.lines?.name || matchingActual.lines?.line_id || "—",
              buyer: matchingActual.work_orders?.buyer || matchingActual.buyer,
              style: matchingActual.work_orders?.style || matchingActual.style,
              po_number: matchingActual.work_orders?.po_number || matchingActual.po_no,
              colour: matchingActual.colour,
              order_qty: matchingActual.order_qty,
              submitted_at: matchingActual.submitted_at,
              man_power: matchingActual.man_power,
              marker_capacity: matchingActual.marker_capacity,
              lay_capacity: matchingActual.lay_capacity,
              cutting_capacity: matchingActual.cutting_capacity,
              under_qty: matchingActual.under_qty,
              day_cutting: matchingActual.day_cutting,
              day_input: matchingActual.day_input,
              total_cutting: matchingActual.total_cutting,
              total_input: matchingActual.total_input,
              balance: matchingActual.balance,
              ot_hours_actual: matchingActual.ot_hours_actual,
              ot_manpower_actual: matchingActual.ot_manpower_actual,
              hours_actual: matchingActual.hours_actual ?? null,
              actual_per_hour: matchingActual.actual_per_hour ?? null,
              leftover_recorded: matchingActual.leftover_recorded,
              leftover_type: matchingActual.leftover_type,
              leftover_unit: matchingActual.leftover_unit,
              leftover_quantity: matchingActual.leftover_quantity,
              leftover_notes: matchingActual.leftover_notes,
              leftover_location: matchingActual.leftover_location,
              leftover_photo_urls: matchingActual.leftover_photo_urls,
            } : null}
            open={!!selectedTarget}
            onOpenChange={(open) => !open && setSelectedTarget(null)}
          />
        );
      })()}

      {/* Actual Detail Modal */}
      {selectedActual && (() => {
        const matchingTarget = targets.find(t =>
          t.production_date === selectedActual.production_date &&
          t.line_id === selectedActual.line_id &&
          t.work_order_id === selectedActual.work_order_id
        );
        return (
          <CuttingSubmissionView
            target={matchingTarget ? {
              id: matchingTarget.id,
              production_date: matchingTarget.production_date,
              line_name: matchingTarget.lines?.name || matchingTarget.lines?.line_id || "—",
              buyer: matchingTarget.work_orders?.buyer || matchingTarget.buyer,
              style: matchingTarget.work_orders?.style || matchingTarget.style,
              po_number: matchingTarget.work_orders?.po_number || matchingTarget.po_no,
              colour: matchingTarget.colour,
              order_qty: matchingTarget.order_qty,
              submitted_at: matchingTarget.submitted_at,
              man_power: matchingTarget.man_power,
              marker_capacity: matchingTarget.marker_capacity,
              lay_capacity: matchingTarget.lay_capacity,
              cutting_capacity: matchingTarget.cutting_capacity,
              under_qty: matchingTarget.under_qty,
              day_cutting: matchingTarget.day_cutting,
              day_input: matchingTarget.day_input,
              ot_hours_planned: matchingTarget.ot_hours_planned ?? null,
              ot_manpower_planned: matchingTarget.ot_manpower_planned ?? null,
              hours_planned: matchingTarget.hours_planned ?? null,
              target_per_hour: matchingTarget.target_per_hour ?? null,
            } : null}
            actual={{
              id: selectedActual.id,
              production_date: selectedActual.production_date,
              line_name: selectedActual.lines?.name || selectedActual.lines?.line_id || "—",
              buyer: selectedActual.work_orders?.buyer || selectedActual.buyer,
              style: selectedActual.work_orders?.style || selectedActual.style,
              po_number: selectedActual.work_orders?.po_number || selectedActual.po_no,
              colour: selectedActual.colour,
              order_qty: selectedActual.order_qty,
              submitted_at: selectedActual.submitted_at,
              man_power: selectedActual.man_power,
              marker_capacity: selectedActual.marker_capacity,
              lay_capacity: selectedActual.lay_capacity,
              cutting_capacity: selectedActual.cutting_capacity,
              under_qty: selectedActual.under_qty,
              day_cutting: selectedActual.day_cutting,
              day_input: selectedActual.day_input,
              total_cutting: selectedActual.total_cutting,
              total_input: selectedActual.total_input,
              balance: selectedActual.balance,
              ot_hours_actual: selectedActual.ot_hours_actual,
              ot_manpower_actual: selectedActual.ot_manpower_actual,
              hours_actual: selectedActual.hours_actual ?? null,
              actual_per_hour: selectedActual.actual_per_hour ?? null,
              leftover_recorded: selectedActual.leftover_recorded,
              leftover_type: selectedActual.leftover_type,
              leftover_unit: selectedActual.leftover_unit,
              leftover_quantity: selectedActual.leftover_quantity,
              leftover_notes: selectedActual.leftover_notes,
              leftover_location: selectedActual.leftover_location,
              leftover_photo_urls: selectedActual.leftover_photo_urls,
            }}
            open={!!selectedActual}
            onOpenChange={(open) => !open && setSelectedActual(null)}
          />
        );
      })()}
    </div>
  );
}

