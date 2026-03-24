import { Receipt, Hash, Package, TrendingUp, Archive } from "lucide-react";
import { SewingMachine } from "@/components/icons/SewingMachine";
import type { POKPIs } from "./types";

interface Props {
  kpis: POKPIs;
  onViewLeftovers?: () => void;
}

const cards = [
  {
    key: "activeOrders",
    label: "Active Orders",
    icon: Receipt,
    gradient: "from-indigo-500 to-blue-600",
    shadow: "shadow-indigo-500/20",
    bg: "from-indigo-50 via-white to-blue-50/50 dark:from-indigo-950/40 dark:via-card dark:to-blue-950/20",
    border: "border-indigo-200/60 dark:border-indigo-800/40",
    text: "text-indigo-900 dark:text-indigo-100",
    label_text: "text-indigo-600/70 dark:text-indigo-400/70",
    format: (v: number) => v.toString(),
  },
  {
    key: "totalQty",
    label: "Total Order Qty",
    icon: Hash,
    gradient: "from-slate-500 to-slate-600",
    shadow: "shadow-slate-500/20",
    bg: "from-slate-50 via-white to-slate-50/50 dark:from-slate-950/40 dark:via-card dark:to-slate-950/20",
    border: "border-slate-200/60 dark:border-slate-800/40",
    text: "text-slate-900 dark:text-slate-100",
    label_text: "text-slate-600/70 dark:text-slate-400/70",
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: "sewingOutput",
    label: "Sewing Output",
    icon: SewingMachine,
    gradient: "from-blue-500 to-indigo-600",
    shadow: "shadow-blue-500/20",
    bg: "from-blue-50 via-white to-blue-50/50 dark:from-blue-950/40 dark:via-card dark:to-blue-950/20",
    border: "border-blue-200/60 dark:border-blue-800/40",
    text: "text-blue-900 dark:text-blue-100",
    label_text: "text-blue-600/70 dark:text-blue-400/70",
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: "finishedOutput",
    label: "Finishing Output",
    icon: Package,
    gradient: "from-violet-500 to-purple-600",
    shadow: "shadow-violet-500/20",
    bg: "from-violet-50 via-white to-purple-50/50 dark:from-violet-950/40 dark:via-card dark:to-purple-950/20",
    border: "border-violet-200/60 dark:border-violet-800/40",
    text: "text-violet-900 dark:text-violet-100",
    label_text: "text-violet-600/70 dark:text-violet-400/70",
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: "totalExtras",
    label: "Total Extras",
    icon: TrendingUp,
    gradient: "from-amber-500 to-orange-600",
    shadow: "shadow-amber-500/20",
    bg: "from-amber-50 via-white to-orange-50/50 dark:from-amber-950/40 dark:via-card dark:to-orange-950/20",
    border: "border-amber-200/60 dark:border-amber-800/40",
    text: "text-amber-900 dark:text-amber-100",
    label_text: "text-amber-600/70 dark:text-amber-400/70",
    format: (v: number) => v.toLocaleString(),
  },
] as const;

export function POControlRoomKPIs({ kpis, onViewLeftovers }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const value = kpis[card.key as keyof POKPIs] as number;
        return (
          <div
            key={card.key}
            className={`relative overflow-hidden rounded-xl border ${card.border} bg-gradient-to-br ${card.bg} p-4 md:p-5 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group`}
          >
            <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl ${card.gradient} opacity-[0.06] rounded-bl-full pointer-events-none`} />
            <div className="relative flex items-start justify-between">
              <div className="space-y-1">
                <p className={`text-[10px] md:text-xs font-semibold uppercase tracking-wider ${card.label_text}`}>
                  {card.label}
                </p>
                <p className={`font-mono text-2xl md:text-3xl font-bold tracking-tight ${card.text}`}>
                  {card.format(value)}
                </p>
              </div>
              <div className={`rounded-xl bg-gradient-to-br ${card.gradient} p-2.5 shadow-lg ${card.shadow} group-hover:shadow-xl transition-shadow`}>
                <Icon className="h-5 w-5 text-white" />
              </div>
            </div>
          </div>
        );
      })}

      {/* View All Leftovers card */}
      {onViewLeftovers && (
        <button
          onClick={onViewLeftovers}
          className="relative overflow-hidden rounded-xl border border-emerald-200/60 dark:border-emerald-800/40 bg-gradient-to-br from-emerald-50 via-white to-green-50/50 dark:from-emerald-950/40 dark:via-card dark:to-green-950/20 p-4 md:p-5 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group text-left cursor-pointer"
        >
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-emerald-500 to-green-600 opacity-[0.06] rounded-bl-full pointer-events-none" />
          <div className="relative flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-emerald-600/70 dark:text-emerald-400/70">
                Leftovers
              </p>
              <p className="font-mono text-sm md:text-base font-bold tracking-tight text-emerald-900 dark:text-emerald-100">
                View All
              </p>
            </div>
            <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 p-2.5 shadow-lg shadow-emerald-500/20 group-hover:shadow-xl transition-shadow">
              <Archive className="h-5 w-5 text-white" />
            </div>
          </div>
        </button>
      )}
    </div>
  );
}
