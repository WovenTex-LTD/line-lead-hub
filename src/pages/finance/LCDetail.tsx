import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Landmark,
  Pencil,
  Trash2,
  Plus,
  Ship,
  FileText,
  Clock,
  AlertTriangle,
  DollarSign,
  Package,
  Calendar,
  Shield,
  Anchor,
  FileDown,
  Loader2,
  Settings,
  CheckCircle2,
  XCircle,
  ListChecks,
  Banknote,
  CircleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { motion } from "framer-motion";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import {
  useMasterLC,
  useMasterLCMutations,
  useBtbLCMutations,
  useLCUtilisation,
  useLCDocChecklist,
  useLCDocChecklistMutations,
  useLCBankingCosts,
  useLCBankingCostMutations,
  useLCDiscrepancies,
  useLCDiscrepancyMutations,
  type MasterLC,
  type BtbLC,
  type LCAmendment,
  type LCShipment,
  type LCDocChecklistItem,
  type LCBankingCost,
  type LCDiscrepancy,
} from "@/hooks/useLCManagement";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// ── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<MasterLC["status"], { label: string; pill: string }> = {
  received:          { label: "Received",          pill: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
  advised:           { label: "Advised",           pill: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  confirmed:         { label: "Confirmed",         pill: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  partially_shipped: { label: "Partially Shipped", pill: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  fully_shipped:     { label: "Fully Shipped",     pill: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  expired:           { label: "Expired",           pill: "bg-red-500/10 text-red-400 border-red-500/20" },
  cancelled:         { label: "Cancelled",         pill: "bg-red-500/10 text-red-400 border-red-500/20" },
  closed:            { label: "Closed",            pill: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" },
};

const BTB_STATUS_CONFIG: Record<BtbLC["status"], { label: string; pill: string }> = {
  opened:        { label: "Opened",        pill: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  docs_received: { label: "Docs Received", pill: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  accepted:      { label: "Accepted",      pill: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  matured:       { label: "Matured",       pill: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  paid:          { label: "Paid",          pill: "bg-green-500/10 text-green-400 border-green-500/20" },
  expired:       { label: "Expired",       pill: "bg-red-500/10 text-red-400 border-red-500/20" },
  cancelled:     { label: "Cancelled",     pill: "bg-red-500/10 text-red-400 border-red-500/20" },
};

const PURPOSE_COLORS: Record<string, string> = {
  fabric:      "bg-blue-500/10 text-blue-400 border-blue-500/20",
  trims:       "bg-amber-500/10 text-amber-400 border-amber-500/20",
  accessories: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  yarn:        "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  other:       "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

const SHIPMENT_DOC_STATUS: Record<string, { label: string; cls: string }> = {
  pending:    { label: "Pending",    cls: "bg-slate-500/10 text-slate-400" },
  submitted:  { label: "Submitted",  cls: "bg-blue-500/10 text-blue-400" },
  accepted:   { label: "Accepted",   cls: "bg-emerald-500/10 text-emerald-400" },
  discrepant: { label: "Discrepant", cls: "bg-red-500/10 text-red-400" },
};

const DOC_STATUS_CONFIG: Record<LCDocChecklistItem["status"], { label: string; cls: string }> = {
  not_started:     { label: "Not Started",     cls: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
  in_preparation:  { label: "In Preparation",  cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  ready:           { label: "Ready",           cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  submitted:       { label: "Submitted",       cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
};

const DOC_STATUS_CYCLE: LCDocChecklistItem["status"][] = ["not_started", "in_preparation", "ready", "submitted"];

const COST_TYPE_COLORS: Record<string, string> = {
  opening_commission:    "bg-blue-500/10 text-blue-400 border-blue-500/20",
  advising_fee:          "bg-purple-500/10 text-purple-400 border-purple-500/20",
  confirmation_fee:      "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  amendment_fee:         "bg-amber-500/10 text-amber-400 border-amber-500/20",
  negotiation_fee:       "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  discrepancy_fee:       "bg-red-500/10 text-red-400 border-red-500/20",
  swift_charges:         "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  courier_charges:       "bg-pink-500/10 text-pink-400 border-pink-500/20",
  other:                 "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "\u2014";
  return format(new Date(d), "dd MMM yyyy");
}

function fmtInt(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

function pct(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

// ── PDF Generation ──────────────────────────────────────────────────────────

function generateLCSummaryPdf(lc: MasterLC) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ml = 15;
  let y = 20;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(`LC Summary - ${lc.lc_number}`, ml, y);
  y += 10;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");

  const fields: [string, string][] = [
    ["LC Type", lc.lc_type],
    ["Buyer", lc.buyer_name],
    ["Applicant", lc.applicant_name || "\u2014"],
    ["Currency", lc.currency],
    ["Value", fmt(lc.lc_value)],
    ["Tolerance", `${lc.tolerance_pct}%`],
    ["Status", STATUS_CONFIG[lc.status].label],
    ["Issue Date", fmtDate(lc.issue_date)],
    ["Expiry Date", fmtDate(lc.expiry_date)],
    ["Latest Shipment Date", fmtDate(lc.latest_shipment_date)],
    ["Port of Loading", lc.port_of_loading || "\u2014"],
    ["Port of Discharge", lc.port_of_discharge || "\u2014"],
    ["Incoterms", lc.incoterms || "\u2014"],
    ["Payment Terms", lc.payment_terms || "\u2014"],
    ["Payment Type", lc.payment_type],
    ["Tenor Days", lc.tenor_days?.toString() || "\u2014"],
    ["Total Utilized", fmt(lc.total_utilized)],
    ["Total Shipped", fmt(lc.total_shipped)],
    ["Amendments", lc.amendment_count.toString()],
  ];

  fields.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, ml, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, ml + 55, y);
    y += 6;
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
  });

  if (lc.documents_required) {
    y += 4;
    doc.setFont("helvetica", "bold");
    doc.text("Documents Required:", ml, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(lc.documents_required, pw - ml * 2);
    doc.text(lines, ml, y);
    y += lines.length * 5;
  }

  if (lc.special_conditions) {
    y += 4;
    doc.setFont("helvetica", "bold");
    doc.text("Special Conditions:", ml, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(lc.special_conditions, pw - ml * 2);
    doc.text(lines, ml, y);
  }

  doc.save(`LC_Summary_${lc.lc_number}_${format(new Date(), "yyyyMMdd")}.pdf`);
}

// ── Detail Field ────────────────────────────────────────────────────────────

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm">{value || "\u2014"}</p>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function LCDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { lc, loading, refetch } = useMasterLC(id);
  const { updateStatus, deleteLC, addAmendment, addShipment, saving } = useMasterLCMutations();
  const { createBtbLC, deleteBtbLC, updateBtbStatus, saving: btbSaving } = useBtbLCMutations();

  // New hooks
  const utilisation = useLCUtilisation(lc);
  const { items: docChecklistItems, refetch: refetchDocs } = useLCDocChecklist(lc?.id);
  const { addItem: addDocToChecklist, updateItemStatus: updateDocStatus, deleteItem: deleteDocItem, addDefaultChecklist, saving: docSaving } = useLCDocChecklistMutations();
  const { costs: bankingCosts, totalCosts: bankingCostTotal, refetch: refetchCosts } = useLCBankingCosts(lc?.id);
  const { addCost: addBankingCost, deleteCost: deleteBankingCost, saving: costSaving } = useLCBankingCostMutations();
  const { discrepancies, refetch: refetchDiscrepancies } = useLCDiscrepancies(lc?.id);
  const { addDiscrepancy: logDiscrepancy, resolveDiscrepancy, saving: discrepancySaving } = useLCDiscrepancyMutations();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Shipment dialog
  const [shipmentDialogOpen, setShipmentDialogOpen] = useState(false);
  const [shipmentForm, setShipmentForm] = useState({
    shipment_date: "",
    bl_number: "",
    bl_date: "",
    invoice_number: "",
    invoice_value: "",
    quantity: "",
    vessel_name: "",
    container_number: "",
    notes: "",
  });

  // BTB LC dialog
  const [btbDialogOpen, setBtbDialogOpen] = useState(false);
  const [btbForm, setBtbForm] = useState({
    lc_number: "",
    supplier_name: "",
    purpose: "fabric",
    lc_value: "",
    margin_pct: "",
    issue_date: "",
    expiry_date: "",
    maturity_date: "",
    tenor_days: "",
    port_of_loading: "",
    notes: "",
  });

  // Amendment dialog
  const [amendmentDialogOpen, setAmendmentDialogOpen] = useState(false);
  const [amendmentForm, setAmendmentForm] = useState({
    description: "",
    value_change: "",
    new_expiry_date: "",
    new_shipment_date: "",
  });

  // Document checklist dialog
  const [docDialogOpen, setDocDialogOpen] = useState(false);
  const [docForm, setDocForm] = useState({
    document_name: "",
    description: "",
    originals_required: "1",
    copies_required: "1",
    special_instructions: "",
  });

  // Banking cost dialog
  const [costDialogOpen, setCostDialogOpen] = useState(false);
  const [costForm, setCostForm] = useState({
    cost_type: "other",
    description: "",
    amount: "",
    currency: "USD",
    date_incurred: "",
    reference: "",
  });

  // Discrepancy dialog
  const [discrepancyDialogOpen, setDiscrepancyDialogOpen] = useState(false);
  const [discrepancyForm, setDiscrepancyForm] = useState({
    notice_date: "",
    discrepancy_items: [""],
    bank_charges: "",
    shipment_id: "",
  });

  // Resolve discrepancy dialog
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<string | null>(null);
  const [resolveForm, setResolveForm] = useState({
    resolution: "buyer_authorized" as LCDiscrepancy["resolution"],
    resolution_date: "",
    resolution_notes: "",
  });

  // Delete confirmation states
  const [deleteBtbTarget, setDeleteBtbTarget] = useState<string | null>(null);
  const [deleteShipmentTarget, setDeleteShipmentTarget] = useState<string | null>(null);
  const [deleteCostTarget, setDeleteCostTarget] = useState<string | null>(null);
  const [deleteDocTarget, setDeleteDocTarget] = useState<string | null>(null);

  // ── Actions ─────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!id) return;
    const ok = await deleteLC(id);
    if (ok) navigate("/finance/lc");
  };

  const handleStatusChange = async (status: MasterLC["status"]) => {
    if (!id) return;
    const ok = await updateStatus(id, status);
    if (ok) refetch();
  };

  const handleGeneratePdf = () => {
    if (!lc) return;
    setPdfLoading(true);
    try {
      generateLCSummaryPdf(lc);
      toast.success("LC summary PDF downloaded");
    } catch (e: any) {
      toast.error("Failed to generate PDF", { description: e.message });
    } finally {
      setPdfLoading(false);
    }
  };

  const handleAddShipment = async () => {
    if (!id || !shipmentForm.shipment_date) return;
    const ok = await addShipment(id, {
      shipment_date: shipmentForm.shipment_date,
      bl_number: shipmentForm.bl_number || null,
      bl_date: shipmentForm.bl_date || null,
      invoice_number: shipmentForm.invoice_number || null,
      invoice_value: parseFloat(shipmentForm.invoice_value) || 0,
      quantity: shipmentForm.quantity ? parseInt(shipmentForm.quantity) : null,
      vessel_name: shipmentForm.vessel_name || null,
      container_number: shipmentForm.container_number || null,
      docs_submitted_date: null,
      docs_accepted_date: null,
      payment_received_date: null,
      payment_amount: null,
      discrepancies: null,
      status: "pending",
      notes: shipmentForm.notes || null,
    });
    if (ok) {
      setShipmentForm({
        shipment_date: "", bl_number: "", bl_date: "", invoice_number: "",
        invoice_value: "", quantity: "", vessel_name: "", container_number: "", notes: "",
      });
      setShipmentDialogOpen(false);
      refetch();
    }
  };

  const handleAddBtbLC = async () => {
    if (!id || !btbForm.lc_number || !btbForm.supplier_name) return;
    const ok = await createBtbLC({
      master_lc_id: id,
      lc_number: btbForm.lc_number,
      supplier_name: btbForm.supplier_name,
      supplier_bank_name: null,
      supplier_bank_swift: null,
      purpose: btbForm.purpose,
      currency: lc?.currency || "USD",
      lc_value: parseFloat(btbForm.lc_value) || 0,
      margin_pct: parseFloat(btbForm.margin_pct) || 0,
      margin_amount: null,
      issue_date: btbForm.issue_date || new Date().toISOString().split("T")[0],
      expiry_date: btbForm.expiry_date || "",
      maturity_date: btbForm.maturity_date || null,
      acceptance_date: null,
      payment_date: null,
      tenor_days: btbForm.tenor_days ? parseInt(btbForm.tenor_days) : null,
      port_of_loading: btbForm.port_of_loading || null,
      port_of_discharge: null,
      status: "opened",
      notes: btbForm.notes || null,
    });
    if (ok) {
      setBtbForm({
        lc_number: "", supplier_name: "", purpose: "fabric", lc_value: "",
        margin_pct: "", issue_date: "", expiry_date: "", maturity_date: "",
        tenor_days: "", port_of_loading: "", notes: "",
      });
      setBtbDialogOpen(false);
      refetch();
    }
  };

  const handleAddAmendment = async () => {
    if (!id || !amendmentForm.description.trim()) return;
    const ok = await addAmendment(id, {
      amendment_date: new Date().toISOString().split("T")[0],
      description: amendmentForm.description.trim(),
      value_change: parseFloat(amendmentForm.value_change) || 0,
      new_expiry_date: amendmentForm.new_expiry_date || null,
      new_shipment_date: amendmentForm.new_shipment_date || null,
      changes: {},
    });
    if (ok) {
      setAmendmentForm({ description: "", value_change: "", new_expiry_date: "", new_shipment_date: "" });
      setAmendmentDialogOpen(false);
      refetch();
    }
  };

  const handleAddDoc = async () => {
    if (!id || !docForm.document_name.trim()) return;
    const items = docChecklistItems ?? [];
    const nextOrder = items.length > 0 ? Math.max(...items.map((d) => d.sort_order)) + 1 : 1;
    const ok = await addDocToChecklist(id, {
      document_name: docForm.document_name.trim(),
      description: docForm.description.trim() || null,
      originals_required: parseInt(docForm.originals_required) || 1,
      copies_required: parseInt(docForm.copies_required) || 1,
      special_instructions: docForm.special_instructions.trim() || null,
      status: "not_started",
      sort_order: nextOrder,
    });
    if (ok) {
      setDocForm({ document_name: "", description: "", originals_required: "1", copies_required: "1", special_instructions: "" });
      setDocDialogOpen(false);
      refetchDocs();
    }
  };

  const handleToggleDocStatus = async (doc: LCDocChecklistItem) => {
    const currentIdx = DOC_STATUS_CYCLE.indexOf(doc.status);
    const nextStatus = DOC_STATUS_CYCLE[(currentIdx + 1) % DOC_STATUS_CYCLE.length];
    const ok = await updateDocStatus(doc.id, nextStatus);
    if (ok) refetchDocs();
  };

  const handleAddDefaultChecklist = async () => {
    if (!id) return;
    const ok = await addDefaultChecklist(id);
    if (ok) refetchDocs();
  };

  const handleAddCost = async () => {
    if (!id || !costForm.amount || !costForm.date_incurred) return;
    const ok = await addBankingCost({
      lc_id: id,
      btb_lc_id: null,
      factory_id: lc?.factory_id ?? "",
      cost_type: costForm.cost_type,
      description: costForm.description.trim() || null,
      amount: parseFloat(costForm.amount) || 0,
      currency: costForm.currency,
      date_incurred: costForm.date_incurred,
      reference: costForm.reference.trim() || null,
    });
    if (ok) {
      setCostForm({ cost_type: "other", description: "", amount: "", currency: lc?.currency || "USD", date_incurred: "", reference: "" });
      setCostDialogOpen(false);
      refetchCosts();
      refetch(); // Also refresh master LC for total_banking_costs KPI
    }
  };

  const handleLogDiscrepancy = async () => {
    if (!id || !discrepancyForm.notice_date) return;
    const items = discrepancyForm.discrepancy_items.filter((i) => i.trim());
    if (items.length === 0) { toast.error("Add at least one discrepancy item"); return; }
    const ok = await logDiscrepancy(id, {
      notice_date: discrepancyForm.notice_date,
      discrepancy_items: items,
      bank_charges: parseFloat(discrepancyForm.bank_charges) || 0,
      shipment_id: discrepancyForm.shipment_id || null,
    });
    if (ok) {
      setDiscrepancyForm({ notice_date: "", discrepancy_items: [""], bank_charges: "", shipment_id: "" });
      setDiscrepancyDialogOpen(false);
      refetchDiscrepancies();
    }
  };

  const handleResolve = async () => {
    if (!resolveTarget || !resolveForm.resolution_date || !resolveForm.resolution) return;
    const ok = await resolveDiscrepancy(resolveTarget, {
      resolution: resolveForm.resolution as LCDiscrepancy["resolution"],
      resolution_date: resolveForm.resolution_date,
      resolution_notes: resolveForm.resolution_notes.trim() || null,
    });
    if (ok) {
      setResolveForm({ resolution: "buyer_authorized", resolution_date: "", resolution_notes: "" });
      setResolveTarget(null);
      setResolveDialogOpen(false);
      refetchDiscrepancies();
    }
  };

  // ── Delete handlers ──────────────────────────────────────────────────

  const handleDeleteBtb = async () => {
    if (!deleteBtbTarget) return;
    const ok = await deleteBtbLC(deleteBtbTarget);
    if (ok) { setDeleteBtbTarget(null); refetch(); }
  };

  const handleDeleteShipment = async () => {
    if (!deleteShipmentTarget || !id) return;
    const { error } = await supabase
      .from("lc_shipments" as any)
      .delete()
      .eq("id", deleteShipmentTarget);
    if (error) {
      toast.error("Failed to delete shipment", { description: error.message });
    } else {
      // Recalculate total_shipped on master LC
      const { data: remainingShipments } = await supabase
        .from("lc_shipments" as any)
        .select("invoice_value")
        .eq("lc_id", id);
      const totalShipped = (remainingShipments ?? []).reduce(
        (sum: number, s: any) => sum + (s.invoice_value ?? 0),
        0
      );
      await supabase
        .from("master_lcs" as any)
        .update({ total_shipped: totalShipped } as any)
        .eq("id", id);

      toast.success("Shipment deleted");
      setDeleteShipmentTarget(null);
      refetch();
    }
  };

  const handleDeleteCost = async () => {
    if (!deleteCostTarget) return;
    const ok = await deleteBankingCost(deleteCostTarget);
    if (ok) { setDeleteCostTarget(null); refetchCosts(); refetch(); }
  };

  const handleDeleteDoc = async () => {
    if (!deleteDocTarget) return;
    const ok = await deleteDocItem(deleteDocTarget);
    if (ok) { setDeleteDocTarget(null); refetchDocs(); }
  };

  // ── Loading state ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="py-6 space-y-4 max-w-5xl">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!lc) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Landmark className="h-12 w-12 text-muted-foreground/20" />
        <p className="text-muted-foreground">LC not found</p>
        <Button variant="outline" onClick={() => navigate("/finance/lc")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to LCs
        </Button>
      </div>
    );
  }

  // ── Computed data ─────────────────────────────────────────────────────

  const cfg = STATUS_CONFIG[lc.status];
  const amendments = lc.lc_amendments ?? [];
  const shipments = lc.lc_shipments ?? [];
  const btbLcs = lc.btb_lcs ?? [];

  const utilizedPct = pct(lc.total_utilized, lc.lc_value);
  const shippedPct = pct(lc.total_shipped, lc.lc_value);

  const daysToExpiry = differenceInDays(new Date(lc.expiry_date), new Date());
  const expiryColor =
    daysToExpiry < 0 ? "text-red-500" :
    daysToExpiry < 30 ? "text-red-500" :
    daysToExpiry < 60 ? "text-amber-500" :
    "text-emerald-500";

  const statuses: MasterLC["status"][] = [
    "received", "advised", "confirmed", "partially_shipped", "fully_shipped", "expired", "cancelled", "closed",
  ];

  const safeDocChecklistItems = docChecklistItems ?? [];
  const safeBankingCosts = bankingCosts ?? [];
  const safeDiscrepancies = discrepancies ?? [];

  const docsReadyCount = safeDocChecklistItems.filter((d) => d.status === "ready" || d.status === "submitted").length;
  const docsTotalCount = safeDocChecklistItems.length;

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-6 max-w-5xl">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/finance/lc")}
            className="-ml-2 shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold font-mono">{lc.lc_number}</h1>
              <span
                className={cn(
                  "inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full border",
                  cfg.pill
                )}
              >
                {cfg.label}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{lc.buyer_name}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <Button
            variant="default"
            size="sm"
            onClick={handleGeneratePdf}
            disabled={pdfLoading}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            {pdfLoading ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <FileDown className="h-3.5 w-3.5 mr-1.5" />
            )}
            <span className="hidden sm:inline">Export PDF</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/finance/lc/${id}/edit`)}
          >
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            <span className="hidden sm:inline">Edit</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAmendmentDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            <span className="hidden sm:inline">Amendment</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShipmentDialogOpen(true)}>
            <Ship className="h-3.5 w-3.5 mr-1.5" />
            <span className="hidden sm:inline">Shipment</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings className="h-3.5 w-3.5 mr-1.5" />
                <span className="hidden sm:inline">Status</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {statuses
                .filter((s) => s !== lc.status)
                .map((s) => (
                  <DropdownMenuItem key={s} onClick={() => handleStatusChange(s)}>
                    <span
                      className={cn(
                        "inline-block h-2 w-2 rounded-full mr-2",
                        STATUS_CONFIG[s].pill.split(" ")[0].replace("/10", "")
                      )}
                    />
                    {STATUS_CONFIG[s].label}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon"
            asChild
          >
            <Link to="/finance/lc/settings">
              <Settings className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Overview Cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                LC Value
              </p>
              <p className="text-2xl font-bold font-mono">
                {lc.currency} {fmt(lc.lc_value)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {lc.tolerance_pct > 0 && `\u00b1${lc.tolerance_pct}% tolerance`}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Total Utilized
              </p>
              <p className="text-xl font-bold font-mono">{fmt(lc.total_utilized)}</p>
              <Progress value={utilizedPct} className="h-1.5 mt-2" />
              <p className="text-xs text-muted-foreground mt-1">{utilizedPct}% of value</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Total Shipped
              </p>
              <p className="text-xl font-bold font-mono">{fmt(lc.total_shipped)}</p>
              <Progress value={shippedPct} className="h-1.5 mt-2" />
              <p className="text-xs text-muted-foreground mt-1">{shippedPct}% of value</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Amendments
              </p>
              <p className="text-2xl font-bold font-mono">{lc.amendment_count}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {amendments.length > 0
                  ? `Last: ${fmtDate(amendments[amendments.length - 1]?.amendment_date)}`
                  : "none"}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Days to Expiry
              </p>
              <p className={cn("text-2xl font-bold font-mono", expiryColor)}>
                {daysToExpiry < 0 ? "Expired" : daysToExpiry}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{fmtDate(lc.expiry_date)}</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Banking Costs
              </p>
              <p className="text-xl font-bold font-mono">{fmt(lc.total_banking_costs ?? 0)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {safeBankingCosts.length} charge{safeBankingCosts.length !== 1 ? "s" : ""}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ── LC Details ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            LC Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            {/* Left column */}
            <div className="space-y-4">
              <DetailField label="LC Type" value={lc.lc_type} />
              <DetailField label="Buyer" value={lc.buyer_name} />
              <DetailField label="Applicant" value={lc.applicant_name} />

              <Separator />

              <DetailField
                label="Applicant Bank"
                value={
                  <span>
                    {lc.applicant_bank_name || "\u2014"}
                    {lc.applicant_bank_swift && (
                      <span className="text-muted-foreground ml-1">({lc.applicant_bank_swift})</span>
                    )}
                  </span>
                }
              />
              <DetailField
                label="Advising Bank"
                value={
                  <span>
                    {lc.advising_bank_name || "\u2014"}
                    {lc.advising_bank_swift && (
                      <span className="text-muted-foreground ml-1">({lc.advising_bank_swift})</span>
                    )}
                  </span>
                }
              />
              <DetailField
                label="Beneficiary Bank"
                value={
                  <div className="space-y-0.5">
                    <p>{lc.beneficiary_bank_name || "\u2014"}</p>
                    {lc.beneficiary_bank_branch && (
                      <p className="text-xs text-muted-foreground">Branch: {lc.beneficiary_bank_branch}</p>
                    )}
                    {lc.beneficiary_bank_swift && (
                      <p className="text-xs text-muted-foreground">SWIFT: {lc.beneficiary_bank_swift}</p>
                    )}
                    {lc.beneficiary_bank_account && (
                      <p className="text-xs text-muted-foreground">Account: {lc.beneficiary_bank_account}</p>
                    )}
                  </div>
                }
              />
              <DetailField
                label="Confirming Bank"
                value={
                  <span>
                    {lc.confirming_bank_name || "\u2014"}
                    {lc.confirming_bank_swift && (
                      <span className="text-muted-foreground ml-1">({lc.confirming_bank_swift})</span>
                    )}
                  </span>
                }
              />

              <Separator />

              <DetailField label="Currency" value={lc.currency} />
              <DetailField label="Value" value={`${lc.currency} ${fmt(lc.lc_value)}`} />
              <DetailField label="Tolerance" value={`${lc.tolerance_pct}%`} />
              <DetailField label="HS Code" value={lc.hs_code} />

              <Separator />

              <DetailField
                label="Partial Shipment"
                value={
                  <Badge variant="outline" className={cn("text-xs", lc.partial_shipment_allowed ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20")}>
                    {lc.partial_shipment_allowed ? "Allowed" : "Not Allowed"}
                  </Badge>
                }
              />
              <DetailField
                label="Transhipment"
                value={
                  <Badge variant="outline" className={cn("text-xs", lc.transhipment_allowed ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20")}>
                    {lc.transhipment_allowed ? "Allowed" : "Not Allowed"}
                  </Badge>
                }
              />
              <DetailField
                label="Insurance"
                value={
                  <div className="space-y-0.5">
                    <Badge variant="outline" className={cn("text-xs", lc.insurance_required ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-slate-500/10 text-slate-400 border-slate-500/20")}>
                      {lc.insurance_required ? "Required" : "Not Required"}
                    </Badge>
                    {lc.insurance_required && lc.insurance_details && (
                      <p className="text-xs text-muted-foreground mt-1">{lc.insurance_details}</p>
                    )}
                  </div>
                }
              />
            </div>

            {/* Right column */}
            <div className="space-y-4">
              <DetailField label="Issue Date" value={fmtDate(lc.issue_date)} />
              <DetailField label="Expiry Date" value={fmtDate(lc.expiry_date)} />
              <DetailField label="Latest Shipment Date" value={fmtDate(lc.latest_shipment_date)} />
              <DetailField label="Presentation Period" value={lc.presentation_period ? `${lc.presentation_period} days` : null} />

              <Separator />

              <DetailField label="Port of Loading" value={lc.port_of_loading} />
              <DetailField label="Port of Discharge" value={lc.port_of_discharge} />
              <DetailField label="Incoterms" value={lc.incoterms} />

              <Separator />

              <DetailField label="Payment Terms" value={lc.payment_terms} />
              <DetailField label="Payment Type" value={lc.payment_type} />
              <DetailField label="Tenor Days" value={lc.tenor_days?.toString()} />
              <DetailField label="Docs Submitted Date" value={fmtDate(lc.docs_submitted_date)} />
              <DetailField label="Expected Payment Date" value={fmtDate(lc.expected_payment_date)} />

              <Separator />

              <DetailField
                label="Linked Contract"
                value={
                  lc.contract_id ? (
                    <Link
                      to={`/finance/contracts/${lc.contract_id}`}
                      className="text-blue-500 hover:underline text-sm"
                    >
                      View Contract
                    </Link>
                  ) : (
                    "\u2014"
                  )
                }
              />

              {lc.goods_description && (
                <DetailField
                  label="Goods Description"
                  value={
                    <pre className="text-xs font-mono bg-muted/50 rounded-md p-3 whitespace-pre-wrap max-h-40 overflow-y-auto">
                      {lc.goods_description}
                    </pre>
                  }
                />
              )}

              {lc.documents_required && (
                <DetailField
                  label="Documents Required"
                  value={<span className="whitespace-pre-wrap">{lc.documents_required}</span>}
                />
              )}

              {lc.special_conditions && (
                <DetailField
                  label="Special Conditions"
                  value={<span className="whitespace-pre-wrap">{lc.special_conditions}</span>}
                />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Utilisation Tracker ──────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              Utilisation Tracker
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Drawn: {lc.currency} {fmt(utilisation.totalDrawn)}</span>
                <span>Max Drawable: {lc.currency} {fmt(utilisation.maxDrawable)}</span>
              </div>
              <div className="relative h-4 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-full transition-all duration-500",
                    utilisation.pct >= 90 ? "bg-red-500" : utilisation.pct >= 75 ? "bg-amber-500" : "bg-emerald-500"
                  )}
                  style={{ width: `${utilisation.pct}%` }}
                />
                {/* LC value marker */}
                {lc.tolerance_pct > 0 && (
                  <div
                    className="absolute inset-y-0 w-0.5 bg-foreground/40"
                    style={{ left: `${pct(lc.lc_value, utilisation.maxDrawable)}%` }}
                    title="LC Face Value"
                  />
                )}
              </div>
            </div>

            {/* Summary numbers */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">LC Value</p>
                <p className="text-sm font-mono font-bold">{lc.currency} {fmt(utilisation.lcValue)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">Max Drawable</p>
                <p className="text-sm font-mono font-bold">{lc.currency} {fmt(utilisation.maxDrawable)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">Total Drawn</p>
                <p className="text-sm font-mono font-bold">{lc.currency} {fmt(utilisation.totalDrawn)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">Remaining</p>
                <p className={cn("text-sm font-mono font-bold", utilisation.remaining < utilisation.lcValue * 0.1 ? "text-red-500" : "text-emerald-500")}>
                  {lc.currency} {fmt(utilisation.remaining)}
                </p>
              </div>
            </div>

            {/* Warning */}
            {utilisation.remaining > 0 && utilisation.remaining < utilisation.lcValue * 0.1 && (
              <div className="flex items-center gap-2 text-xs text-red-500 bg-red-500/10 rounded-lg p-3">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Remaining drawable amount is less than 10% of LC value.</span>
              </div>
            )}

            {/* Per-shipment breakdown */}
            {utilisation.shipments.length > 0 && (
              <div className="overflow-x-auto -mx-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs w-10">#</TableHead>
                      <TableHead className="text-xs">BL Number</TableHead>
                      <TableHead className="text-xs text-right">Invoice Value</TableHead>
                      <TableHead className="text-xs text-right">Cumulative</TableHead>
                      <TableHead className="text-xs text-right">Remaining</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {utilisation.shipments.map((s) => (
                      <TableRow key={s.number}>
                        <TableCell className="text-sm font-mono text-muted-foreground">{s.number}</TableCell>
                        <TableCell className="text-sm font-mono">{s.blNumber || "\u2014"}</TableCell>
                        <TableCell className="text-sm font-mono text-right">{fmt(s.invoiceValue)}</TableCell>
                        <TableCell className="text-sm font-mono text-right">{fmt(s.cumulative)}</TableCell>
                        <TableCell className={cn("text-sm font-mono text-right", s.remaining < utilisation.lcValue * 0.1 ? "text-red-500" : "")}>
                          {fmt(s.remaining)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── BTB LCs ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              Back-to-Back LCs
              <span className="text-xs font-normal text-muted-foreground">({btbLcs.length})</span>
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => setBtbDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add BTB LC
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {btbLcs.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4 text-center">
              No back-to-back LCs
            </p>
          ) : (
            <div className="overflow-x-auto -mx-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">LC Number</TableHead>
                    <TableHead className="text-xs">Supplier</TableHead>
                    <TableHead className="text-xs">Purpose</TableHead>
                    <TableHead className="text-xs text-right">Value</TableHead>
                    <TableHead className="text-xs hidden md:table-cell">Maturity</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {btbLcs.map((btb) => {
                    const maturityDays = btb.maturity_date
                      ? differenceInDays(new Date(btb.maturity_date), new Date())
                      : null;
                    const maturityWarning =
                      maturityDays !== null && maturityDays >= 0 && maturityDays <= 7
                        ? "text-red-500 font-medium"
                        : maturityDays !== null && maturityDays >= 0 && maturityDays <= 14
                        ? "text-amber-500"
                        : "";
                    const purposeCls = PURPOSE_COLORS[btb.purpose] || PURPOSE_COLORS.other;
                    const btbCfg = BTB_STATUS_CONFIG[btb.status];

                    return (
                      <TableRow key={btb.id}>
                        <TableCell className="text-sm font-mono">{btb.lc_number}</TableCell>
                        <TableCell className="text-sm">{btb.supplier_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-xs capitalize", purposeCls)}>
                            {btb.purpose}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm font-mono text-right">
                          {fmt(btb.lc_value)}
                        </TableCell>
                        <TableCell className={cn("text-sm hidden md:table-cell", maturityWarning)}>
                          {btb.maturity_date ? (
                            <span className="flex items-center gap-1">
                              {fmtDate(btb.maturity_date)}
                              {maturityDays !== null && maturityDays >= 0 && maturityDays <= 14 && (
                                <AlertTriangle className="h-3.5 w-3.5" />
                              )}
                            </span>
                          ) : (
                            "\u2014"
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-xs", btbCfg.pill)}>
                            {btbCfg.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Select
                              value={btb.status}
                              onValueChange={async (val) => {
                                const ok = await updateBtbStatus(btb.id, val as BtbLC["status"]);
                                if (ok) refetch();
                              }}
                            >
                              <SelectTrigger className="h-7 w-[110px] text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(["opened", "docs_received", "accepted", "matured", "paid", "expired", "cancelled"] as BtbLC["status"][]).map((s) => (
                                  <SelectItem key={s} value={s} className="text-xs capitalize">
                                    {s.replace(/_/g, " ")}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => navigate(`/finance/lc/${btb.id}/edit?type=btb`)}
                              title="Edit BTB LC"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => setDeleteBtbTarget(btb.id)}
                              title="Delete BTB LC"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Shipments ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Ship className="h-4 w-4 text-muted-foreground" />
              Shipments
              <span className="text-xs font-normal text-muted-foreground">({shipments.length})</span>
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => setShipmentDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Shipment
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {shipments.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4 text-center">
              No shipments recorded
            </p>
          ) : (
            <div className="overflow-x-auto -mx-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-10">#</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs hidden md:table-cell">BL Number</TableHead>
                    <TableHead className="text-xs hidden lg:table-cell">Invoice</TableHead>
                    <TableHead className="text-xs text-right">Value</TableHead>
                    <TableHead className="text-xs text-right hidden sm:table-cell">Qty</TableHead>
                    <TableHead className="text-xs">Docs Status</TableHead>
                    <TableHead className="text-xs hidden md:table-cell">Payment</TableHead>
                    <TableHead className="text-xs w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shipments.map((s) => {
                    const docStatus = s.docs_accepted_date
                      ? "accepted"
                      : s.docs_submitted_date
                      ? "submitted"
                      : s.discrepancies
                      ? "discrepant"
                      : "pending";
                    const docCfg = SHIPMENT_DOC_STATUS[docStatus];
                    const paymentStatus = s.payment_received_date
                      ? "Received"
                      : s.docs_accepted_date
                      ? "Awaiting"
                      : "\u2014";

                    return (
                      <TableRow key={s.id}>
                        <TableCell className="text-sm font-mono text-muted-foreground">
                          {s.shipment_number}
                        </TableCell>
                        <TableCell className="text-sm">{fmtDate(s.shipment_date)}</TableCell>
                        <TableCell className="text-sm font-mono hidden md:table-cell">
                          {s.bl_number || "\u2014"}
                        </TableCell>
                        <TableCell className="text-sm hidden lg:table-cell">
                          {s.invoice_number || "\u2014"}
                        </TableCell>
                        <TableCell className="text-sm font-mono text-right">
                          {fmt(s.invoice_value)}
                        </TableCell>
                        <TableCell className="text-sm text-right hidden sm:table-cell">
                          {s.quantity ? fmtInt(s.quantity) : "\u2014"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-xs", docCfg.cls)}>
                            {docCfg.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm hidden md:table-cell">
                          {paymentStatus === "Received" ? (
                            <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                              Received
                            </Badge>
                          ) : paymentStatus === "Awaiting" ? (
                            <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-400 border-amber-500/20">
                              Awaiting
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">{paymentStatus}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {!s.docs_submitted_date && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 text-[10px] px-2"
                                onClick={async () => {
                                  await supabase.from("lc_shipments" as any).update({ docs_submitted_date: new Date().toISOString().split("T")[0] } as any).eq("id", s.id);
                                  refetch();
                                  toast.success("Marked docs as submitted");
                                }}
                              >
                                Submit Docs
                              </Button>
                            )}
                            {s.docs_submitted_date && !s.docs_accepted_date && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 text-[10px] px-2"
                                onClick={async () => {
                                  await supabase.from("lc_shipments" as any).update({ docs_accepted_date: new Date().toISOString().split("T")[0] } as any).eq("id", s.id);
                                  refetch();
                                  toast.success("Marked docs as accepted");
                                }}
                              >
                                Accept Docs
                              </Button>
                            )}
                            {s.docs_accepted_date && !s.payment_received_date && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 text-[10px] px-2 text-emerald-600"
                                onClick={async () => {
                                  await supabase.from("lc_shipments" as any).update({ payment_received_date: new Date().toISOString().split("T")[0], payment_amount: s.invoice_value } as any).eq("id", s.id);
                                  refetch();
                                  toast.success("Payment received");
                                }}
                              >
                                Payment Received
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => setDeleteShipmentTarget(s.id)}
                              title="Delete shipment"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Amendments Timeline ──────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Amendments
              <span className="text-xs font-normal text-muted-foreground">({amendments.length})</span>
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => setAmendmentDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Amendment
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {amendments.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4 text-center">
              No amendments
            </p>
          ) : (
            <div className="relative pl-6 space-y-6">
              {/* Timeline line */}
              <div className="absolute left-2.5 top-1 bottom-1 w-px bg-border" />

              {amendments.map((a) => (
                <div key={a.id} className="relative">
                  {/* Dot */}
                  <div className="absolute -left-6 top-1 h-5 w-5 rounded-full bg-background border-2 border-primary flex items-center justify-center">
                    <span className="text-[9px] font-bold text-primary">{a.amendment_number}</span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">Amendment #{a.amendment_number}</span>
                      <span className="text-xs text-muted-foreground">{fmtDate(a.amendment_date)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{a.description}</p>
                    {a.value_change !== 0 && (
                      <p className={cn(
                        "text-xs font-mono",
                        a.value_change > 0 ? "text-emerald-500" : "text-red-500"
                      )}>
                        Value change: {a.value_change > 0 ? "+" : ""}{fmt(a.value_change)}
                      </p>
                    )}
                    {a.new_expiry_date && (
                      <p className="text-xs text-muted-foreground">
                        New expiry: {fmtDate(a.new_expiry_date)}
                      </p>
                    )}
                    {a.new_shipment_date && (
                      <p className="text-xs text-muted-foreground">
                        New shipment date: {fmtDate(a.new_shipment_date)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Document Checklist ───────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-muted-foreground" />
                Document Checklist
                <span className="text-xs font-normal text-muted-foreground">
                  ({docsReadyCount} of {docsTotalCount} documents ready)
                </span>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleAddDefaultChecklist} disabled={docSaving || safeDocChecklistItems.length > 0}>
                  {docSaving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                  Add Default Checklist
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDocDialogOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add Document
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {docsTotalCount > 0 && (
              <div className="mb-4 space-y-1">
                <Progress value={docsTotalCount > 0 ? (docsReadyCount / docsTotalCount) * 100 : 0} className="h-2" />
                <p className="text-xs text-muted-foreground">{docsReadyCount} of {docsTotalCount} documents ready</p>
              </div>
            )}
            {safeDocChecklistItems.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-4 text-center">
                No documents in checklist
              </p>
            ) : (
              <div className="overflow-x-auto -mx-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Document Name</TableHead>
                      <TableHead className="text-xs hidden md:table-cell">Description</TableHead>
                      <TableHead className="text-xs text-center w-16">Orig.</TableHead>
                      <TableHead className="text-xs text-center w-16">Copies</TableHead>
                      <TableHead className="text-xs hidden lg:table-cell">Special Instructions</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs w-20">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {safeDocChecklistItems.map((doc) => {
                      const statusCfg = DOC_STATUS_CONFIG[doc.status];
                      return (
                        <TableRow key={doc.id}>
                          <TableCell className="text-sm font-medium">{doc.document_name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground hidden md:table-cell">{doc.description || "\u2014"}</TableCell>
                          <TableCell className="text-sm text-center font-mono">{doc.originals_required}</TableCell>
                          <TableCell className="text-sm text-center font-mono">{doc.copies_required}</TableCell>
                          <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">{doc.special_instructions || "\u2014"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("text-xs", statusCfg.cls)}>
                              {statusCfg.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Select
                                value={doc.status}
                                onValueChange={async (val) => {
                                  const ok = await updateDocStatus(doc.id, val as LCDocChecklistItem["status"]);
                                  if (ok) refetchDocs();
                                }}
                              >
                                <SelectTrigger className="h-7 w-[130px] text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {DOC_STATUS_CYCLE.map((s) => (
                                    <SelectItem key={s} value={s} className="text-xs">
                                      {DOC_STATUS_CONFIG[s].label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => setDeleteDocTarget(doc.id)}
                                title="Delete document"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Banking Costs ────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Banknote className="h-4 w-4 text-muted-foreground" />
                Banking Costs
                <span className="text-xs font-normal text-muted-foreground">({safeBankingCosts.length})</span>
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => { setCostForm((f) => ({ ...f, currency: lc.currency })); setCostDialogOpen(true); }}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add Cost
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {safeBankingCosts.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-4 text-center">
                No banking costs recorded
              </p>
            ) : (
              <div className="overflow-x-auto -mx-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs hidden md:table-cell">Description</TableHead>
                      <TableHead className="text-xs text-right">Amount</TableHead>
                      <TableHead className="text-xs hidden sm:table-cell">Currency</TableHead>
                      <TableHead className="text-xs hidden lg:table-cell">Reference</TableHead>
                      <TableHead className="text-xs w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {safeBankingCosts.map((c) => {
                      const typeCls = COST_TYPE_COLORS[c.cost_type] || COST_TYPE_COLORS.other;
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="text-sm">{fmtDate(c.date_incurred)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("text-xs capitalize", typeCls)}>
                              {c.cost_type.replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground hidden md:table-cell">{c.description || "\u2014"}</TableCell>
                          <TableCell className="text-sm font-mono text-right">{fmt(c.amount)}</TableCell>
                          <TableCell className="text-sm hidden sm:table-cell">{c.currency}</TableCell>
                          <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">{c.reference || "\u2014"}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => setDeleteCostTarget(c.id)}
                              title="Delete cost"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={3} className="text-sm font-semibold">Total</TableCell>
                      <TableCell className="text-sm font-mono font-bold text-right">{fmt(bankingCostTotal)}</TableCell>
                      <TableCell colSpan={3} />
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Discrepancies ────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <CircleAlert className="h-4 w-4 text-muted-foreground" />
                Discrepancies
                <span className="text-xs font-normal text-muted-foreground">({safeDiscrepancies.length})</span>
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => setDiscrepancyDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Log Discrepancy
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {safeDiscrepancies.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-4 text-center">
                No discrepancies recorded
              </p>
            ) : (
              <div className="relative pl-6 space-y-6">
                <div className="absolute left-2.5 top-1 bottom-1 w-px bg-border" />

                {safeDiscrepancies.map((d) => {
                  const isPending = d.status === "pending";
                  const items = Array.isArray(d.discrepancy_items) ? d.discrepancy_items : [];
                  return (
                    <div key={d.id} className={cn("relative", isPending && "bg-red-500/5 -mx-3 px-3 py-2 rounded-lg")}>
                      <div className={cn(
                        "absolute -left-6 top-1 h-5 w-5 rounded-full border-2 flex items-center justify-center",
                        isPending ? "bg-red-500/20 border-red-500" : d.status === "rejected" ? "bg-red-500/20 border-red-500" : "bg-emerald-500/20 border-emerald-500"
                      )}>
                        {isPending ? (
                          <AlertTriangle className="h-3 w-3 text-red-500" />
                        ) : d.status === "rejected" ? (
                          <XCircle className="h-3 w-3 text-red-500" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold">{fmtDate(d.notice_date)}</span>
                          <Badge variant="outline" className={cn("text-xs", isPending ? "bg-red-500/10 text-red-400 border-red-500/20" : d.status === "rejected" ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20")}>
                            {isPending ? "Pending" : d.status === "rejected" ? "Rejected" : "Resolved"}
                          </Badge>
                        </div>
                        <ul className="list-disc list-inside space-y-0.5">
                          {items.map((item: string, idx: number) => (
                            <li key={idx} className="text-sm text-muted-foreground">{item}</li>
                          ))}
                        </ul>
                        {d.bank_charges > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Bank charges: <span className="font-mono">{lc.currency} {fmt(d.bank_charges)}</span>
                          </p>
                        )}
                        {!isPending && (d.resolution || d.resolution_date) && (
                          <div className="flex items-center gap-2 flex-wrap mt-1 text-xs">
                            {d.resolution && (
                              <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/20 capitalize">
                                {d.resolution.replace(/_/g, " ")}
                              </Badge>
                            )}
                            {d.resolution_date && (
                              <span className="text-muted-foreground">
                                Resolved {fmtDate(d.resolution_date)}
                              </span>
                            )}
                          </div>
                        )}
                        {d.resolution_notes && (
                          <p className="text-xs text-muted-foreground italic">
                            Notes: {d.resolution_notes}
                          </p>
                        )}
                        {isPending && (
                          <Button
                            variant="default"
                            size="sm"
                            className="mt-2 h-8 text-xs bg-red-600 hover:bg-red-700 text-white"
                            onClick={() => {
                              setResolveTarget(d.id);
                              setResolveDialogOpen(true);
                            }}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                            Resolve Discrepancy
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Notes ────────────────────────────────────────────────────────── */}
      {lc.notes && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{lc.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* ── Delete Confirmation ──────────────────────────────────────────── */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete LC?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete LC <strong>{lc.lc_number}</strong> and all related data
              including amendments, shipments, and BTB LCs. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Add Shipment Dialog ──────────────────────────────────────────── */}
      <Dialog open={shipmentDialogOpen} onOpenChange={setShipmentDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Shipment</DialogTitle>
            <DialogDescription>Record a new shipment against this LC.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="s-date">Shipment Date *</Label>
                <Input
                  id="s-date"
                  type="date"
                  value={shipmentForm.shipment_date}
                  onChange={(e) => setShipmentForm((f) => ({ ...f, shipment_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-bl-date">BL Date</Label>
                <Input
                  id="s-bl-date"
                  type="date"
                  value={shipmentForm.bl_date}
                  onChange={(e) => setShipmentForm((f) => ({ ...f, bl_date: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="s-bl">BL Number</Label>
                <Input
                  id="s-bl"
                  value={shipmentForm.bl_number}
                  onChange={(e) => setShipmentForm((f) => ({ ...f, bl_number: e.target.value }))}
                  placeholder="e.g. MEDU1234567"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-inv">Invoice Number</Label>
                <Input
                  id="s-inv"
                  value={shipmentForm.invoice_number}
                  onChange={(e) => setShipmentForm((f) => ({ ...f, invoice_number: e.target.value }))}
                  placeholder="e.g. INV-001"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="s-val">Invoice Value *</Label>
                <Input
                  id="s-val"
                  type="number"
                  step="0.01"
                  value={shipmentForm.invoice_value}
                  onChange={(e) => setShipmentForm((f) => ({ ...f, invoice_value: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-qty">Quantity</Label>
                <Input
                  id="s-qty"
                  type="number"
                  value={shipmentForm.quantity}
                  onChange={(e) => setShipmentForm((f) => ({ ...f, quantity: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="s-vessel">Vessel Name</Label>
                <Input
                  id="s-vessel"
                  value={shipmentForm.vessel_name}
                  onChange={(e) => setShipmentForm((f) => ({ ...f, vessel_name: e.target.value }))}
                  placeholder="e.g. MSC GULSUN"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-container">Container Number</Label>
                <Input
                  id="s-container"
                  value={shipmentForm.container_number}
                  onChange={(e) => setShipmentForm((f) => ({ ...f, container_number: e.target.value }))}
                  placeholder="e.g. MSCU1234567"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-notes">Notes</Label>
              <Textarea
                id="s-notes"
                value={shipmentForm.notes}
                onChange={(e) => setShipmentForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShipmentDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddShipment} disabled={saving || !shipmentForm.shipment_date}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Add Shipment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add BTB LC Dialog ────────────────────────────────────────────── */}
      <Dialog open={btbDialogOpen} onOpenChange={setBtbDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Back-to-Back LC</DialogTitle>
            <DialogDescription>Link a new BTB LC to this master LC.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="btb-num">LC Number *</Label>
                <Input
                  id="btb-num"
                  value={btbForm.lc_number}
                  onChange={(e) => setBtbForm((f) => ({ ...f, lc_number: e.target.value }))}
                  placeholder="e.g. BTB-2024-001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="btb-supplier">Supplier *</Label>
                <Input
                  id="btb-supplier"
                  value={btbForm.supplier_name}
                  onChange={(e) => setBtbForm((f) => ({ ...f, supplier_name: e.target.value }))}
                  placeholder="Supplier name"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Purpose</Label>
                <Select
                  value={btbForm.purpose}
                  onValueChange={(v) => setBtbForm((f) => ({ ...f, purpose: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fabric">Fabric</SelectItem>
                    <SelectItem value="trims">Trims</SelectItem>
                    <SelectItem value="accessories">Accessories</SelectItem>
                    <SelectItem value="yarn">Yarn</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="btb-val">LC Value *</Label>
                <Input
                  id="btb-val"
                  type="number"
                  step="0.01"
                  value={btbForm.lc_value}
                  onChange={(e) => setBtbForm((f) => ({ ...f, lc_value: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="btb-margin">Margin %</Label>
                <Input
                  id="btb-margin"
                  type="number"
                  step="0.01"
                  value={btbForm.margin_pct}
                  onChange={(e) => setBtbForm((f) => ({ ...f, margin_pct: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="btb-tenor">Tenor Days</Label>
                <Input
                  id="btb-tenor"
                  type="number"
                  value={btbForm.tenor_days}
                  onChange={(e) => setBtbForm((f) => ({ ...f, tenor_days: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="btb-issue">Issue Date</Label>
                <Input
                  id="btb-issue"
                  type="date"
                  value={btbForm.issue_date}
                  onChange={(e) => setBtbForm((f) => ({ ...f, issue_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="btb-expiry">Expiry Date</Label>
                <Input
                  id="btb-expiry"
                  type="date"
                  value={btbForm.expiry_date}
                  onChange={(e) => setBtbForm((f) => ({ ...f, expiry_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="btb-maturity">Maturity Date</Label>
                <Input
                  id="btb-maturity"
                  type="date"
                  value={btbForm.maturity_date}
                  onChange={(e) => setBtbForm((f) => ({ ...f, maturity_date: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="btb-port">Port of Loading</Label>
              <Input
                id="btb-port"
                value={btbForm.port_of_loading}
                onChange={(e) => setBtbForm((f) => ({ ...f, port_of_loading: e.target.value }))}
                placeholder="e.g. Shanghai"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="btb-notes">Notes</Label>
              <Textarea
                id="btb-notes"
                value={btbForm.notes}
                onChange={(e) => setBtbForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBtbDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddBtbLC}
              disabled={btbSaving || !btbForm.lc_number || !btbForm.supplier_name}
            >
              {btbSaving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Add BTB LC
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Amendment Dialog ─────────────────────────────────────────── */}
      <Dialog open={amendmentDialogOpen} onOpenChange={setAmendmentDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Amendment</DialogTitle>
            <DialogDescription>Record an amendment to this LC.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="a-desc">Description *</Label>
              <Textarea
                id="a-desc"
                value={amendmentForm.description}
                onChange={(e) => setAmendmentForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                placeholder="Describe the amendment..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="a-val">Value Change</Label>
              <Input
                id="a-val"
                type="number"
                step="0.01"
                value={amendmentForm.value_change}
                onChange={(e) => setAmendmentForm((f) => ({ ...f, value_change: e.target.value }))}
                placeholder="0.00 (positive to increase, negative to decrease)"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="a-expiry">New Expiry Date</Label>
                <Input
                  id="a-expiry"
                  type="date"
                  value={amendmentForm.new_expiry_date}
                  onChange={(e) => setAmendmentForm((f) => ({ ...f, new_expiry_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="a-ship">New Shipment Date</Label>
                <Input
                  id="a-ship"
                  type="date"
                  value={amendmentForm.new_shipment_date}
                  onChange={(e) => setAmendmentForm((f) => ({ ...f, new_shipment_date: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAmendmentDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddAmendment}
              disabled={saving || !amendmentForm.description.trim()}
            >
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Add Amendment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Document Dialog ──────────────────────────────────────────── */}
      <Dialog open={docDialogOpen} onOpenChange={setDocDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Document</DialogTitle>
            <DialogDescription>Add a document to the LC checklist.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Document Name *</Label>
              <Input
                value={docForm.document_name}
                onChange={(e) => setDocForm((f) => ({ ...f, document_name: e.target.value }))}
                placeholder="e.g. Commercial Invoice"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={docForm.description}
                onChange={(e) => setDocForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Brief description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Originals Required</Label>
                <Input
                  type="number"
                  min="0"
                  value={docForm.originals_required}
                  onChange={(e) => setDocForm((f) => ({ ...f, originals_required: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Copies Required</Label>
                <Input
                  type="number"
                  min="0"
                  value={docForm.copies_required}
                  onChange={(e) => setDocForm((f) => ({ ...f, copies_required: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Special Instructions</Label>
              <Textarea
                value={docForm.special_instructions}
                onChange={(e) => setDocForm((f) => ({ ...f, special_instructions: e.target.value }))}
                rows={2}
                placeholder="Any special instructions..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddDoc} disabled={docSaving || !docForm.document_name.trim()}>
              {docSaving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Add Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Banking Cost Dialog ──────────────────────────────────────── */}
      <Dialog open={costDialogOpen} onOpenChange={setCostDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Banking Cost</DialogTitle>
            <DialogDescription>Record a banking charge or fee for this LC.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={costForm.date_incurred}
                  onChange={(e) => setCostForm((f) => ({ ...f, date_incurred: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Cost Type</Label>
                <Select value={costForm.cost_type} onValueChange={(v) => setCostForm((f) => ({ ...f, cost_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="opening_commission">Opening Commission</SelectItem>
                    <SelectItem value="advising_fee">Advising Fee</SelectItem>
                    <SelectItem value="confirmation_fee">Confirmation Fee</SelectItem>
                    <SelectItem value="amendment_fee">Amendment Fee</SelectItem>
                    <SelectItem value="negotiation_fee">Negotiation Fee</SelectItem>
                    <SelectItem value="discrepancy_fee">Discrepancy Fee</SelectItem>
                    <SelectItem value="swift_charges">SWIFT Charges</SelectItem>
                    <SelectItem value="courier_charges">Courier Charges</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={costForm.description}
                onChange={(e) => setCostForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Brief description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Amount *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={costForm.amount}
                  onChange={(e) => setCostForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={costForm.currency} onValueChange={(v) => setCostForm((f) => ({ ...f, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="BDT">BDT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reference</Label>
              <Input
                value={costForm.reference}
                onChange={(e) => setCostForm((f) => ({ ...f, reference: e.target.value }))}
                placeholder="Bank reference number"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCostDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddCost} disabled={costSaving || !costForm.amount || !costForm.date_incurred}>
              {costSaving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Add Cost
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Log Discrepancy Dialog ───────────────────────────────────────── */}
      <Dialog open={discrepancyDialogOpen} onOpenChange={setDiscrepancyDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Log Discrepancy</DialogTitle>
            <DialogDescription>Record a document discrepancy notice.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Notice Date *</Label>
                <Input
                  type="date"
                  value={discrepancyForm.notice_date}
                  onChange={(e) => setDiscrepancyForm((f) => ({ ...f, notice_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Bank Charges</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={discrepancyForm.bank_charges}
                  onChange={(e) => setDiscrepancyForm((f) => ({ ...f, bank_charges: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
            </div>
            {shipments.length > 0 && (
              <div className="space-y-2">
                <Label>Linked Shipment</Label>
                <Select
                  value={discrepancyForm.shipment_id || "none"}
                  onValueChange={(v) => setDiscrepancyForm((f) => ({ ...f, shipment_id: v === "none" ? "" : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Select shipment..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No linked shipment</SelectItem>
                    {shipments.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        Shipment #{s.shipment_number} - {s.bl_number || fmtDate(s.shipment_date)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Discrepancy Items *</Label>
              {discrepancyForm.discrepancy_items.map((item, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input
                    value={item}
                    onChange={(e) => {
                      const updated = [...discrepancyForm.discrepancy_items];
                      updated[idx] = e.target.value;
                      setDiscrepancyForm((f) => ({ ...f, discrepancy_items: updated }));
                    }}
                    placeholder={`Discrepancy item ${idx + 1}`}
                  />
                  {discrepancyForm.discrepancy_items.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 h-10 w-10"
                      onClick={() => {
                        const updated = discrepancyForm.discrepancy_items.filter((_, i) => i !== idx);
                        setDiscrepancyForm((f) => ({ ...f, discrepancy_items: updated }));
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDiscrepancyForm((f) => ({ ...f, discrepancy_items: [...f.discrepancy_items, ""] }))}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Item
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscrepancyDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleLogDiscrepancy}
              disabled={discrepancySaving || !discrepancyForm.notice_date || discrepancyForm.discrepancy_items.every((i) => !i.trim())}
            >
              {discrepancySaving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Log Discrepancy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Resolve Discrepancy Dialog ───────────────────────────────────── */}
      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resolve Discrepancy</DialogTitle>
            <DialogDescription>Record how this discrepancy was resolved.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Resolution Type *</Label>
              <Select
                value={resolveForm.resolution || "buyer_authorized"}
                onValueChange={(v) => setResolveForm((f) => ({ ...f, resolution: v as LCDiscrepancy["resolution"] }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="buyer_authorized">Buyer Authorized</SelectItem>
                  <SelectItem value="docs_corrected">Documents Corrected</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Resolution Date *</Label>
              <Input
                type="date"
                value={resolveForm.resolution_date}
                onChange={(e) => setResolveForm((f) => ({ ...f, resolution_date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={resolveForm.resolution_notes}
                onChange={(e) => setResolveForm((f) => ({ ...f, resolution_notes: e.target.value }))}
                rows={3}
                placeholder="Resolution details..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleResolve}
              disabled={discrepancySaving || !resolveForm.resolution_date}
            >
              {discrepancySaving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Resolve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete BTB LC Confirmation ──────────────────────────────────── */}
      <AlertDialog open={!!deleteBtbTarget} onOpenChange={(open) => { if (!open) setDeleteBtbTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete BTB LC?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this back-to-back LC. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteBtb} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Shipment Confirmation ────────────────────────────────── */}
      <AlertDialog open={!!deleteShipmentTarget} onOpenChange={(open) => { if (!open) setDeleteShipmentTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Shipment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this shipment record. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteShipment} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Banking Cost Confirmation ─────────────────────────────── */}
      <AlertDialog open={!!deleteCostTarget} onOpenChange={(open) => { if (!open) setDeleteCostTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Banking Cost?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this banking cost record. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCost} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Document Confirmation ─────────────────────────────────── */}
      <AlertDialog open={!!deleteDocTarget} onOpenChange={(open) => { if (!open) setDeleteDocTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove this document from the checklist. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteDoc} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
