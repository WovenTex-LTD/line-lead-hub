import { useState } from "react";
import { useCustomSubmissions } from "@/hooks/useCustomForms";
import { CustomSubmissionModal } from "./CustomSubmissionModal";
import { ChevronRight, ClipboardList } from "lucide-react";

/** Lists the custom-form submissions for one department inline within that department's
 *  area of the production pages, so they sit alongside the default submissions. Each row
 *  opens a detail that pulls its fields from the form. Hidden when there are none. */
export function DepartmentCustomSubmissions({ role, scope = "all" }: {
  role: string;
  scope?: "today" | "week" | "all";
}) {
  const { entries, loading } = useCustomSubmissions(scope);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openTitle, setOpenTitle] = useState<string>("");

  const mine = role === "all" ? entries : entries.filter((e) => (e.targetRole ?? "worker") === role);
  if (loading || mine.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {mine.map((e) => (
        <button
          key={e.id}
          onClick={() => { setOpenId(e.id); setOpenTitle(e.formName); }}
          className="w-full flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-card px-3 py-2.5 text-left transition hover:bg-accent/40"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <ClipboardList className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{e.formName}</p>
              <p className="text-xs text-muted-foreground truncate">
                {e.submitterName ?? "—"} · {new Date(e.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
        </button>
      ))}
      <CustomSubmissionModal submissionId={openId} title={openTitle} onClose={() => setOpenId(null)} />
    </div>
  );
}
