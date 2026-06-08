import { TrendingUp, AlertTriangle, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuickActionsProps {
  onSelect: (prompt: string) => void;
  language: "en" | "bn" | "zh";
}

const QUICK_ACTIONS = {
  en: [
    {
      icon: TrendingUp,
      label: "Today's production",
      hint: "Output & efficiency",
      prompt: "How is production doing today?",
    },
    {
      icon: Activity,
      label: "Line performance",
      hint: "Who's behind target",
      prompt: "Which lines are behind target right now?",
    },
    {
      icon: AlertTriangle,
      label: "Open blockers",
      hint: "Issues to resolve",
      prompt: "Are there any open blockers I should know about?",
    },
  ],
  bn: [
    {
      icon: TrendingUp,
      label: "আজকের প্রোডাকশন",
      hint: "আউটপুট ও দক্ষতা",
      prompt: "আজ প্রোডাকশন কেমন চলছে?",
    },
    {
      icon: Activity,
      label: "লাইন পারফরম্যান্স",
      hint: "কারা টার্গেটের পিছনে",
      prompt: "এখন কোন লাইনগুলো টার্গেটের পিছনে আছে?",
    },
    {
      icon: AlertTriangle,
      label: "ওপেন ব্লকার",
      hint: "সমাধানের সমস্যা",
      prompt: "আমার জানা উচিত এমন কোনো ওপেন ব্লকার আছে কি?",
    },
  ],
  zh: [
    {
      icon: TrendingUp,
      label: "今日生产",
      hint: "产量与效率",
      prompt: "今天生产情况如何？",
    },
    {
      icon: Activity,
      label: "生产线表现",
      hint: "哪些落后于目标",
      prompt: "现在哪些生产线落后于目标？",
    },
    {
      icon: AlertTriangle,
      label: "未解决的阻碍",
      hint: "需要解决的问题",
      prompt: "有什么我应该知道的未解决的阻碍吗？",
    },
  ],
};

export function QuickActions({ onSelect, language }: QuickActionsProps) {
  const actions = QUICK_ACTIONS[language];
  const isOddCount = actions.length % 2 !== 0;

  return (
    <div className="grid grid-cols-2 gap-2.5 w-full max-w-sm">
      {actions.map((action, index) => {
        const isLastOdd = isOddCount && index === actions.length - 1;
        return (
          <button
            key={index}
            onClick={() => onSelect(action.prompt)}
            className={cn(
              "group flex flex-col items-start gap-2 p-3 rounded-xl border bg-card text-left",
              "shadow-sm hover:shadow-md hover:border-primary/30",
              "transition-all duration-200 hover:-translate-y-0.5",
              "animate-in fade-in slide-in-from-bottom-2",
              isLastOdd && "col-span-2 justify-self-center max-w-[calc(50%-0.3125rem)]"
            )}
            style={{
              animationDelay: `${index * 75}ms`,
              animationFillMode: "both",
              animationDuration: "400ms",
            }}
          >
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 text-primary group-hover:bg-primary/15 transition-colors duration-200">
              <action.icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground leading-tight">
                {action.label}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {action.hint}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
