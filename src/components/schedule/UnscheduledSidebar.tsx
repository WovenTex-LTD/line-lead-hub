import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, Clock, CalendarDays, ChevronDown, ChevronUp, ListTodo } from "lucide-react";
import { UnscheduledPOCard } from "./UnscheduledPOCard";
import type { UnscheduledPO, UrgencyGroup } from "@/hooks/useProductionSchedule";

interface Props {
  unscheduledPOs: UnscheduledPO[];
  onSchedule: (po: UnscheduledPO) => void;
}

const groupConfig: Record<UrgencyGroup, { label: string; textColor: string; icon: typeof AlertTriangle; borderColor: string }> = {
  at_risk: { label: "At Risk", textColor: "text-red-600", icon: AlertTriangle, borderColor: "border-red-200" },
  upcoming: { label: "Upcoming", textColor: "text-amber-600", icon: Clock, borderColor: "border-amber-200" },
  later: { label: "Later", textColor: "text-slate-400", icon: CalendarDays, borderColor: "border-slate-200" },
};

export function UnscheduledSidebar({ unscheduledPOs, onSchedule }: Props) {
  const [expanded, setExpanded] = useState(false);

  const groups = (["at_risk", "upcoming", "later"] as const).map((key) => ({
    key,
    ...groupConfig[key],
    items: unscheduledPOs.filter((po) => po.urgency === key),
  })).filter((g) => g.items.length > 0);

  const atRiskCount = groups.find((g) => g.key === "at_risk")?.items.length ?? 0;

  return (
    <div className="w-full shrink-0">
      {/* Collapsed state — compact trigger bar */}
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-150"
        >
          <div className="flex items-center gap-2.5">
            <ListTodo className="h-4 w-4 text-slate-400" />
            <span className="text-[13px] font-semibold text-slate-700">Unscheduled Orders</span>
            <Badge variant="secondary" className="text-[10px] font-bold px-2 h-5 bg-slate-100 text-slate-600">
              {unscheduledPOs.length}
            </Badge>
            {atRiskCount > 0 && (
              <Badge className="text-[9px] font-bold px-1.5 h-4 bg-red-100 text-red-600 border-0">
                {atRiskCount} at risk
              </Badge>
            )}
          </div>
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </button>
      )}

      {/* Expanded state — full sidebar */}
      {expanded && (
        <div className="w-full max-h-[calc(100vh-420px)] overflow-y-auto">
          <div className="border border-slate-200 rounded-xl bg-white shadow-sm ring-1 ring-slate-900/[0.03] overflow-hidden">
            {/* Header with collapse button */}
            <button
              onClick={() => setExpanded(false)}
              className="w-full px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/60 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-bold text-slate-800 tracking-tight">Unscheduled Orders</span>
                <Badge variant="secondary" className="text-[10px] font-bold px-2 h-5 bg-slate-100 text-slate-600">
                  {unscheduledPOs.length}
                </Badge>
              </div>
              <ChevronUp className="h-4 w-4 text-slate-400" />
            </button>

            {/* Content */}
            <div className="p-3">
              {unscheduledPOs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center mb-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  </div>
                  <p className="text-[13px] font-semibold text-slate-700">All orders scheduled</p>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-[200px]">Every active PO has been assigned to a production line</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {groups.map((group) => {
                    const Icon = group.icon;
                    return (
                      <div key={group.key}>
                        <div className={`flex items-center gap-1.5 mb-2 pb-1.5 border-b ${group.borderColor}`}>
                          <Icon className={`h-3 w-3 ${group.textColor}`} />
                          <span className={`text-[10px] font-bold uppercase tracking-[0.08em] ${group.textColor}`}>
                            {group.label}
                          </span>
                          <span className={`text-[10px] font-semibold ${group.textColor} opacity-60`}>
                            {group.items.length}
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {group.items.map((po) => (
                            <UnscheduledPOCard key={po.id} po={po} onSchedule={onSchedule} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
