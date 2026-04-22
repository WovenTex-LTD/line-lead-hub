import { Card, CardContent } from "@/components/ui/card";
import { CalendarCheck, AlertTriangle, Activity, Pause, ShieldAlert } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import type { ScheduleKPIs } from "@/hooks/useProductionSchedule";

interface Props {
  kpis: ScheduleKPIs;
}

const cards = [
  { key: "scheduledCount" as const, label: "Scheduled", icon: CalendarCheck, color: "blue" },
  { key: "unscheduledCount" as const, label: "Unscheduled", icon: AlertTriangle, color: "amber" },
  { key: "linesInUse" as const, label: "Lines Active", icon: Activity, color: "emerald" },
  { key: "idleLines" as const, label: "Lines Idle", icon: Pause, color: "slate" },
  { key: "exFactoryRisks" as const, label: "At Risk", icon: ShieldAlert, color: "red" },
];

const colorMap: Record<string, { bg: string; iconBg: string; iconText: string; accent: string }> = {
  blue: { bg: "from-blue-50/80 to-white", iconBg: "bg-blue-500", iconText: "text-white", accent: "bg-blue-500" },
  amber: { bg: "from-amber-50/80 to-white", iconBg: "bg-amber-500", iconText: "text-white", accent: "bg-amber-500" },
  emerald: { bg: "from-emerald-50/80 to-white", iconBg: "bg-emerald-500", iconText: "text-white", accent: "bg-emerald-500" },
  slate: { bg: "from-slate-50/80 to-white", iconBg: "bg-slate-400", iconText: "text-white", accent: "bg-slate-400" },
  red: { bg: "from-red-50/80 to-white", iconBg: "bg-red-500", iconText: "text-white", accent: "bg-red-500" },
};

export function ScheduleKPIStrip({ kpis }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {cards.map((card, i) => {
        const Icon = card.icon;
        const value = kpis[card.key];
        const c = colorMap[card.color];
        return (
          <Card
            key={card.key}
            className={`relative overflow-hidden bg-gradient-to-br ${c.bg} border-slate-200/60
              hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 animate-fade-in`}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            {/* Top accent bar */}
            <div className={`absolute top-0 inset-x-0 h-[2px] ${c.accent}`} />
            <CardContent className="pt-4 pb-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 mb-1">{card.label}</p>
                  <p className="text-[28px] font-extrabold text-slate-900 tabular-nums leading-none tracking-tight">
                    <AnimatedNumber value={value} />
                  </p>
                </div>
                <div className={`h-9 w-9 rounded-lg ${c.iconBg} flex items-center justify-center shadow-sm`}>
                  <Icon className={`h-4 w-4 ${c.iconText}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
