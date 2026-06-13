import { useEffect, useState, type ReactNode } from "react";
import { getSubmission } from "@/hooks/useCustomForms";
import { supabase } from "@/integrations/supabase/client";
import type { CustomFormSubmission, CustomFormField } from "@/types/custom-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Crosshair, Shirt } from "lucide-react";

export interface SubmissionLookup {
  factoryId: string;
  lineId: string;
  workOrderId: string;
  productionDate: string;
  targetTable: string;  // e.g. "sewing_targets"
  actualTable: string;  // e.g. "sewing_actuals"
}

/** Shared by every department's submission view: when the opened production row came
 *  from a custom form, return the lookup so the view renders the form-driven detail.
 *  `ready` gates a loader so the typed view never flashes first. */
export function useCustomSubmissionBranch(params: {
  open: boolean; actualId?: string | null; targetId?: string | null; targetTable: string; actualTable: string;
}): { lookup: SubmissionLookup | null; ready: boolean } {
  const { open, actualId, targetId, targetTable, actualTable } = params;
  const [lookup, setLookup] = useState<SubmissionLookup | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!open) { setLookup(null); setReady(false); return; }
    setReady(false);
    (async () => {
      const sides: [string, string][] = [];
      if (actualId) sides.push([actualTable, actualId]);
      if (targetId) sides.push([targetTable, targetId]);
      let key: SubmissionLookup | null = null;
      let isCustom = false;
      for (const [tbl, id] of sides) {
        const { data } = await supabase.from(tbl as never).select("factory_id, line_id, work_order_id, production_date, custom_data").eq("id", id).maybeSingle();
        const row = data as { factory_id?: string; line_id?: string; work_order_id?: string; production_date?: string; custom_data?: { custom_submission_id?: string } } | null;
        if (row?.factory_id && row.line_id && row.work_order_id && row.production_date) {
          key = { factoryId: row.factory_id, lineId: row.line_id, workOrderId: row.work_order_id, productionDate: row.production_date, targetTable, actualTable };
        }
        if (row?.custom_data?.custom_submission_id) isCustom = true;
      }
      if (!cancelled) { setLookup(isCustom ? key : null); setReady(true); }
    })();
    return () => { cancelled = true; };
  }, [open, actualId, targetId, targetTable, actualTable]);
  return { lookup, ready };
}

// Typed columns to show when a side is a DEFAULT (non-custom) production row.
const TYPED_FIELDS: Record<string, { col: string; label: string; suffix?: string }[]> = {
  sewing_targets: [
    { col: "per_hour_target", label: "Per Hour Target", suffix: " /hr" },
    { col: "manpower_planned", label: "Manpower Planned" },
    { col: "hours_planned", label: "Hours Planned" },
    { col: "ot_hours_planned", label: "OT Hours Planned" },
  ],
  sewing_actuals: [
    { col: "good_today", label: "Good Output" },
    { col: "reject_today", label: "Reject" },
    { col: "rework_today", label: "Rework" },
    { col: "manpower_actual", label: "Manpower Actual" },
    { col: "hours_actual", label: "Hours Actual" },
    { col: "ot_hours_actual", label: "OT Hours Actual" },
  ],
  cutting_targets: [
    { col: "day_cutting", label: "Day Cutting" }, { col: "day_input", label: "Day Input" },
    { col: "man_power", label: "Manpower" }, { col: "hours_planned", label: "Hours Planned" },
  ],
  cutting_actuals: [
    { col: "day_cutting", label: "Day Cutting" }, { col: "day_input", label: "Day Input" },
    { col: "man_power", label: "Manpower" }, { col: "hours_actual", label: "Hours Actual" },
  ],
  finishing_targets: [
    { col: "per_hour_target", label: "Per Hour Target", suffix: " /hr" },
    { col: "m_power_planned", label: "Manpower Planned" }, { col: "day_hour_planned", label: "Hours Planned" },
  ],
  finishing_actuals: [
    { col: "day_qc_pass", label: "QC Pass" }, { col: "day_poly", label: "Poly" }, { col: "day_carton", label: "Carton" },
    { col: "m_power_actual", label: "Manpower Actual" }, { col: "day_hour_actual", label: "Hours Actual" },
  ],
};

const SELECT = "*, lines(line_id, name), work_orders(po_number, buyer, style, item, order_qty, planned_ex_factory)";

