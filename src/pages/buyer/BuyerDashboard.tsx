import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getTodayInTimezone, getCurrentTimeInTimezone } from "@/lib/date-utils";
import { format } from "date-fns";
import { useBuyerPOAccess } from "@/hooks/useBuyerPOAccess";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { CompactPOCard } from "@/components/buyer/CompactPOCard";
import { Card, CardContent } from "@/components/ui/card";
import { Package, TrendingUp, Archive, CirclePercent, Boxes } from "lucide-react";
import { StatsCardsSkeleton } from "@/components/ui/table-skeleton";
import { POAggregates, computeHealth, EMPTY_AGGREGATES } from "@/lib/buyer-health";
import { motion } from "framer-motion";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

interface DashboardMeta {
  lastSubmittedMap: Map<string, string>;
  dailySewingMap: Map<string, number[]>;
  dailyFinishingMap: Map<string, number[]>;
  todayAgg: Map<string, { sewing: number; finishing: number }>;
  yesterdayAgg: Map<string, { sewing: number; finishing: number }>;
}

const EMPTY_META: DashboardMeta = {
  lastSubmittedMap: new Map(),
  dailySewingMap: new Map(),
  dailyFinishingMap: new Map(),
  todayAgg: new Map(),
  yesterdayAgg: new Map(),
};

