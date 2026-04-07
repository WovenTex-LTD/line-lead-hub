import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Calculator,
  Pencil,
  Copy,
  Trash2,
  FileDown,
  Package,
  Scissors,
  Settings,
  DollarSign,
  Ship,
  TrendingUp,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
import { motion } from "framer-motion";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  useCostSheet,
  useCostSheetMutations,
  calcCostSheetTotals,
  type CostSheet,
  type FabricRow,
  type TrimRow,
  type ProcessRow,
  type CommercialRow,
} from "@/hooks/useCostSheets";
import { useFactoryFinanceSettings } from "@/hooks/useFactoryFinanceSettings";
import { cn } from "@/lib/utils";

// ── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<CostSheet["status"], { label: string; pill: string }> = {
  draft:    { label: "Draft",    pill: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
  submitted:{ label: "Submitted",pill: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  approved: { label: "Approved", pill: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  sent:     { label: "Sent",     pill: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  accepted: { label: "Accepted", pill: "bg-green-500/10 text-green-400 border-green-500/20" },
  rejected: { label: "Rejected", pill: "bg-red-500/10 text-red-400 border-red-500/20" },
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "\u2014";
  return format(new Date(d), "dd MMMM yyyy");
}

function pct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

// ── Cost breakdown bar ──────────────────────────────────────────────────────

const BREAKDOWN_COLORS = [
  { key: "Fabric", color: "bg-blue-500" },
  { key: "Trims", color: "bg-amber-500" },
  { key: "CM", color: "bg-emerald-500" },
  { key: "Processes", color: "bg-purple-500" },
  { key: "Commercial", color: "bg-rose-500" },
] as const;

function CostBreakdownBar({
  values,
  total,
}: {
  values: { fabric: number; trims: number; cm: number; processes: number; commercial: number };
  total: number;
}) {
  if (total <= 0) return null;
  const items = [
    { key: "Fabric", value: values.fabric },
    { key: "Trims", value: values.trims },
    { key: "CM", value: values.cm },
    { key: "Processes", value: values.processes },
    { key: "Commercial", value: values.commercial },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          Cost Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Bar */}
        <div className="flex h-4 rounded-full overflow-hidden bg-muted">
          {items.map((item, i) => {
            const widthPct = (item.value / total) * 100;
            if (widthPct < 0.5) return null;
            return (
              <motion.div
                key={item.key}
                initial={{ width: 0 }}
                animate={{ width: `${widthPct}%` }}
                transition={{ duration: 0.6, delay: i * 0.08 }}
                className={cn("h-full", BREAKDOWN_COLORS[i].color)}
              />
            );
          })}
        </div>
        {/* Legend */}
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
          {items.map((item, i) => {
            const share = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0.0";
            return (
              <div key={item.key} className="flex items-center gap-1.5">
                <span className={cn("h-2.5 w-2.5 rounded-full", BREAKDOWN_COLORS[i].color)} />
                <span className="text-muted-foreground">{item.key}</span>
                <span className="font-semibold">${fmt(item.value)}</span>
                <span className="text-muted-foreground">({share}%)</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Section table wrapper ───────────────────────────────────────────────────

function SectionCard({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: React.ElementType;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
          <span className="text-xs font-normal text-muted-foreground">({count})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// ── PDF generation ──────────────────────────────────────────────────────────

function generateQuotationPdf(
  cs: CostSheet,
  totals: ReturnType<typeof calcCostSheetTotals>,
  factoryName: string | null
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ml = 15;
  const mr = 15;
  const cw = pw - ml - mr;
  let y = 15;

  // Letterhead
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(factoryName || "Factory Name", ml, y);
  y += 8;

  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.line(ml, y, ml + cw, y);
  y += 10;

  // Quotation title
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("QUOTATION", pw / 2, y, { align: "center" });
  y += 10;

  // Quotation info
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const quotationNo = `QTN-${cs.style_ref}-${format(new Date(), "yyyyMMdd")}`;

  const infoLeft = [
    ["Quotation No:", quotationNo],
    ["Date:", format(new Date(), "dd MMMM yyyy")],
    ["Valid Until:", format(new Date(Date.now() + 30 * 86400000), "dd MMMM yyyy")],
  ];

  const infoRight = [
    ["Buyer:", cs.buyer_name],
    ["Style Reference:", cs.style_ref],
    ...(cs.garment_type ? [["Garment Type:", cs.garment_type]] : []),
  ];

  infoLeft.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.text(label, ml, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, ml + 30, y);
    y += 5;
  });

  y -= infoLeft.length * 5;
  infoRight.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.text(label, pw / 2, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, pw / 2 + 32, y);
    y += 5;
  });

  y = Math.max(y, y) + 8;

  doc.line(ml, y, ml + cw, y);
  y += 8;

  // Garment details
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Garment Details", ml, y);
  y += 7;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const details: [string, string][] = [];
  if (cs.style_description) details.push(["Description:", cs.style_description]);
  if (cs.fabric_composition) details.push(["Composition:", cs.fabric_composition]);
  if (cs.gsm) details.push(["GSM:", String(cs.gsm)]);
  if (cs.target_quantity) details.push(["Target Quantity:", cs.target_quantity.toLocaleString() + " pcs"]);
  if (cs.season) details.push(["Season:", cs.season]);
  if (cs.program_name) details.push(["Program:", cs.program_name]);

  details.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.text(label, ml, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, ml + 32, y);
    y += 5;
  });

  y += 8;

  // Pricing
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Pricing", ml, y);
  y += 7;

  const priceType = cs.target_price_type === "per_dozen" ? "FOB" : "CM";
  const quotedPricePc = cs.quoted_price ?? totals.totalCostPc;
  const quotedPriceDz = quotedPricePc * 12;

  doc.setFontSize(9);
  const pricingRows: [string, string][] = [
    ["Price Type:", priceType],
    ["Price Per Piece:", `${cs.currency} ${fmt(quotedPricePc)}`],
    ["Price Per Dozen:", `${cs.currency} ${fmt(quotedPriceDz)}`],
  ];

  pricingRows.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.text(label, ml, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, ml + 32, y);
    y += 5;
  });

  y += 10;

  // Terms
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Terms & Conditions", ml, y);
  y += 7;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  const terms = [
    "1. Payment: 30% advance, 70% against shipment by T/T or L/C at sight.",
    "2. Delivery: 90-120 days from order confirmation and all approvals.",
    "3. This quotation is valid for 30 days from the date of issue.",
    "4. Prices are subject to change based on fabric/raw material price fluctuations.",
    "5. Minimum order quantity applies as per factory policy.",
  ];
  terms.forEach((t) => {
    doc.text(t, ml, y);
    y += 4.5;
  });

  y += 8;
  doc.line(ml, y, ml + cw, y);
  y += 6;

  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.text("This is a system-generated quotation.", ml, y);

  // Save
  doc.save(`Quotation_${cs.style_ref}_${format(new Date(), "yyyyMMdd")}.pdf`);
}

// ── Internal Cost Sheet PDF ─────────────────────────────────────────────────

function generateInternalPdf(
  cs: CostSheet,
  totals: ReturnType<typeof calcCostSheetTotals>,
  factoryName: string | null
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const ml = 12;
  const cw = pw - ml * 2;
  let y = ml;
  let pageNum = 0;
  type RGB = [number, number, number];
  const slate900: RGB = [15, 23, 42];
  const slate700: RGB = [51, 65, 85];
  const slate500: RGB = [100, 116, 139];
  const slate50: RGB = [248, 250, 252];
  const violet100: RGB = [237, 233, 254];
  const violet700: RGB = [109, 40, 217];
  const green600: RGB = [22, 163, 74];
  const red600: RGB = [220, 38, 38];
  const white: RGB = [255, 255, 255];

  const fmtN = (v: number, dp = 2) => v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const cur = cs.currency ?? "USD";

  const drawFooter = () => {
    pageNum++;
    doc.setDrawColor(200);
    doc.line(ml, ph - 14, pw - ml, ph - 14);
    doc.setFontSize(6.5);
    doc.setTextColor(...slate500);
    doc.text("CONFIDENTIAL — Internal Use Only", ml, ph - 9);
    doc.text(`Page ${pageNum}`, pw - ml, ph - 9, { align: "right" });
  };

  const newPage = () => { doc.addPage(); y = ml; };
  const checkPage = (need: number) => { if (y + need > ph - 18) { newPage(); drawFooter(); } };

  // Table helper
  const drawTable = (
    headers: string[],
    colWidths: number[],
    aligns: ("left" | "right")[],
    rows: string[][],
    subtotalRow?: string[]
  ) => {
    // Header
    checkPage(14);
    doc.setFillColor(...slate900);
    doc.rect(ml, y, cw, 8, "F");
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    let cx = ml + 1;
    headers.forEach((h, i) => {
      if (aligns[i] === "right") doc.text(h, cx + colWidths[i] - 2, y + 5.5, { align: "right" });
      else doc.text(h, cx + 1, y + 5.5);
      cx += colWidths[i];
    });
    y += 8;

    // Data rows
    doc.setFont("helvetica", "normal");
    rows.forEach((row, ri) => {
      checkPage(6);
      if (ri % 2 === 0) { doc.setFillColor(...slate50); doc.rect(ml, y, cw, 6, "F"); }
      doc.setFontSize(7);
      doc.setTextColor(...slate700);
      cx = ml + 1;
      row.forEach((cell, i) => {
        const txt = cell.substring(0, 40);
        if (aligns[i] === "right") doc.text(txt, cx + colWidths[i] - 2, y + 4, { align: "right" });
        else doc.text(txt, cx + 1, y + 4);
        cx += colWidths[i];
      });
      y += 6;
    });

    // Subtotal
    if (subtotalRow) {
      checkPage(7);
      doc.setFillColor(...violet100);
      doc.rect(ml, y, cw, 7, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...violet700);
      cx = ml + 1;
      subtotalRow.forEach((cell, i) => {
        if (aligns[i] === "right") doc.text(cell, cx + colWidths[i] - 2, y + 5, { align: "right" });
        else doc.text(cell, cx + 1, y + 5);
        cx += colWidths[i];
      });
      y += 7;
    }
    y += 4;
  };

  // ── PAGE 1: HEADER ──
  doc.setFillColor(...violet700);
  doc.rect(0, 0, pw, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("INTERNAL COST SHEET", ml, 12);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`${factoryName || "Factory"} — ${cs.style_ref} — ${cs.buyer_name}`, ml, 20);
  doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`, pw - ml, 20, { align: "right" });
  y = 36;
  drawFooter();

  // Style details
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...slate900);
  doc.text("STYLE DETAILS", ml, y);
  y += 7;

  const info: [string, string][] = [
    ["Buyer", cs.buyer_name],
    ["Style Ref", cs.style_ref],
    ...(cs.style_description ? [["Description", cs.style_description] as [string, string]] : []),
    ...(cs.garment_type ? [["Garment Type", cs.garment_type] as [string, string]] : []),
    ...(cs.fabric_composition ? [["Composition", cs.fabric_composition] as [string, string]] : []),
    ...(cs.target_quantity ? [["Target Qty", cs.target_quantity.toLocaleString() + " pcs"] as [string, string]] : []),
    ...(cs.season ? [["Season", cs.season] as [string, string]] : []),
    ["Currency", `${cur} (Rate: ${cs.exchange_rate})`],
    ["Status", cs.status.toUpperCase()],
  ];

  doc.setFontSize(8);
  const colW = cw / 2;
  info.forEach((pair, i) => {
    const col = i % 2;
    if (col === 0 && i > 0) y += 5;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...slate500);
    doc.text(pair[0] + ":", ml + col * colW, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...slate900);
    doc.text(pair[1], ml + col * colW + 30, y);
  });
  y += 10;

  // ── COST SUMMARY BOX ──
  checkPage(35);
  doc.setFillColor(...slate50);
  doc.setDrawColor(200);
  doc.roundedRect(ml, y, cw, 28, 2, 2, "FD");

  const summaryItems = [
    { label: "Fabric", value: totals.fabricCostDz },
    { label: "Trims", value: totals.trimsCostDz },
    { label: "CM", value: totals.cmCostDz },
    { label: "Processes", value: totals.processCostDz },
    { label: "Commercial", value: totals.commercialCostDz },
    { label: "TOTAL/DZ", value: totals.totalCostDz },
    { label: "TOTAL/PC", value: totals.totalCostPc },
  ];

  const boxW = cw / summaryItems.length;
  summaryItems.forEach((item, i) => {
    const bx = ml + i * boxW;
    const isTotal = i >= 5;
    doc.setFontSize(6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...(isTotal ? violet700 : slate500));
    doc.text(item.label.toUpperCase(), bx + boxW / 2, y + 8, { align: "center" });
    doc.setFontSize(isTotal ? 11 : 9);
    doc.setTextColor(...(isTotal ? violet700 : slate900));
    doc.text(`${cur} ${fmtN(item.value)}`, bx + boxW / 2, y + 18, { align: "center" });
  });
  y += 34;

  // ── FABRIC TABLE ──
  const fabrics = cs.cost_sheet_fabrics ?? [];
  if (fabrics.length > 0) {
    checkPage(20);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...slate900);
    doc.text("FABRIC COSTING", ml, y);
    y += 6;

    const fCols = [35, 35, 30, 25, 18, 25, 22, 25, 25, 25];
    const fHeaders = ["Type", "Description", "Composition", "Construction", "GSM", "Consumption/Dz", "Wastage%", "Price/Unit", "Source", "Cost/Dozen"];
    const fAligns: ("left" | "right")[] = ["left", "left", "left", "left", "right", "right", "right", "right", "left", "right"];

    const fRows = fabrics.map((f) => {
      const consumption = f.consumption_per_dozen ?? 0;
      const effectiveConsumption = consumption * (1 + (f.wastage_pct ?? 0) / 100);
      const costDz = effectiveConsumption * (f.price_per_unit ?? 0) * (f.exchange_rate ?? 1) / (cs.exchange_rate || 1);
      return [
        f.fabric_type ?? "",
        (f.description ?? "").substring(0, 20),
        (f.composition ?? "").substring(0, 18),
        f.construction ?? "",
        f.gsm ? String(f.gsm) : "",
        `${fmtN(consumption)} ${f.consumption_unit ?? "yds"}`,
        f.wastage_pct != null ? `${f.wastage_pct}%` : "",
        `${f.currency ?? cur} ${fmtN(f.price_per_unit ?? 0)}/${f.price_unit ?? "yd"}`,
        f.source ?? "",
        `${cur} ${fmtN(costDz)}`,
      ];
    });

    const fabricSubtotal = ["", "", "", "", "", "", "", "", "SUBTOTAL", `${cur} ${fmtN(totals.fabricCostDz)}`];
    drawTable(fHeaders, fCols, fAligns, fRows, fabricSubtotal);
  }

  // ── TRIMS TABLE ──
  const trims = cs.cost_sheet_trims ?? [];
  if (trims.length > 0) {
    checkPage(20);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...slate900);
    doc.text("TRIMS & ACCESSORIES", ml, y);
    y += 6;

    const tCols = [30, 40, 30, 25, 25, 30, 25, 30, 30];
    const tHeaders = ["Category", "Item", "Qty/Garment", "UoM", "Unit Price", "Supplier", "Buyer Supplied", "Currency", "Cost/Dozen"];
    const tAligns: ("left" | "right")[] = ["left", "left", "right", "left", "right", "left", "left", "left", "right"];

    const tRows = trims.map((t) => {
      const costDz = t.is_buyer_supplied ? 0 : (t.qty_per_garment ?? 0) * 12 * (t.unit_price ?? 0) * (t.exchange_rate ?? 1) / (cs.exchange_rate || 1);
      return [
        t.category ?? "",
        t.item_name ?? "",
        t.qty_per_garment != null ? fmtN(t.qty_per_garment, 1) : "",
        t.unit_of_measure ?? "",
        `${t.currency ?? "BDT"} ${fmtN(t.unit_price ?? 0)}`,
        (t.supplier_name ?? "").substring(0, 15),
        t.is_buyer_supplied ? "Yes" : "No",
        t.currency ?? "BDT",
        `${cur} ${fmtN(costDz)}`,
      ];
    });

    const trimsSubtotal = ["", "", "", "", "", "", "", "SUBTOTAL", `${cur} ${fmtN(totals.trimsCostDz)}`];
    drawTable(tHeaders, tCols, tAligns, tRows, trimsSubtotal);
  }

  // ── CM SECTION ──
  const cm = cs.cost_sheet_cm?.[0];
  if (cm) {
    checkPage(20);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...slate900);
    doc.text("CUT & MAKE (CM)", ml, y);
    y += 6;

    const cmRows: string[][] = [];
    if (cm.cm_per_dozen) cmRows.push(["CM/Dozen (flat)", `${cur} ${fmtN(cm.cm_per_dozen)}`]);
    if (cm.sam) cmRows.push(["SAM", fmtN(cm.sam, 1)]);
    if (cm.efficiency_pct) cmRows.push(["Efficiency", `${cm.efficiency_pct}%`]);
    if (cm.labour_cost_per_minute) cmRows.push(["Labour Cost/Min", `${cur} ${fmtN(cm.labour_cost_per_minute, 4)}`]);
    if (cm.overhead_value) cmRows.push([`Overhead (${cm.overhead_type})`, cm.overhead_type === "percentage" ? `${cm.overhead_value}%` : `${cur} ${fmtN(cm.overhead_value)}`]);
    cmRows.push(["Total CM/Dozen", `${cur} ${fmtN(totals.cmCostDz)}`]);
    cmRows.push(["Total CM/Piece", `${cur} ${fmtN(totals.cmCostDz / 12)}`]);

    drawTable(["Item", "Value"], [cw / 2, cw / 2], ["left", "right"], cmRows);
  }

  // ── PROCESSES TABLE ──
  const processes = cs.cost_sheet_processes ?? [];
  if (processes.length > 0) {
    checkPage(20);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...slate900);
    doc.text("PROCESSES (WASH / EMBELLISHMENT / TESTING)", ml, y);
    y += 6;

    const pCols = [35, 45, 35, 35, 30, 25, 30, 30];
    const pHeaders = ["Category", "Process", "Placement", "Supplier", "Outsourced", "Cost/Piece", "Currency", "Cost/Dozen"];
    const pAligns: ("left" | "right")[] = ["left", "left", "left", "left", "left", "right", "left", "right"];

    const pRows = processes.map((p) => {
      const costDz = (p.cost_per_piece ?? 0) * 12 * (p.exchange_rate ?? 1) / (cs.exchange_rate || 1);
      return [
        p.category ?? "",
        p.process_name ?? "",
        p.placement ?? "",
        (p.supplier_name ?? "").substring(0, 15),
        p.is_outsourced ? "Yes" : "No",
        `${p.currency ?? "BDT"} ${fmtN(p.cost_per_piece ?? 0)}`,
        p.currency ?? "BDT",
        `${cur} ${fmtN(costDz)}`,
      ];
    });

    const procSubtotal = ["", "", "", "", "", "", "SUBTOTAL", `${cur} ${fmtN(totals.processCostDz)}`];
    drawTable(pHeaders, pCols, pAligns, pRows, procSubtotal);
  }

  // ── COMMERCIAL COSTS TABLE ──
  const commercial = cs.cost_sheet_commercial ?? [];
  if (commercial.length > 0) {
    checkPage(20);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...slate900);
    doc.text("COMMERCIAL COSTS", ml, y);
    y += 6;

    const cCols = [40, 50, 35, 30, 30, 30, 50];
    const cHeaders = ["Category", "Item", "Type", "Amount", "Currency", "Rate", "Cost/Dozen"];
    const cAligns: ("left" | "right")[] = ["left", "left", "left", "right", "left", "right", "right"];

    const targetDozens = (cs.target_quantity ?? 1) / 12;
    const cRows = commercial.map((c) => {
      let costDz = 0;
      const amt = c.amount ?? 0;
      const fx = (c.exchange_rate ?? 1) / (cs.exchange_rate || 1);
      if (c.cost_type === "per_piece") costDz = amt * 12 * fx;
      else if (c.cost_type === "per_shipment") costDz = targetDozens > 0 ? (amt * fx) / targetDozens : 0;
      else if (c.cost_type === "percentage") costDz = (totals.fabricCostDz + totals.trimsCostDz + totals.cmCostDz + totals.processCostDz) * (amt / 100);
      return [
        c.category ?? "",
        c.item_name ?? "",
        c.cost_type ?? "",
        fmtN(amt),
        c.currency ?? cur,
        fmtN(c.exchange_rate ?? 1),
        `${cur} ${fmtN(costDz)}`,
      ];
    });

    const commSubtotal = ["", "", "", "", "", "SUBTOTAL", `${cur} ${fmtN(totals.commercialCostDz)}`];
    drawTable(cHeaders, cCols, cAligns, cRows, commSubtotal);
  }

  // ── FINAL SUMMARY ──
  checkPage(45);
  doc.setFillColor(...violet700);
  doc.rect(ml, y, cw, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("COST SUMMARY", ml + 4, y + 5.5);
  y += 10;

  const summaryLines: [string, string, boolean][] = [
    ["Fabric Cost / Dozen", `${cur} ${fmtN(totals.fabricCostDz)}`, false],
    ["Trims & Accessories / Dozen", `${cur} ${fmtN(totals.trimsCostDz)}`, false],
    ["Cut & Make / Dozen", `${cur} ${fmtN(totals.cmCostDz)}`, false],
    ["Processes / Dozen", `${cur} ${fmtN(totals.processCostDz)}`, false],
    ["Commercial Costs / Dozen", `${cur} ${fmtN(totals.commercialCostDz)}`, false],
    ["TOTAL COST / DOZEN", `${cur} ${fmtN(totals.totalCostDz)}`, true],
    ["TOTAL COST / PIECE", `${cur} ${fmtN(totals.totalCostPc)}`, true],
  ];

  if (cs.quoted_price) {
    summaryLines.push(["QUOTED PRICE / PIECE", `${cur} ${fmtN(cs.quoted_price)}`, true]);
    if (totals.quotedMarginPct != null) {
      summaryLines.push(["MARGIN", `${totals.quotedMarginPct.toFixed(1)}%`, true]);
    }
  }

  if (cs.buyer_target_price && totals.buyerGapPc != null) {
    summaryLines.push(["Buyer Target / Piece", `${cur} ${fmtN(cs.buyer_target_price)}`, false]);
    summaryLines.push(["Gap vs Target", `${totals.buyerGapPc >= 0 ? "+" : ""}${cur} ${fmtN(totals.buyerGapPc)} / pc`, true]);
  }

  summaryLines.forEach(([label, value, bold]) => {
    checkPage(7);
    if (bold) {
      doc.setFillColor(...violet100);
      doc.rect(ml, y, cw, 7, "F");
    }
    doc.setFontSize(8);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(...(bold ? violet700 : slate700));
    doc.text(label, ml + 4, y + 5);
    doc.text(value, pw - ml - 4, y + 5, { align: "right" });
    y += 7;
  });

  doc.save(`CostSheet_${cs.style_ref}_${cs.buyer_name}_${format(new Date(), "yyyyMMdd")}.pdf`);
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function CostSheetDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { costSheet, loading, refetch } = useCostSheet(id);
  const { updateStatus, deleteCostSheet, duplicateCostSheet, saving } = useCostSheetMutations();
  const { settings } = useFactoryFinanceSettings();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // ── Actions ─────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!id) return;
    const ok = await deleteCostSheet(id);
    if (ok) navigate("/finance/cost-sheets");
  };

  const handleStatusChange = async (status: CostSheet["status"]) => {
    if (!id) return;
    const ok = await updateStatus(id, status);
    if (ok) refetch();
    setStatusDialogOpen(false);
  };

  const handleDuplicate = async () => {
    if (!id || !costSheet) return;
    const copy = await duplicateCostSheet(id, `${costSheet.style_description ?? costSheet.style_ref} (Copy)`);
    if (copy) navigate(`/finance/cost-sheets/${copy.id}`);
  };

  const handleGeneratePdf = () => {
    if (!costSheet) return;
    setPdfLoading(true);
    try {
      const totals = calcCostSheetTotals(costSheet, costSheet.currency, costSheet.exchange_rate);
      generateQuotationPdf(costSheet, totals, settings?.seller_name ?? null);
      toast.success("Quotation PDF downloaded");
    } catch (e: any) {
      toast.error("Failed to generate PDF", { description: e.message });
    } finally {
      setPdfLoading(false);
    }
  };

  const handleInternalPdf = () => {
    if (!costSheet) return;
    setPdfLoading(true);
    try {
      const totals = calcCostSheetTotals(costSheet, costSheet.currency, costSheet.exchange_rate);
      generateInternalPdf(costSheet, totals, settings?.seller_name ?? null);
      toast.success("Internal cost sheet PDF downloaded");
    } catch (e: any) {
      toast.error("Failed to generate PDF", { description: e.message });
    } finally {
      setPdfLoading(false);
    }
  };

  // ── Loading / Not found states ──────────────────────────────────────────

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
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!costSheet) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Calculator className="h-12 w-12 text-muted-foreground/20" />
        <p className="text-muted-foreground">Cost sheet not found</p>
        <Button variant="outline" onClick={() => navigate("/finance/cost-sheets")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Cost Sheets
        </Button>
      </div>
    );
  }

  // ── Computed data ───────────────────────────────────────────────────────

  const totals = calcCostSheetTotals(costSheet, costSheet.currency, costSheet.exchange_rate);
  const cfg = STATUS_CONFIG[costSheet.status];
  const fabrics = costSheet.cost_sheet_fabrics ?? [];
  const trims = costSheet.cost_sheet_trims ?? [];
  const processes = costSheet.cost_sheet_processes ?? [];
  const commercial = costSheet.cost_sheet_commercial ?? [];
  const cmRow = (costSheet.cost_sheet_cm ?? [])[0] ?? null;

  const quotedPricePc = costSheet.quoted_price ?? 0;
  const quotedPriceDz = quotedPricePc * 12;

  const buyerTargetPc =
    costSheet.buyer_target_price != null
      ? costSheet.target_price_type === "per_dozen"
        ? costSheet.buyer_target_price / 12
        : costSheet.buyer_target_price
      : null;

  const statuses: CostSheet["status"][] = ["draft", "submitted", "approved", "sent", "accepted", "rejected"];

  // Fabric cost per row helper
  const fabricRowCost = (f: FabricRow) => {
    const consumption = f.consumption_per_dozen ?? 0;
    const wastageMultiplier = 1 + (f.wastage_pct ?? 0) / 100;
    return consumption * f.price_per_unit * wastageMultiplier;
  };

  // Trims cost per row helper
  const trimRowCost = (t: TrimRow) => {
    if (t.is_buyer_supplied) return 0;
    return (t.qty_per_garment ?? 0) * 12 * t.unit_price;
  };

  // Commercial cost label
  const costTypeLabel = (ct: string) => {
    switch (ct) {
      case "per_piece": return "Per Piece";
      case "per_shipment": return "Per Shipment";
      case "percentage": return "Percentage";
      default: return ct;
    }
  };

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-6 max-w-5xl">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/finance/cost-sheets")}
            className="-ml-2 shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold font-mono">{costSheet.style_ref}</h1>
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
              {costSheet.buyer_name}
              {costSheet.garment_type && ` \u00b7 ${costSheet.garment_type}`}
              {costSheet.season && ` \u00b7 ${costSheet.season}`}
            </p>
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
            <span className="hidden sm:inline">Quotation PDF</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleInternalPdf}
            disabled={pdfLoading}
          >
            {pdfLoading ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <FileDown className="h-3.5 w-3.5 mr-1.5" />
            )}
            <span className="hidden sm:inline">Cost Sheet PDF</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/finance/cost-sheets/${id}/edit`)}
          >
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            <span className="hidden sm:inline">Edit</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleDuplicate} disabled={saving}>
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            <span className="hidden sm:inline">Duplicate</span>
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
                .filter((s) => s !== costSheet.status)
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
        {/* Total Cost / Dozen */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Cost / Dozen
              </p>
              <p className="text-2xl font-bold font-mono">${fmt(totals.totalCostDz)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                F:{fmt(totals.fabricCostDz)} T:{fmt(totals.trimsCostDz)} C:{fmt(totals.cmCostDz)}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Total Cost / Piece */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Cost / Piece
              </p>
              <p className="text-2xl font-bold font-mono">${fmt(totals.totalCostPc)}</p>
              <p className="text-xs text-muted-foreground mt-1">Break-even price</p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Quoted Price */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Quoted Price
              </p>
              {quotedPricePc > 0 ? (
                <>
                  <p className="text-2xl font-bold font-mono">${fmt(quotedPricePc)}</p>
                  <p
                    className={cn(
                      "text-xs font-semibold mt-1",
                      totals.quotedMarginPct >= 0 ? "text-emerald-500" : "text-red-500"
                    )}
                  >
                    {pct(totals.quotedMarginPct)} margin
                  </p>
                </>
              ) : (
                <p className="text-lg text-muted-foreground">{"\u2014"}</p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Buyer Target */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Buyer Target
              </p>
              {buyerTargetPc != null ? (
                <>
                  <p className="text-2xl font-bold font-mono">${fmt(buyerTargetPc)}</p>
                  {totals.buyerGapPc != null && (
                    <p
                      className={cn(
                        "text-xs font-semibold mt-1",
                        totals.buyerGapPc >= 0 ? "text-emerald-500" : "text-red-500"
                      )}
                    >
                      {totals.buyerGapPc >= 0 ? "Under" : "Over"} by ${fmt(Math.abs(totals.buyerGapPc))}/pc
                    </p>
                  )}
                </>
              ) : (
                <p className="text-lg text-muted-foreground">{"\u2014"}</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ── Cost Breakdown Bar ───────────────────────────────────────────── */}
      <CostBreakdownBar
        values={{
          fabric: totals.fabricCostDz,
          trims: totals.trimsCostDz,
          cm: totals.cmCostDz,
          processes: totals.processCostDz,
          commercial: totals.commercialCostDz,
        }}
        total={totals.totalCostDz}
      />

      {/* ── Fabric Section ───────────────────────────────────────────────── */}
      <SectionCard icon={Package} title="Fabric" count={fabrics.length}>
        {fabrics.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-4 text-center">No fabric rows</p>
        ) : (
          <>
            {/* Desktop header */}
            <div className="hidden md:grid md:grid-cols-[100px_1fr_120px_90px_70px_90px_90px_100px] gap-3 pb-2 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              <span>Type</span>
              <span>Description</span>
              <span>Composition</span>
              <span className="text-right">Cons/Dz</span>
              <span className="text-right">Waste%</span>
              <span className="text-right">Price</span>
              <span>Source</span>
              <span className="text-right">Cost/Dz</span>
            </div>
            {fabrics.map((f, i) => (
              <div
                key={f.id}
                className={cn(
                  "grid grid-cols-1 md:grid-cols-[100px_1fr_120px_90px_70px_90px_90px_100px] gap-x-3 gap-y-0.5 py-3 text-sm",
                  i < fabrics.length - 1 && "border-b border-border/50"
                )}
              >
                <span className="font-medium">{f.fabric_type}</span>
                <span className="text-muted-foreground truncate">{f.description || "\u2014"}</span>
                <span className="text-muted-foreground text-xs">{f.composition || "\u2014"}</span>
                <span className="md:text-right font-mono">
                  <span className="md:hidden text-xs text-muted-foreground">Cons: </span>
                  {f.consumption_per_dozen ?? 0} {f.consumption_unit}
                </span>
                <span className="md:text-right font-mono">
                  <span className="md:hidden text-xs text-muted-foreground">Waste: </span>
                  {f.wastage_pct}%
                </span>
                <span className="md:text-right font-mono">
                  <span className="md:hidden text-xs text-muted-foreground">Price: </span>
                  {fmt(f.price_per_unit)}/{f.price_unit}
                </span>
                <span className="text-muted-foreground text-xs">{f.source || "\u2014"}</span>
                <span className="md:text-right font-semibold font-mono">
                  ${fmt(fabricRowCost(f))}
                </span>
              </div>
            ))}
            {/* Subtotal */}
            <div className="flex justify-between items-center pt-3 border-t border-border mt-1">
              <span className="text-sm font-semibold text-muted-foreground">Fabric Subtotal</span>
              <span className="text-sm font-bold font-mono">${fmt(totals.fabricCostDz)}/dz</span>
            </div>
          </>
        )}
      </SectionCard>

      {/* ── Trims Section ────────────────────────────────────────────────── */}
      <SectionCard icon={Scissors} title="Trims" count={trims.length}>
        {trims.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-4 text-center">No trim rows</p>
        ) : (
          <>
            <div className="hidden md:grid md:grid-cols-[100px_1fr_80px_90px_100px_80px_100px] gap-3 pb-2 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              <span>Category</span>
              <span>Item</span>
              <span className="text-right">Qty/Gmt</span>
              <span className="text-right">Unit Price</span>
              <span>Supplier</span>
              <span className="text-center">Buyer</span>
              <span className="text-right">Cost/Dz</span>
            </div>
            {trims.map((t, i) => (
              <div
                key={t.id}
                className={cn(
                  "grid grid-cols-1 md:grid-cols-[100px_1fr_80px_90px_100px_80px_100px] gap-x-3 gap-y-0.5 py-3 text-sm",
                  i < trims.length - 1 && "border-b border-border/50"
                )}
              >
                <span className="text-muted-foreground text-xs uppercase">{t.category}</span>
                <span className="font-medium">{t.item_name}</span>
                <span className="md:text-right font-mono">
                  <span className="md:hidden text-xs text-muted-foreground">Qty: </span>
                  {t.qty_per_garment ?? 0}
                </span>
                <span className="md:text-right font-mono">
                  <span className="md:hidden text-xs text-muted-foreground">@ </span>
                  {fmt(t.unit_price)}
                </span>
                <span className="text-muted-foreground text-xs truncate">{t.supplier_name || "\u2014"}</span>
                <span className="md:text-center">
                  {t.is_buyer_supplied && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500/30 text-blue-400">
                      Buyer
                    </Badge>
                  )}
                </span>
                <span
                  className={cn(
                    "md:text-right font-semibold font-mono",
                    t.is_buyer_supplied && "text-muted-foreground line-through"
                  )}
                >
                  ${fmt(trimRowCost(t))}
                </span>
              </div>
            ))}
            <div className="flex justify-between items-center pt-3 border-t border-border mt-1">
              <span className="text-sm font-semibold text-muted-foreground">Trims Subtotal</span>
              <span className="text-sm font-bold font-mono">${fmt(totals.trimsCostDz)}/dz</span>
            </div>
          </>
        )}
      </SectionCard>

      {/* ── CM Section ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground" />
            CM (Cut & Make)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!cmRow ? (
            <p className="text-sm text-muted-foreground italic py-4 text-center">No CM data</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-4 text-sm">
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  CM / Dozen
                </p>
                <p className="text-xl font-bold font-mono">${fmt(totals.cmCostDz)}</p>
              </div>
              {cmRow.cm_per_dozen != null ? (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Method
                  </p>
                  <p className="font-semibold">Flat Rate</p>
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                      SAM
                    </p>
                    <p className="font-semibold font-mono">{cmRow.sam ?? "\u2014"} min</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                      Efficiency
                    </p>
                    <p className="font-semibold font-mono">{cmRow.efficiency_pct ?? 100}%</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                      Labour Cost/Min
                    </p>
                    <p className="font-semibold font-mono">${fmt(cmRow.labour_cost_per_minute ?? 0)}</p>
                  </div>
                </>
              )}
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Overhead
                </p>
                <p className="font-semibold font-mono">
                  {cmRow.overhead_type === "percentage"
                    ? `${cmRow.overhead_value}%`
                    : `$${fmt(cmRow.overhead_value)} flat`}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Processes Section ────────────────────────────────────────────── */}
      <SectionCard icon={Scissors} title="Processes" count={processes.length}>
        {processes.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-4 text-center">No process rows</p>
        ) : (
          <>
            <div className="hidden md:grid md:grid-cols-[100px_1fr_120px_120px_100px_100px] gap-3 pb-2 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              <span>Category</span>
              <span>Process</span>
              <span>Placement</span>
              <span>Supplier</span>
              <span className="text-right">Cost/Pc</span>
              <span className="text-right">Cost/Dz</span>
            </div>
            {processes.map((p, i) => (
              <div
                key={p.id}
                className={cn(
                  "grid grid-cols-1 md:grid-cols-[100px_1fr_120px_120px_100px_100px] gap-x-3 gap-y-0.5 py-3 text-sm",
                  i < processes.length - 1 && "border-b border-border/50"
                )}
              >
                <span className="text-muted-foreground text-xs uppercase">{p.category}</span>
                <span className="font-medium">{p.process_name}</span>
                <span className="text-muted-foreground text-xs">{p.placement || "\u2014"}</span>
                <span className="text-muted-foreground text-xs truncate">{p.supplier_name || "\u2014"}</span>
                <span className="md:text-right font-mono">
                  <span className="md:hidden text-xs text-muted-foreground">Cost/pc: </span>
                  ${fmt(p.cost_per_piece)}
                </span>
                <span className="md:text-right font-semibold font-mono">
                  ${fmt(p.cost_per_piece * 12)}
                </span>
              </div>
            ))}
            <div className="flex justify-between items-center pt-3 border-t border-border mt-1">
              <span className="text-sm font-semibold text-muted-foreground">Processes Subtotal</span>
              <span className="text-sm font-bold font-mono">${fmt(totals.processCostDz)}/dz</span>
            </div>
          </>
        )}
      </SectionCard>

      {/* ── Commercial Costs Section ─────────────────────────────────────── */}
      <SectionCard icon={Ship} title="Commercial Costs" count={commercial.length}>
        {commercial.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-4 text-center">No commercial cost rows</p>
        ) : (
          <>
            <div className="hidden md:grid md:grid-cols-[100px_1fr_100px_100px_100px] gap-3 pb-2 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              <span>Category</span>
              <span>Item</span>
              <span>Type</span>
              <span className="text-right">Amount</span>
              <span className="text-right">Cost/Dz</span>
            </div>
            {commercial.map((c, i) => {
              // Compute per-dozen for this row
              const subtotalBefore =
                totals.fabricCostDz + totals.trimsCostDz + totals.cmCostDz + totals.processCostDz;
              const dozensTotal =
                costSheet.target_quantity && costSheet.target_quantity > 0
                  ? costSheet.target_quantity / 12
                  : 1;
              let rowCostDz = 0;
              if (c.cost_type === "per_piece") rowCostDz = c.amount * 12;
              else if (c.cost_type === "per_shipment") rowCostDz = c.amount / dozensTotal;
              else if (c.cost_type === "percentage") rowCostDz = subtotalBefore * (c.amount / 100);
              else rowCostDz = c.amount * 12;

              return (
                <div
                  key={c.id}
                  className={cn(
                    "grid grid-cols-1 md:grid-cols-[100px_1fr_100px_100px_100px] gap-x-3 gap-y-0.5 py-3 text-sm",
                    i < commercial.length - 1 && "border-b border-border/50"
                  )}
                >
                  <span className="text-muted-foreground text-xs uppercase">{c.category}</span>
                  <span className="font-medium">{c.item_name}</span>
                  <span className="text-muted-foreground text-xs">{costTypeLabel(c.cost_type)}</span>
                  <span className="md:text-right font-mono">
                    <span className="md:hidden text-xs text-muted-foreground">Amt: </span>
                    {c.cost_type === "percentage" ? `${c.amount}%` : `$${fmt(c.amount)}`}
                  </span>
                  <span className="md:text-right font-semibold font-mono">${fmt(rowCostDz)}</span>
                </div>
              );
            })}
            <div className="flex justify-between items-center pt-3 border-t border-border mt-1">
              <span className="text-sm font-semibold text-muted-foreground">Commercial Subtotal</span>
              <span className="text-sm font-bold font-mono">${fmt(totals.commercialCostDz)}/dz</span>
            </div>
          </>
        )}
      </SectionCard>

      {/* ── Quotation Summary ────────────────────────────────────────────── */}
      <Card className="border-primary/20">
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            Quotation Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Breakdown */}
          <div className="space-y-2 text-sm">
            {[
              { label: "Fabric", value: totals.fabricCostDz },
              { label: "Trims", value: totals.trimsCostDz },
              { label: "CM", value: totals.cmCostDz },
              { label: "Processes", value: totals.processCostDz },
              { label: "Commercial", value: totals.commercialCostDz },
            ].map((row) => (
              <div key={row.label} className="flex justify-between">
                <span className="text-muted-foreground">{row.label}</span>
                <span className="font-mono">${fmt(row.value)}/dz</span>
              </div>
            ))}
          </div>

          <Separator />

          <div className="flex justify-between text-sm font-bold">
            <span>Total Cost</span>
            <span className="font-mono">${fmt(totals.totalCostDz)}/dz &middot; ${fmt(totals.totalCostPc)}/pc</span>
          </div>

          {costSheet.desired_margin_pct != null && costSheet.desired_margin_pct > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Desired Margin</span>
              <span className="font-mono">{costSheet.desired_margin_pct}%</span>
            </div>
          )}

          {quotedPricePc > 0 && (
            <>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="font-semibold">Quoted Price</span>
                <div className="text-right">
                  <p className="text-xl font-bold font-mono">${fmt(quotedPriceDz)}/dz</p>
                  <p className="text-sm text-muted-foreground font-mono">${fmt(quotedPricePc)}/pc</p>
                </div>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Actual Margin</span>
                <span
                  className={cn(
                    "font-semibold",
                    totals.quotedMarginPct >= 0 ? "text-emerald-500" : "text-red-500"
                  )}
                >
                  {pct(totals.quotedMarginPct)}
                </span>
              </div>
            </>
          )}

          {buyerTargetPc != null && (
            <>
              <Separator />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Buyer Target</span>
                <span className="font-mono">${fmt(buyerTargetPc)}/pc</span>
              </div>
              {totals.buyerGapPc != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Gap</span>
                  <span
                    className={cn(
                      "font-semibold",
                      totals.buyerGapPc >= 0 ? "text-emerald-500" : "text-red-500"
                    )}
                  >
                    {totals.buyerGapPc >= 0 ? "Under target" : "Over target"} by $
                    {fmt(Math.abs(totals.buyerGapPc))}/pc
                  </span>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Details ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4 text-sm">
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Created
              </p>
              <p className="font-semibold">{fmtDate(costSheet.created_at)}</p>
            </div>
            {costSheet.approved_at && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Approved
                </p>
                <p className="font-semibold">{fmtDate(costSheet.approved_at)}</p>
              </div>
            )}
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Currency
              </p>
              <p className="font-semibold">
                {costSheet.currency} (Rate: {fmt(costSheet.exchange_rate)})
              </p>
            </div>
            {costSheet.target_quantity != null && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Target Qty
                </p>
                <p className="font-semibold">{costSheet.target_quantity.toLocaleString()} pcs</p>
              </div>
            )}
            {costSheet.program_name && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Program
                </p>
                <p className="font-semibold">{costSheet.program_name}</p>
              </div>
            )}
            {costSheet.fabric_composition && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Composition
                </p>
                <p className="font-semibold">{costSheet.fabric_composition}</p>
              </div>
            )}
            {costSheet.work_order_id && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Work Order
                </p>
                <Button
                  variant="link"
                  className="p-0 h-auto text-sm"
                  onClick={() => navigate(`/work-orders/${costSheet.work_order_id}`)}
                >
                  View Work Order
                </Button>
              </div>
            )}
          </div>

          {costSheet.notes && (
            <>
              <Separator className="my-4" />
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Notes
                </p>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{costSheet.notes}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Delete Dialog ────────────────────────────────────────────────── */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete cost sheet for {costSheet.style_ref}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the cost sheet and all its line items (fabric, trims, CM, processes,
              commercial). This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Cost Sheet
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