interface SideData { row: Record<string, unknown> | null; custom: CustomFormSubmission | null; }

interface CompareRow { label: string; target: number; actual: number; diff: number; }

/** Pair the target and actual custom submissions' numeric fields by label (matching
 *  "Target X" to "X") and compute the difference (actual − target). */
function buildComparison(target: CustomFormSubmission, actual: CustomFormSubmission): CompareRow[] {
  const norm = (s: string) => s.toLowerCase().replace(/^target\s+/, "").trim();
  const targetByLabel = new Map<string, unknown>();
  for (const f of target.fields_snapshot) targetByLabel.set(norm(f.label), target.values[f.key]);
  const rows: CompareRow[] = [];
  for (const af of actual.fields_snapshot) {
    if (af.field_type === "po_select" || (af.field_type === "dynamic_select" && af.source_key === "lines")) continue;
    const key = norm(af.label);
    if (!targetByLabel.has(key)) continue;
    const an = Number(actual.values[af.key]);
    const tn = Number(targetByLabel.get(key));
    if (!Number.isFinite(an) || !Number.isFinite(tn)) continue;
    rows.push({ label: af.label, target: tn, actual: an, diff: Math.round((an - tn) * 100) / 100 });
  }
  return rows;
}

function HeaderField({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return <div><p className="text-[11px] text-muted-foreground mb-0.5">{label}</p><p className="font-semibold">{value}</p></div>;
}

function FieldRows({ fields, values }: { fields: CustomFormField[]; values: Record<string, unknown> }) {
  const shown = fields.filter((f) => !(f.field_type === "dynamic_select" && f.source_key === "lines") && f.field_type !== "po_select");
  return (
    <div className="rounded-md border border-border/40 divide-y divide-border/40 bg-background/40">
      {shown.map((f) => {
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

function TypedRows({ table, row }: { table: string; row: Record<string, unknown> }) {
  const cols = TYPED_FIELDS[table] ?? [];
  return (
    <div className="grid grid-cols-2 gap-3">
      {cols.map(({ col, label, suffix }) => {
        const v = row[col];
        if (v === null || v === undefined) return null;
        return <div key={col}><p className="text-[11px] text-muted-foreground mb-0.5">{label}</p><p className="text-sm font-semibold">{String(v)}{suffix ?? ""}</p></div>;
      })}
    </div>
  );
}

/** The combined form-driven body (header + target/actual columns) for one line/PO/day.
 *  Rendered inside a DialogContent — by CustomSubmissionModal, or by the shared
 *  SewingSubmissionView when it detects a custom row, so every page follows the same rule. */
export function CustomSubmissionDetail({ title, lookup }: { title?: string; lookup: SubmissionLookup | null }) {
  const open = lookup !== null;
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState<SideData>({ row: null, custom: null });
  const [actual, setActual] = useState<SideData>({ row: null, custom: null });

  useEffect(() => {
    let cancelled = false;
    if (!open || !lookup) { setTarget({ row: null, custom: null }); setActual({ row: null, custom: null }); return; }
    setLoading(true);
    (async () => {
      const fetchSide = async (table: string): Promise<SideData> => {
        const { data } = await supabase.from(table as never).select(SELECT)
          .eq("factory_id", lookup.factoryId).eq("line_id", lookup.lineId)
          .eq("work_order_id", lookup.workOrderId).eq("production_date", lookup.productionDate)
          .maybeSingle();
        const row = data as Record<string, unknown> | null;
        const cid = (row?.custom_data as { custom_submission_id?: string } | null)?.custom_submission_id;
        const custom = cid ? await getSubmission(cid) : null;
        return { row, custom };
      };
      const [t, a] = await Promise.all([fetchSide(lookup.targetTable), fetchSide(lookup.actualTable)]);
      if (!cancelled) { setTarget(t); setActual(a); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [open, lookup]);

  // Header from whichever side exists (prefer actual).
  const head = (actual.row || target.row) as Record<string, unknown> | null;
  const lines = head?.lines as { name?: string; line_id?: string } | undefined;
  const wo = head?.work_orders as { po_number?: string; buyer?: string; style?: string; item?: string; order_qty?: number; planned_ex_factory?: string } | undefined;

  const targetTotal = (() => {
    const r = target.row; if (!r) return null;
    const tt = Number(r.target_total_planned); if (Number.isFinite(tt) && tt > 0) return tt;
    const ph = Number(r.per_hour_target), h = Number(r.hours_planned);
    if (Number.isFinite(ph) && Number.isFinite(h) && h > 0) return Math.round(ph * h);
    return null;
  })();
  const actualOutput = actual.row ? Number(actual.row.good_today) : null;
  const achievement = (actualOutput != null && Number.isFinite(actualOutput) && targetTotal != null && targetTotal > 0)
    ? Math.round((actualOutput / targetTotal) * 1000) / 10 : null;

  const renderSide = (kind: "target" | "actual", side: SideData, table: string) => {
    if (side.custom) return <FieldRows fields={side.custom.fields_snapshot} values={side.custom.values} />;
    if (side.row) return <TypedRows table={table} row={side.row} />;
    return (
      <div className="flex flex-col items-center justify-center text-center min-h-[140px]">
        <Crosshair className="h-8 w-8 mb-2 opacity-40 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{kind === "target" ? "Morning target not submitted" : "End of day not submitted"}</p>
      </div>
    );
  };

  const hasTarget = !!(target.row || target.custom);
  const hasActual = !!(actual.row || actual.custom);
  const comparison = (target.custom && actual.custom) ? buildComparison(target.custom, actual.custom) : [];

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!hasTarget && !hasActual) return <div className="p-6"><p className="text-sm text-muted-foreground">Nothing to show.</p></div>;
  return (
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
          <HeaderField label="Date" value={lookup ? new Date(lookup.productionDate).toLocaleDateString() : undefined} />
          <HeaderField label="Line" value={lines?.name || lines?.line_id} />
          <HeaderField label="Buyer" value={wo?.buyer} />
          <HeaderField label="Style" value={wo?.style} />
          <HeaderField label="PO Number" value={wo?.po_number} />
          <HeaderField label="Order Qty" value={wo?.order_qty ?? undefined} />
          {achievement != null && <HeaderField label="Achievement" value={`${achievement}%`} />}
        </div>
      </div>
      <div className="px-6 py-5">
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          <div className={hasTarget
            ? "rounded-lg border-l-2 border-l-blue-500 border border-border/50 bg-blue-50/30 dark:bg-blue-950/10 p-4 space-y-3"
            : "rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-4 min-h-[180px] flex items-center justify-center"}>
            {hasTarget && <h4 className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-400 flex items-center gap-2"><Crosshair className="h-3.5 w-3.5" /> Morning Target</h4>}
            {renderSide("target", target, lookup!.targetTable)}
          </div>
          <div className={hasActual
            ? "rounded-lg border-l-2 border-l-emerald-500 border border-border/50 bg-emerald-50/30 dark:bg-emerald-950/10 p-4 space-y-3"
            : "rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-4 min-h-[180px] flex items-center justify-center"}>
            {hasActual && <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-2"><Shirt className="h-3.5 w-3.5" /> End of Day Actual</h4>}
            {renderSide("actual", actual, lookup!.actualTable)}
          </div>
        </div>

        {comparison.length > 0 && (
          <div className="mt-5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Target vs Actual Comparison</h4>
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="text-left font-medium px-3 py-2">Field</th>
                    <th className="text-right font-medium px-3 py-2">Target</th>
                    <th className="text-right font-medium px-3 py-2">Actual</th>
                    <th className="text-right font-medium px-3 py-2">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((r) => (
                    <tr key={r.label} className="border-t border-border/40">
                      <td className="px-3 py-2">{r.label}</td>
                      <td className="text-right px-3 py-2 font-mono text-muted-foreground">{r.target}</td>
                      <td className="text-right px-3 py-2 font-mono">{r.actual}</td>
                      <td className={`text-right px-3 py-2 font-mono font-semibold ${r.diff > 0 ? "text-emerald-600 dark:text-emerald-400" : r.diff < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                        {r.diff > 0 ? "+" : ""}{r.diff}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/** Standalone modal wrapper around the form-driven detail. */
export function CustomSubmissionModal({ open, onClose, title, lookup }: {
  open: boolean;
  onClose: () => void;
  title?: string;
  lookup: SubmissionLookup | null;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        {open && <CustomSubmissionDetail title={title} lookup={lookup} />}
      </DialogContent>
    </Dialog>
  );
}
