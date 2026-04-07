import { useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  FileText,
  Pencil,
  Trash2,
  FileDown,
  Plus,
  Upload,
  Clock,
  AlertCircle,
  Package,
  Ship,
  DollarSign,
  Calendar,
  Loader2,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { motion } from "framer-motion";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  useSalesContract,
  useSalesContractMutations,
  useExtractPO,
  type SalesContract,
  type ContractItem,
  type ContractAmendment,
  type ContractDocument,
} from "@/hooks/useSalesContracts";
import { useFactoryFinanceSettings, type FactoryFinanceSettings } from "@/hooks/useFactoryFinanceSettings";
import { useUserSignature } from "@/hooks/useUserSignature";
import { cn } from "@/lib/utils";

// ── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<SalesContract["status"], { label: string; pill: string }> = {
  draft:         { label: "Draft",         pill: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
  confirmed:     { label: "Confirmed",     pill: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  in_production: { label: "In Production", pill: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  shipped:       { label: "Shipped",       pill: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  completed:     { label: "Completed",     pill: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  cancelled:     { label: "Cancelled",     pill: "bg-red-500/10 text-red-400 border-red-500/20" },
};

const EXTRACTION_STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  pending:   { label: "Pending",   cls: "bg-amber-500/10 text-amber-400" },
  completed: { label: "Extracted", cls: "bg-emerald-500/10 text-emerald-400" },
  failed:    { label: "Failed",    cls: "bg-red-500/10 text-red-400" },
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

// ── PDF Generation ──────────────────────────────────────────────────────────

async function generateContractPdf(sc: SalesContract, settings: FactoryFinanceSettings | null, signatureUrl?: string | null, stampUrl?: string | null) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const ml = 15;
  const mr = 15;
  const cw = pw - ml - mr;
  let y = 20;
  let pageNum = 1;

  // ── Helpers ──────────────────────────────────────────────────────────────

  const drawPageFooter = () => {
    doc.setDrawColor(180);
    doc.setLineWidth(0.3);
    doc.line(ml, ph - 14, pw - mr, ph - 14);
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(`Page ${pageNum}`, pw / 2, ph - 9, { align: "center" });
    doc.setTextColor(0);
  };

  const newPage = () => {
    drawPageFooter();
    doc.addPage();
    pageNum++;
    y = 20;
  };

  const ensureSpace = (need: number) => {
    if (y + need > ph - 22) newPage();
  };

  const sectionHeader = (num: string, title: string) => {
    ensureSpace(12);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text(`${num}. ${title}`, ml, y);
    y += 5;
  };

  const bodyText = (text: string, indent = 0) => {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0);
    const lines = doc.splitTextToSize(text, cw - indent);
    lines.forEach((line: string) => {
      ensureSpace(5);
      doc.text(line, ml + indent, y);
      y += 4;
    });
  };

  const bodyBoldText = (text: string, indent = 0) => {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    const lines = doc.splitTextToSize(text, cw - indent);
    lines.forEach((line: string) => {
      ensureSpace(5);
      doc.text(line, ml + indent, y);
      y += 4;
    });
  };

  // ── Derived data ─────────────────────────────────────────────────────────

  const items = sc.sales_contract_items ?? [];
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const totalVal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);

  const factoryName = settings?.seller_name || "Factory (Seller)";
  const factoryAddr = [settings?.seller_address, settings?.seller_city, settings?.seller_country]
    .filter(Boolean)
    .join(", ") || "";

  const contractDateFormatted = sc.contract_date
    ? format(new Date(sc.contract_date), "dd MMMM yyyy")
    : "\u2014";

  // Group items by PO number
  const poGroups = new Map<string, ContractItem[]>();
  items.forEach((item) => {
    const po = item.po_number || "N/A";
    if (!poGroups.has(po)) poGroups.set(po, []);
    poGroups.get(po)!.push(item);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // PAGE 1 — Title + Sections 01-07
  // ═════════════════════════════════════════════════════════════════════════

  // Title
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  const titleText = "IRREVOCABLE SALES CONTRACT";
  doc.text(titleText, pw / 2, y, { align: "center" });
  // Underline
  const titleW = doc.getTextWidth(titleText);
  doc.setLineWidth(0.5);
  doc.setDrawColor(0);
  doc.line(pw / 2 - titleW / 2, y + 1.5, pw / 2 + titleW / 2, y + 1.5);
  y += 10;

  // Contract No & Date centered
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Contract No.: ${sc.contract_number}`, pw / 2, y, { align: "center" });
  y += 5;
  doc.text(`Date of Issue: ${contractDateFormatted}`, pw / 2, y, { align: "center" });
  y += 10;

  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(ml, y, pw - mr, y);
  y += 8;

  // 01 — Beneficiary
  sectionHeader("01", "Beneficiary's Name:");
  bodyText(factoryName, 4);
  if (factoryAddr) bodyText(factoryAddr, 4);
  y += 3;

  // 02 — Beneficiary's Bank
  sectionHeader("02", "Beneficiary's Bank:");
  if (sc.beneficiary_bank_name) bodyText(sc.beneficiary_bank_name, 4);
  if (sc.beneficiary_bank_branch) bodyText(sc.beneficiary_bank_branch, 4);
  if (sc.beneficiary_bank_address) bodyText(sc.beneficiary_bank_address, 4);
  const swiftAcct: string[] = [];
  if (sc.beneficiary_bank_swift) swiftAcct.push(`SWIFT: ${sc.beneficiary_bank_swift}`);
  if (sc.beneficiary_bank_account) swiftAcct.push(`C/D Account No. ${sc.beneficiary_bank_account}`);
  if (swiftAcct.length) bodyText(swiftAcct.join(", "), 4);
  y += 3;

  // 03 — Applicant
  sectionHeader("03", "Applicant's Name:");
  bodyText(sc.applicant_name || sc.buyer_name, 4);
  if (sc.applicant_address || sc.buyer_address)
    bodyText(sc.applicant_address || sc.buyer_address || "", 4);
  y += 3;

  // 04 — Applicant's Bank
  sectionHeader("04", "Applicant's Bank:");
  if (sc.applicant_bank_name) bodyText(sc.applicant_bank_name, 4);
  if (sc.applicant_bank_address) bodyText(sc.applicant_bank_address, 4);
  if (sc.applicant_bank_iban) bodyText(`IBAN: ${sc.applicant_bank_iban}`, 4);
  if (sc.applicant_bank_swift) bodyText(`BIC/SWIFT: ${sc.applicant_bank_swift}`, 4);
  if (sc.applicant_bank_account) bodyText(`ACCOUNT NUMBER: ${sc.applicant_bank_account}`, 4);
  y += 3;

  // 05 — Notify Party / Ultimate Buyer
  sectionHeader("05", "Notify Party / Ultimate Buyer:");
  if (sc.notify_party_name) bodyText(sc.notify_party_name, 4);
  if (sc.notify_party_address) bodyText(sc.notify_party_address, 4);
  if (sc.notify_party_contact) bodyText(sc.notify_party_contact, 4);
  if (sc.notify_party_note) bodyText(sc.notify_party_note, 4);
  y += 3;

  // 06 — Port and Country Details
  sectionHeader("06", "Port and Country Details:");
  const portDetails: [string, string][] = [
    ["Port of Loading:", sc.port_of_loading || "\u2014"],
    ["Port of Discharge:", sc.port_of_discharge || "\u2014"],
    ["Place of Delivery:", sc.place_of_delivery || sc.port_of_discharge || "\u2014"],
    ["Country of Origin:", sc.country_of_origin || "\u2014"],
    ["Country of Destination:", sc.port_of_discharge ? sc.port_of_discharge.split(",").pop()?.trim() || "\u2014" : "\u2014"],
  ];
  portDetails.forEach(([label, value]) => {
    ensureSpace(5);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(label, ml + 4, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, ml + 50, y);
    y += 4.5;
  });
  y += 3;

  // 07 — Details Description of the Goods
  sectionHeader("07", "Details Description of the Goods:");
  if (poGroups.size > 1) {
    bodyText(`This contract covers ${poGroups.size} Purchase Orders as detailed below.`, 4);
  }
  y += 2;

  // ── Items Table ──────────────────────────────────────────────────────────

  const colWidths = [20, 22, 38, 18, 18, 22, 22, 22];
  const colHeaders = ["PO#", "Style", "Description", "Color", "Qty", "Unit Price", "Total (USD)", "Delivery"];
  const tableW = colWidths.reduce((a, b) => a + b, 0);
  const tableX = ml;
  const rowH = 6;
  const headerH = 7;

  const drawTableHeader = () => {
    ensureSpace(headerH + rowH);
    doc.setFillColor(30, 30, 40);
    doc.rect(tableX, y, tableW, headerH, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255);
    let cx = tableX + 1;
    colHeaders.forEach((h, i) => {
      doc.text(h, cx, y + 5);
      cx += colWidths[i];
    });
    y += headerH;
    doc.setTextColor(0);
  };

  const drawTableRow = (cells: string[], isBold = false, fillColor?: [number, number, number]) => {
    ensureSpace(rowH + 2);
    if (y + rowH > ph - 22) {
      // Draw bottom line before page break
      doc.setDrawColor(180);
      doc.line(tableX, y, tableX + tableW, y);
      newPage();
      drawTableHeader();
    }
    if (fillColor) {
      doc.setFillColor(fillColor[0], fillColor[1], fillColor[2]);
      doc.rect(tableX, y, tableW, rowH, "F");
    }
    doc.setFontSize(7);
    doc.setFont("helvetica", isBold ? "bold" : "normal");
    doc.setTextColor(0);
    let cx = tableX + 1;
    cells.forEach((cell, i) => {
      const maxW = colWidths[i] - 2;
      const truncated = doc.getTextWidth(cell) > maxW ? cell.substring(0, Math.floor(maxW / 2)) + ".." : cell;
      doc.text(truncated, cx, y + 4);
      cx += colWidths[i];
    });
    // Draw grid lines for this row
    doc.setDrawColor(200);
    doc.setLineWidth(0.2);
    doc.line(tableX, y + rowH, tableX + tableW, y + rowH);
    y += rowH;
  };

  drawTableHeader();

  let grandTotalQty = 0;
  let grandTotalVal = 0;

  poGroups.forEach((poItems, poNum) => {
    // PO group header
    const buyer = sc.buyer_name;
    const customer = poItems[0]?.end_customer || sc.end_customer || "";
    const poHeaderText = `PO# ${poNum}` +
      (buyer ? ` | Buyer: ${buyer}` : "") +
      (customer ? ` | Customer: ${customer}` : "");

    ensureSpace(rowH * 2);
    if (y + rowH > ph - 22) {
      doc.setDrawColor(180);
      doc.line(tableX, y, tableX + tableW, y);
      newPage();
      drawTableHeader();
    }
    doc.setFillColor(230, 240, 255);
    doc.rect(tableX, y, tableW, rowH, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 60, 120);
    doc.text(poHeaderText, tableX + 2, y + 4);
    doc.setDrawColor(200);
    doc.line(tableX, y + rowH, tableX + tableW, y + rowH);
    y += rowH;
    doc.setTextColor(0);

    let poQty = 0;
    let poVal = 0;

    poItems.forEach((item, ri) => {
      const val = item.quantity * item.unit_price;
      poQty += item.quantity;
      poVal += val;
      const fillColor: [number, number, number] | undefined = ri % 2 === 0 ? [248, 250, 252] : undefined;
      drawTableRow(
        [
          "", // PO# already in header
          item.style_ref || "",
          (item.style_description ?? "").substring(0, 30),
          (item.color ?? "").substring(0, 12),
          fmtInt(item.quantity),
          fmt(item.unit_price),
          fmt(val),
          item.delivery_date ? format(new Date(item.delivery_date), "dd-MMM-yy") : (item.ship_date ? format(new Date(item.ship_date), "dd-MMM-yy") : "\u2014"),
        ],
        false,
        fillColor
      );
    });

    // PO subtotal
    drawTableRow(
      ["", "", "", `Subtotal PO# ${poNum}`, fmtInt(poQty), "", fmt(poVal), ""],
      true,
      [240, 240, 248]
    );

    grandTotalQty += poQty;
    grandTotalVal += poVal;
  });

  // Grand total row
  ensureSpace(8);
  doc.setFillColor(30, 30, 40);
  doc.rect(tableX, y, tableW, headerH, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255);
  doc.text("GRAND TOTAL", tableX + 2, y + 5);
  let cx = tableX + 1;
  const grandCells = ["", "", "", "", fmtInt(grandTotalQty), "", `USD ${fmt(grandTotalVal)}`, ""];
  grandCells.forEach((cell, i) => {
    if (cell) doc.text(cell, cx, y + 5);
    cx += colWidths[i];
  });
  y += headerH + 2;
  doc.setTextColor(0);

  // ═════════════════════════════════════════════════════════════════════════
  // Sections 08 - 16 (continues, may span pages)
  // ═════════════════════════════════════════════════════════════════════════

  y += 5;

  // 08 — Total Value
  sectionHeader("08", "Total Value:");
  const totalValueText = sc.total_value_text || "";
  bodyText(`USD $${fmt(grandTotalVal)}${totalValueText ? ` (${totalValueText}) Only.` : ""}`, 4);
  y += 3;

  // 09 — Foreign Agent Commission
  sectionHeader("09", "Foreign Agent Commission:");
  if (sc.commission_pct > 0) {
    bodyText(`Commission: ${sc.commission_pct}%${sc.commission_per_piece ? ` / USD ${fmt(sc.commission_per_piece)} per piece` : ""} on FOB Value`, 4);
    if (sc.agent_name) bodyText(`Agent: ${sc.agent_name}`, 4);
    if (sc.agent_bank_name) bodyText(`Agent's Bank: ${sc.agent_bank_name}`, 4);
    if (sc.agent_bank_address) bodyText(sc.agent_bank_address, 4);
    if (sc.agent_bank_iban) bodyText(`IBAN: ${sc.agent_bank_iban}`, 4);
    if (sc.agent_bank_swift) bodyText(`SWIFT: ${sc.agent_bank_swift}`, 4);
    if (sc.agent_bank_account) bodyText(`Account: ${sc.agent_bank_account}`, 4);
  } else {
    bodyText("N/A (No foreign agent commission applicable)", 4);
  }
  y += 3;

  // 10 — Shipment Date & Destination
  sectionHeader("10", "Shipment Date & Destination:");
  const earliestDelivery = items
    .map((i) => i.delivery_date || i.ship_date)
    .filter(Boolean)
    .sort()[0];
  const latestDelivery = items
    .map((i) => i.delivery_date || i.ship_date)
    .filter(Boolean)
    .sort()
    .pop();
  if (earliestDelivery && latestDelivery) {
    bodyText(`Ex-Port Date: ${format(new Date(earliestDelivery), "dd MMMM yyyy")} to ${format(new Date(latestDelivery), "dd MMMM yyyy")}`, 4);
  } else if (earliestDelivery) {
    bodyText(`Ex-Port Date: ${format(new Date(earliestDelivery), "dd MMMM yyyy")}`, 4);
  }
  bodyText(`From: ${sc.port_of_loading || "\u2014"}`, 4);
  bodyText(`To: ${sc.port_of_discharge || "\u2014"}`, 4);
  y += 3;

  // 11 — Shipment Mode
  sectionHeader("11", "Shipment Mode:");
  bodyText(sc.shipment_mode || "By Sea", 4);
  y += 3;

  // 12 — Expiry Date
  sectionHeader("12", "Expiry Date:");
  bodyText(sc.expiry_date ? format(new Date(sc.expiry_date), "dd MMMM yyyy") : "\u2014", 4);
  y += 3;

  // 13 — Tolerance
  sectionHeader("13", "Tolerance (Value and Quantity):");
  bodyText(`${sc.tolerance_pct ?? 0}% +/- on Value and Quantity.`, 4);
  y += 3;

  // 14 — Documents Required
  sectionHeader("14", "Documents Required:");
  if (sc.documents_required) {
    const docLines = sc.documents_required.split("\n");
    docLines.forEach((line) => {
      bodyText(line, 4);
    });
  } else {
    bodyText("As per standard export documentation requirements.", 4);
  }
  y += 3;

  // 15 — Payment Term
  sectionHeader("15", "Payment Term:");
  bodyText(sc.payment_terms || "\u2014", 4);
  y += 3;

  // 16 — Additional Clauses
  sectionHeader("16", "Additional Clauses:");
  if (sc.additional_clauses) {
    const clauseLines = sc.additional_clauses.split("\n");
    clauseLines.forEach((line) => {
      bodyText(line, 4);
    });
  } else {
    bodyText("N/A", 4);
  }
  y += 10;

  // ── Signature Blocks ─────────────────────────────────────────────────────

  const sigBlockH = (signatureUrl || stampUrl) ? 55 : 40;
  ensureSpace(sigBlockH);
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);

  const sigColW = (cw - 20) / 2;
  const sigLeftX = ml;
  const sigRightX = ml + sigColW + 20;

  // Add signature/stamp images on the beneficiary (right) side
  if (signatureUrl || stampUrl) {
    try {
      if (stampUrl) {
        const stampResp = await fetch(stampUrl);
        const stampBlob = await stampResp.blob();
        const stampBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(stampBlob);
        });
        doc.addImage(stampBase64, "PNG", sigRightX + sigColW - 35, y, 30, 15);
      }
      if (signatureUrl) {
        const sigResp = await fetch(signatureUrl);
        const sigBlob = await sigResp.blob();
        const sigBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(sigBlob);
        });
        doc.addImage(sigBase64, "PNG", sigRightX, y, 35, 18);
      }
    } catch (e) {
      console.warn("Failed to load signature/stamp images:", e);
    }
  }

  // Signature lines
  const sigLineY = y + ((signatureUrl || stampUrl) ? 25 : 20);
  doc.line(sigLeftX, sigLineY, sigLeftX + sigColW, sigLineY);
  doc.line(sigRightX, sigLineY, sigRightX + sigColW, sigLineY);

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(`For ${sc.applicant_name || sc.buyer_name}`, sigLeftX, sigLineY + 5);
  doc.text(`For ${factoryName}`, sigRightX, sigLineY + 5);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text("(Applicant)", sigLeftX, sigLineY + 9);
  doc.text("(Shipper / Beneficiary)", sigRightX, sigLineY + 9);
  doc.setTextColor(0);

  // ── Final page footer ────────────────────────────────────────────────────

  drawPageFooter();

  doc.save(`SalesContract_${sc.contract_number}_${format(new Date(), "yyyyMMdd")}.pdf`);
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

