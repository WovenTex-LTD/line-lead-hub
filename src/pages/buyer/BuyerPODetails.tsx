import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useBuyerPODetails } from "@/hooks/useBuyerPODetails";
import { computeHealth, healthColors, type HealthStatus } from "@/lib/buyer-health";
import { computeBuyerAlerts, sortAlerts } from "@/lib/buyer-alerts";
import { formatTimeInTimezone, formatShortDate } from "@/lib/date-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/ui/animated-number";
import {
  Loader2,
  ArrowLeft,
  Clock,
  Download,
  AlertTriangle,
  Package,
  Scissors,
  TrendingUp,
  PackageCheck,
  Warehouse,
} from "lucide-react";
import { motion } from "framer-motion";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const healthAccent: Record<HealthStatus, string> = {
  healthy: "from-emerald-400 to-emerald-500",
  watch: "from-amber-400 to-amber-500",
  at_risk: "from-red-400 to-red-500",
  no_deadline: "from-slate-300 to-slate-400",
  completed: "from-blue-400 to-blue-500",
};

const DEPT_COLORS: Record<string, string> = {
  sewing: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  cutting: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
  finishing: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 border-violet-200 dark:border-violet-800",
  storage: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800",
};

const DEPT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  sewing: TrendingUp,
  cutting: Scissors,
  finishing: PackageCheck,
  storage: Warehouse,
};

const DEPT_DOT_COLOR: Record<string, string> = {
  sewing: "bg-blue-500",
  cutting: "bg-emerald-500",
  finishing: "bg-violet-500",
  storage: "bg-orange-500",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "border-red-200 bg-red-50/80 dark:border-red-800/50 dark:bg-red-950/20",
  warning: "border-amber-200 bg-amber-50/80 dark:border-amber-800/50 dark:bg-amber-950/20",
  info: "border-blue-200 bg-blue-50/80 dark:border-blue-800/50 dark:bg-blue-950/20",
};

const SEVERITY_ICON_COLOR: Record<string, string> = {
  critical: "text-red-500",
  warning: "text-amber-500",
  info: "text-blue-500",
};

const STAGE_CARD_STYLES = [
  { icon: Warehouse, label: "Storage", bg: "bg-orange-50/80 dark:bg-orange-950/20", border: "border-orange-100 dark:border-orange-900/30", iconColor: "text-orange-600 dark:text-orange-400", labelColor: "text-orange-600 dark:text-orange-400" },
  { icon: Scissors, label: "Cutting", bg: "bg-emerald-50/80 dark:bg-emerald-950/20", border: "border-emerald-100 dark:border-emerald-900/30", iconColor: "text-emerald-600 dark:text-emerald-400", labelColor: "text-emerald-600 dark:text-emerald-400" },
  { icon: TrendingUp, label: "Sewing", bg: "bg-blue-50/80 dark:bg-blue-950/20", border: "border-blue-100 dark:border-blue-900/30", iconColor: "text-blue-600 dark:text-blue-400", labelColor: "text-blue-600 dark:text-blue-400" },
  { icon: PackageCheck, label: "Finishing", bg: "bg-violet-50/80 dark:bg-violet-950/20", border: "border-violet-100 dark:border-violet-900/30", iconColor: "text-violet-600 dark:text-violet-400", labelColor: "text-violet-600 dark:text-violet-400" },
];

