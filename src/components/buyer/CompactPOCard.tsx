import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ChevronRight,
  Clock,
  TrendingUp,
  PackageCheck,
} from "lucide-react";
import { healthColors, type HealthStatus, type POAggregates } from "@/lib/buyer-health";
import { BuyerWorkOrder } from "@/hooks/useBuyerPOAccess";
import { formatShortDate } from "@/lib/date-utils";

interface CompactPOCardProps {
  wo: BuyerWorkOrder;
  agg: POAggregates;
  health: { status: HealthStatus; label: string };
  todaySewing: number;
  todayFinishing: number;
  yesterdaySewing?: number;
  yesterdayFinishing?: number;
  onClick: () => void;
}

const healthAccent: Record<HealthStatus, string> = {
  healthy: "from-emerald-400 to-emerald-500",
  watch: "from-amber-400 to-amber-500",
  at_risk: "from-red-400 to-red-500",
  no_deadline: "from-slate-300 to-slate-400",
  completed: "from-blue-400 to-blue-500",
};

function DeltaChip({ current, yesterday }: { current: number; yesterday?: number }) {
  if (yesterday === undefined || yesterday === 0 || current === 0) return null;
  const delta = current - yesterday;
  if (delta === 0) return null;

  return (
    <span
      className={`text-[10px] font-medium ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 ${
        delta > 0
          ? "text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/50"
          : "text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-950/50"
      }`}
    >
      {delta > 0 ? "+" : ""}
      {delta.toLocaleString()}
    </span>
  );
}

function CompletionRing({ percent }: { percent: number }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const color =
    percent >= 75
      ? "text-emerald-500"
      : percent >= 40
      ? "text-blue-500"
      : percent >= 10
      ? "text-amber-500"
      : "text-slate-300";

  return (
    <div className="relative flex items-center justify-center h-[76px] w-[76px] shrink-0">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 64 64">
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          className="stroke-muted"
          strokeWidth="5"
        />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          className={`stroke-current ${color}`}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-base font-bold leading-none">{percent}%</span>
      </div>
    </div>
  );
}

export function CompactPOCard({
  wo,
  agg,
  health,
  todaySewing,
  todayFinishing,
  yesterdaySewing,
  yesterdayFinishing,
  onClick,
}: CompactPOCardProps) {
  const sewPct =
    wo.order_qty > 0
      ? Math.min(100, Math.round((agg.cumulativeGood / wo.order_qty) * 100))
      : 0;
  const packedPct =
    wo.order_qty > 0
      ? Math.min(100, Math.round((agg.finishingCarton / wo.order_qty) * 100))
      : 0;
  const completionPct = Math.round((sewPct + packedPct) / 2);
  const balance = Math.max(0, wo.order_qty - agg.cumulativeGood);
  const accent = healthAccent[health.status] || healthAccent.no_deadline;

  return (
    <Card
      className="group cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-border/60 hover:border-primary/20 overflow-hidden"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      {/* Color accent bar */}
      <div className={`h-1.5 bg-gradient-to-r ${accent}`} />

      <CardContent className="p-5 md:p-6">
        {/* Header with completion ring */}
        <div className="flex items-start gap-4 mb-5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="text-lg font-bold text-primary group-hover:underline decoration-primary/30 underline-offset-2">
                {wo.po_number}
              </h3>
              <Badge
                variant="outline"
                className={`text-xs px-2 py-0.5 shrink-0 ${healthColors[health.status]}`}
              >
                {health.label}
              </Badge>
              {wo.status && (
                <Badge variant="secondary" className="text-xs">
                  {wo.status.replace("_", " ")}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {wo.style}
              {wo.color && ` — ${wo.color}`}
              {wo.item && ` — ${wo.item}`}
            </p>
            <div className="flex items-center gap-3 mt-2 text-sm">
              <span className="font-semibold">
                {wo.order_qty.toLocaleString()} pcs
              </span>
              {wo.planned_ex_factory && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatShortDate(wo.planned_ex_factory)}
                </span>
              )}
            </div>
          </div>
          <CompletionRing percent={completionPct} />
        </div>

        {/* Progress bars */}
        <div className="mb-5 space-y-3">
          <div>
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="text-muted-foreground font-medium">Sewing</span>
              <span className="font-medium tabular-nums">
                {agg.cumulativeGood.toLocaleString()} / {wo.order_qty.toLocaleString()}
                <span className="text-muted-foreground ml-1">({sewPct}%)</span>
              </span>
            </div>
            <Progress value={sewPct} className="h-2.5" />
            <div className="text-xs text-muted-foreground mt-1">
              Balance: {balance.toLocaleString()} pcs remaining
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="text-muted-foreground font-medium">Finishing</span>
              <span className="font-medium tabular-nums">
                {agg.finishingCarton.toLocaleString()} / {wo.order_qty.toLocaleString()}
                <span className="text-muted-foreground ml-1">({packedPct}%)</span>
              </span>
            </div>
            <Progress value={packedPct} className="h-2.5 [&>div]:from-violet-500 [&>div]:to-violet-400" />
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-xl bg-blue-50/80 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 p-3">
            <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">
              <TrendingUp className="h-3.5 w-3.5" /> Sewn Today
            </div>
            <div className="text-lg font-bold tabular-nums">
              {todaySewing.toLocaleString()}
              <DeltaChip current={todaySewing} yesterday={yesterdaySewing} />
            </div>
          </div>
          <div className="rounded-xl bg-violet-50/80 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900/30 p-3">
            <div className="flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400 font-medium mb-1">
              <PackageCheck className="h-3.5 w-3.5" /> Packed Today
            </div>
            <div className="text-lg font-bold tabular-nums">
              {todayFinishing.toLocaleString()}
              <DeltaChip current={todayFinishing} yesterday={yesterdayFinishing} />
            </div>
          </div>
        </div>

        {/* Clickable hint */}
        <div className="flex items-center justify-end text-sm text-muted-foreground group-hover:text-primary transition-colors">
          <span className="font-medium">View details</span>
          <ChevronRight className="h-4 w-4 ml-0.5 group-hover:translate-x-1 transition-transform duration-200" />
        </div>
      </CardContent>
    </Card>
  );
}
