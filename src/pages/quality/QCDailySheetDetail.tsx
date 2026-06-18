import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ListChecks,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  MinusCircle,
  Send,
  Save,
  Stamp,
  RotateCcw,
  Trash2,
  Calendar,
  User,
  Package,
  Layers,
  Truck,
  Target,
  Building2,
  Tag,
  Rows3,
  Pencil,
  Lock,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { formatShortDate } from "@/lib/date-utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  useQCDailySheet,
  requestDailyShiftSignoff,
  signOffDailySheet,
  reopenDailySheet,
  deleteDailySheet,
  type DailySheetItem,
  type DailySheetStatus,
} from "@/hooks/useQCDailySheets";
import { DailyItemRow } from "@/components/quality/DailyItemRow";
import { SECTION_PALETTE } from "@/components/quality/section-palette";
import { DetailCell } from "@/components/quality/detail-cell";
import { downloadSingleDailySheetPDF } from "@/lib/qc-pdf";

const STATUS_BADGE: Record<DailySheetStatus, { label: string; cls: string }> = {
  in_progress: {
    label: "In Progress",
    cls: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  },
  awaiting_signoff: {
    label: "Awaiting Sign-off",
    cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  },
  signed_off: {
    label: "Signed Off",
    cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  },
};

export default function QCDailySheetDetail() {
  const { sheetId } = useParams<{ sheetId: string }>();
  const navigate = useNavigate();
  const { user, isAdminOrHigher, factory } = useAuth();
  const { data, loading, error, refetch } = useQCDailySheet(sheetId);
  const [items, setItems] = useState<DailySheetItem[] | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  // Admins land in view mode and explicitly toggle edit. QC inspectors are
  // always editable until the sheet is signed off.
  const [editMode, setEditMode] = useState(false);

  // Reset optimistic local state whenever the server data changes (mount, refetch, route swap).
  useEffect(() => {
    setItems(data?.items ?? null);
  }, [data?.items]);

  const currentItems = items ?? data?.items ?? [];

  const grouped = useMemo(() => {
    const map = new Map<string, { order: number; items: DailySheetItem[] }>();
    for (const it of currentItems) {
      const g = map.get(it.section_label) ?? { order: it.section_order, items: [] };
      g.items.push(it);
      map.set(it.section_label, g);
    }
    return Array.from(map.entries())
      .map(([label, g]) => ({ label, order: g.order, items: g.items }))
      .sort((a, b) => a.order - b.order);
  }, [currentItems]);

  const counts = useMemo(() => {
    const c = { pass: 0, fail: 0, na: 0, pending: 0, total: 0 };
    for (const i of currentItems) {
      c.total += 1;
      if (i.status === "pass") c.pass += 1;
      else if (i.status === "fail") c.fail += 1;
      else if (i.status === "na") c.na += 1;
      else c.pending += 1;
    }
    return c;
  }, [currentItems]);

  const progressPct =
    counts.total > 0 ? Math.round(((counts.pass + counts.na) / counts.total) * 100) : 0;

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-muted-foreground mb-4">{error ?? "Sheet not found"}</p>
        <Button variant="outline" onClick={() => navigate(isAdminOrHigher() ? "/quality/admin/sheets" : "/quality/daily-sheet")}>
          Back to list
        </Button>
      </div>
    );
  }

  const statusMeta = STATUS_BADGE[data.status];
  // Admins default to view-only on every sheet — they're reviewers, not
  // submitters. They explicitly toggle Edit to make changes (the DB trigger
  // qc_block_daily_item_when_locked permits admin writes regardless of status).
  // QC inspectors stay editable until the sheet is signed off.
  const adminViewing = isAdminOrHigher();
  const isLocked = adminViewing
    ? !editMode
    : data.status === "signed_off";

  async function handleRequestSignoff() {
    if (!user?.id || !data) return;
    setActionLoading(true);
    try {
      await requestDailyShiftSignoff(data.id, user.id);
      toast.success("Sign-off requested");
      refetch();
    } catch (err: any) {
      toast.error(err?.message || "Failed");
    } finally {
      setActionLoading(false);
    }
  }
  async function handleSignOff() {
    if (!user?.id || !data) return;
    setActionLoading(true);
    try {
      await signOffDailySheet(data.id, user.id);
      toast.success("Sheet signed off");
      refetch();
    } catch (err: any) {
      toast.error(err?.message || "Failed");
    } finally {
      setActionLoading(false);
    }
  }
  async function handleReopen() {
    if (!user?.id || !data) return;
    setActionLoading(true);
    try {
      await reopenDailySheet(data.id, user.id);
      toast.success("Sheet reopened");
      refetch();
    } catch (err: any) {
      toast.error(err?.message || "Failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete() {
    if (!data) return;
    setActionLoading(true);
    try {
      await deleteDailySheet(data.id);
      toast.success("Sheet deleted");
      navigate(isAdminOrHigher() ? "/quality/admin/sheets" : "/quality/daily-sheet");
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete");
    } finally {
      setActionLoading(false);
      setConfirmDeleteOpen(false);
    }
  }

  async function handleDownloadPDF() {
    if (!data) return;
    setActionLoading(true);
    try {
      await downloadSingleDailySheetPDF(data.id, {
        factoryName: factory?.name ?? "Factory",
        factoryTimezone: factory?.timezone ?? "Asia/Dhaka",
      });
    } catch (err: any) {
      toast.error(err?.message || "Failed to generate PDF");
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-5">
      <div>
        <Link
          to={isAdminOrHigher() ? "/quality/admin/sheets" : "/quality/daily-sheet"}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          {isAdminOrHigher() ? "Back to sheet review" : "Back to daily sheets"}
        </Link>
      </div>

      {/* ── Action bar ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {/* Save & close — entries save automatically as you go; this just makes
            that obvious and returns to the list. Shown unless already signed off. */}
        {data.status !== "signed_off" && (
          <Button
            size="sm"
            className="gap-1.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-md shadow-blue-500/25"
            onClick={() => {
              toast.success("Sheet saved");
              navigate(isAdminOrHigher() ? "/quality/admin/sheets" : "/quality/daily-sheet");
            }}
          >
            <Save className="h-3.5 w-3.5" />
            Save &amp; close
          </Button>
        )}
        {/* Download — only on signed-off records; available to anyone viewing. */}
        {data.status === "signed_off" && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-blue-700 border-blue-300/60 hover:bg-blue-500/10 dark:text-blue-300"
            onClick={handleDownloadPDF}
            disabled={actionLoading}
          >
            <Download className="h-3.5 w-3.5" />
            Download PDF
          </Button>
        )}
        {/* Request sign-off is a QC-inspector action only — admins are approvers, not submitters. */}
        {data.status === "in_progress" && !adminViewing && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={handleRequestSignoff}
            disabled={actionLoading || counts.pending > 0}
            title={counts.pending > 0 ? "Resolve all pending items first" : ""}
          >
            <Send className="h-3.5 w-3.5" />
            Request sign-off
          </Button>
        )}
        {data.status === "awaiting_signoff" && adminViewing && (
          <Button size="sm" className="gap-1.5" onClick={handleSignOff} disabled={actionLoading}>
            <Stamp className="h-3.5 w-3.5" />
            Sign off
          </Button>
        )}
        {(data.status === "awaiting_signoff" || data.status === "signed_off") && adminViewing && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={handleReopen}
            disabled={actionLoading}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reopen
          </Button>
        )}
        {adminViewing && (
          <Button
            size="sm"
            variant={editMode ? "default" : "outline"}
            className={cn("gap-1.5", editMode && "bg-indigo-600 hover:bg-indigo-700 text-white")}
            onClick={() => setEditMode((m) => !m)}
            disabled={actionLoading}
          >
            {editMode ? <Lock className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            {editMode ? "Done editing" : "Edit"}
          </Button>
        )}
        {adminViewing && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={actionLoading}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        )}
      </div>

      {/* ── Page title (icon + PO + status, outside the card) ───────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25 shrink-0">
            <ListChecks className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-600 dark:text-blue-400">
              Daily QC Sheet
            </p>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight truncate">
              {data.po_number}
              <span className="text-muted-foreground/70 font-medium"> · {data.line_name}</span>
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className={cn("text-[10px]", statusMeta.cls)}>
            {statusMeta.label}
          </Badge>
          <Badge variant="outline" className="text-[10px] capitalize">
            {data.shift}
          </Badge>
        </div>
      </div>

      {/* ── PO details card (no dark banner now) ───────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        {/* Blue accent strip — matches the daily sheet brand color */}
        <div className="h-[3px] bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-600" />

        {/* Guidance line */}
        <div className="px-5 py-2.5 bg-blue-50/40 dark:bg-blue-950/20 border-b border-border/60">
          <p className="text-[11px] text-muted-foreground italic">
            Complete one sheet per line per shift. Pass = ✓ &nbsp;&nbsp; Fail = ✗ &nbsp;&nbsp; N/A = —
          </p>
        </div>

        {/* PO details grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y divide-border/60 [&>*]:border-border/60">
          <DetailCell icon={Tag} label="Order / PO No." value={data.po_number} mono />
          <DetailCell icon={Building2} label="Buyer" value={data.buyer} />
          <DetailCell icon={Layers} label="Style" value={data.style} mono />
          <DetailCell
            icon={Package}
            label="Total Qty"
            value={data.order_qty ? data.order_qty.toLocaleString() + " pcs" : "—"}
          />

          <DetailCell icon={Rows3} label="Line" value={data.line_name || "—"} />
          <DetailCell icon={Clock} label="Shift" value={data.shift} capitalize />
          <DetailCell
            icon={Calendar}
            label="Inspection Date"
            value={formatShortDate(data.inspection_date)}
          />
          <DetailCell icon={User} label="Inspector" value={data.inspector_name || "—"} />

          <DetailCell icon={Tag} label="Product Type" value={data.product_type || "—"} />
          <DetailCell icon={Layers} label="Fabric / Material" value={data.fabric || "—"} />
          <DetailCell
            icon={Target}
            label="Target Qty"
            value={data.target_qty ? data.target_qty.toLocaleString() + " pcs" : "—"}
          />
          <DetailCell
            icon={Truck}
            label="FOB / Ex-Factory"
            value={data.planned_ex_factory ? formatShortDate(data.planned_ex_factory) : "—"}
          />
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Delete this daily sheet?"
        description={`This will permanently delete the daily QC sheet for ${data.po_number} · ${data.line_name} (${formatShortDate(data.inspection_date)} ${data.shift}) and all 42 checklist items. Linked open issues will be auto-resolved. This cannot be undone.`}
        confirmLabel="Delete sheet"
        variant="destructive"
        onConfirm={handleDelete}
      />

      {/* Progress strip */}
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Checklist Progress
          </p>
          <span className="text-xs tabular-nums font-mono">
            <span className="font-bold">{progressPct}%</span>{" "}
            <span className="text-muted-foreground">complete</span>
          </span>
        </div>
        <div className="h-2 rounded-full bg-foreground/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            <span className="font-mono font-medium text-foreground">{counts.pass}</span> pass
          </span>
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            <span className="font-mono font-medium text-foreground">{counts.fail}</span> fail
          </span>
          <span className="flex items-center gap-1.5">
            <MinusCircle className="h-3.5 w-3.5 text-muted-foreground/70" />
            <span className="font-mono font-medium text-foreground">{counts.na}</span> N/A
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-muted-foreground/70" />
            <span className="font-mono font-medium text-foreground">{counts.pending}</span> pending
          </span>
          {counts.fail > 0 && (
            <span className="ml-auto text-[11px] text-amber-700 dark:text-amber-300 font-medium">
              {counts.fail} item{counts.fail !== 1 ? "s" : ""} flagged as QC issue
            </span>
          )}
        </div>
      </div>

      {isLocked && (
        adminViewing ? (
          <div className="rounded-md border border-indigo-200 bg-indigo-50/50 dark:border-indigo-800/40 dark:bg-indigo-950/20 px-3 py-2 text-xs text-indigo-800 dark:text-indigo-200 flex items-center gap-2">
            <Lock className="h-3.5 w-3.5" />
            You are reviewing this sheet in read-only mode. Click <span className="font-semibold">Edit</span> to make changes.
          </div>
        ) : (
          <div className="rounded-md border border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-emerald-950/20 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
            <Stamp className="h-3.5 w-3.5" />
            This sheet is signed off and read-only. An admin can reopen it.
          </div>
        )
      )}
      {adminViewing && editMode && (
        <div className="rounded-md border border-amber-200 bg-amber-50/60 dark:border-amber-800/40 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
          <Pencil className="h-3.5 w-3.5" />
          Edit mode is on. Changes are saved immediately. Click <span className="font-semibold">Done editing</span> when you're finished.
        </div>
      )}

      {/* Sections — each gets a colored banner like the PDF */}
      <div className="space-y-5">
        {grouped.map((g, idx) => {
          const palette = SECTION_PALETTE[idx % SECTION_PALETTE.length];
          // Tally per-section so the banner shows progress at a glance
          const sec = {
            pass: 0, fail: 0, na: 0, pending: 0, total: g.items.length,
          };
          for (const it of g.items) {
            if (it.status === "pass") sec.pass += 1;
            else if (it.status === "fail") sec.fail += 1;
            else if (it.status === "na") sec.na += 1;
            else sec.pending += 1;
          }
          return (
            <section
              key={g.label}
              className="rounded-xl border border-border/60 overflow-hidden bg-card shadow-sm"
            >
              {/* Colored banner — stacks title above counts on mobile */}
              <div
                className={cn(
                  "px-4 md:px-5 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3",
                  palette.banner
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-mono font-bold text-white/70 tabular-nums shrink-0">
                    SECTION {g.order}
                  </span>
                  <span className="text-white/40 shrink-0">—</span>
                  <h2 className="text-sm md:text-base font-bold text-white uppercase tracking-wide truncate">
                    {/* Strip any leading "SECTION N —" / "PHASE N —" the template label
                        already carries, otherwise we render the number twice. */}
                    {g.label.replace(/^(PHASE|SECTION)\s+\d+\s*[—\-:]\s*/i, "")}
                  </h2>
                </div>
                <div className="flex items-center gap-2 sm:gap-2.5 text-[11px] shrink-0 font-mono tabular-nums flex-wrap">
                  {sec.pass > 0 && (
                    <span className="inline-flex items-center gap-1 text-white/95">
                      <CheckCircle2 className="h-3 w-3" />
                      {sec.pass}
                    </span>
                  )}
                  {sec.fail > 0 && (
                    <span className="inline-flex items-center gap-1 text-white font-semibold">
                      <AlertTriangle className="h-3 w-3" />
                      {sec.fail}
                    </span>
                  )}
                  {sec.pending > 0 && (
                    <span className="inline-flex items-center gap-1 text-white/70">
                      <Clock className="h-3 w-3" />
                      {sec.pending}
                    </span>
                  )}
                  <span className="text-white/50 hidden sm:inline">
                    · {sec.total} item{sec.total === 1 ? "" : "s"}
                  </span>
                </div>
              </div>

              {/* Items */}
              <div className={cn("p-3 md:p-4 space-y-2", palette.body)}>
                {g.items.map((it) => (
                  <DailyItemRow
                    key={it.id}
                    item={it}
                    updatedBy={user?.id ?? ""}
                    disabled={isLocked}
                    onLocalUpdate={(next) =>
                      setItems((prev) => {
                        const base = prev ?? data.items;
                        return base.map((x) => (x.id === next.id ? next : x));
                      })
                    }
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

