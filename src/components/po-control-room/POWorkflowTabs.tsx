import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Play, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { POWorkflowTab } from "./types";

const TABS: {
  value: POWorkflowTab;
  label: string;
  icon: typeof Play;
  activeClass: string;
  badgeVariant?: "destructive" | "success" | "secondary";
}[] = [
  {
    value: "running",
    label: "Running",
    icon: Play,
    activeClass: "data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 dark:data-[state=active]:bg-blue-950/40 dark:data-[state=active]:text-blue-300",
  },
  {
    value: "not_started",
    label: "Not Started",
    icon: Clock,
    activeClass: "data-[state=active]:bg-slate-100 data-[state=active]:text-slate-700 dark:data-[state=active]:bg-slate-800/40 dark:data-[state=active]:text-slate-300",
  },
  {
    value: "at_risk",
    label: "At Risk",
    icon: AlertTriangle,
    activeClass: "data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700 dark:data-[state=active]:bg-amber-950/40 dark:data-[state=active]:text-amber-300",
    badgeVariant: "destructive",
  },
  {
    value: "completed",
    label: "Completed",
    icon: CheckCircle2,
    activeClass: "data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700 dark:data-[state=active]:bg-emerald-950/40 dark:data-[state=active]:text-emerald-300",
    badgeVariant: "success",
  },
];

interface Props {
  activeTab: POWorkflowTab;
  onTabChange: (tab: POWorkflowTab) => void;
  counts: Record<POWorkflowTab, number>;
}

export function POWorkflowTabs({ activeTab, onTabChange, counts }: Props) {
  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => onTabChange(v as POWorkflowTab)}
    >
      <TabsList className="w-full grid grid-cols-4 h-auto p-1 rounded-xl bg-muted/60 border border-border/50">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className={`flex items-center justify-center gap-1.5 text-xs sm:text-sm px-2 py-2.5 rounded-lg data-[state=active]:shadow-sm ${tab.activeClass}`}
            >
              <Icon className="h-3.5 w-3.5 hidden sm:block" />
              <span className="hidden xs:inline">{tab.label}</span>
              <span className="xs:hidden">{tab.label.split(" ")[0]}</span>
              {counts[tab.value] > 0 && (
                <Badge
                  variant={tab.badgeVariant ?? "secondary"}
                  className="text-[10px] px-1.5 py-0 min-w-[18px] h-[18px] justify-center"
                >
                  {counts[tab.value]}
                </Badge>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
