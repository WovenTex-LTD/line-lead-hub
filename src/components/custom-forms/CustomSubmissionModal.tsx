import { useEffect, useState } from "react";
import { getSubmission } from "@/hooks/useCustomForms";
import type { CustomFormSubmission, PoDetail } from "@/types/custom-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PoDetailsPanel } from "./PoDetailsPanel";
import { Loader2 } from "lucide-react";

/** Read-only submission detail that PULLS its fields from the form (the submission's
 *  own fields_snapshot + values) — it adapts to whatever the form contains, rather
 *  than a fixed production layout. */
export function CustomSubmissionModal({ submissionId, title, onClose }: {
  submissionId: string | null;
  title?: string;
  onClose: () => void;
}) {
  const [sub, setSub] = useState<CustomFormSubmission | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!submissionId) { setSub(null); return; }
    setLoading(true);
    (async () => {
      const result = await getSubmission(submissionId);
      if (!cancelled) { setSub(result); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [submissionId]);

  const poSnapshots = sub
    ? Object.entries(sub.values).filter(([k, v]) => k.startsWith("__po:") && v && typeof v === "object")
    : [];

  return (
    <Dialog open={submissionId !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title || "Submission"}</DialogTitle>
        </DialogHeader>
        {loading && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
        {!loading && !sub && <p className="text-sm text-muted-foreground">Submission not found.</p>}
        {!loading && sub && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Submitted {new Date(sub.created_at).toLocaleString()}</p>
            <div className="rounded-lg border border-border/50 divide-y divide-border/40">
              {sub.fields_snapshot.map((f) => {
                const v = sub.values[f.key];
                const display = f.field_type === "checkbox"
                  ? (v ? "Yes" : "No")
                  : (v === undefined || v === null || v === "" ? "—" : String(v));
                return (
                  <div key={f.key} className="flex items-baseline justify-between gap-4 px-3 py-2">
                    <span className="text-xs text-muted-foreground shrink-0">{f.label}</span>
                    <span className="text-sm font-medium text-right">{display}</span>
                  </div>
                );
              })}
            </div>
            {poSnapshots.map(([k, v]) => (
              <PoDetailsPanel key={k} detail={v as PoDetail} />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
