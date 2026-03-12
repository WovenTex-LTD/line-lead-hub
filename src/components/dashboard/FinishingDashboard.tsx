import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { formatTimeInTimezone, getTodayInTimezone } from "@/lib/date-utils";
import { useMidnightRefresh } from "@/hooks/useMidnightRefresh";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinishingSubmissionView, FinishingTargetData, FinishingActualData } from "@/components/FinishingSubmissionView";
import {
  Package,
  Clock,
  Plus,
  ChevronRight,
  ClipboardList,
  Target,
  TrendingUp,
} from "lucide-react";

interface DailyLogSummary {
  id: string;
  line_id: string;
  line_name: string;
  work_order_id: string | null;
  po_number: string | null;
  buyer: string | null;
  style: string | null;
  log_type: "TARGET" | "OUTPUT";
  thread_cutting: number;
  inside_check: number;
  top_side_check: number;
  buttoning: number;
  iron: number;
  get_up: number;
  poly: number;
  carton: number;
  m_power_planned: number | null;
  m_power_actual: number | null;
  planned_hours: number | null;
  actual_hours: number | null;
  remarks: string | null;
  ot_hours_actual: number | null;
  ot_manpower_actual: number | null;
  ot_hours_planned: number | null;
  ot_manpower_planned: number | null;
  submitted_at: string;
  production_date: string;
}

interface FinishingStats {
  totalTargets: number;
  totalOutputs: number;
  totalPoly: number;
  totalCarton: number;
}

