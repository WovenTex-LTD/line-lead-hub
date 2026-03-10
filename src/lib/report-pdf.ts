import { format } from "date-fns";
import { jsPDF } from "jspdf";

type Department = "sewing" | "cutting" | "finishing" | "storage";

type PeriodRow = Record<string, any>;

export interface ProductionReportPdfData {
  factoryName: string;
  reportType: "daily" | "weekly" | "monthly";
  periodLabel: string;
  startDate: string;
  endDate: string;
  dates: string[];
  departments: Record<Department, boolean>;
  sewing: PeriodRow[];
  cutting: PeriodRow[];
  finishing: PeriodRow[];
  storage: PeriodRow[];
  headcountCostRate: number;
  headcountCostCurrency: string;
  bdtToUsdRate: number | null;
}

const toNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const lineCost = (
  rate: number,
  manpower: unknown,
  hours: unknown,
  otManpower: unknown,
  otHours: unknown,
) => {
  if (!rate) return 0;
  return Number(
    (
      rate * toNumber(manpower) * toNumber(hours) +
      rate * toNumber(otManpower) * toNumber(otHours)
    ).toFixed(2),
  );
};

const toUsd = (amount: number, currency: string, rate: number | null) => {
  if (currency === "BDT" && rate) return Number((amount * rate).toFixed(2));
  return Number(amount.toFixed(2));
};

const fmtInt = (value: unknown) => toNumber(value).toLocaleString();
const fmtMoney = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function savePdf(doc: jsPDF, filename: string) {
  doc.save(filename.replace(/\s+/g, "_").toLowerCase());
}

