import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { CalendarClock } from "lucide-react";
import type { UnscheduledPO } from "@/hooks/useProductionSchedule";

interface Props {
  po: UnscheduledPO;
  onSchedule: (po: UnscheduledPO) => void;
}

export function UnscheduledPOCard({ po, onSchedule }: Props) {
  const isRisk = po.urgency === "at_risk";
  const isUpcoming = po.urgency === "upcoming";

  return (
    <div className={`group relative rounded-lg border bg-white transition-all duration-150 hover:shadow-md overflow-hidden
      ${isRisk ? "border-red-200/60 hover:border-red-300/80" : "border-slate-200/80 hover:border-slate-300"}
    `}>
      {/* Left accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${
        isRisk ? "bg-red-500" : isUpcoming ? "bg-amber-400" : "bg-slate-200"
      }`} />

      <div className="flex items-center justify-between gap-3 pl-4 pr-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="text-[12px] font-bold text-slate-800 tracking-tight truncate">{po.po_number}</p>
            <p className="text-[10px] text-slate-400 truncate">{po.buyer}</p>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-[10px] text-slate-400 tabular-nums">{po.order_qty?.toLocaleString()} pcs</span>
            {po.planned_ex_factory && (
              <span className={`inline-flex items-center gap-1 text-[10px] font-medium tabular-nums
                ${isRisk ? "text-red-500" : isUpcoming ? "text-amber-500" : "text-slate-400"}
              `}>
                <CalendarClock className="h-2.5 w-2.5" />
                {format(parseISO(po.planned_ex_factory), "d MMM")}
                {po.daysToExFactory !== null && (
                  <span>({po.daysToExFactory <= 0 ? "overdue" : `${po.daysToExFactory}d`})</span>
                )}
              </span>
            )}
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-[10px] font-semibold shrink-0 opacity-0 group-hover:opacity-100 border-blue-200 text-blue-600 hover:bg-blue-50 transition-all"
          onClick={() => onSchedule(po)}
        >
          Schedule
        </Button>
      </div>
    </div>
  );
}