export default function BuyerDashboard() {
  const navigate = useNavigate();
  const { factory } = useAuth();
  const { workOrderIds, workOrders, loading: accessLoading } = useBuyerPOAccess();
  const [aggregates, setAggregates] = useState<Map<string, POAggregates>>(new Map());
  const [meta, setMeta] = useState<DashboardMeta>(EMPTY_META);
  const [dataLoading, setDataLoading] = useState(true);

  const timezone = factory?.timezone || "Asia/Dhaka";

  useEffect(() => {
    if (accessLoading || workOrderIds.length === 0) {
      setDataLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchAggregates() {
      setDataLoading(true);

      const today = getTodayInTimezone(timezone);
      const yesterdayDate = getCurrentTimeInTimezone(timezone);
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterday = format(yesterdayDate, "yyyy-MM-dd");

      const [sewingRes, finishingRes, cuttingRes] = await Promise.all([
        supabase
          .from("sewing_actuals")
          .select("work_order_id, good_today, reject_today, rework_today, cumulative_good_total, production_date, submitted_at")
          .in("work_order_id", workOrderIds),
        supabase
          .from("finishing_actuals")
          .select("work_order_id, day_carton, day_poly, day_qc_pass, total_carton, total_poly, total_qc_pass, production_date, submitted_at")
          .in("work_order_id", workOrderIds),
        supabase
          .from("cutting_actuals")
          .select("work_order_id, day_cutting, day_input, production_date, submitted_at")
          .in("work_order_id", workOrderIds),
      ]);

      if (cancelled) return;

      const aggMap = new Map<string, POAggregates>();
      const submitMap = new Map<string, string>();
      const sewDailyRaw = new Map<string, Map<string, number>>();
      const finDailyRaw = new Map<string, Map<string, number>>();
      const todayAgg = new Map<string, { sewing: number; finishing: number }>();
      const yesterdayAgg = new Map<string, { sewing: number; finishing: number }>();

      // Initialize
      for (const woId of workOrderIds) {
        aggMap.set(woId, { ...EMPTY_AGGREGATES });
        todayAgg.set(woId, { sewing: 0, finishing: 0 });
        yesterdayAgg.set(woId, { sewing: 0, finishing: 0 });
      }

      // Aggregate sewing
      for (const row of sewingRes.data || []) {
        const agg = aggMap.get(row.work_order_id);
        if (!agg) continue;
        agg.sewingOutput += row.good_today || 0;
        agg.rejectTotal += row.reject_today || 0;
        agg.reworkTotal += row.rework_today || 0;
        if ((row.cumulative_good_total || 0) > agg.cumulativeGood) {
          agg.cumulativeGood = row.cumulative_good_total || 0;
        }
        if (row.production_date === today) {
          agg.hasEodToday = true;
          const t = todayAgg.get(row.work_order_id);
          if (t) t.sewing += row.good_today || 0;
        }
        if (row.production_date === yesterday) {
          const y = yesterdayAgg.get(row.work_order_id);
          if (y) y.sewing += row.good_today || 0;
        }
        // Track last submitted
        if (row.submitted_at) {
          const prev = submitMap.get(row.work_order_id);
          if (!prev || row.submitted_at > prev) {
            submitMap.set(row.work_order_id, row.submitted_at);
          }
        }
        // Daily sewing for sparkline
        if (!sewDailyRaw.has(row.work_order_id)) {
          sewDailyRaw.set(row.work_order_id, new Map());
        }
        const dayMap = sewDailyRaw.get(row.work_order_id)!;
        dayMap.set(
          row.production_date,
          (dayMap.get(row.production_date) || 0) + (row.good_today || 0)
        );
      }

      // Aggregate finishing
      for (const row of finishingRes.data || []) {
        const agg = aggMap.get(row.work_order_id);
        if (!agg) continue;
        agg.finishingCarton += row.day_carton || 0;
        agg.finishingPoly += row.day_poly || 0;
        agg.finishingQcPass += row.day_qc_pass || 0;
        if (row.production_date === today) {
          const t = todayAgg.get(row.work_order_id);
          if (t) t.finishing += row.day_poly || 0;
        }
        if (row.production_date === yesterday) {
          const y = yesterdayAgg.get(row.work_order_id);
          if (y) y.finishing += row.day_poly || 0;
        }
        if (row.submitted_at) {
          const prev = submitMap.get(row.work_order_id);
          if (!prev || row.submitted_at > prev) {
            submitMap.set(row.work_order_id, row.submitted_at);
          }
        }
        if (!finDailyRaw.has(row.work_order_id)) {
          finDailyRaw.set(row.work_order_id, new Map());
        }
        const dayMap = finDailyRaw.get(row.work_order_id)!;
        dayMap.set(
          row.production_date,
          (dayMap.get(row.production_date) || 0) + (row.day_poly || 0)
        );
      }

      // Aggregate cutting
      for (const row of cuttingRes.data || []) {
        const agg = aggMap.get(row.work_order_id);
        if (!agg) continue;
        agg.cuttingTotal += row.day_cutting || 0;
        agg.cuttingInput += row.day_input || 0;
        if (row.submitted_at) {
          const prev = submitMap.get(row.work_order_id);
          if (!prev || row.submitted_at > prev) {
            submitMap.set(row.work_order_id, row.submitted_at);
          }
        }
      }

      // Convert daily maps to sorted arrays (last 7 days)
      const dailySewing = new Map<string, number[]>();
      for (const [woId, dayMap] of sewDailyRaw) {
        dailySewing.set(
          woId,
          [...dayMap.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .slice(-7)
            .map(([, v]) => v)
        );
      }
      const dailyFinishing = new Map<string, number[]>();
      for (const [woId, dayMap] of finDailyRaw) {
        dailyFinishing.set(
          woId,
          [...dayMap.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .slice(-7)
            .map(([, v]) => v)
        );
      }

      setAggregates(aggMap);
      setMeta({
        lastSubmittedMap: submitMap,
        dailySewingMap: dailySewing,
        dailyFinishingMap: dailyFinishing,
        todayAgg,
        yesterdayAgg,
      });
      setDataLoading(false);
    }

    fetchAggregates();
    return () => {
      cancelled = true;
    };
  }, [accessLoading, workOrderIds]);

  // Compute KPIs
  const kpis = useMemo(() => {
    let totalQty = 0;
    let totalSewed = 0;
    let weightedCompletionSum = 0;

    for (const wo of workOrders) {
      const qty = wo.order_qty || 0;
      totalQty += qty;
      const agg = aggregates.get(wo.id);
      if (agg) {
        totalSewed += agg.cumulativeGood;
        if (qty > 0) {
          const sewPct = Math.min(100, (agg.cumulativeGood / qty) * 100);
          const finPct = Math.min(100, (agg.finishingCarton / qty) * 100);
          weightedCompletionSum += ((sewPct + finPct) / 2) * qty;
        }
      }
    }

    const completionPct = totalQty > 0 ? Math.round(weightedCompletionSum / totalQty) : 0;

    return {
      totalPOs: workOrders.length,
      totalQty,
      totalSewed,
      completionPct,
    };
  }, [workOrders, aggregates]);

  const loading = accessLoading || dataLoading;

  const heroBanner = (
    <motion.div
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 p-6 md:p-8 text-white"
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDJ2LTJoMzR6TTAgMzR2Mkgydi0ySDB6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-50" />
      <div className="relative z-10">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">PO Overview</h1>
        <p className="text-blue-100 mt-1 text-sm md:text-base">
          Track the production status of your purchase orders
        </p>
      </div>
      <div className="absolute -right-6 -bottom-6 opacity-10">
        <Boxes className="h-40 w-40" />
      </div>
    </motion.div>
  );

  if (loading) {
    return (
      <div className="py-4 lg:py-6 space-y-6">
        {heroBanner}
        <StatsCardsSkeleton count={4} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-64 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (workOrders.length === 0) {
    return (
      <div className="py-4 lg:py-6 space-y-6">
        {heroBanner}
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="h-16 w-16 rounded-full bg-blue-50 flex items-center justify-center mb-4">
              <Package className="h-8 w-8 text-blue-400" />
            </div>
            <h3 className="text-lg font-medium mb-2">No POs Assigned</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              You don't have any purchase orders assigned to your account yet.
              Please contact your factory administrator to get access.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const kpiCards = [
    {
      title: "Active POs",
      value: kpis.totalPOs,
      icon: Package,
      gradient: "from-blue-500 to-blue-600",
      bg: "bg-blue-50 dark:bg-blue-950/30",
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-600 dark:text-blue-400",
    },
    {
      title: "Total Order Qty",
      value: kpis.totalQty,
      icon: Archive,
      gradient: "from-violet-500 to-purple-600",
      bg: "bg-violet-50 dark:bg-violet-950/30",
      iconBg: "bg-violet-500/10",
      iconColor: "text-violet-600 dark:text-violet-400",
    },
    {
      title: "Total Sewn",
      value: kpis.totalSewed,
      icon: TrendingUp,
      gradient: "from-emerald-500 to-green-600",
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-600 dark:text-emerald-400",
    },
    {
      title: "Completion",
      value: kpis.completionPct,
      suffix: "%",
      icon: CirclePercent,
      gradient: "from-amber-500 to-orange-600",
      bg: "bg-amber-50 dark:bg-amber-950/30",
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-600 dark:text-amber-400",
    },
  ];

  return (
    <div className="py-4 lg:py-6 space-y-6">
      {heroBanner}

      {/* KPI Cards */}
      <motion.div
        className="grid gap-4 grid-cols-2 lg:grid-cols-4"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        {kpiCards.map((kpi) => (
          <motion.div key={kpi.title} variants={fadeUp}>
            <div className={`relative overflow-hidden rounded-xl border ${kpi.bg} p-4 md:p-5 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5`}>
              <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${kpi.gradient}`} />
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-[10px] md:text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {kpi.title}
                  </p>
                  <p className="font-mono text-2xl md:text-3xl font-bold tracking-tight">
                    <AnimatedNumber value={kpi.value} />
                    {kpi.suffix && <span>{kpi.suffix}</span>}
                  </p>
                </div>
                <div className={`rounded-xl ${kpi.iconBg} p-2.5`}>
                  <kpi.icon className={`h-5 w-5 ${kpi.iconColor}`} />
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* PO Cards section */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-lg font-semibold">Purchase Orders</h2>
          <span className="text-xs font-medium bg-muted text-muted-foreground rounded-full px-2.5 py-0.5">
            {workOrders.length}
          </span>
        </div>
        <motion.div
          className="grid grid-cols-1 lg:grid-cols-2 gap-4"
          variants={stagger}
          initial="hidden"
          animate="show"
        >
          {workOrders.map((wo) => {
            const agg = aggregates.get(wo.id) || EMPTY_AGGREGATES;
            const health = computeHealth(wo, agg);
            const tAgg = meta.todayAgg.get(wo.id);
            const yAgg = meta.yesterdayAgg.get(wo.id);
            return (
              <motion.div key={wo.id} variants={fadeUp}>
                <CompactPOCard
                  wo={wo}
                  agg={agg}
                  health={health}
                  todaySewing={tAgg?.sewing ?? 0}
                  todayFinishing={tAgg?.finishing ?? 0}
                  yesterdaySewing={yAgg?.sewing}
                  yesterdayFinishing={yAgg?.finishing}
                  onClick={() => navigate(`/buyer/po/${wo.id}`)}
                />
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
