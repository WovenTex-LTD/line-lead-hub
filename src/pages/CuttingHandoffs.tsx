import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useMidnightRefresh } from "@/hooks/useMidnightRefresh";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Scissors, Check, RefreshCw, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, subDays } from "date-fns";
import { getTodayInTimezone, getCurrentTimeInTimezone } from "@/lib/date-utils";
import { useTranslation } from "react-i18next";

interface CuttingHandoff {
  id: string;
  production_date: string;
  submitted_at: string | null;
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
  transfer_to_line_id: string | null;
  acknowledged: boolean | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  transfer_line: {
    line_id: string;
    name: string | null;
  } | null;
  source_line: {
    line_id: string;
    name: string | null;
  } | null;
}

type DateFilter = "today" | "7days" | "30days" | "all";

export default function CuttingHandoffs() {
  const { user, profile, factory, isAdminOrHigher } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [handoffs, setHandoffs] = useState<CuttingHandoff[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilter>("today");
  const [selectedHandoff, setSelectedHandoff] = useState<CuttingHandoff | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);
  const [userLineIds, setUserLineIds] = useState<string[]>([]);

  useEffect(() => {
    if (profile?.factory_id && user?.id) {
      fetchUserLineAssignments();
    }
  }, [profile?.factory_id, user?.id]);

  useEffect(() => {
    if (profile?.factory_id && (isAdminOrHigher() || userLineIds.length > 0)) {
      fetchHandoffs();
    }
  }, [profile?.factory_id, dateFilter, userLineIds, isAdminOrHigher]);

  // Auto-refresh at midnight (factory timezone) and on tab refocus
  useMidnightRefresh(useCallback(() => {
    if (profile?.factory_id) {
      fetchHandoffs();
    }
  }, [profile?.factory_id, dateFilter, userLineIds]));

  async function fetchUserLineAssignments() {
    if (!user?.id || !profile?.factory_id) return;

    try {
      const { data, error } = await supabase
        .from("user_line_assignments")
        .select("line_id")
        .eq("user_id", user.id)
        .eq("factory_id", profile.factory_id);

      if (error) throw error;
      const lineIds = (data || []).map(a => a.line_id);
      setUserLineIds(lineIds);
      // Only stop loading here if user has no line assignments and is not admin
      // (fetchHandoffs won't be called, so we need to stop loading ourselves)
      if (!isAdminOrHigher() && lineIds.length === 0) {
        setLoading(false);
      }
      // Otherwise, loading stays true until fetchHandoffs completes
    } catch (error) {
      console.error("Error fetching user line assignments:", error);
      setLoading(false);
    }
  }

  async function fetchHandoffs() {
    if (!profile?.factory_id) return;
    setLoading(true);

    try {
      const tz = factory?.timezone || "Asia/Dhaka";
      let dateFrom = getTodayInTimezone(tz);

      if (dateFilter === "7days") {
        dateFrom = format(subDays(getCurrentTimeInTimezone(tz), 7), "yyyy-MM-dd");
      } else if (dateFilter === "30days") {
        dateFrom = format(subDays(getCurrentTimeInTimezone(tz), 30), "yyyy-MM-dd");
      } else if (dateFilter === "all") {
        dateFrom = "2000-01-01";
      }

      let query = supabase
        .from("cutting_actuals")
        .select(`
          id,
          production_date,
          submitted_at,
          buyer,
          style,
          po_no,
          colour,
          order_qty,
          day_cutting,
          day_input,
          total_cutting,
          total_input,
          balance,
          transfer_to_line_id,
          acknowledged,
          acknowledged_by,
          acknowledged_at,
          transfer_line:lines!cutting_actuals_transfer_to_line_id_fkey(line_id, name),
          source_line:lines!cutting_actuals_line_id_fkey(line_id, name)
        `)
        .eq("factory_id", profile.factory_id)
        .not("transfer_to_line_id", "is", null)
        .gte("production_date", dateFrom)
        .order("production_date", { ascending: false })
        .order("submitted_at", { ascending: false });

      // For non-admin users, filter by their assigned lines
      if (!isAdminOrHigher() && userLineIds.length > 0) {
        query = query.in("transfer_to_line_id", userLineIds);
      }

      const { data, error } = await query;

      if (error) throw error;
      setHandoffs((data as unknown as CuttingHandoff[]) || []);
    } catch (error) {
      console.error("Error fetching cutting handoffs:", error);
      toast.error(t('cutting.failedToLoadSubmission'));
    } finally {
      setLoading(false);
    }
  }

  async function acknowledgeHandoff(handoff: CuttingHandoff) {
    if (!user?.id) return;
    setAcknowledging(true);

    try {
      const { error } = await supabase
        .from("cutting_actuals")
        .update({
          acknowledged: true,
          acknowledged_by: user.id,
          acknowledged_at: new Date().toISOString(),
        })
        .eq("id", handoff.id);

      if (error) throw error;

      toast.success(t('cutting.handoffAcknowledged'));
      setSelectedHandoff(null);
      fetchHandoffs();
    } catch (error) {
      console.error("Error acknowledging handoff:", error);
      toast.error(t('cutting.acknowledgeFailed'));
    } finally {
      setAcknowledging(false);
    }
  }

  const stats = useMemo(() => {
    const today = getTodayInTimezone(factory?.timezone || "Asia/Dhaka");
    const todayHandoffs = handoffs.filter(h => h.production_date === today);
    const unacknowledged = handoffs.filter(h => !h.acknowledged);
    const totalCutting = todayHandoffs.reduce((sum, h) => sum + (h.day_cutting || 0), 0);
    const totalInput = todayHandoffs.reduce((sum, h) => sum + (h.day_input || 0), 0);

    return {
      todayCount: todayHandoffs.length,
      unacknowledgedCount: unacknowledged.length,
      totalCutting,
      totalInput,
    };
  }, [handoffs]);

  if (loading && handoffs.length === 0) {
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

  if (!isAdminOrHigher() && userLineIds.length === 0) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-4">
        <div className="text-center">
          <Scissors className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">{t('cutting.noLinesAssigned')}</h2>
          <p className="text-muted-foreground">
            {t('cutting.noLinesAssignedDesc')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <Scissors className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">{t('cutting.cuttingHandoffs')}</h1>
            <p className="text-sm text-muted-foreground">{t('cutting.cutBundlesTransferred')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Date Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">{t('sewingMySubmissions.today')}</SelectItem>
              <SelectItem value="7days">{t('cutting.last7Days')}</SelectItem>
              <SelectItem value="30days">{t('cutting.last30Days')}</SelectItem>
              {isAdminOrHigher() && <SelectItem value="all">{t('cutting.allTime')}</SelectItem>}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={fetchHandoffs}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="relative overflow-hidden rounded-xl border border-emerald-200/60 dark:border-emerald-800/40 bg-gradient-to-br from-emerald-50 via-white to-green-50/50 dark:from-emerald-950/40 dark:via-card dark:to-green-950/20 p-4 transition-all duration-300 hover:shadow-lg">
          <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-emerald-600/70 dark:text-emerald-400/70">{t('cutting.todaysHandoffs')}</p>
          <p className="font-mono text-2xl font-bold tracking-tight text-emerald-900 dark:text-emerald-100 mt-1">{stats.todayCount}</p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-amber-200/60 dark:border-amber-800/40 bg-gradient-to-br from-amber-50 via-white to-orange-50/50 dark:from-amber-950/40 dark:via-card dark:to-orange-950/20 p-4 transition-all duration-300 hover:shadow-lg">
          <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-amber-600/70 dark:text-amber-400/70">{t('cutting.unacknowledged')}</p>
          <p className="font-mono text-2xl font-bold tracking-tight text-amber-900 dark:text-amber-100 mt-1">{stats.unacknowledgedCount}</p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-blue-200/60 dark:border-blue-800/40 bg-gradient-to-br from-blue-50 via-white to-blue-50/50 dark:from-blue-950/40 dark:via-card dark:to-blue-950/20 p-4 transition-all duration-300 hover:shadow-lg">
          <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-blue-600/70 dark:text-blue-400/70">{t('cuttingHandoffsPage.cuttingToday')}</p>
          <p className="font-mono text-2xl font-bold tracking-tight text-blue-900 dark:text-blue-100 mt-1">{stats.totalCutting.toLocaleString()}</p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-slate-200/60 dark:border-slate-800/40 bg-gradient-to-br from-slate-50 via-white to-slate-50/50 dark:from-slate-950/40 dark:via-card dark:to-slate-950/20 p-4 transition-all duration-300 hover:shadow-lg">
          <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-slate-600/70 dark:text-slate-400/70">{t('cuttingHandoffsPage.inputToday')}</p>
          <p className="font-mono text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 mt-1">{stats.totalInput.toLocaleString()}</p>
        </div>
      </div>

      {/* Table */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 shadow-md shadow-emerald-500/20 flex items-center justify-center">
              <Scissors className="h-3.5 w-3.5 text-white" />
            </div>
            {t('cuttingHandoffsPage.cuttingHandoffs')}
            <Badge variant="secondary" className="ml-1">{handoffs.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {handoffs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Scissors className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>{t('cutting.noHandoffsFound')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>{t('cutting.date')}</TableHead>
                    <TableHead>{t('cutting.po')} / {t('cutting.style')}</TableHead>
                    <TableHead>{t('cutting.colour')}</TableHead>
                    <TableHead className="text-right">{t('cutting.dayCutting')}</TableHead>
                    <TableHead className="text-right">{t('cutting.dayInput')}</TableHead>
                    <TableHead>{t('cutting.toLine')}</TableHead>
                    <TableHead>{t('cutting.status')}</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {handoffs.map((handoff) => (
                    <TableRow
                      key={handoff.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedHandoff(handoff)}
                    >
                      <TableCell>
                        <p className="font-mono text-sm">{format(new Date(handoff.production_date), "dd MMM")}</p>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-sm">{handoff.po_no || "-"}</p>
                        <p className="text-xs text-muted-foreground">{handoff.style || "-"}</p>
                      </TableCell>
                      <TableCell className="text-sm">{handoff.colour || "-"}</TableCell>
                      <TableCell className="text-right font-mono font-bold text-sm">
                        {handoff.day_cutting?.toLocaleString() || 0}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {handoff.day_input?.toLocaleString() || 0}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {handoff.transfer_line?.name || handoff.transfer_line?.line_id || "-"}
                      </TableCell>
                      <TableCell>
                        {handoff.acknowledged ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                            {t('cutting.received')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                            {t('cutting.pending')}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Dialog open={!!selectedHandoff} onOpenChange={() => setSelectedHandoff(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('cuttingHandoffsPage.handoffDetails')}</DialogTitle>
            <DialogDescription>
              {selectedHandoff?.po_no} - {selectedHandoff?.buyer}
            </DialogDescription>
          </DialogHeader>
          
          {selectedHandoff && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">{t('cutting.date')}</p>
                  <p className="font-medium">
                    {format(new Date(selectedHandoff.production_date), "dd MMM yyyy")}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('cutting.po')}</p>
                  <p className="font-medium">{selectedHandoff.po_no || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('cutting.buyer')}</p>
                  <p className="font-medium">{selectedHandoff.buyer || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('cutting.style')}</p>
                  <p className="font-medium">{selectedHandoff.style || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('cutting.colour')}</p>
                  <p className="font-medium">{selectedHandoff.colour || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('cutting.orderQtyLabel')}</p>
                  <p className="font-medium">{selectedHandoff.order_qty?.toLocaleString() || "-"}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">{t('cuttingHandoffsPage.productionData')}</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">{t('cutting.dayCutting')}</p>
                    <p className="text-xl font-bold">{selectedHandoff.day_cutting?.toLocaleString() || 0}</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">{t('cutting.dayInput')}</p>
                    <p className="text-xl font-bold">{selectedHandoff.day_input?.toLocaleString() || 0}</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">{t('cutting.totalCutting')}</p>
                    <p className="text-lg font-bold">{selectedHandoff.total_cutting?.toLocaleString() || 0}</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">{t('cutting.totalInput')}</p>
                    <p className="text-lg font-bold">{selectedHandoff.total_input?.toLocaleString() || 0}</p>
                  </div>
                </div>
                <div className={`mt-3 p-3 rounded-lg text-center ${(selectedHandoff.balance ?? 0) < 0 ? 'bg-destructive/10' : 'bg-primary/10'}`}>
                  <p className="text-xs text-muted-foreground">{t('cutting.balance')}</p>
                  <p className={`text-xl font-bold ${(selectedHandoff.balance ?? 0) < 0 ? 'text-destructive' : ''}`}>
                    {selectedHandoff.balance?.toLocaleString() || 0}
                  </p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">{t('cuttingHandoffsPage.transferInfo')}</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">{t('cuttingHandoffsPage.from')}</p>
                    <p className="font-medium">{t('cutting.cuttingHandoffs').split(' ')[0]}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('cuttingHandoffsPage.to')}</p>
                    <p className="font-medium">
                      {selectedHandoff.transfer_line?.name || selectedHandoff.transfer_line?.line_id || "-"}
                    </p>
                  </div>
                  {selectedHandoff.submitted_at && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground">{t('cutting.submitted')}</p>
                      <p className="font-medium">
                        {format(new Date(selectedHandoff.submitted_at), "dd MMM yyyy, hh:mm a")}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Acknowledgement Section */}
              <div className="border-t pt-4">
                {selectedHandoff.acknowledged ? (
                  <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                    <Check className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="font-medium text-green-800">{t('cutting.received')}</p>
                      {selectedHandoff.acknowledged_at && (
                        <p className="text-xs text-green-600">
                          {t('cuttingHandoffsPage.acknowledgedOn')} {format(new Date(selectedHandoff.acknowledged_at), "dd MMM yyyy, hh:mm a")}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <Button 
                    className="w-full"
                    onClick={() => acknowledgeHandoff(selectedHandoff)}
                    disabled={acknowledging}
                  >
                    {acknowledging ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('cuttingHandoffsPage.acknowledging')}
                      </>
                    ) : (
                      <>
                        <Check className="mr-2 h-4 w-4" />
                        {t('cutting.acknowledgeReceived')}
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
