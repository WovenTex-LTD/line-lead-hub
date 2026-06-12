import { useState } from "react";
import { useCustomSubmissions } from "@/hooks/useCustomForms";
import { CustomSubmissionModal } from "./CustomSubmissionModal";
import { ChevronRight } from "lucide-react";

/** Custom-form submissions for one department, rendered as rows that show the form's
 *  OWN field values and open a detail driven by the form (only its fields, nothing the
 *  form doesn't have). Sits in the same submission area as the default submissions.
 *  Hidden when there are none. */
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
    <div className="space-y-2">
      {mine.map((e) => (
        <button
          key={e.id}
          onClick={() => { setOpenId(e.id); setOpenTitle(e.formName); }}
          className="w-full flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-left shadow-sm transition hover:bg-accent/40"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold truncate">{e.formName}</p>
              <span className="text-[11px] text-muted-foreground shrink-0">{new Date(e.createdAt).toLocaleDateString()}</span>
            </div>
            {e.summary && <p className="text-xs text-muted-foreground truncate mt-0.5">{e.summary}</p>}
            <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5">{e.submitterName ?? "—"}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
        </button>
      ))}
      <CustomSubmissionModal submissionId={openId} title={openTitle} onClose={() => setOpenId(null)} />
    </div>
  );
}
