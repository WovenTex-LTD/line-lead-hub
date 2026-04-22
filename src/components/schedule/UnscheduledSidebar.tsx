import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";
import { UnscheduledPOCard } from "./UnscheduledPOCard";
import type { UnscheduledPO, UrgencyGroup } from "@/hooks/useProductionSchedule";

interface Props {
  unscheduledPOs: UnscheduledPO[];
  onSchedule: (po: UnscheduledPO) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const groupConfig: Record<UrgencyGroup, { label: string; color: string }> = {
  at_risk: { label: "At Risk", color: "text-red-500" },
  upcoming: { label: "Upcoming", color: "text-amber-500" },
  later: { label: "Later", color: "text-slate-400" },
};

export function UnscheduledSidebar({ unscheduledPOs, onSchedule, open, onOpenChange }: Props) {
  const groups = (["at_risk", "upcoming", "later"] as const)
    .map(key => ({ key, ...groupConfig[key], items: unscheduledPOs.filter(po => po.urgency === key) }))
    .filter(g => g.items.length > 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[380px] overflow-y-auto p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-[15px] font-bold">Unscheduled Orders</SheetTitle>
            <Badge variant="secondary" className="text-[11px] font-bold px-2 h-6">{unscheduledPOs.length}</Badge>
          </div>
        </SheetHeader>

        <div className="px-4 py-4">
          {unscheduledPOs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-400 mb-3" />
              <p className="text-[14px] font-semibold text-slate-700">All orders scheduled</p>
              <p className="text-[12px] text-slate-400 mt-1">Every active PO is assigned to a line</p>
            </div>
          ) : (
            <div className="space-y-5">
              {groups.map(group => (
                <div key={group.key}>
                  <p className={`text-[10px] font-bold uppercase tracking-[0.1em] mb-2.5 ${group.color}`}>
                    {group.label} ({group.items.length})
                  </p>
                  <div className="space-y-1.5">
                    {group.items.map(po => (
                      <UnscheduledPOCard key={po.id} po={po} onSchedule={onSchedule} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
