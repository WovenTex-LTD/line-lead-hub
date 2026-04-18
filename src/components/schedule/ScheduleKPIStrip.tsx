import { Card, CardContent } from "@/components/ui/card";
import { CalendarCheck, AlertTriangle, Activity, Pause, ShieldAlert } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import type { ScheduleKPIs } from "@/hooks/useProductionSchedule";

interface Props {
  kpis: ScheduleKPIs;
}

const cards = [
  { key: "scheduledCount" as const, label: "Scheduled POs", icon: CalendarCheck, gradient: "from-blue-50 via-white to-blue-50/50", iconBg: "bg-blue-100", iconColor: "text-blue-600" },
  { key: "unscheduledCount" as const, label: "Unscheduled POs", icon: AlertTriangle, gradient: "from-amber-50 via-white to-amber-50/50", iconBg: "bg-amber-100", iconColor: "text-amber-600" },
  { key: "linesInUse" as const, label: "Lines in Use", icon: Activity, gradient: "from-emerald-50 via-white to-emerald-50/50", iconBg: "bg-emerald-100", iconColor: "text-emerald-600" },
  { key: "idleLines" as const, label: "Idle Lines", icon: Pause, gradient: "from-slate-50 via-white to-slate-50/50", iconBg: "bg-slate-100", iconColor: "text-slate-500" },
  { key: "exFactoryRisks" as const, label: "Ex-Factory Risks", icon: ShieldAlert, gradient: "from-red-50 via-white to-red-50/50", iconBg: "bg-red-100", iconColor: "text-red-600" },
];

export function ScheduleKPIStrip({ kpis }: Props) {
  return (
    <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
      {cards.map((card, i) => {
        const Icon = card.icon;
        const value = kpis[card.key];
        return (
          <Card
            key={card.key}
            className={`relative overflow-hidden bg-gradient-to-br ${card.gradient} border-slate-200/60 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 animate-fade-in`}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-gradient-to-br from-slate-100/40 to-transparent" />
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{card.label}</p>
                  <p className="text-2xl md:text-3xl font-bold text-slate-900 tabular-nums">
                    <AnimatedNumber value={value} />
                  </p>
                </div>
                <div className={`h-10 w-10 rounded-xl ${card.iconBg} flex items-center justify-center shrink-0`}>
                  <Icon className={`h-5 w-5 ${card.iconColor}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
