import { Card, CardContent } from "@/components/ui/card";
import { CalendarCheck, AlertTriangle, Clock, ShieldAlert } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import type { ScheduleKPIs } from "@/hooks/useProductionSchedule";

interface Props {
  kpis: ScheduleKPIs;
}

export function ScheduleKPIStrip({ kpis }: Props) {
  return (
    <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">

      {/* Scheduled POs */}
      <Card className="relative overflow-hidden animate-fade-in group hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-gradient-to-br from-blue-50 via-white to-blue-50/50 border-blue-200/60">
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-500/10 to-transparent rounded-bl-full" />
        <div className="absolute bottom-0 left-0 w-20 h-20 bg-gradient-to-tr from-blue-500/5 to-transparent rounded-tr-full" />
        <CardContent className="relative pt-5 pb-4">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600/70 flex items-center gap-1.5">
                <CalendarCheck className="h-3.5 w-3.5" />
                Scheduled POs
              </p>
              <p className="text-2xl md:text-3xl font-bold font-mono tracking-tight text-blue-900">
                <AnimatedNumber value={kpis.scheduledCount} />
              </p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/25 group-hover:shadow-blue-500/40 transition-shadow">
              <CalendarCheck className="h-5 w-5 text-white" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Unscheduled POs */}
      <Card className="relative overflow-hidden animate-fade-in group hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-gradient-to-br from-amber-50 via-white to-orange-50/50 border-amber-200/60" style={{ animationDelay: '50ms' }}>
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-amber-500/10 to-transparent rounded-bl-full" />
        <div className="absolute bottom-0 left-0 w-20 h-20 bg-gradient-to-tr from-amber-500/5 to-transparent rounded-tr-full" />
        <CardContent className="relative pt-5 pb-4">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-600/70 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Unscheduled POs
              </p>
              <p className="text-2xl md:text-3xl font-bold font-mono tracking-tight text-amber-900">
                <AnimatedNumber value={kpis.unscheduledCount} />
              </p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/25 group-hover:shadow-amber-500/40 transition-shadow">
              <AlertTriangle className="h-5 w-5 text-white" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Next Deadline */}
      <Card className="relative overflow-hidden animate-fade-in group hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-gradient-to-br from-violet-50 via-white to-purple-50/50 border-violet-200/60" style={{ animationDelay: '100ms' }}>
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-violet-500/10 to-transparent rounded-bl-full" />
        <div className="absolute bottom-0 left-0 w-20 h-20 bg-gradient-to-tr from-violet-500/5 to-transparent rounded-tr-full" />
        <CardContent className="relative pt-5 pb-4">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-600/70 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Next Deadline
              </p>
              <p className={`text-2xl md:text-3xl font-bold font-mono tracking-tight ${
                kpis.nextDeadlineDays !== null && kpis.nextDeadlineDays <= 7 ? "text-red-700" :
                kpis.nextDeadlineDays !== null && kpis.nextDeadlineDays <= 14 ? "text-amber-700" :
                "text-violet-900"
              }`}>
                {kpis.nextDeadlineDays !== null ? (
                  <><AnimatedNumber value={kpis.nextDeadlineDays} /><span className="text-lg ml-0.5">d</span></>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25 group-hover:shadow-violet-500/40 transition-shadow">
              <Clock className="h-5 w-5 text-white" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ex-Factory Risks */}
      <Card className="relative overflow-hidden animate-fade-in group hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-gradient-to-br from-red-50 via-white to-rose-50/50 border-red-200/60" style={{ animationDelay: '150ms' }}>
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-red-500/10 to-transparent rounded-bl-full" />
        <div className="absolute bottom-0 left-0 w-20 h-20 bg-gradient-to-tr from-red-500/5 to-transparent rounded-tr-full" />
        <CardContent className="relative pt-5 pb-4">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-red-600/70 flex items-center gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5" />
                Ex-Factory Risks
              </p>
              <p className="text-2xl md:text-3xl font-bold font-mono tracking-tight text-red-900">
                <AnimatedNumber value={kpis.exFactoryRisks} />
              </p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-lg shadow-red-500/25 group-hover:shadow-red-500/40 transition-shadow">
              <ShieldAlert className="h-5 w-5 text-white" />
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
