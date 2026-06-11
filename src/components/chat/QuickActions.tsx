import { TrendingUp, AlertTriangle, Activity, ChevronRight } from "lucide-react";
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

  return (
    <div className="mx-auto flex w-full max-w-[320px] flex-col gap-2">
      <p className="px-1 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
        {language === "bn" ? "শুরু করুন" : "Try asking"}
      </p>
      {actions.map((action, index) => (
        <button
          key={index}
          onClick={() => onSelect(action.prompt)}
          className={cn(
            "group flex items-center gap-3 rounded-xl border border-border/70 bg-card px-3 py-2.5 text-left",
            "shadow-premium-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-premium-md",
            "animate-fade-in-up"
          )}
          style={{ animationDelay: `${index * 70}ms`, animationFillMode: "both" }}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-primary/10 text-primary transition-colors duration-200 group-hover:bg-primary/15">
            <action.icon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium leading-tight text-foreground">{action.label}</span>
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{action.hint}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
        </button>
      ))}
    </div>
  );
}
