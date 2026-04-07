import { jsPDF } from "jspdf";
import type { Invoice, InvoiceLineItem, InvoiceCharge, InvoiceTaxLine } from "@/hooks/useInvoices";
import type { FactoryFinanceSettings } from "@/hooks/useFactoryFinanceSettings";
import type { FactoryBankAccount } from "@/hooks/useFactoryBankAccounts";
import { calcLineItemTotal } from "@/hooks/useInvoices";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

const TYPE_LABELS: Record<string, string> = {
  commercial: "COMMERCIAL INVOICE",
  proforma: "PROFORMA INVOICE",
  credit_note: "CREDIT NOTE",
  debit_note: "DEBIT NOTE",
};

async function loadImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateInvoicePdf(
  invoice: Invoice,
  settings: FactoryFinanceSettings | null,
  bankAccount: FactoryBankAccount | null = null,
  signatureUrl: string | null = null
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();   // 210
  const ph = doc.internal.pageSize.getHeight();  // 297
  const ml = 15; // margin left
  const mr = 15; // margin right
  const cw = pw - ml - mr; // content width = 180
  let y = 15;

  const lineItems: InvoiceLineItem[] = invoice.invoice_line_items ?? [];
  const charges: InvoiceCharge[] = invoice.invoice_charges ?? [];
  const taxLines: InvoiceTaxLine[] = invoice.invoice_tax_lines ?? [];

  // Pre-load signature image from user preferences
  const sigDataUrl = signatureUrl ? await loadImageDataUrl(signatureUrl) : null;

  // ── Helpers ────────────────────────────────────────────────────────────────

  const ensurePage = (need: number) => {
    if (y + need > ph - 16) {
      doc.addPage();
      y = 15;
    }
  };

  const text = (
    str: string,
    x: number,
    yPos: number,
    opts?: { align?: "left" | "right" | "center"; maxWidth?: number; fontSize?: number; bold?: boolean; color?: [number, number, number] }
  ) => {
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
    doc.setFontSize(opts?.fontSize ?? 9);
    doc.setTextColor(...(opts?.color ?? [0, 0, 0]));
    doc.text(str, x, yPos, { align: opts?.align ?? "left", maxWidth: opts?.maxWidth });
  };

  const hline = (yPos: number, x1 = ml, x2 = ml + cw, color: [number, number, number] = [200, 200, 200]) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.2);
    doc.line(x1, yPos, x2, yPos);
  };

  // ── Header ─────────────────────────────────────────────────────────────────

  // Title block (right side)
  const typeLabel = TYPE_LABELS[invoice.invoice_type ?? "commercial"] ?? "COMMERCIAL INVOICE";
  text(typeLabel, ml + cw, y, { align: "right", fontSize: 16, bold: true, color: [30, 30, 30] });
  y += 6.5;
  text(`No. ${invoice.invoice_number}`, ml + cw, y, { align: "right", fontSize: 10, color: [80, 80, 80] });
  y += 5;
  text(`Date: ${fmtDate(invoice.issue_date)}`, ml + cw, y, { align: "right", fontSize: 8.5, color: [100, 100, 100] });
  if (invoice.due_date) {
    y += 4.5;
    text(`Due: ${fmtDate(invoice.due_date)}`, ml + cw, y, { align: "right", fontSize: 8.5, color: [100, 100, 100] });
  }

  // Seller block (left side) — limited to 85 mm wide so it doesn't bleed into title
  const sellerMaxW = 85;
  let sellerY = 15;
  const sellerName = settings?.seller_name ?? "Seller";
  text(sellerName, ml, sellerY, { fontSize: 12, bold: true, maxWidth: sellerMaxW });
  sellerY += 5.5;
  if (settings?.seller_address) {
    const addrLines = doc.splitTextToSize(settings.seller_address, sellerMaxW);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(addrLines, ml, sellerY, { maxWidth: sellerMaxW });
    sellerY += addrLines.length * 4;
  }
  const cityCountry = [settings?.seller_city, settings?.seller_country].filter(Boolean).join(", ");
  if (cityCountry) {
    text(cityCountry, ml, sellerY, { fontSize: 8, color: [80, 80, 80], maxWidth: sellerMaxW });
    sellerY += 4;
  }
  if (settings?.seller_phone) { text(`Tel: ${settings.seller_phone}`, ml, sellerY, { fontSize: 8, color: [80, 80, 80] }); sellerY += 4; }
  if (settings?.seller_email) { text(settings.seller_email, ml, sellerY, { fontSize: 8, color: [80, 80, 80] }); sellerY += 4; }
  if (settings?.tin_number) { text(`TIN: ${settings.tin_number}`, ml, sellerY, { fontSize: 8, color: [80, 80, 80] }); sellerY += 4; }
  if (settings?.bin_number) { text(`BIN: ${settings.bin_number}`, ml, sellerY, { fontSize: 8, color: [80, 80, 80] }); sellerY += 4; }

  y = Math.max(y, sellerY) + 7;
  hline(y, ml, ml + cw, [60, 60, 60]);
  y += 7;

  // ── Buyer + Trade row ──────────────────────────────────────────────────────

  const buyerColW = cw * 0.45;
  const tradeColX = ml + buyerColW + 6;
  const tradeColW = cw - buyerColW - 6;

  text("BILL TO", ml, y, { fontSize: 7, bold: true, color: [120, 120, 120] });
  text("DETAILS", tradeColX, y, { fontSize: 7, bold: true, color: [120, 120, 120] });
  y += 5;

  // Buyer name + address
  text(invoice.buyer_name, ml, y, { fontSize: 10, bold: true, maxWidth: buyerColW });
  let buyerY = y + 5;
  if (invoice.buyer_address) {
    const addrLines = doc.splitTextToSize(invoice.buyer_address, buyerColW);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    doc.text(addrLines, ml, buyerY, { maxWidth: buyerColW });
    buyerY += addrLines.length * 4 + 1;
  }
  if (invoice.buyer_contact) {
    text(invoice.buyer_contact, ml, buyerY, { fontSize: 8, color: [80, 80, 80] });
    buyerY += 4;
  }

  // Trade details (right column)
  let tradeY = y;
  const tradeItems: [string, string][] = [
    ["Payment Terms", invoice.payment_terms ?? ""],
    ["Incoterms", invoice.incoterms ?? ""],
    ["Port of Loading", invoice.port_of_loading ?? ""],
    ["Port of Discharge", invoice.port_of_discharge ?? ""],
    ["Country of Origin", invoice.country_of_origin ?? ""],
    ["LC Number", invoice.lc_number ?? ""],
    ["Contract No.", invoice.contract_number ?? ""],
    ["Vessel / Flight", invoice.vessel_name ?? ""],
    ["B/L Number", invoice.bl_number ?? ""],
    ["B/L Date", invoice.bl_date ? fmtDate(invoice.bl_date) : ""],
  ].filter(([, v]) => v) as [string, string][];

  const labelW = 28;
  for (const [label, val] of tradeItems) {
    text(`${label}:`, tradeColX, tradeY, { fontSize: 7.5, color: [110, 110, 110] });
    text(val, tradeColX + labelW, tradeY, { fontSize: 7.5, bold: true, maxWidth: tradeColW - labelW });
    tradeY += 4.5;
  }

  y = Math.max(buyerY, tradeY) + 8;

  // ── Line Items Table ───────────────────────────────────────────────────────

  ensurePage(20);
  hline(y, ml, ml + cw, [60, 60, 60]);
  const th = 6;
  // Total must equal cw (180): 60+24+20+12+18+24+14+8 = 180
  const cols = { desc: 60, style: 24, hs: 20, unit: 12, qty: 18, price: 24, disc: 14, total: 8 };
  // total col is actually the rightmost edge, used for right-aligned text
  const colX = {
    desc: ml,
    style: ml + cols.desc,
    hs: ml + cols.desc + cols.style,
    unit: ml + cols.desc + cols.style + cols.hs,
    qty: ml + cols.desc + cols.style + cols.hs + cols.unit,
    price: ml + cols.desc + cols.style + cols.hs + cols.unit + cols.qty,
    disc: ml + cols.desc + cols.style + cols.hs + cols.unit + cols.qty + cols.price,
    total: ml + cw, // right edge
  };

  y += 5;
  // Header row background
  doc.setFillColor(245, 245, 247);
  doc.rect(ml, y - 4, cw, th + 1, "F");

  const hasDiscount = lineItems.some((li) => (li.discount_pct ?? 0) > 0);

  const hdr = (lbl: string, x: number, align: "left" | "right" = "left") =>
    text(lbl, align === "right" ? x - 1 : x + 1, y, { fontSize: 7, bold: true, color: [80, 80, 80], align });

  hdr("DESCRIPTION", colX.desc);
  hdr("STYLE NO.", colX.style);
  hdr("HS CODE", colX.hs);
  hdr("UNIT", colX.unit);
  hdr("QTY", colX.qty + cols.qty, "right");
  hdr("UNIT PRICE", colX.price + cols.price, "right");
  if (hasDiscount) hdr("DISC%", colX.disc + cols.disc, "right");
  hdr("AMOUNT", colX.total, "right");
  y += th;
  hline(y, ml, ml + cw, [180, 180, 180]);

  // Data rows
  for (const li of lineItems) {
    ensurePage(10);
    const lineTotal = calcLineItemTotal(li);
    const descLines = doc.splitTextToSize(li.description, cols.desc - 2);
    const rowH = Math.max(6, descLines.length * 4.5);

    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text(descLines, colX.desc + 1, y, { maxWidth: cols.desc - 2 });

    text(li.style_number ?? "—", colX.style + 1, y, { fontSize: 7.5 });
    text(li.hs_code ?? "—", colX.hs + 1, y, { fontSize: 7.5, color: [80, 80, 80] });
    text(li.unit ?? "PCS", colX.unit + 1, y, { fontSize: 7.5 });
    text(li.quantity.toLocaleString(), colX.qty + cols.qty - 1, y, { fontSize: 8.5, align: "right" });
    text(`${invoice.currency} ${fmt(li.unit_price)}`, colX.price + cols.price - 1, y, { fontSize: 8.5, align: "right" });
    if (hasDiscount) {
      text((li.discount_pct ?? 0) > 0 ? `${li.discount_pct}%` : "—", colX.disc + cols.disc - 1, y, { fontSize: 8, align: "right" });
    }
    text(`${invoice.currency} ${fmt(lineTotal)}`, colX.total - 1, y, { fontSize: 8.5, bold: true, align: "right" });

    if (li.style_name || li.color || li.size_range) {
      y += 4;
      const sub = [li.style_name, li.color, li.size_range].filter(Boolean).join(" · ");
      text(sub, colX.desc + 1, y, { fontSize: 7, color: [130, 130, 130] });
    }

    y += rowH - 4.5 + 2;
    hline(y, ml, ml + cw, [220, 220, 220]);
  }

  y += 6;

  // ── Packing details ────────────────────────────────────────────────────────
  const hasPackingInfo = invoice.packing_type || invoice.total_cartons || invoice.total_gross_weight || invoice.total_net_weight || invoice.total_cbm;
  if (hasPackingInfo) {
    ensurePage(14);
    text("PACKING DETAILS", ml, y, { fontSize: 7, bold: true, color: [120, 120, 120] });
    y += 4.5;
    const packParts: string[] = [];
    if (invoice.packing_type) packParts.push(invoice.packing_type);
    if (invoice.total_cartons) packParts.push(`${invoice.total_cartons.toLocaleString()} Cartons`);
    if (invoice.total_gross_weight) packParts.push(`Gross: ${invoice.total_gross_weight} kg`);
    if (invoice.total_net_weight) packParts.push(`Net: ${invoice.total_net_weight} kg`);
    if (invoice.total_cbm) packParts.push(`${invoice.total_cbm} CBM`);
    text(packParts.join("   ·   "), ml, y, { fontSize: 8 });
    y += 8;
  }

  // ── Totals block ───────────────────────────────────────────────────────────

  ensurePage(40);
  const totalsX = ml + cw * 0.55;
  const totalsLabelX = totalsX;
  const totalsValueX = ml + cw;

  const subtotal = lineItems.reduce((s, li) => s + calcLineItemTotal(li), 0);
  const discountAmt = subtotal * ((invoice.discount_pct ?? 0) / 100);
  const afterDiscount = subtotal - discountAmt;
  const chargesTotal = charges.reduce((s, c) => c.is_deduct ? s - c.amount : s + c.amount, 0);
  const taxTotal = taxLines.reduce((s, t) => s + t.amount, 0);
  const totalInvoice = afterDiscount + chargesTotal + taxTotal;

  hline(y, totalsX - 4, ml + cw, [150, 150, 150]);
  y += 5.5;

  const totRow = (label: string, value: string, bold = false) => {
    ensurePage(6);
    text(label, totalsLabelX, y, { fontSize: 8.5, bold, color: bold ? [0, 0, 0] : [80, 80, 80] });
    text(value, totalsValueX, y, { fontSize: 8.5, bold, align: "right" });
    y += 5.5;
  };

  if ((invoice.discount_pct ?? 0) > 0 || charges.length > 0 || taxLines.length > 0) {
    totRow("Subtotal", `${invoice.currency} ${fmt(subtotal)}`);
    if ((invoice.discount_pct ?? 0) > 0) {
      totRow(`Discount (${invoice.discount_pct}%)`, `- ${invoice.currency} ${fmt(discountAmt)}`);
    }
  }

  for (const c of charges) {
    totRow(c.label, `${c.is_deduct ? "- " : "+ "}${invoice.currency} ${fmt(c.amount)}`);
  }
  for (const t of taxLines) {
    totRow(`${t.label}${t.rate_pct ? ` (${t.rate_pct}%)` : ""}`, `+ ${invoice.currency} ${fmt(t.amount)}`);
  }

  hline(y - 1, totalsX - 4, ml + cw, [80, 80, 80]);
  y += 3;
  totRow(`TOTAL (${invoice.currency})`, `${invoice.currency} ${fmt(totalInvoice)}`, true);

  if (invoice.currency !== "BDT" && invoice.exchange_rate) {
    const bdtTotal = totalInvoice * invoice.exchange_rate;
    text(`BDT Equivalent @ BDT ${fmt(invoice.exchange_rate)} / USD`, totalsLabelX, y, { fontSize: 7.5, color: [120, 120, 120] });
    text(`BDT ${fmt(bdtTotal)}`, totalsValueX, y, { fontSize: 7.5, align: "right", color: [120, 120, 120] });
    y += 7;
  }

  y += 5;

  // ── Remarks ────────────────────────────────────────────────────────────────

  if (invoice.remarks || invoice.notes) {
    ensurePage(20);
    hline(y, ml, ml + cw, [200, 200, 200]);
    y += 5;
    text("REMARKS", ml, y, { fontSize: 7, bold: true, color: [120, 120, 120] });
    y += 5;
    const combined = [invoice.remarks, invoice.notes].filter(Boolean).join("\n");
    const remarksLines = doc.splitTextToSize(combined, cw);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    doc.text(remarksLines, ml, y, { maxWidth: cw });
    y += remarksLines.length * 4.5 + 6;
  }

  // ── Bank details + Signature (kept together on same page) ──────────────────

  const halfW = cw / 2 - 4;
  const rightX = ml + cw / 2 + 4;

  const hasBankSection = invoice.show_bank_details && bankAccount && (bankAccount.bank_name || bankAccount.account_number);

  if (hasBankSection && bankAccount) {
    const leftFields: [string, string][] = [
      ["Bank Name", bankAccount.bank_name ?? ""],
      ["Bank Address", bankAccount.bank_address ?? ""],
      ["Account Name", bankAccount.account_name ?? ""],
      ["Account Number", bankAccount.account_number ?? ""],
    ].filter(([, v]) => v) as [string, string][];

    const rightFields: [string, string][] = [
      ["IBAN", bankAccount.iban ?? ""],
      ["Routing Number", bankAccount.routing_number ?? ""],
      ["SWIFT / BIC", bankAccount.swift_bic ?? ""],
      ["Branch", bankAccount.branch ?? ""],
      ["Currency", bankAccount.currency ?? ""],
    ].filter(([, v]) => v) as [string, string][];

    // Estimate banking section height so we can keep it with the signature
    let leftColH = 0;
    for (const [, val] of leftFields) {
      const lines = doc.splitTextToSize(val, halfW);
      leftColH += 3.5 + lines.length * 4.5 + 2;
    }
    const rightColH = rightFields.length * (3.5 + 6);
    const bankSectionH = 12 + Math.max(leftColH, rightColH) + 6;
    const sigH = sigDataUrl ? 46 : 34; // image sig is taller than placeholder line
    ensurePage(bankSectionH + sigH);

    hline(y, ml, ml + cw, [200, 200, 200]);
    y += 5;
    const bankLabel = bankAccount.account_label
      ? `BANKING DETAILS — ${bankAccount.account_label.toUpperCase()}`
      : "BANKING DETAILS";
    text(bankLabel, ml, y, { fontSize: 7, bold: true, color: [120, 120, 120] });
    y += 6;

    let leftY = y;
    for (const [label, val] of leftFields) {
      text(label, ml, leftY, { fontSize: 7, color: [120, 120, 120] });
      leftY += 3.5;
      const valLines = doc.splitTextToSize(val, halfW);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(0, 0, 0);
      doc.text(valLines, ml, leftY, { maxWidth: halfW });
      leftY += valLines.length * 4.5 + 2;
    }

    let rightY = y;
    for (const [label, val] of rightFields) {
      text(label, rightX, rightY, { fontSize: 7, color: [120, 120, 120] });
      rightY += 3.5;
      text(val, rightX, rightY, { fontSize: 8.5, bold: true, maxWidth: halfW });
      rightY += 6;
    }

    y = Math.max(leftY, rightY) + 6;
  }

  // ── Signature block (seller only) ──────────────────────────────────────────

  if (!hasBankSection) ensurePage(34); // only needed when there's no bank section above
  y += 4;
  hline(y, ml, ml + cw, [200, 200, 200]);
  y += 6;

  const sigBlockW = 70;
  const sigBlockX = ml + cw - sigBlockW;

  if (sigDataUrl) {
    // Render the saved signature image (max 50 × 18 mm, aspect-ratio preserved)
    try {
      const imgProps = doc.getImageProperties(sigDataUrl);
      const maxW = sigBlockW - 4;
      const maxH = 18;
      const aspect = imgProps.width / imgProps.height;
      let imgW = maxW;
      let imgH = imgW / aspect;
      if (imgH > maxH) { imgH = maxH; imgW = imgH * aspect; }
      const imgX = sigBlockX + (sigBlockW - imgW) / 2;
      doc.addImage(sigDataUrl, imgX, y, imgW, imgH);
      y += imgH + 2;
    } catch {
      // If image fails to load, fall through to the line
      y += 14;
    }
  } else {
    // Placeholder line for manual signature
    hline(y + 12, sigBlockX, ml + cw, [120, 120, 120]);
    y += 14;
  }

  text("Authorised Signatory", sigBlockX, y, { fontSize: 7, color: [120, 120, 120] });
  y += 4;
  text(settings?.seller_name ?? "", sigBlockX, y, { fontSize: 8, bold: true });

  // ── Footer on every page ───────────────────────────────────────────────────

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text(`Page ${i} of ${pageCount}`, pw / 2, ph - 7, { align: "center" });
    doc.text(invoice.invoice_number, ml, ph - 7);
    if (settings?.seller_name) doc.text(settings.seller_name, ml + cw, ph - 7, { align: "right" });
  }

  doc.save(`${invoice.invoice_number}.pdf`);
}
