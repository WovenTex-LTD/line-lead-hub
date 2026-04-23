import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, Clock, CalendarDays, ChevronDown, ChevronUp, Package } from "lucide-react";
import { UnscheduledPOCard } from "./UnscheduledPOCard";
import type { UnscheduledPO, UrgencyGroup } from "@/hooks/useProductionSchedule";

interface Props {
  unscheduledPOs: UnscheduledPO[];
  onSchedule: (po: UnscheduledPO) => void;
}

const groupConfig: Record<UrgencyGroup, { label: string; textColor: string; icon: typeof AlertTriangle; dotColor: string }> = {
  at_risk: { label: "At Risk", textColor: "text-red-600", icon: AlertTriangle, dotColor: "bg-red-500" },
  upcoming: { label: "Upcoming", textColor: "text-amber-600", icon: Clock, dotColor: "bg-amber-400" },
  later: { label: "Later", textColor: "text-slate-400", icon: CalendarDays, dotColor: "bg-slate-300" },
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
      {/* Collapsed trigger */}
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-gradient-to-r from-white to-slate-50/80 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-150"
        >
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-amber-100 flex items-center justify-center">
              <Package className="h-3.5 w-3.5 text-amber-600" />
            </div>
            <div className="text-left">
              <span className="text-[12px] font-bold text-slate-700 block leading-none">Unscheduled Orders</span>
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                {unscheduledPOs.length} PO{unscheduledPOs.length !== 1 ? "s" : ""} waiting
                {atRiskCount > 0 && <span className="text-red-500 font-semibold ml-1">· {atRiskCount} at risk</span>}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px] font-bold px-2 h-5 bg-slate-100 text-slate-600">
              {unscheduledPOs.length}
            </Badge>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </div>
        </button>
      )}

      {/* Expanded */}
      {expanded && (
        <div className="w-full max-h-[calc(100vh-420px)] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {/* Header */}
          <button
            onClick={() => setExpanded(false)}
            className="w-full px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white hover:from-slate-100/80 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-amber-100 flex items-center justify-center">
                <Package className="h-3.5 w-3.5 text-amber-600" />
              </div>
              <span className="text-[13px] font-bold text-slate-800 tracking-tight">Unscheduled Orders</span>
              <Badge variant="secondary" className="text-[10px] font-bold px-2 h-5 bg-slate-100 text-slate-600">
                {unscheduledPOs.length}
              </Badge>
            </div>
            <ChevronUp className="h-4 w-4 text-slate-400" />
          </button>

          {/* Content */}
          <div className="p-2.5">
            {unscheduledPOs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center mb-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                </div>
                <p className="text-[13px] font-semibold text-slate-700">All orders scheduled</p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-[200px]">Every active PO has been assigned to a production line</p>
              </div>
            ) : (
              <div className="space-y-3">
                {groups.map((group) => {
                  const Icon = group.icon;
                  return (
                    <div key={group.key}>
                      {/* Group header */}
                      <div className="flex items-center gap-2 px-1 mb-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${group.dotColor}`} />
                        <span className={`text-[10px] font-bold uppercase tracking-[0.08em] ${group.textColor}`}>
                          {group.label}
                        </span>
                        <span className={`text-[10px] font-medium ${group.textColor} opacity-50`}>
                          {group.items.length}
                        </span>
                      </div>
                      {/* Cards */}
                      <div className="space-y-1">
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
      )}
    </div>
  );
}
