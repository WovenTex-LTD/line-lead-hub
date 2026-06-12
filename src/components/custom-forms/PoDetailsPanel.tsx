import type { PoDetail } from "@/types/custom-form";

/** Read-only panel of a selected PO's details. Rendered under a po_select field
 *  once a PO is chosen, and in the submission view from the stored snapshot —
 *  mirroring how the default production forms surface PO context. */
export function PoDetailsPanel({ detail }: { detail: PoDetail }) {
  const rows: [string, unknown][] = [
    ["Buyer", detail.buyer],
    ["Style", detail.style],
    ["Item", detail.item],
    ["Color", detail.color],
    ["Order Qty", detail.order_qty],
    ["Ex-Factory", detail.planned_ex_factory],
    ["Status", detail.status],
  ];
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (shown.length === 0) return null;

  return (
    <div className="mt-2 rounded-lg border border-border/60 bg-muted/30 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        PO {detail.po_number} · details (read-only)
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {shown.map(([label, v]) => (
          <div key={label} className="flex flex-col">
            <span className="text-[11px] text-muted-foreground">{label}</span>
            <span className="text-sm">{String(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
