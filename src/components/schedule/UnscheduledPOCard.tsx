import { format, parseISO } from "date-fns";
import type { UnscheduledPO } from "@/hooks/useProductionSchedule";

interface Props {
  po: UnscheduledPO;
  onSchedule: (po: UnscheduledPO) => void;
}

export function UnscheduledPOCard({ po, onSchedule }: Props) {
  return (
    <button
      onClick={() => onSchedule(po)}
      className="w-full text-left rounded-lg px-3.5 py-2.5 hover:bg-slate-50 transition-colors group"
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-slate-800">{po.po_number}</span>
        <span className="text-[11px] font-medium text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
          Schedule
        </span>
      </div>
      <div className="flex items-center gap-2 mt-0.5">
        <span className="text-[11px] text-slate-400">{po.buyer} · {po.style}</span>
      </div>
      <div className="flex items-center gap-3 mt-1">
        <span className="text-[10px] text-slate-400 tabular-nums">{po.order_qty?.toLocaleString()} pcs</span>
        {po.planned_ex_factory && (
          <span className={`text-[10px] font-medium tabular-nums ${
            po.urgency === "at_risk" ? "text-red-500" : po.urgency === "upcoming" ? "text-amber-500" : "text-slate-400"
          }`}>
            {format(parseISO(po.planned_ex_factory), "d MMM")}
            {po.daysToExFactory !== null && (
              <span className="ml-1">
                ({po.daysToExFactory <= 0 ? "overdue" : `${po.daysToExFactory}d`})
              </span>
            )}
          </span>
        )}
      </div>
    </button>
  );
}
