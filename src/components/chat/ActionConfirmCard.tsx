import { useState } from "react";
import { Check, X, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PendingAction } from "@/hooks/useChat";

interface Props {
  action: PendingAction;
  onRun: (action: PendingAction) => Promise<{ ok: boolean; summary?: string; error?: string }>;
}

type State = "pending" | "executing" | "done" | "cancelled" | "error";

export function ActionConfirmCard({ action, onRun }: Props) {
  const [state, setState] = useState<State>("pending");
  const [message, setMessage] = useState<string>("");

  const approve = async () => {
    setState("executing");
    const res = await onRun(action);
    if (res.ok) { setState("done"); setMessage(res.summary || "Done"); }
    else { setState("error"); setMessage(res.error || "The change could not be applied."); }
  };

  return (
    <div className="mt-2 w-full rounded-xl border border-primary/30 bg-card p-3 shadow-premium-sm">
      <p className="text-sm text-foreground leading-snug">{action.humanSummary}</p>
      {state === "pending" && (
        <div className="mt-2.5 flex items-center gap-2">
          <Button size="sm" className="h-8 gap-1 bg-gradient-to-br from-primary to-primary/80" onClick={approve}>
            <Check className="h-3.5 w-3.5" /> Approve
          </Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-muted-foreground" onClick={() => setState("cancelled")}>
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
        </div>
      )}
      {state === "executing" && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Applying…</p>
      )}
      {state === "done" && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"><Check className="h-3.5 w-3.5" /> {message}</p>
      )}
      {state === "cancelled" && <p className="mt-2 text-xs text-muted-foreground">Cancelled — nothing was changed.</p>}
      {state === "error" && (
        <div className="mt-2">
          <p className="flex items-center gap-1.5 text-xs text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> {message}</p>
          <Button size="sm" variant="ghost" className="mt-1 h-7 text-xs" onClick={approve}>Retry</Button>
        </div>
      )}
    </div>
  );
}
