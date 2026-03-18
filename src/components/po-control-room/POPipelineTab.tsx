import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { formatShortDate } from "@/lib/date-utils";
import type { POPipelineStage } from "./types";

interface Props {
  stages: POPipelineStage[];
}

const STAGE_COLORS: Record<string, { bar: string; text: string; accent: string }> = {
  storage: { bar: "bg-orange-500", text: "text-orange-600 dark:text-orange-400", accent: "border-orange-500" },
  cutting: { bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", accent: "border-emerald-500" },
  sewing: { bar: "bg-blue-500", text: "text-blue-600 dark:text-blue-400", accent: "border-blue-500" },
  finishing: { bar: "bg-violet-500", text: "text-violet-600 dark:text-violet-400", accent: "border-violet-500" },
};

function barBg(pct: number) {
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 40) return "bg-amber-500";
  if (pct > 0) return "bg-blue-500";
  return "bg-muted-foreground/20";
}

export function POPipelineTab({ stages }: Props) {
  return (
    <div className="flex flex-col sm:flex-row items-stretch gap-2">
      {stages.map((stage, i) => {
        const colors = STAGE_COLORS[stage.stage] || STAGE_COLORS.sewing;
        return (
          <div key={stage.stage} className="flex items-center gap-1 flex-1 min-w-0">
            <div className={cn("flex-1 border-t-2 rounded-lg border bg-card p-4", colors.accent)}>
              <div className="flex items-baseline justify-between mb-3">
                <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">{stage.label}</span>
                <span className={cn("text-sm font-bold font-mono tabular-nums", colors.text)}>
                  {stage.pct}%
                </span>
              </div>
              <div className="h-1 rounded-full bg-muted overflow-hidden mb-3">
                <div
                  className={cn("h-full rounded-full transition-all", barBg(stage.pct))}
                  style={{ width: `${Math.min(stage.pct, 100)}%` }}
                />
              </div>
              <p className="font-mono text-lg font-bold tabular-nums leading-none">{stage.qty.toLocaleString()}</p>
              {stage.lastDate && (
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  Last {formatShortDate(stage.lastDate)}
                </p>
              )}
            </div>
            {i < stages.length - 1 && (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0 hidden sm:block" />
            )}
          </div>
        );
      })}
    </div>
  );
}
