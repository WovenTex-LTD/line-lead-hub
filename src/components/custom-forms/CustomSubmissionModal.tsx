import { useEffect, useState, type ReactNode } from "react";
import { getSubmission } from "@/hooks/useCustomForms";
import { supabase } from "@/integrations/supabase/client";
import type { CustomFormSubmission, CustomFormField, PoDetail } from "@/types/custom-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Crosshair, Shirt } from "lucide-react";

export interface TargetLookup {
  table: string;        // production target table, e.g. "sewing_targets"
  factoryId: string;
  lineId: string;
  workOrderId: string;
  productionDate: string;
}

function HeaderField({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

/** A label/value row list — used for a custom form's own fields in either column. */
function FieldRows({ fields, values }: { fields: CustomFormField[]; values: Record<string, unknown> }) {
  return (
    <div className="rounded-md border border-border/40 divide-y divide-border/40 bg-background/40">
      {fields.map((f) => {
        const v = values[f.key];
        const display = f.field_type === "checkbox" ? (v ? "Yes" : "No") : (v === undefined || v === null || v === "" ? "—" : String(v));
        return (
          <div key={f.key} className="flex items-baseline justify-between gap-4 px-3 py-2">
            <span className="text-xs text-muted-foreground">{f.label}</span>
            <span className="text-sm font-semibold text-right">{display}</span>
          </div>
        );
      })}
    </div>
  );
}

// Default target columns to show per production target table.
const TARGET_FIELDS: Record<string, { col: string; label: string; suffix?: string }[]> = {
  sewing_targets: [
    { col: "per_hour_target", label: "Per Hour Target", suffix: " /hr" },
    { col: "target_total_planned", label: "Target Total Output" },
    { col: "manpower_planned", label: "Manpower Planned" },
    { col: "hours_planned", label: "Hours Planned" },
    { col: "ot_hours_planned", label: "OT Hours Planned" },
  ],
  cutting_targets: [
    { col: "day_cutting", label: "Day Cutting" },
    { col: "day_input", label: "Day Input" },
    { col: "man_power", label: "Manpower" },
    { col: "hours_planned", label: "Hours Planned" },
  ],
  finishing_targets: [
    { col: "per_hour_target", label: "Per Hour Target", suffix: " /hr" },
    { col: "m_power_planned", label: "Manpower Planned" },
    { col: "day_hour_planned", label: "Hours Planned" },
  ],
};

/** Custom slot-form submission shown in the SAME layout as the production end-of-day
 *  detail: header bar, a left column for the morning target (the matching target —
 *  custom form-driven or default), and a green "End of Day Actual" column listing the
 *  form's own fields, with a target-vs-actual achievement when both are available. */
export function CustomSubmissionModal({ submissionId, title, onClose, targetLookup, actualOutput }: {
  submissionId: string | null;
  title?: string;
  onClose: () => void;
  targetLookup?: TargetLookup | null;
  actualOutput?: number | null;
}) {
  const [sub, setSub] = useState<CustomFormSubmission | null>(null);
  const [loading, setLoading] = useState(false);
  const [targetRow, setTargetRow] = useState<Record<string, unknown> | null>(null);
  const [targetCustom, setTargetCustom] = useState<CustomFormSubmission | null>(null);
  const [targetLoading, setTargetLoading] = useState(false);

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

  // Look up the morning target for the same line/PO/day.
  useEffect(() => {
    let cancelled = false;
    setTargetRow(null); setTargetCustom(null);
    if (!submissionId || !targetLookup) return;
    setTargetLoading(true);
    (async () => {
      const { data } = await supabase
        .from(targetLookup.table as never).select("*")
        .eq("factory_id", targetLookup.factoryId)
        .eq("line_id", targetLookup.lineId)
        .eq("work_order_id", targetLookup.workOrderId)
        .eq("production_date", targetLookup.productionDate)
        .maybeSingle();
      if (cancelled) return;
      const row = data as Record<string, unknown> | null;
      setTargetRow(row);
      const customId = (row?.custom_data as { custom_submission_id?: string } | null)?.custom_submission_id;
      if (customId) {
        const cs = await getSubmission(customId);
        if (!cancelled) setTargetCustom(cs);
      }
      if (!cancelled) setTargetLoading(false);
    })();
    return () => { cancelled = true; };
  }, [submissionId, targetLookup]);

  const fields = sub?.fields_snapshot ?? [];
  const lineField = fields.find((f) => f.field_type === "dynamic_select" && f.source_key === "lines");
  const poField = fields.find((f) => f.field_type === "po_select");
  const poDetail = sub
    ? (Object.entries(sub.values).find(([k, v]) => k.startsWith("__po:") && v && typeof v === "object")?.[1] as PoDetail | undefined)
    : undefined;
  const lineName = lineField ? (sub?.values[lineField.key] as string | undefined) : undefined;
  const poNumber = poDetail?.po_number ?? (poField ? (sub?.values[poField.key] as string | undefined) : undefined);
  const actualFields = fields.filter((f) => f !== lineField && f !== poField);

  // Target-vs-actual achievement (when both an output and a target total are present).
  const targetTotal = (() => {
    if (!targetRow) return null;
    const tt = Number(targetRow.target_total_planned);
    if (Number.isFinite(tt) && tt > 0) return tt;
    const ph = Number(targetRow.per_hour_target), hrs = Number(targetRow.hours_planned);
    if (Number.isFinite(ph) && Number.isFinite(hrs) && hrs > 0) return Math.round(ph * hrs);
    return null;
  })();
  const achievement = (actualOutput != null && targetTotal != null && targetTotal > 0)
    ? Math.round((actualOutput / targetTotal) * 1000) / 10
    : null;

  // Target column inner content: custom form-driven, default fields, or placeholder.
  const renderTargetInner = () => {
    if (targetLoading) return <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
    if (targetCustom) {
      const tFields = targetCustom.fields_snapshot.filter(
        (f) => !(f.field_type === "dynamic_select" && f.source_key === "lines") && f.field_type !== "po_select");
      return <FieldRows fields={tFields} values={targetCustom.values} />;
    }
    if (targetRow) {
      const cols = TARGET_FIELDS[targetLookup!.table] ?? [];
      return (
        <div className="grid grid-cols-2 gap-3">
          {cols.map(({ col, label, suffix }) => {
            const v = col === "target_total_planned" && targetTotal != null ? targetTotal : targetRow[col];
            if (v === null || v === undefined) return null;
            return (
              <div key={col}>
                <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
                <p className="text-sm font-semibold">{String(v)}{suffix ?? ""}</p>
              </div>
            );
          })}
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center text-center min-h-[160px]">
        <Crosshair className="h-8 w-8 mb-2 opacity-40 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Morning target not submitted</p>
      </div>
    );
  };

  const hasTarget = !!targetRow;

  return (
    <Dialog open={submissionId !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        {loading && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
        {!loading && !sub && <div className="p-6"><p className="text-sm text-muted-foreground">Submission not found.</p></div>}
        {!loading && sub && (
          <>
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
                {achievement != null && <HeaderField label="Achievement" value={`${achievement}%`} />}
              </div>
            </div>

            <div className="px-6 py-5">
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                {/* Left: morning target */}
                <div className={hasTarget || targetCustom
                  ? "rounded-lg border-l-2 border-l-blue-500 border border-border/50 bg-blue-50/30 dark:bg-blue-950/10 p-4 space-y-3"
                  : "rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-4 min-h-[200px] flex items-center justify-center"}>
                  {(hasTarget || targetCustom) && (
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-400 flex items-center gap-2">
                      <Crosshair className="h-3.5 w-3.5" /> Morning Target
                    </h4>
                  )}
                  {renderTargetInner()}
                </div>

                {/* Right: end of day actual = the form's own fields */}
                <div className="rounded-lg border-l-2 border-l-emerald-500 border border-border/50 bg-emerald-50/30 dark:bg-emerald-950/10 p-4 space-y-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                    <Shirt className="h-3.5 w-3.5" /> End of Day Actual
                  </h4>
                  <FieldRows fields={actualFields} values={sub.values} />
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
