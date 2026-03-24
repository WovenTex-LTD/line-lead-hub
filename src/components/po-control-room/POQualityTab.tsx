import { cn } from "@/lib/utils";
import type { POQualityData } from "./types";

interface Props {
  quality: POQualityData;
  orderQty: number;
}

export function POQualityTab({ quality, orderQty }: Props) {
  const progressPct = orderQty > 0 ? Math.min((quality.totalOutput / orderQty) * 100, 100) : 0;

  const stats = [
    {
      label: "Rejects",
      value: quality.totalRejects.toLocaleString(),
      sub: `${quality.rejectRate.toFixed(1)}%`,
      alert: quality.rejectRate > 3,
      color: quality.rejectRate > 3 ? "text-red-500" : undefined,
    },
    {
      label: "Rework",
      value: quality.totalRework.toLocaleString(),
      sub: `${quality.reworkRate.toFixed(1)}%`,
      alert: quality.reworkRate > 5,
      color: quality.reworkRate > 5 ? "text-amber-500" : undefined,
    },
    {
      label: "Extras",
      value: quality.extrasTotal.toLocaleString(),
      sub: quality.extrasConsumed > 0 ? `${quality.extrasAvailable.toLocaleString()} avail` : undefined,
      alert: false,
    },
    {
      label: "Available",
      value: quality.extrasAvailable.toLocaleString(),
      alert: false,
      color: quality.extrasAvailable > 0 ? "text-emerald-600 dark:text-emerald-400" : undefined,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Progress */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sewing Progress</span>
          <span className="text-sm font-mono tabular-nums">
            <span className="font-bold">{quality.totalOutput.toLocaleString()}</span>
            <span className="text-muted-foreground"> / {orderQty.toLocaleString()}</span>
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500 transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground mt-1 text-right font-mono tabular-nums">{Math.round(progressPct)}%</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-px rounded-lg border bg-border overflow-hidden">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-card px-4 py-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-1">{stat.label}</p>
            <p className={cn("text-lg font-bold font-mono tabular-nums leading-none", stat.color)}>
              {stat.value}
            </p>
            {stat.sub && (
              <p className={cn("text-[10px] mt-1", stat.alert ? stat.color : "text-muted-foreground")}>{stat.sub}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