export function generateProductionReportPdf(data: ProductionReportPdfData) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  let y = margin;

  const periodTitle = `${data.factoryName} ${data.reportType.charAt(0).toUpperCase() + data.reportType.slice(1)} Report`;
  const generatedOn = format(new Date(), "dd MMM yyyy, HH:mm");

  const addHeader = (title: string, subtitle?: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(title, margin, y);
    y += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(subtitle || data.periodLabel, margin, y);
    doc.text(`Generated ${generatedOn}`, pageWidth - margin, y, { align: "right" });
    y += 6;
    doc.setDrawColor(160);
    doc.line(margin, y, pageWidth - margin, y);
    y += 7;
  };

  const ensureSpace = (needed = 10) => {
    if (y + needed <= pageHeight - margin) return;
    doc.addPage();
    y = margin;
  };

  const addSummaryBlock = (title: string, rows: Array<[string, string]>) => {
    if (!rows.length) return;
    ensureSpace(12 + rows.length * 6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(title, margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    rows.forEach(([label, value]) => {
      ensureSpace(6);
      doc.text(`${label}:`, margin, y);
      doc.text(value, margin + 46, y);
      y += 5;
    });
    y += 3;
  };

  const addSimpleTable = (title: string, headers: string[], rows: string[][]) => {
    if (!rows.length) return;
    ensureSpace(18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(title, margin, y);
    y += 6;

    const tableWidth = pageWidth - margin * 2;
    const colWidth = tableWidth / headers.length;

    doc.setFontSize(8);
    doc.setFillColor(235, 235, 235);
    headers.forEach((header, index) => {
      const x = margin + index * colWidth;
      doc.rect(x, y, colWidth, 7, "FD");
      doc.text(header, x + 2, y + 4.7);
    });
    y += 7;

    doc.setFont("helvetica", "normal");
    rows.forEach((row) => {
      ensureSpace(7);
      row.forEach((cell, index) => {
        const x = margin + index * colWidth;
        doc.rect(x, y, colWidth, 6);
        doc.text(String(cell ?? "-").slice(0, 28), x + 2, y + 4.2);
      });
      y += 6;
    });
    y += 4;
  };

  addHeader(periodTitle, `${data.periodLabel} • ${data.startDate} → ${data.endDate}`);

  const totalSewingOutput = data.sewing.reduce((sum, row) => sum + toNumber(row.good_today), 0);
  const totalCuttingOutput = data.cutting.reduce((sum, row) => sum + toNumber(row.day_cutting), 0);
  const totalFinishingOutput = data.finishing.reduce((sum, row) => sum + toNumber(row.poly) + toNumber(row.carton), 0);
  const storageMovements = data.storage.length;

  const sewingCost = data.sewing.reduce(
    (sum, row) => sum + lineCost(data.headcountCostRate, row.manpower_actual, row.hours_actual, row.ot_manpower_actual, row.ot_hours_actual),
    0,
  );
  const cuttingCost = data.cutting.reduce(
    (sum, row) => sum + lineCost(data.headcountCostRate, row.man_power, row.hours_actual, row.ot_manpower_actual, row.ot_hours_actual),
    0,
  );
  const finishingCost = data.finishing.reduce(
    (sum, row) => sum + lineCost(data.headcountCostRate, row.m_power_actual, row.actual_hours, row.ot_manpower_actual, row.ot_hours_actual),
    0,
  );

  addSummaryBlock("Summary", [
    ["Reporting window", data.periodLabel],
    ["Days included", String(data.dates.length || 1)],
    ["Sewing output", fmtInt(totalSewingOutput)],
    ["Cutting output", fmtInt(totalCuttingOutput)],
    ["Finishing output", fmtInt(totalFinishingOutput)],
    ["Storage transactions", fmtInt(storageMovements)],
  ]);

  if (data.headcountCostRate > 0) {
    addSummaryBlock("Estimated labor cost", [
      ["Configured rate", `${data.headcountCostCurrency} ${data.headcountCostRate.toLocaleString()}`],
      ["Sewing cost (USD)", fmtMoney(toUsd(sewingCost, data.headcountCostCurrency, data.bdtToUsdRate))],
      ["Cutting cost (USD)", fmtMoney(toUsd(cuttingCost, data.headcountCostCurrency, data.bdtToUsdRate))],
      ["Finishing cost (USD)", fmtMoney(toUsd(finishingCost, data.headcountCostCurrency, data.bdtToUsdRate))],
      [
        "Total cost (USD)",
        fmtMoney(toUsd(sewingCost + cuttingCost + finishingCost, data.headcountCostCurrency, data.bdtToUsdRate)),
      ],
    ]);
  }

  addSimpleTable(
    "Sewing",
    ["Line", "PO", "Buyer", "Output", "Reject", "Hours"],
    data.sewing.slice(0, 14).map((row) => [
      row.lines?.name || row.lines?.line_id || row.line_id || "-",
      row.work_orders?.po_number || "-",
      row.work_orders?.buyer || "-",
      fmtInt(row.good_today),
      fmtInt(row.reject_today),
      fmtInt(row.hours_actual),
    ]),
  );

  addSimpleTable(
    "Cutting",
    ["Line", "PO", "Buyer", "Day cut", "Day input", "Hours"],
    data.cutting.slice(0, 14).map((row) => [
      row.lines?.name || row.lines?.line_id || row.line_id || "-",
      row.work_orders?.po_number || "-",
      row.work_orders?.buyer || "-",
      fmtInt(row.day_cutting),
      fmtInt(row.day_input),
      fmtInt(row.hours_actual),
    ]),
  );

  addSimpleTable(
    "Finishing",
    ["PO", "Buyer", "Style", "Poly", "Carton", "Hours"],
    data.finishing.slice(0, 14).map((row) => [
      row.work_orders?.po_number || "-",
      row.work_orders?.buyer || "-",
      row.work_orders?.style || "-",
      fmtInt(row.poly),
      fmtInt(row.carton),
      fmtInt(row.actual_hours),
    ]),
  );

  if (data.storage.length) {
    addSimpleTable(
      "Storage",
      ["Date", "PO", "Buyer", "Style", "Receive", "Issue"],
      data.storage.slice(0, 14).map((row) => [
        row.transaction_date || "-",
        row.storage_bin_cards?.work_orders?.po_number || row.storage_bin_cards?.group_name || "-",
        row.storage_bin_cards?.buyer || "-",
        row.storage_bin_cards?.style || "-",
        fmtInt(row.receive_qty),
        fmtInt(row.issue_qty),
      ]),
    );
  }

  savePdf(doc, `${data.reportType}_report_${data.periodLabel}.pdf`);
}