export default function BuyerPODetails() {
  const { poId } = useParams<{ poId: string }>();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<"7" | "14" | "30">("14");

  const {
    workOrder,
    aggregates,
    trendData,
    todayTimeline,
    stageData,
    sewingHistory,
    loading,
    error,
    isAuthorized,
    timezone,
    todayStr,
  } = useBuyerPODetails(poId);

  const filteredTrend = useMemo(() => {
    const days = parseInt(period);
    return trendData.slice(-days);
  }, [trendData, period]);

  const alerts = useMemo(() => {
    if (!workOrder) return [];
    return sortAlerts(computeBuyerAlerts(workOrder, aggregates, sewingHistory));
  }, [workOrder, aggregates, sewingHistory]);

  const handleExport = () => {
    if (!workOrder) return;
    let csv = `PO Report: ${workOrder.po_number}\n`;
    csv += `Style,${workOrder.style}\n`;
    csv += `Color,${workOrder.color || ""}\n`;
    csv += `Order Qty,${workOrder.order_qty}\n`;
    csv += `Ex-Factory,${workOrder.planned_ex_factory || ""}\n`;
    csv += `Cumulative Sewed,${aggregates.cumulativeGood}\n`;
    csv += `Total Packed,${aggregates.finishingCarton}\n\n`;

    csv += `Date,Sewing Output,Finishing Output\n`;
    for (const d of trendData) {
      csv += `${d.date},${d.sewingOutput},${d.finishingOutput}\n`;
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `po-report-${workOrder.po_number}-${todayStr}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (loading) {
    return (
      <div className="py-4 lg:py-6 flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !isAuthorized || !workOrder) {
    return (
      <div className="py-4 lg:py-6 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/buyer/dashboard")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Overview
        </Button>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Package className="h-8 w-8 text-muted-foreground/60" />
            </div>
            <h3 className="text-lg font-medium mb-2">PO Not Found</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              {error || "This purchase order doesn't exist or you don't have access to it."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const health = computeHealth(workOrder, aggregates);
  const producedPct = workOrder.order_qty > 0 ? Math.min(100, Math.round((aggregates.cumulativeGood / workOrder.order_qty) * 100)) : 0;
  const packedPct = workOrder.order_qty > 0 ? Math.min(100, Math.round((aggregates.finishingPoly / workOrder.order_qty) * 100)) : 0;
  const accent = healthAccent[health.status] || healthAccent.no_deadline;

  const stageCards = [
    { ...STAGE_CARD_STYLES[0], value: stageData.storage.todayReceived, prefix: "+", sub: `Balance: ${stageData.storage.balance.toLocaleString()}`, lastUpdate: stageData.storage.lastUpdate },
    { ...STAGE_CARD_STYLES[1], value: stageData.cutting.todayCut, sub: `Total: ${stageData.cutting.totalCut.toLocaleString()}`, lastUpdate: stageData.cutting.lastUpdate },
    { ...STAGE_CARD_STYLES[2], value: stageData.sewing.todayOutput, sub: `Cumulative: ${stageData.sewing.cumulative.toLocaleString()}`, lastUpdate: stageData.sewing.lastUpdate },
    { ...STAGE_CARD_STYLES[3], value: stageData.finishing.todayPoly, sub: `Total: ${stageData.finishing.totalPoly.toLocaleString()}`, lastUpdate: stageData.finishing.lastUpdate },
  ];

  return (
    <motion.div
      className="py-4 lg:py-6 space-y-6"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      {/* Back button */}
      <motion.div variants={fadeUp}>
        <Button variant="ghost" size="sm" onClick={() => navigate("/buyer/dashboard")} className="gap-2 -ml-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Overview
        </Button>
      </motion.div>

      {/* Header card */}
      <motion.div variants={fadeUp}>
        <div className="relative overflow-hidden rounded-2xl border bg-card">
          <div className={`h-1.5 bg-gradient-to-r ${accent}`} />
          <div className="p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{workOrder.po_number}</h1>
                  <Badge variant="outline" className={`text-xs ${healthColors[health.status]}`}>{health.label}</Badge>
                  {workOrder.status && <Badge variant="secondary" className="text-xs">{workOrder.status.replace("_", " ")}</Badge>}
                </div>
                <p className="text-sm text-muted-foreground mt-1.5">
                  {workOrder.style}
                  {workOrder.color && ` \u2014 ${workOrder.color}`}
                  {workOrder.item && ` \u2014 ${workOrder.item}`}
                </p>
              </div>
              <div className="text-right text-sm flex flex-col gap-1.5 items-end">
                <div className="font-semibold text-base">Order: {workOrder.order_qty.toLocaleString()} pcs</div>
                {workOrder.planned_ex_factory && (
                  <div className="text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    Ex-factory: {formatShortDate(workOrder.planned_ex_factory)}
                  </div>
                )}
                <Button variant="outline" size="sm" onClick={handleExport} className="gap-2 mt-1">
                  <Download className="h-3.5 w-3.5" /> Export CSV
                </Button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Progress Bars */}
      <motion.div className="grid grid-cols-1 md:grid-cols-2 gap-4" variants={fadeUp}>
        <div className="rounded-xl border bg-blue-50/50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/30 p-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-semibold flex items-center gap-1.5 text-blue-700 dark:text-blue-400">
              <TrendingUp className="h-4 w-4" /> Sewn
            </span>
            <span className="text-muted-foreground tabular-nums">
              {aggregates.cumulativeGood.toLocaleString()} / {workOrder.order_qty.toLocaleString()} ({producedPct}%)
            </span>
          </div>
          <Progress value={producedPct} className="h-3" />
        </div>
        <div className="rounded-xl border bg-violet-50/50 dark:bg-violet-950/20 border-violet-100 dark:border-violet-900/30 p-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-semibold flex items-center gap-1.5 text-violet-700 dark:text-violet-400">
              <PackageCheck className="h-4 w-4" /> Packed
            </span>
            <span className="text-muted-foreground tabular-nums">
              {aggregates.finishingCarton.toLocaleString()} / {workOrder.order_qty.toLocaleString()} ({packedPct}%)
            </span>
          </div>
          <Progress value={packedPct} className="h-3 [&>div]:from-violet-500 [&>div]:to-violet-400" />
        </div>
      </motion.div>

      {/* Stage Cards */}
      <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-3" variants={fadeUp}>
        {stageCards.map((stage) => {
          const Icon = stage.icon;
          return (
            <div key={stage.label} className={`rounded-xl border ${stage.bg} ${stage.border} p-4 transition-all duration-300 hover:shadow-md`}>
              <div className={`flex items-center gap-1.5 text-xs font-medium mb-2.5 ${stage.labelColor}`}>
                <Icon className="h-3.5 w-3.5" /> {stage.label}
              </div>
              <div className="text-xl font-bold tabular-nums">
                {stage.value > 0 ? (
                  <>{"prefix" in stage ? (stage as any).prefix : ""}<AnimatedNumber value={stage.value} /></>
                ) : "\u2014"}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{stage.sub}</div>
              {stage.lastUpdate && (
                <div className="text-[10px] text-muted-foreground/60 mt-1.5">{formatTimeInTimezone(stage.lastUpdate, timezone)}</div>
              )}
            </div>
          );
        })}
      </motion.div>

      {/* Risks & Flags */}
      {alerts.length > 0 && (
        <motion.div className="space-y-3" variants={fadeUp}>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Risks & Flags</h2>
          {alerts.map((alert, i) => (
            <div key={i} className={`flex items-start gap-3 rounded-xl border p-4 ${SEVERITY_COLORS[alert.severity]}`}>
              <div className={`rounded-full p-1.5 ${alert.severity === "critical" ? "bg-red-100 dark:bg-red-900/40" : alert.severity === "warning" ? "bg-amber-100 dark:bg-amber-900/40" : "bg-blue-100 dark:bg-blue-900/40"}`}>
                <AlertTriangle className={`h-4 w-4 ${SEVERITY_ICON_COLOR[alert.severity]}`} />
              </div>
              <div>
                <div className="text-sm font-semibold">{alert.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{alert.message}</div>
              </div>
            </div>
          ))}
        </motion.div>
      )}

      {/* Trend Chart — unchanged */}
      <motion.div variants={fadeUp}>
      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Production Trend</CardTitle>
            <div className="flex gap-1">
              {(["7", "14", "30"] as const).map((p) => (
                <Button key={p} variant={period === p ? "default" : "outline"} size="sm" className="h-7 text-xs px-2.5" onClick={() => setPeriod(p)}>
                  {p}d
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-2 sm:p-6">
          {filteredTrend.length > 0 ? (
            <div className="w-full overflow-hidden">
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={filteredTrend}>
                  <defs>
                    <linearGradient id="colorSewing" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorFinishing" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="displayDate" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                  <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} width={40} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  <Legend wrapperStyle={{ paddingTop: "8px" }} />
                  <Area type="monotone" dataKey="sewingOutput" name="Sewing" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorSewing)" strokeWidth={2} />
                  <Area type="monotone" dataKey="finishingOutput" name="Finishing" stroke="#10b981" fillOpacity={1} fill="url(#colorFinishing)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-muted-foreground">No data available for this period</div>
          )}
        </CardContent>
      </Card>
      </motion.div>

      {/* Today Timeline */}
      <motion.div variants={fadeUp}>
      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Today's Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {todayTimeline.length === 0 ? (
            <div className="py-10 text-center">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                <Clock className="h-6 w-6 text-muted-foreground/60" />
              </div>
              <p className="text-sm text-muted-foreground">No submissions today</p>
            </div>
          ) : (
            <div className="space-y-0">
              {todayTimeline.map((entry, i) => {
                const Icon = DEPT_ICONS[entry.department];
                const dotColor = DEPT_DOT_COLOR[entry.department] || "bg-gray-400";
                return (
                  <div key={i} className="flex items-start gap-3 py-2">
                    <div className="flex flex-col items-center mt-1.5">
                      <div className={`h-2.5 w-2.5 rounded-full ${dotColor} ring-2 ring-background`} />
                      {i < todayTimeline.length - 1 && <div className="w-px flex-1 bg-border mt-1 min-h-[20px]" />}
                    </div>
                    <div className="min-w-0 flex-1 pb-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${DEPT_COLORS[entry.department]}`}
                        >
                          {Icon && <Icon className="h-2.5 w-2.5 mr-1" />}
                          {entry.department}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {entry.time ? formatTimeInTimezone(entry.time, timezone) : "\u2014"}
                        </span>
                      </div>
                      <div className="text-sm">{entry.label}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      </motion.div>
    </motion.div>
  );
}