export function FinishingDashboard() {
  const { t, i18n } = useTranslation();
  const { profile, factory } = useAuth();
  const [logs, setLogs] = useState<DailyLogSummary[]>([]);
  const [stats, setStats] = useState<FinishingStats>({
    totalTargets: 0,
    totalOutputs: 0,
    totalPoly: 0,
    totalCarton: 0,
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"targets" | "outputs">("targets");
  const [selectedLog, setSelectedLog] = useState<DailyLogSummary | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  useEffect(() => {
    if (profile?.factory_id) {
      fetchFinishingData();
    }
  }, [profile?.factory_id]);

  // Auto-refresh at midnight (factory timezone) and on tab refocus
  useMidnightRefresh(useCallback(() => {
    if (profile?.factory_id) {
      fetchFinishingData();
    }
  }, [profile?.factory_id]));

  async function fetchFinishingData() {
    if (!profile?.factory_id) return;
    
    setLoading(true);
    const today = getTodayInTimezone(factory?.timezone || "Asia/Dhaka");

    try {
      // Fetch today's daily logs from new table
      const { data: logsData } = await supabase
        .from('finishing_daily_logs')
        .select('*, lines(id, line_id, name), work_orders(po_number, buyer, style)')
        .eq('factory_id', profile.factory_id)
        .eq('production_date', today)
        .order('submitted_at', { ascending: false });

      // Format logs
      const formattedLogs: DailyLogSummary[] = (logsData || []).map((log: any) => ({
        id: log.id,
        line_id: '',
        line_name: '',
        work_order_id: log.work_order_id,
        po_number: log.work_orders?.po_number || null,
        buyer: log.work_orders?.buyer || null,
        style: log.work_orders?.style || null,
        log_type: log.log_type,
        thread_cutting: log.thread_cutting || 0,
        inside_check: log.inside_check || 0,
        top_side_check: log.top_side_check || 0,
        buttoning: log.buttoning || 0,
        iron: log.iron || 0,
        get_up: log.get_up || 0,
        poly: log.poly || 0,
        carton: log.carton || 0,
        m_power_planned: log.m_power_planned ?? null,
        m_power_actual: log.m_power_actual ?? null,
        planned_hours: log.planned_hours ?? null,
        actual_hours: log.actual_hours ?? null,
        remarks: log.remarks || null,
        ot_hours_actual: log.ot_hours_actual ?? null,
        ot_manpower_actual: log.ot_manpower_actual ?? null,
        ot_hours_planned: log.ot_hours_planned ?? null,
        ot_manpower_planned: log.ot_manpower_planned ?? null,
        submitted_at: log.submitted_at,
        production_date: log.production_date,
      }));

      // Calculate stats
      const targets = formattedLogs.filter(l => l.log_type === 'TARGET');
      const outputs = formattedLogs.filter(l => l.log_type === 'OUTPUT');
      
      const totalStats: FinishingStats = {
        totalTargets: targets.length,
        totalOutputs: outputs.length,
        totalPoly: outputs.reduce((sum, l) => {
          const effectivePoly = l.actual_hours && l.actual_hours > 0 && l.ot_hours_actual && l.ot_hours_actual > 0
            ? Math.round((l.poly / l.actual_hours) * (l.actual_hours + l.ot_hours_actual))
            : l.poly;
          return sum + effectivePoly;
        }, 0),
        totalCarton: outputs.reduce((sum, l) => {
          const effectiveCarton = l.actual_hours && l.actual_hours > 0 && l.ot_hours_actual && l.ot_hours_actual > 0
            ? Math.round((l.carton / l.actual_hours) * (l.actual_hours + l.ot_hours_actual))
            : l.carton;
          return sum + effectiveCarton;
        }, 0),
      };

      setLogs(formattedLogs);
      setStats(totalStats);
    } catch (error) {
      console.error('Error fetching finishing data:', error);
    } finally {
      setLoading(false);
    }
  }

  const formatTime = (dateString: string) => {
    // Use factory timezone for display
    const timezone = factory?.timezone || "Asia/Dhaka";
    return formatTimeInTimezone(dateString, timezone);
  };

  const filteredLogs = logs.filter(log => 
    activeTab === "targets" ? log.log_type === "TARGET" : log.log_type === "OUTPUT"
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "targets" | "outputs")}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="targets" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Daily Targets
          </TabsTrigger>
          <TabsTrigger value="outputs" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Daily Outputs
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6 space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <ClipboardList className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Today's Submissions</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-3xl font-bold">{stats.totalTargets}</p>
                    <p className="text-sm text-muted-foreground">Targets Set</p>
                  </div>
                  <div>
                    <p className="text-3xl font-bold">{stats.totalOutputs}</p>
                    <p className="text-sm text-muted-foreground">Outputs Logged</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                    <Package className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Today's Output</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-3xl font-bold text-success">{stats.totalPoly.toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground">Poly Packed</p>
                  </div>
                  <div>
                    <p className="text-xl font-semibold text-muted-foreground">{stats.totalCarton.toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground">Cartons Packed</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Today's Logs */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Today's {activeTab === "targets" ? "Targets" : "Outputs"}
              </CardTitle>
              <div className="flex gap-2">
                <Link to={activeTab === "targets" ? "/finishing/daily-target" : "/finishing/daily-output"}>
                  <Button variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    New {activeTab === "targets" ? "Target" : "Output"}
                  </Button>
                </Link>
                <Link to="/finishing/my-submissions">
                  <Button variant="ghost" size="sm">
                    View All
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {filteredLogs.length > 0 ? (
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {filteredLogs.map((log) => (
                    <div
                      key={log.id}
                      onClick={() => {
                        setSelectedLog(log);
                        setDetailModalOpen(true);
                      }}
                      className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          {activeTab === "targets" ? (
                            <Target className="h-6 w-6 text-primary" />
                          ) : (
                            <Package className="h-6 w-6 text-primary" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{log.po_number || 'No PO'}</span>
                            <Badge variant={activeTab === "targets" ? "secondary" : "default"} className="text-xs">
                              {activeTab === "targets" ? "Target" : "Output"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {log.buyer || 'No Buyer'} • {log.style || 'No Style'}
                          </p>
                          <span className="text-xs text-muted-foreground">
                            Submitted {formatTime(log.submitted_at)}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex gap-4">
                          <div>
                            <p className="font-mono font-bold text-lg text-success">
                              {(log.actual_hours && log.actual_hours > 0 && log.ot_hours_actual && log.ot_hours_actual > 0
                                ? Math.round((log.poly / log.actual_hours) * (log.actual_hours + log.ot_hours_actual))
                                : log.poly
                              ).toLocaleString()}
                            </p>
                            <p className="text-xs text-muted-foreground">poly</p>
                          </div>
                          {log.carton > 0 && (
                          <div>
                            <p className="font-mono font-semibold text-base text-muted-foreground">
                              {(log.actual_hours && log.actual_hours > 0 && log.ot_hours_actual && log.ot_hours_actual > 0
                                ? Math.round((log.carton / log.actual_hours) * (log.actual_hours + log.ot_hours_actual))
                                : log.carton
                              ).toLocaleString()}
                            </p>
                            <p className="text-xs text-muted-foreground">carton</p>
                          </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Package className="h-16 w-16 mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-medium">No {activeTab === "targets" ? "targets" : "outputs"} today</p>
                  <p className="text-sm mb-4">Start tracking finishing {activeTab === "targets" ? "targets" : "production"}</p>
                  <Link to={activeTab === "targets" ? "/finishing/daily-target" : "/finishing/daily-output"}>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Create {activeTab === "targets" ? "Target" : "Output"}
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {(() => {
        if (!selectedLog) return null;

        const counterpart = logs.find(l =>
          l.log_type !== selectedLog.log_type &&
          l.production_date === selectedLog.production_date &&
          l.work_order_id === selectedLog.work_order_id
        ) ?? null;

        const targetLog = selectedLog.log_type === "TARGET" ? selectedLog : counterpart;
        const actualLog = selectedLog.log_type === "OUTPUT" ? selectedLog : counterpart;

        const target: FinishingTargetData | null = targetLog ? {
          id: targetLog.id,
          production_date: targetLog.production_date,
          submitted_at: targetLog.submitted_at,
          po_number: targetLog.po_number ?? null,
          buyer: targetLog.buyer ?? null,
          style: targetLog.style ?? null,
          thread_cutting: targetLog.thread_cutting,
          inside_check: targetLog.inside_check,
          top_side_check: targetLog.top_side_check,
          buttoning: targetLog.buttoning,
          iron: targetLog.iron,
          get_up: targetLog.get_up,
          poly: targetLog.poly,
          carton: targetLog.carton,
          m_power_planned: targetLog.m_power_planned ?? null,
          planned_hours: targetLog.planned_hours ?? null,
          ot_hours_planned: targetLog.ot_hours_planned ?? null,
          ot_manpower_planned: targetLog.ot_manpower_planned ?? null,
          remarks: targetLog.remarks ?? null,
        } : null;

        const actual: FinishingActualData | null = actualLog ? {
          id: actualLog.id,
          production_date: actualLog.production_date,
          submitted_at: actualLog.submitted_at,
          po_number: actualLog.po_number ?? null,
          buyer: actualLog.buyer ?? null,
          style: actualLog.style ?? null,
          thread_cutting: actualLog.thread_cutting,
          inside_check: actualLog.inside_check,
          top_side_check: actualLog.top_side_check,
          buttoning: actualLog.buttoning,
          iron: actualLog.iron,
          get_up: actualLog.get_up,
          poly: actualLog.poly,
          carton: actualLog.carton,
          m_power_actual: actualLog.m_power_actual ?? null,
          actual_hours: actualLog.actual_hours ?? null,
          ot_hours_actual: actualLog.ot_hours_actual ?? null,
          ot_manpower_actual: actualLog.ot_manpower_actual ?? null,
          remarks: actualLog.remarks ?? null,
        } : null;

        return (
          <FinishingSubmissionView
            target={target}
            actual={actual}
            open={detailModalOpen}
            onOpenChange={setDetailModalOpen}
          />
        );
      })()}
    </div>
  );
}
