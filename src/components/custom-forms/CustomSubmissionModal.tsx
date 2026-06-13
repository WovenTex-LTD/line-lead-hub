import { useEffect, useState, type ReactNode } from "react";
import { getSubmission } from "@/hooks/useCustomForms";
import type { CustomFormSubmission, PoDetail } from "@/types/custom-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Crosshair, Shirt } from "lucide-react";

function HeaderField({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

/** Custom slot-form submission shown in the SAME layout as the production
 *  end-of-day detail: header bar (date/line/buyer/style/PO/qty/ex-factory), a left
 *  column reserved for the morning target, and a green "End of Day Actual" column —
 *  but the actual column lists the FORM's own fields. */
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

  // Pull the line/PO pickers and the PO snapshot out for the header; everything else
  // becomes the "actual" field list.
  const fields = sub?.fields_snapshot ?? [];
  const lineField = fields.find((f) => f.field_type === "dynamic_select" && f.source_key === "lines");
  const poField = fields.find((f) => f.field_type === "po_select");
  const poDetail = sub
    ? (Object.entries(sub.values).find(([k, v]) => k.startsWith("__po:") && v && typeof v === "object")?.[1] as PoDetail | undefined)
    : undefined;

  const lineName = lineField ? (sub?.values[lineField.key] as string | undefined) : undefined;
  const poNumber = poDetail?.po_number ?? (poField ? (sub?.values[poField.key] as string | undefined) : undefined);

  // Actual-column fields = the form's fields minus the line/PO pickers (shown in header).
  const actualFields = fields.filter((f) => f !== lineField && f !== poField);

  return (
    <Dialog open={submissionId !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        {loading && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
        {!loading && !sub && <div className="p-6"><p className="text-sm text-muted-foreground">Submission not found.</p></div>}
        {!loading && sub && (
          <>
            {/* Header bar */}
            <div className="px-6 pt-6 pb-4 border-b border-border/40">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm shadow-blue-500/20 flex items-center justify-center">
                    <Shirt className="h-4 w-4 text-white" />
                  </div>
                  {title || "Submission"}
                </DialogTitle>
              </DialogHeader>
              <div className="flex flex-wrap items-start gap-x-5 gap-y-1 mt-3 text-sm">
                <HeaderField label="Date" value={new Date(sub.created_at).toLocaleDateString()} />
                <HeaderField label="Line" value={lineName} />
                <HeaderField label="Buyer" value={poDetail?.buyer} />
                <HeaderField label="Style" value={poDetail?.style} />
                <HeaderField label="PO Number" value={poNumber} />
                <HeaderField label="Order Qty" value={poDetail?.order_qty ?? undefined} />
                <HeaderField label="Item" value={poDetail?.item} />
              </div>
            </div>

            <div className="px-6 py-5">
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                {/* Left: morning target — reserved space (shows when a target is submitted) */}
                <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-4 flex flex-col items-center justify-center text-center min-h-[200px]">
                  <Crosshair className="h-8 w-8 mb-2 opacity-40 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Morning target not submitted</p>
                </div>

                {/* Right: end of day actual = the form's own fields */}
                <div className="rounded-lg border-l-2 border-l-emerald-500 border border-border/50 bg-emerald-50/30 dark:bg-emerald-950/10 p-4 space-y-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                    <Shirt className="h-3.5 w-3.5" />
                    End of Day Actual
                  </h4>
                  <div className="rounded-md border border-border/40 divide-y divide-border/40 bg-background/40">
                    {actualFields.map((f) => {
                      const v = sub.values[f.key];
                      const display = f.field_type === "checkbox"
                        ? (v ? "Yes" : "No")
                        : (v === undefined || v === null || v === "" ? "—" : String(v));
                      return (
                        <div key={f.key} className="flex items-baseline justify-between gap-4 px-3 py-2">
                          <span className="text-xs text-muted-foreground">{f.label}</span>
                          <span className="text-sm font-semibold text-right">{display}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground pt-1">Submitted: {new Date(sub.created_at).toLocaleString()}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
