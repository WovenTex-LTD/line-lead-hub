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
    <div className={`group relative rounded-lg border bg-white p-3 transition-all duration-150 hover:shadow-md
      ${isRisk ? "border-red-200/60 hover:border-red-300/80" : "border-slate-200/80 hover:border-slate-300"}
    `}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* PO Number */}
          <p className="text-[13px] font-bold text-slate-800 tracking-tight truncate">{po.po_number}</p>

          {/* Buyer · Style */}
          <p className="text-[11px] text-slate-500 mt-0.5 truncate">{po.buyer} · {po.style}</p>

          {/* Meta row: Qty + Ex-factory */}
          <div className="flex items-center gap-3 mt-2">
            <span className="text-[10px] font-medium text-slate-400 tabular-nums">{po.order_qty?.toLocaleString()} pcs</span>

            {po.planned_ex_factory && (
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold tabular-nums
                ${isRisk ? "text-red-600/80" : isUpcoming ? "text-amber-600/80" : "text-slate-400"}
              `}>
                <CalendarClock className="h-3 w-3" />
                {format(parseISO(po.planned_ex_factory), "d MMM")}
                {po.daysToExFactory !== null && (
                  <span className={`ml-0.5 ${isRisk ? "text-red-500" : ""}`}>
                    ({po.daysToExFactory <= 0 ? "overdue" : `${po.daysToExFactory}d`})
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Schedule button */}
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-[10px] font-semibold shrink-0 border-slate-200 text-slate-600 hover:text-blue-700 hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
          onClick={() => onSchedule(po)}
        >
          Schedule
        </Button>
      </div>
    </div>
  );
}