export default function ContractDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { contract, loading, refetch } = useSalesContract(id);
  const { updateStatus, deleteContract, addAmendment, saving } = useSalesContractMutations();
  const { uploading, uploadAndExtract } = useExtractPO();
  const { settings: financeSettings } = useFactoryFinanceSettings();
  const { signature: userSignature } = useUserSignature();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [amendmentDialogOpen, setAmendmentDialogOpen] = useState(false);
  const [amendmentDesc, setAmendmentDesc] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [includeSignature, setIncludeSignature] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Actions ─────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!id) return;
    const ok = await deleteContract(id);
    if (ok) navigate("/finance/contracts");
  };

  const handleStatusChange = async (status: SalesContract["status"]) => {
    if (!id) return;
    const ok = await updateStatus(id, status);
    if (ok) refetch();
  };

  const handleAddAmendment = async () => {
    if (!id || !amendmentDesc.trim()) return;
    const ok = await addAmendment(id, amendmentDesc.trim(), {});
    if (ok) {
      setAmendmentDesc("");
      setAmendmentDialogOpen(false);
      refetch();
    }
  };

  const handleGeneratePdf = async () => {
    if (!contract) return;
    setPdfLoading(true);
    try {
      const sigUrl = includeSignature ? (financeSettings?.signature_url || userSignature?.signature_url || null) : null;
      const stampUrl = includeSignature ? (financeSettings?.stamp_url ?? null) : null;
      await generateContractPdf(contract, financeSettings, sigUrl, stampUrl);
      toast.success("Contract PDF downloaded");
    } catch (e: any) {
      toast.error("Failed to generate PDF", { description: e.message });
    } finally {
      setPdfLoading(false);
    }
  };

  const handleUploadPO = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const result = await uploadAndExtract(file);
    if (!result.error) {
      toast.success("Document uploaded and processed");
      refetch();
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <FileText className="h-12 w-12 text-muted-foreground/20" />
        <p className="text-muted-foreground">Contract not found</p>
        <Button variant="outline" onClick={() => navigate("/finance/contracts")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Contracts
        </Button>
      </div>
    );
  }

  // ── Computed data ─────────────────────────────────────────────────────

  const cfg = STATUS_CONFIG[contract.status];
  const items = contract.sales_contract_items ?? [];
  const amendments = contract.sales_contract_amendments ?? [];
  const documents = contract.sales_contract_documents ?? [];

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const totalValue = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);

  const statuses: SalesContract["status"][] = [
    "draft", "confirmed", "in_production", "shipped", "completed", "cancelled",
  ];

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-6 max-w-5xl">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/finance/contracts")}
            className="-ml-2 shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold font-mono">{contract.contract_number}</h1>
              <span
                className={cn(
                  "inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full border",
                  cfg.pill
                )}
              >
                {cfg.label}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {contract.buyer_name}
              {contract.season && ` \u00b7 ${contract.season}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <div className="flex items-center gap-1.5 mr-1">
            <Switch id="sig-toggle" checked={includeSignature} onCheckedChange={setIncludeSignature} className="scale-75" />
            <Label htmlFor="sig-toggle" className="text-[10px] text-muted-foreground cursor-pointer">Sign</Label>
          </div>
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
            onClick={() => navigate(`/finance/contracts/${id}/edit`)}
          >
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            <span className="hidden sm:inline">Edit</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAmendmentDialogOpen(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            <span className="hidden sm:inline">Amendment</span>
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
                .filter((s) => s !== contract.status)
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
            className="text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Overview Cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Total Quantity
              </p>
              <p className="text-2xl font-bold font-mono">{fmtInt(totalQty)}</p>
              <p className="text-xs text-muted-foreground mt-1">pieces</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Total Value
              </p>
              <p className="text-2xl font-bold font-mono">
                {contract.currency} {fmt(totalValue)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">contract value</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Line Items
              </p>
              <p className="text-2xl font-bold font-mono">{items.length}</p>
              <p className="text-xs text-muted-foreground mt-1">styles</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Commission
              </p>
              <p className="text-2xl font-bold font-mono">{contract.commission_pct}%</p>
              {contract.agent_name && (
                <p className="text-xs text-muted-foreground mt-1">{contract.agent_name}</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ── Contract Details ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Contract Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            {/* Left column */}
            <div className="space-y-4">
              <DetailField label="Buyer Name" value={contract.buyer_name} />
              {contract.buyer_address && (
                <DetailField label="Buyer Address" value={contract.buyer_address} />
              )}
              {contract.buyer_contact && (
                <DetailField label="Buyer Contact" value={contract.buyer_contact} />
              )}
              <DetailField label="Contract Date" value={fmtDate(contract.contract_date)} />
              <DetailField label="Season" value={contract.season} />
              <DetailField label="Payment Terms" value={contract.payment_terms} />
              <DetailField label="Delivery Terms" value={contract.delivery_terms} />
            </div>

            {/* Right column */}
            <div className="space-y-4">
              <DetailField label="Incoterms" value={contract.incoterms} />
              <DetailField label="Port of Loading" value={contract.port_of_loading} />
              <DetailField label="Port of Discharge" value={contract.port_of_discharge} />
              <DetailField label="Country of Origin" value={contract.country_of_origin} />
              <DetailField
                label="Currency / Exchange Rate"
                value={`${contract.currency} (${contract.exchange_rate})`}
              />

              <Separator />

              <DetailField
                label="LC Required"
                value={
                  contract.lc_required ? (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                      Yes
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-slate-500/10 text-slate-400 border-slate-500/20">
                      No
                    </Badge>
                  )
                }
              />
              {contract.lc_required && (
                <>
                  <DetailField label="LC Number" value={contract.lc_number} />
                  <DetailField label="LC Date" value={fmtDate(contract.lc_date)} />
                  <DetailField label="LC Expiry Date" value={fmtDate(contract.lc_expiry_date)} />
                </>
              )}

              {contract.commission_pct > 0 && contract.agent_name && (
                <DetailField label="Agent Name" value={contract.agent_name} />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Line Items Table ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            Line Items
            <span className="text-xs font-normal text-muted-foreground">({items.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4 text-center">
              No line items
            </p>
          ) : (
            <div className="overflow-x-auto -mx-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">PO Number</TableHead>
                    <TableHead className="text-xs">Style Ref</TableHead>
                    <TableHead className="text-xs hidden lg:table-cell">Description</TableHead>
                    <TableHead className="text-xs hidden md:table-cell">Color</TableHead>
                    <TableHead className="text-xs hidden md:table-cell">Size Range</TableHead>
                    <TableHead className="text-xs text-right">Qty</TableHead>
                    <TableHead className="text-xs text-right">Unit Price</TableHead>
                    <TableHead className="text-xs hidden sm:table-cell">Price Type</TableHead>
                    <TableHead className="text-xs hidden lg:table-cell">Delivery</TableHead>
                    <TableHead className="text-xs text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const val = item.quantity * item.unit_price;
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="text-sm font-mono">
                          {item.po_number ?? "\u2014"}
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {item.work_order_id ? (
                            <button
                              onClick={() => navigate(`/work-orders/${item.work_order_id}`)}
                              className="text-blue-500 hover:underline"
                            >
                              {item.style_ref}
                            </button>
                          ) : (
                            item.style_ref
                          )}
                        </TableCell>
                        <TableCell className="text-sm hidden lg:table-cell text-muted-foreground">
                          {item.style_description ?? "\u2014"}
                        </TableCell>
                        <TableCell className="text-sm hidden md:table-cell">
                          {item.color ?? "\u2014"}
                        </TableCell>
                        <TableCell className="text-sm hidden md:table-cell">
                          {item.size_range ?? "\u2014"}
                        </TableCell>
                        <TableCell className="text-sm text-right font-mono">
                          {fmtInt(item.quantity)}
                        </TableCell>
                        <TableCell className="text-sm text-right font-mono">
                          {fmt(item.unit_price)}
                        </TableCell>
                        <TableCell className="text-sm hidden sm:table-cell">
                          <Badge variant="outline" className="text-[10px]">
                            {item.price_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm hidden lg:table-cell text-muted-foreground">
                          {fmtDate(item.delivery_date)}
                        </TableCell>
                        <TableCell className="text-sm text-right font-mono font-medium">
                          {fmt(val)}
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {/* Totals row */}
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell colSpan={5} className="text-sm">
                      Total
                    </TableCell>
                    <TableCell className="text-sm text-right font-mono">
                      {fmtInt(totalQty)}
                    </TableCell>
                    <TableCell />
                    <TableCell className="hidden sm:table-cell" />
                    <TableCell className="hidden lg:table-cell" />
                    <TableCell className="text-sm text-right font-mono">
                      {contract.currency} {fmt(totalValue)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Amendments ───────────────────────────────────────────────────── */}
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
              No amendments recorded
            </p>
          ) : (
            <div className="relative pl-6 space-y-6">
              {/* Timeline line */}
              <div className="absolute left-[11px] top-1 bottom-1 w-px bg-border" />

              {amendments.map((amendment) => (
                <div key={amendment.id} className="relative">
                  {/* Timeline dot */}
                  <div className="absolute -left-6 top-1 h-[9px] w-[9px] rounded-full border-2 border-purple-500 bg-background" />

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">
                        Amendment #{amendment.amendment_number}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {fmtDate(amendment.amendment_date)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{amendment.description}</p>
                    {amendment.changed_by && (
                      <p className="text-xs text-muted-foreground/70">
                        Changed by: {amendment.changed_by}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Documents ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="h-4 w-4 text-muted-foreground" />
              Documents
              <span className="text-xs font-normal text-muted-foreground">({documents.length})</span>
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5 mr-1.5" />
              )}
              Upload PO
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv"
              className="hidden"
              onChange={handleUploadPO}
            />
          </div>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4 text-center">
              No documents uploaded
            </p>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => {
                const extCfg = EXTRACTION_STATUS_CONFIG[doc.extraction_status] ?? {
                  label: doc.extraction_status,
                  cls: "bg-slate-500/10 text-slate-400",
                };
                return (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium hover:underline truncate block"
                        >
                          {doc.file_name}
                        </a>
                        <p className="text-xs text-muted-foreground">
                          Uploaded {fmtDate(doc.created_at)}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className={cn("text-[10px] shrink-0", extCfg.cls)}>
                      {extCfg.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Notes ────────────────────────────────────────────────────────── */}
      {(contract.notes || contract.internal_notes) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {contract.notes && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Notes
                </p>
                <p className="text-sm whitespace-pre-wrap">{contract.notes}</p>
              </div>
            )}
            {contract.internal_notes && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Internal Notes
                </p>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                  {contract.internal_notes}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Delete Confirmation Dialog ───────────────────────────────────── */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contract</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete contract{" "}
              <strong>{contract.contract_number}</strong>? This will also remove all
              line items, amendments, and documents. This action cannot be undone.
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

      {/* ── Add Amendment Dialog ─────────────────────────────────────────── */}
      <Dialog open={amendmentDialogOpen} onOpenChange={setAmendmentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Amendment</DialogTitle>
            <DialogDescription>
              Record a change or amendment to this contract.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Textarea
              placeholder="Describe the amendment..."
              value={amendmentDesc}
              onChange={(e) => setAmendmentDesc(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAmendmentDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddAmendment}
              disabled={saving || !amendmentDesc.trim()}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5 mr-1.5" />
              )}
              Add Amendment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
