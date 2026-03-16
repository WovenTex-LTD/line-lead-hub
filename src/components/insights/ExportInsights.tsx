import { format, subDays } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, Table, FileDown } from "lucide-react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";

export interface ExportFinancialData {
  totalRevenue: number;
  totalCost: number;
  profit: number;
  margin: number;
  sewingCost: number;
  cuttingCost: number;
  finishingCost: number;
  revenuePerPiece: number;
  costPerPiece: number;
  profitByPo: Array<{ po: string; buyer: string; revenue: number; cost: number; profit: number; margin: number }>;
  dailyFinancials: Array<{ date: string; displayDate: string; revenue: number; cost: number; profit: number }>;
  prevRevenue: number;
  prevProfit: number;
  prevMargin: number;
  hasData: boolean;
}

export interface ExportData {
  summary: {
    totalSewingOutput: number;
    totalFinishingQcPass: number;
    avgEfficiency: number;
    totalBlockers: number;
    openBlockers: number;
    resolvedBlockers: number;
    avgManpower: number;
    daysWithData: number;
    topPerformingLine: string | null;
    worstPerformingLine: string | null;
  };
  linePerformance: Array<{
    lineName: string;
    totalOutput: number;
    totalTarget: number;
    efficiency: number;
    avgManpower: number;
    blockers: number;
  }>;
  dailyData: Array<{
    date: string;
    sewingOutput: number;
    sewingTarget: number;
    finishingQcPass: number;
    efficiency: number;
    blockers: number;
  }>;
  blockerBreakdown: Array<{
    type: string;
    count: number;
  }>;
  workOrderProgress: Array<{
    poNumber: string;
    buyer: string;
    style: string;
    orderQty: number;
    totalOutput: number;
    progress: number;
  }>;
  financials?: ExportFinancialData;
  periodDays: number;
  startDate: string;
  endDate: string;
  exportDate: string;
  factoryName: string;
}

interface ExportInsightsProps {
  data: ExportData;
  loading?: boolean;
  onChangePeriod?: (days: number) => void;
}

const esc = (cell: string) => `"${String(cell ?? "").replace(/"/g, '""')}"`;

type RGB = [number, number, number];

// Load white PP logo for PDF cover
function loadWhiteLogo(): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 200;
      canvas.height = 200;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(img, 0, 0, 200, 200);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
    // White PP logo on transparent - strip the blue background rect from the SVG
    const svgRaw = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 375 375"><defs><clipPath id="a"><path d="M160.4 154.2H269v132.8H160.4z"/></clipPath><clipPath id="b"><path d="M106.1 87.7h108.8v132.7H106.1z"/></clipPath></defs><g clip-path="url(#a)"><path fill="#fff" d="M160.4 287.3v-83.9h34.1v12.7h30c2.7 0 5.3-1 7.3-3 1.9-1.9 3-4.5 3-7.2l-.1-7.4c0-5.6-4.6-10.2-10.2-10.2h-28.3l-23.4-34.1h51.7c24.4 0 44.2 19.8 44.3 44.2v7.4c0 11.8-4.6 23-13 31.4-8.4 8.4-19.5 13-31.4 13h-30v37z"/></g><g clip-path="url(#b)"><path fill="#fff" d="M106.1 220.7v-83.8h34.1v12.7h30c2.8 0 5.4-1.1 7.3-3 1.9-1.9 3-4.4 3-7.2v-7.4c0-5.6-4.6-10.2-10.2-10.2h-28.3l-23.4-34.1h51.7c24.4 0 44.2 19.9 44.3 44.2v7.4c0 11.8-4.6 23-13 31.4-8.4 8.4-19.5 13-31.3 13h-30.1v37z"/></g></svg>`;
    img.src = "data:image/svg+xml;base64," + btoa(svgRaw);
  });
}

// ─── PDF GENERATION ───────────────────────────────────────────────────

export async function downloadInsightsPdf(d: ExportData) {
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 18; // margin
  const cw = pw - m * 2; // content width
  let pageNum = 0;

  // ── Palette ──
  const blue: RGB = [37, 99, 235];
  const blueDark: RGB = [29, 78, 216];
  const blueLight: RGB = [219, 234, 254];
  const slate900: RGB = [15, 23, 42];
  const slate700: RGB = [51, 65, 85];
  const slate500: RGB = [100, 116, 139];
  const slate200: RGB = [226, 232, 240];
  const slate50: RGB = [248, 250, 252];
  const green: RGB = [22, 163, 74];
  const greenLight: RGB = [220, 252, 231];
  const amber: RGB = [217, 119, 6];
  const amberLight: RGB = [254, 243, 199];
  const red: RGB = [220, 38, 38];
  const redLight: RGB = [254, 226, 226];
  const white: RGB = [255, 255, 255];

  const startDate = d.startDate ? format(new Date(d.startDate + "T00:00:00"), "MMM d, yyyy") : format(subDays(new Date(), d.periodDays), "MMM d, yyyy");
  const endDate = d.endDate ? format(new Date(d.endDate + "T00:00:00"), "MMM d, yyyy") : format(new Date(), "MMM d, yyyy");

  // ── Computed insights ──
  const avgPerDay =
    d.summary.daysWithData > 0
      ? Math.round(d.summary.totalSewingOutput / d.summary.daysWithData)
      : 0;
  const qcPerDay =
    d.summary.daysWithData > 0
      ? Math.round(d.summary.totalFinishingQcPass / d.summary.daysWithData)
      : 0;
  const totalTarget = d.dailyData.reduce((s, day) => s + day.sewingTarget, 0);
  const targetVariance = d.summary.totalSewingOutput - totalTarget;
  const blockerResolutionRate =
    d.summary.totalBlockers > 0
      ? Math.round((d.summary.resolvedBlockers / d.summary.totalBlockers) * 100)
      : 100;
  const linesOnTarget = d.linePerformance.filter(
    (l) => l.totalTarget > 0 && l.efficiency >= 85,
  ).length;
  const linesActive = d.linePerformance.filter(
    (l) => l.totalOutput > 0 || l.totalTarget > 0,
  ).length;

  // Best / worst days
  const sortedByOutput = [...d.dailyData].sort((a, b) => b.sewingOutput - a.sewingOutput);
  const bestDay = sortedByOutput[0];
  const worstDay = sortedByOutput[sortedByOutput.length - 1];
  const sortedByEff = [...d.dailyData].sort((a, b) => b.efficiency - a.efficiency);
  const bestEffDay = sortedByEff[0];

  // Trend (first half vs second half avg output)
  const half = Math.ceil(d.dailyData.length / 2);
  const firstHalf = d.dailyData.slice(0, half);
  const secondHalf = d.dailyData.slice(half);
  const firstAvg =
    firstHalf.length > 0
      ? firstHalf.reduce((s, day) => s + day.sewingOutput, 0) / firstHalf.length
      : 0;
  const secondAvg =
    secondHalf.length > 0
      ? secondHalf.reduce((s, day) => s + day.sewingOutput, 0) / secondHalf.length
      : 0;
  const trendPct = firstAvg > 0 ? Math.round(((secondAvg - firstAvg) / firstAvg) * 100) : 0;

  // WO stats
  const woCompleted = d.workOrderProgress.filter((wo) => wo.progress >= 100).length;
  const woNearDone = d.workOrderProgress.filter(
    (wo) => wo.progress >= 75 && wo.progress < 100,
  ).length;

  // ── Helpers ──
  const drawPageFooter = () => {
    pageNum++;
    doc.setDrawColor(...slate200);
    doc.setLineWidth(0.3);
    doc.line(m, ph - 18, pw - m, ph - 18);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...slate500);
    doc.text(d.factoryName, m, ph - 12);
    doc.text(`${startDate} - ${endDate}`, pw / 2, ph - 12, { align: "center" });
    doc.text(`Page ${pageNum}`, pw - m, ph - 12, { align: "right" });
  };

  const drawPageHeader = (title: string, subtitle?: string) => {
    // Gradient-like header
    doc.setFillColor(...blue);
    doc.rect(0, 0, pw, 38, "F");
    doc.setFillColor(...blueDark);
    doc.rect(0, 34, pw, 4, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(17);
    doc.setFont("helvetica", "bold");
    doc.text(title, m, 18);
    if (subtitle) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(subtitle, m, 28);
    }

    // Factory name right-aligned
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(d.factoryName, pw - m, 28, { align: "right" });

    drawPageFooter();
    return 50;
  };

  const drawSectionTitle = (title: string, y: number) => {
    doc.setFillColor(...blue);
    doc.rect(m, y, 3, 12, "F");
    doc.setTextColor(...slate900);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(title, m + 7, y + 9);
    return y + 18;
  };

  const drawKpiCard = (
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    value: string,
    sub?: string,
    accent?: RGB,
  ) => {
    // Card background
    doc.setFillColor(...white);
    doc.setDrawColor(...slate200);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, w, h, 3, 3, "FD");

    // Accent bar on top
    if (accent) {
      doc.setFillColor(...accent);
      doc.roundedRect(x, y, w, 3, 3, 3, "F");
      doc.setFillColor(...accent);
      doc.rect(x, y + 2, w, 1, "F");
    }

    // Label
    doc.setTextColor(...slate500);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text(label.toUpperCase(), x + w / 2, y + 14, { align: "center" });

    // Value
    doc.setTextColor(...slate900);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(value, x + w / 2, y + 28, { align: "center" });

    // Subtext
    if (sub) {
      doc.setTextColor(...slate500);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(sub, x + w / 2, y + 35, { align: "center" });
    }
  };

  const drawProgressBar = (
    x: number,
    y: number,
    w: number,
    h: number,
    pct: number,
    fg: RGB,
    bg: RGB,
  ) => {
    doc.setFillColor(...bg);
    doc.roundedRect(x, y, w, h, h / 2, h / 2, "F");
    const fillW = Math.max(h, (Math.min(pct, 100) / 100) * w);
    doc.setFillColor(...fg);
    doc.roundedRect(x, y, fillW, h, h / 2, h / 2, "F");
  };

  const drawStatusBadge = (x: number, y: number, text: string, fg: RGB, bg: RGB) => {
    const textW = doc.getTextWidth(text);
    const padX = 4;
    const badgeW = textW + padX * 2;
    doc.setFillColor(...bg);
    doc.roundedRect(x, y - 4, badgeW, 6, 3, 3, "F");
    doc.setTextColor(...fg);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.text(text, x + padX, y);
    return badgeW;
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

  // Load white logo
  const logoDataUrl = await loadWhiteLogo();

  // ========== PAGE 1: COVER PAGE ==========
  // Full blue background
  doc.setFillColor(...blue);
  doc.rect(0, 0, pw, ph, "F");

  // Subtle geometric pattern overlay
  doc.setFillColor(255, 255, 255);
  doc.setGState(new (doc as any).GState({ opacity: 0.04 }));
  for (let i = 0; i < 8; i++) {
    doc.circle(pw * 0.8 + i * 15, 40 + i * 20, 60 + i * 10, "F");
  }
  doc.setGState(new (doc as any).GState({ opacity: 1 }));

  // Production Portal logo + branding
  if (logoDataUrl) {
    const logoSize = 22;
    doc.setGState(new (doc as any).GState({ opacity: 0.85 }));
    doc.addImage(logoDataUrl, "PNG", pw / 2 - logoSize / 2, 18, logoSize, logoSize);
    doc.setGState(new (doc as any).GState({ opacity: 1 }));
  }
  doc.setTextColor(255, 255, 255);
  doc.setGState(new (doc as any).GState({ opacity: 0.6 }));
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("PRODUCTION PORTAL", pw / 2, logoDataUrl ? 46 : 30, { align: "center" });
  doc.setGState(new (doc as any).GState({ opacity: 1 }));

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("PRODUCTION", pw / 2, 72, { align: "center" });
  doc.setFontSize(38);
  doc.setFont("helvetica", "bold");
  doc.text("Insights Report", pw / 2, 92, { align: "center" });

  // Factory name
  doc.setFontSize(18);
  doc.setFont("helvetica", "normal");
  doc.text(d.factoryName, pw / 2, 115, { align: "center" });

  // Date range card
  doc.setFillColor(255, 255, 255);
  doc.setGState(new (doc as any).GState({ opacity: 0.15 }));
  doc.roundedRect(pw / 2 - 65, 130, 130, 30, 5, 5, "F");
  doc.setGState(new (doc as any).GState({ opacity: 1 }));
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`${startDate}  -  ${endDate}`, pw / 2, 145, { align: "center" });
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`${d.periodDays}-Day Report`, pw / 2, 154, { align: "center" });

  // Cover KPI cards (4 across, white translucent)
  const coverCardW = (cw - 15) / 4;
  const coverCardY = 178;
  const coverCards = [
    { label: "Total Output", value: d.summary.totalSewingOutput.toLocaleString(), sub: "pieces" },
    { label: "Avg Efficiency", value: d.summary.avgEfficiency + "%", sub: avgPerDay.toLocaleString() + " pcs/day" },
    { label: "QC Pass", value: d.summary.totalFinishingQcPass.toLocaleString(), sub: "pieces" },
    { label: "Blockers", value: String(d.summary.totalBlockers), sub: d.summary.openBlockers + " open" },
  ];
  coverCards.forEach((c, i) => {
    const cx = m + i * (coverCardW + 5);
    doc.setFillColor(255, 255, 255);
    doc.setGState(new (doc as any).GState({ opacity: 0.15 }));
    doc.roundedRect(cx, coverCardY, coverCardW, 42, 4, 4, "F");
    doc.setGState(new (doc as any).GState({ opacity: 1 }));

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(c.label.toUpperCase(), cx + coverCardW / 2, coverCardY + 12, { align: "center" });
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(c.value, cx + coverCardW / 2, coverCardY + 27, { align: "center" });
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(c.sub, cx + coverCardW / 2, coverCardY + 35, { align: "center" });
  });

  // Key highlights box
  const hlY = 238;
  doc.setFillColor(255, 255, 255);
  doc.setGState(new (doc as any).GState({ opacity: 0.1 }));
  doc.roundedRect(m, hlY, cw, 42, 5, 5, "F");
  doc.setGState(new (doc as any).GState({ opacity: 1 }));

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("KEY HIGHLIGHTS", m + 8, hlY + 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const highlights: string[] = [];
  if (d.summary.topPerformingLine) highlights.push(`Top performer: ${d.summary.topPerformingLine}`);
  if (linesOnTarget > 0) highlights.push(`${linesOnTarget} of ${linesActive} lines meeting target`);
  if (trendPct !== 0) highlights.push(`Output trend: ${trendPct > 0 ? "+" : ""}${trendPct}% (2nd half vs 1st half)`);
  if (blockerResolutionRate < 100) highlights.push(`Blocker resolution: ${blockerResolutionRate}%`);
  if (woCompleted > 0) highlights.push(`${woCompleted} work orders completed`);
  highlights.slice(0, 4).forEach((h, i) => {
    doc.text(`  -  ${h}`, m + 8, hlY + 19 + i * 7);
  });

  // Generated timestamp + branding
  doc.setFontSize(7);
  doc.text(`Generated: ${format(new Date(), "PPpp")}`, pw / 2, ph - 26, { align: "center" });
  doc.setGState(new (doc as any).GState({ opacity: 0.4 }));
  doc.setFontSize(6);
  doc.text("Powered by Production Portal", pw / 2, ph - 18, { align: "center" });
  doc.setGState(new (doc as any).GState({ opacity: 1 }));
  pageNum++;

  // ========== PAGE 2: EXECUTIVE SUMMARY ==========
  doc.addPage();
  let y = drawPageHeader("Executive Summary", `${d.periodDays}-day overview of production performance`);

  // 6 KPI cards in 3x2 grid
  const kw = (cw - 10) / 3;
  const kh = 40;
  const kpiData = [
    { label: "Total Sewing Output", value: d.summary.totalSewingOutput.toLocaleString(), sub: `${avgPerDay.toLocaleString()} avg/day`, accent: blue },
    { label: "Average Efficiency", value: d.summary.avgEfficiency + "%", sub: d.summary.avgEfficiency >= 85 ? "On Target" : d.summary.avgEfficiency >= 60 ? "Needs Improvement" : "Below Target", accent: d.summary.avgEfficiency >= 85 ? green : d.summary.avgEfficiency >= 60 ? amber : red },
    { label: "QC Pass Output", value: d.summary.totalFinishingQcPass.toLocaleString(), sub: `${qcPerDay.toLocaleString()} avg/day`, accent: green },
    { label: "Target Variance", value: (targetVariance >= 0 ? "+" : "") + targetVariance.toLocaleString(), sub: `vs ${totalTarget.toLocaleString()} target`, accent: targetVariance >= 0 ? green : red },
    { label: "Avg Manpower / Line", value: String(d.summary.avgManpower), sub: `${d.linePerformance.length} lines tracked`, accent: blue },
    { label: "Blocker Resolution", value: blockerResolutionRate + "%", sub: `${d.summary.resolvedBlockers} of ${d.summary.totalBlockers} resolved`, accent: blockerResolutionRate >= 80 ? green : amber },
  ];
  kpiData.forEach((k, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    drawKpiCard(m + col * (kw + 5), y + row * (kh + 6), kw, kh, k.label, k.value, k.sub, k.accent);
  });
  y += 2 * (kh + 6) + 8;

  // Performance snapshot section
  y = drawSectionTitle("Performance Snapshot", y);
  const snapCol1 = m;
  const snapCol2 = m + cw / 2 + 5;
  const snapW = cw / 2 - 5;

  // Lines on target card
  doc.setFillColor(...slate50);
  doc.setDrawColor(...slate200);
  doc.setLineWidth(0.3);
  doc.roundedRect(snapCol1, y, snapW, 32, 3, 3, "FD");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...slate700);
  doc.text("Lines Meeting Target", snapCol1 + 6, y + 10);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...slate500);
  doc.text(`${linesOnTarget} of ${linesActive} active lines`, snapCol1 + 6, y + 18);
  drawProgressBar(
    snapCol1 + 6,
    y + 23,
    snapW - 12,
    4,
    linesActive > 0 ? (linesOnTarget / linesActive) * 100 : 0,
    green,
    slate200,
  );

  // Output trend card
  doc.setFillColor(...slate50);
  doc.roundedRect(snapCol2, y, snapW, 32, 3, 3, "FD");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...slate700);
  doc.text("Output Trend (2nd half vs 1st half)", snapCol2 + 6, y + 10);
  const trendColor = trendPct >= 0 ? green : red;
  doc.setTextColor(...trendColor);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(`${trendPct > 0 ? "+" : ""}${trendPct}%`, snapCol2 + 6, y + 26);

  y += 40;

  // Top / bottom performers
  if (d.summary.topPerformingLine || d.summary.worstPerformingLine) {
    y = drawSectionTitle("Line Highlights", y);
    if (d.summary.topPerformingLine) {
      const topLine = d.linePerformance.find((l) => l.lineName === d.summary.topPerformingLine);
      doc.setFillColor(...greenLight);
      doc.roundedRect(m, y, cw, 14, 3, 3, "F");
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...green);
      doc.text("TOP PERFORMER", m + 6, y + 9);
      doc.setTextColor(...slate900);
      doc.setFont("helvetica", "normal");
      doc.text(
        `${d.summary.topPerformingLine}${topLine ? ` - ${topLine.efficiency}% efficiency, ${topLine.totalOutput.toLocaleString()} pcs` : ""}`,
        m + 50,
        y + 9,
      );
      y += 17;
    }
    if (d.summary.worstPerformingLine && d.summary.worstPerformingLine !== d.summary.topPerformingLine) {
      const worstLine = d.linePerformance.find((l) => l.lineName === d.summary.worstPerformingLine);
      doc.setFillColor(...redLight);
      doc.roundedRect(m, y, cw, 14, 3, 3, "F");
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...red);
      doc.text("NEEDS ATTENTION", m + 6, y + 9);
      doc.setTextColor(...slate900);
      doc.setFont("helvetica", "normal");
      doc.text(
        `${d.summary.worstPerformingLine}${worstLine ? ` - ${worstLine.efficiency}% efficiency, ${worstLine.totalOutput.toLocaleString()} pcs` : ""}`,
        m + 55,
        y + 9,
      );
      y += 17;
    }
  }

  // Blocker summary
  if (d.blockerBreakdown.length > 0) {
    y += 3;
    y = drawSectionTitle("Blocker Analysis", y);
    const totalBlockerCount = d.blockerBreakdown.reduce((s, b) => s + b.count, 0);
    d.blockerBreakdown.forEach((b) => {
      if (y > ph - 30) return;
      const pct = Math.round((b.count / totalBlockerCount) * 100);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...slate700);
      doc.text(b.type, m, y + 3);
      doc.setTextColor(...slate500);
      doc.text(`${b.count} (${pct}%)`, m + 70, y + 3);
      drawProgressBar(m + 95, y, cw - 95, 4, pct, amber, slate200);
      y += 9;
    });
  }

  // ========== PAGE 3: PRODUCTION TRENDS ==========
  if (d.dailyData.length > 0) {
    doc.addPage();
    y = drawPageHeader("Production Trends", "Daily output and efficiency over the reporting period");

    // Quick insight cards across top
    const insightW = (cw - 10) / 3;
    if (bestDay) {
      doc.setFillColor(...greenLight);
      doc.roundedRect(m, y, insightW, 20, 3, 3, "F");
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...green);
      doc.text("BEST DAY", m + 4, y + 7);
      doc.setTextColor(...slate900);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(`${formatDate(bestDay.date)} - ${bestDay.sewingOutput.toLocaleString()} pcs`, m + 4, y + 15);
    }
    if (worstDay && d.dailyData.length > 1) {
      doc.setFillColor(...redLight);
      doc.roundedRect(m + insightW + 5, y, insightW, 20, 3, 3, "F");
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...red);
      doc.text("LOWEST DAY", m + insightW + 9, y + 7);
      doc.setTextColor(...slate900);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(
        `${formatDate(worstDay.date)} - ${worstDay.sewingOutput.toLocaleString()} pcs`,
        m + insightW + 9,
        y + 15,
      );
    }
    if (bestEffDay) {
      doc.setFillColor(...blueLight);
      doc.roundedRect(m + 2 * (insightW + 5), y, insightW, 20, 3, 3, "F");
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...blue);
      doc.text("PEAK EFFICIENCY", m + 2 * (insightW + 5) + 4, y + 7);
      doc.setTextColor(...slate900);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(
        `${formatDate(bestEffDay.date)} - ${bestEffDay.efficiency}%`,
        m + 2 * (insightW + 5) + 4,
        y + 15,
      );
    }
    y += 28;

    // ── Output bar chart ──
    y = drawSectionTitle("Daily Sewing Output", y);
    const chartH = 75;
    const gapTotal = 20;
    const barSpacing = (cw - gapTotal) / d.dailyData.length;
    const barW = Math.min(barSpacing * 0.65, 18);
    const maxOut = Math.max(...d.dailyData.map((day) => Math.max(day.sewingOutput, day.sewingTarget)), 1);

    // Grid lines
    doc.setDrawColor(...slate200);
    doc.setLineWidth(0.15);
    for (let i = 0; i <= 4; i++) {
      const gy = y + chartH - (i / 4) * chartH;
      doc.line(m, gy, m + cw, gy);
      doc.setFontSize(6);
      doc.setTextColor(...slate500);
      doc.text(Math.round((maxOut * i) / 4).toLocaleString(), m - 2, gy + 1, { align: "right" });
    }

    d.dailyData.forEach((day, idx) => {
      const cx = m + gapTotal / 2 + idx * barSpacing + barSpacing / 2;

      // Output bar — green if >= 85% of target, blue otherwise
      const barH = (day.sewingOutput / maxOut) * chartH;
      const barY = y + chartH - barH;
      const metTarget = day.sewingTarget > 0 && day.sewingOutput >= day.sewingTarget * 0.85;
      doc.setFillColor(...(metTarget ? green : blue));
      if (barH > 2) {
        doc.roundedRect(cx - barW / 2, barY, barW, barH, 1.5, 1.5, "F");
      } else if (barH > 0) {
        doc.rect(cx - barW / 2, barY, barW, Math.max(barH, 0.5), "F");
      }

      // Value on top
      if (day.sewingOutput > 0) {
        doc.setFontSize(5.5);
        doc.setTextColor(...slate700);
        doc.text(day.sewingOutput.toLocaleString(), cx, barY - 2, { align: "center" });
      }

      // Date label
      doc.setFontSize(6);
      doc.setTextColor(...slate500);
      doc.text(formatDate(day.date), cx, y + chartH + 7, { align: "center" });
    });

    // Legend
    const legY = y + chartH + 12;
    doc.setFillColor(...green);
    doc.rect(m, legY, 6, 3, "F");
    doc.setFontSize(6);
    doc.setTextColor(...slate500);
    doc.text("On Target (85%+)", m + 8, legY + 3);
    doc.setFillColor(...blue);
    doc.rect(m + 55, legY, 6, 3, "F");
    doc.text("Below Target", m + 63, legY + 3);

    y = legY + 12;

    // ── Efficiency bar chart ──
    y = drawSectionTitle("Daily Efficiency (%)", y);
    const effH = 55;

    // 85% target line
    const targetLineY = y + effH - (85 / 150) * effH;
    doc.setDrawColor(...slate200);
    doc.setLineWidth(0.15);
    for (let i = 0; i <= 3; i++) {
      const gy = y + effH - (i / 3) * effH;
      doc.line(m, gy, m + cw, gy);
    }
    doc.setDrawColor(...slate500);
    doc.setLineWidth(0.4);
    doc.setLineDashPattern([2, 2], 0);
    doc.line(m, targetLineY, m + cw, targetLineY);
    doc.setLineDashPattern([], 0);
    doc.setFontSize(5.5);
    doc.setTextColor(...slate500);
    doc.text("85%", m - 2, targetLineY + 1, { align: "right" });

    d.dailyData.forEach((day, idx) => {
      const cx = m + gapTotal / 2 + idx * barSpacing + barSpacing / 2;
      const barH = Math.min((day.efficiency / 150) * effH, effH);
      const barY = y + effH - barH;

      const color: RGB = day.efficiency >= 85 ? green : day.efficiency >= 60 ? amber : red;
      doc.setFillColor(...color);
      if (barH > 2) {
        doc.roundedRect(cx - barW / 2, barY, barW, barH, 1.5, 1.5, "F");
      } else if (barH > 0) {
        doc.rect(cx - barW / 2, barY, barW, Math.max(barH, 0.5), "F");
      }

      doc.setFontSize(5.5);
      doc.setTextColor(...slate700);
      doc.text(day.efficiency + "%", cx, barY - 2, { align: "center" });

      doc.setFontSize(6);
      doc.setTextColor(...slate500);
      const dl = new Date(day.date + "T00:00:00").toLocaleDateString("en-US", { day: "numeric" });
      doc.text(dl, cx, y + effH + 5, { align: "center" });
    });
  }

  // ========== PAGE 4: LINE PERFORMANCE ==========
  if (d.linePerformance.length > 0) {
    doc.addPage();
    y = drawPageHeader("Line Performance", `Ranked by efficiency across ${d.linePerformance.length} production lines`);

    // Summary badges
    drawStatusBadge(m, y, `${linesActive} ACTIVE`, blue, blueLight);
    drawStatusBadge(m + 38, y, `${linesOnTarget} ON TARGET`, green, greenLight);
    drawStatusBadge(m + 82, y, `${linesActive - linesOnTarget} BELOW`, linesActive - linesOnTarget > 0 ? red : green, linesActive - linesOnTarget > 0 ? redLight : greenLight);
    y += 10;

    // Table
    const cols = [0, 15, 55, 90, 122, 148];
    const colHeaders = ["#", "LINE", "OUTPUT", "TARGET", "EFF %", "BLOCKERS"];

    // Header row
    doc.setFillColor(...slate900);
    doc.roundedRect(m, y, cw, 10, 2, 2, "F");
    doc.rect(m, y + 5, cw, 5, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    colHeaders.forEach((h, i) => doc.text(h, m + cols[i] + 4, y + 7));

    y += 13;
    doc.setFont("helvetica", "normal");

    d.linePerformance.forEach((line, idx) => {
      if (y > ph - 28) return;

      // Row bg
      if (idx % 2 === 0) {
        doc.setFillColor(...slate50);
        doc.rect(m, y - 4.5, cw, 10, "F");
      }

      doc.setFontSize(8);
      const rank = idx + 1;

      // Rank with medal colors for top 3
      if (rank === 1) {
        doc.setTextColor(202, 138, 4); // gold
        doc.setFont("helvetica", "bold");
      } else if (rank === 2) {
        doc.setTextColor(...slate500);
        doc.setFont("helvetica", "bold");
      } else if (rank === 3) {
        doc.setTextColor(180, 83, 9); // bronze
        doc.setFont("helvetica", "bold");
      } else {
        doc.setTextColor(...slate500);
        doc.setFont("helvetica", "normal");
      }
      doc.text(String(rank), m + cols[0] + 4, y);

      // Line name
      doc.setTextColor(...slate900);
      doc.setFont(rank <= 3 ? "helvetica" : "helvetica", rank <= 3 ? "bold" : "normal");
      doc.text(line.lineName.substring(0, 20), m + cols[1] + 4, y);

      // Output / Target
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...slate700);
      doc.text(line.totalOutput.toLocaleString(), m + cols[2] + 4, y);
      doc.text(line.totalTarget.toLocaleString(), m + cols[3] + 4, y);

      // Efficiency badge
      const effColor: RGB = line.efficiency >= 85 ? green : line.efficiency >= 60 ? amber : red;
      const effBg: RGB = line.efficiency >= 85 ? greenLight : line.efficiency >= 60 ? amberLight : redLight;
      drawStatusBadge(m + cols[4] + 4, y, line.efficiency + "%", effColor, effBg);

      // Blockers
      doc.setTextColor(...(line.blockers > 0 ? red : slate500));
      doc.setFont("helvetica", line.blockers > 0 ? "bold" : "normal");
      doc.text(String(line.blockers), m + cols[5] + 4, y);

      y += 10;
    });
  }

  // ========== PAGE 5: WORK ORDER PROGRESS ==========
  if (d.workOrderProgress.length > 0) {
    doc.addPage();
    y = drawPageHeader("Work Order Progress", `${d.workOrderProgress.length} orders tracked`);

    // Summary badges
    drawStatusBadge(m, y, `${woCompleted} COMPLETED`, green, greenLight);
    drawStatusBadge(m + 45, y, `${woNearDone} ALMOST DONE`, amber, amberLight);
    drawStatusBadge(
      m + 98,
      y,
      `${d.workOrderProgress.length - woCompleted - woNearDone} IN PROGRESS`,
      blue,
      blueLight,
    );
    y += 12;

    d.workOrderProgress.forEach((wo) => {
      if (y > ph - 35) return;

      // Card per work order
      doc.setFillColor(...white);
      doc.setDrawColor(...slate200);
      doc.setLineWidth(0.3);
      doc.roundedRect(m, y, cw, 22, 3, 3, "FD");

      // Left accent bar based on progress
      const pColor: RGB = wo.progress >= 100 ? green : wo.progress >= 75 ? amber : blue;
      doc.setFillColor(...pColor);
      doc.roundedRect(m, y, 3, 22, 3, 3, "F");
      doc.rect(m + 2, y, 1, 22, "F");

      // PO + Buyer + Style
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...slate900);
      doc.text(wo.poNumber, m + 8, y + 8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...slate500);
      doc.setFontSize(7);
      doc.text(`${wo.buyer} / ${wo.style}`, m + 8, y + 14);

      // Progress bar
      const pbX = m + cw * 0.45;
      const pbW = cw * 0.35;
      drawProgressBar(pbX, y + 8, pbW, 5, wo.progress, pColor, slate200);

      // Output / Qty text
      doc.setFontSize(7);
      doc.setTextColor(...slate700);
      doc.text(
        `${wo.totalOutput.toLocaleString()} / ${wo.orderQty.toLocaleString()} pcs`,
        pbX,
        y + 18,
      );

      // Percentage
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...pColor);
      doc.text(wo.progress + "%", m + cw - 8, y + 13, { align: "right" });

      y += 25;
    });
  }

  // ========== PAGE 6: FINANCIAL INSIGHTS ==========
  if (d.financials?.hasData) {
    const fin = d.financials;
    doc.addPage();
    y = drawPageHeader("Financial Insights", "Revenue, cost, and profitability analysis (USD)");

    // 4 KPI cards
    const fkw = (cw - 15) / 4;
    const fkh = 40;
    const finKpis = [
      { label: "Output Value", value: `$${fin.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, sub: `$${fin.revenuePerPiece.toFixed(2)}/piece`, accent: green },
      { label: "Oper. Cost", value: `$${fin.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, sub: `$${fin.costPerPiece.toFixed(2)}/piece`, accent: amber },
      { label: "Operating Margin", value: `${fin.profit < 0 ? '-' : ''}$${Math.abs(fin.profit).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, sub: `vs $${fin.prevProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })} prev`, accent: fin.profit >= 0 ? green : red },
      { label: "Margin %", value: `${fin.margin.toFixed(1)}%`, sub: `vs ${fin.prevMargin.toFixed(1)}% prev`, accent: fin.margin >= 20 ? green : fin.margin >= 0 ? amber : red },
    ];
    finKpis.forEach((k, i) => {
      drawKpiCard(m + i * (fkw + 5), y, fkw, fkh, k.label, k.value, k.sub, k.accent);
    });
    y += fkh + 12;

    // Output Value vs Oper. Cost trend chart
    if (fin.dailyFinancials.length > 0) {
      y = drawSectionTitle("Daily Output Value vs Oper. Cost", y);
      const chartH = 60;
      const days = fin.dailyFinancials;
      const maxVal = Math.max(...days.map(dd => Math.max(dd.revenue, dd.cost)), 1);
      const barSpacing = cw / days.length;
      const barW = Math.min(barSpacing * 0.3, 10);

      // Grid lines
      doc.setDrawColor(...slate200);
      doc.setLineWidth(0.15);
      for (let i = 0; i <= 4; i++) {
        const gy = y + chartH - (i / 4) * chartH;
        doc.line(m, gy, m + cw, gy);
        doc.setFontSize(5.5);
        doc.setTextColor(...slate500);
        const val = Math.round((maxVal * i) / 4);
        doc.text(`$${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`, m - 2, gy + 1, { align: "right" });
      }

      days.forEach((dd, idx) => {
        const cx = m + idx * barSpacing + barSpacing / 2;
        // Revenue bar (green)
        const revH = (dd.revenue / maxVal) * chartH;
        if (revH > 0) {
          doc.setFillColor(...green);
          doc.rect(cx - barW - 1, y + chartH - revH, barW, revH, "F");
        }
        // Cost bar (orange)
        const costH = (dd.cost / maxVal) * chartH;
        if (costH > 0) {
          doc.setFillColor(...amber);
          doc.rect(cx + 1, y + chartH - costH, barW, costH, "F");
        }
        // Date label
        doc.setFontSize(5);
        doc.setTextColor(...slate500);
        doc.text(dd.displayDate, cx, y + chartH + 5, { align: "center" });
      });

      // Legend
      const legY = y + chartH + 10;
      doc.setFillColor(...green);
      doc.rect(m, legY, 6, 3, "F");
      doc.setFontSize(6);
      doc.setTextColor(...slate500);
      doc.text("Output Value", m + 8, legY + 3);
      doc.setFillColor(...amber);
      doc.rect(m + 35, legY, 6, 3, "F");
      doc.text("Cost", m + 43, legY + 3);
      y = legY + 12;
    }

    // Profitability by PO table
    if (fin.profitByPo.length > 0 && y < ph - 60) {
      y = drawSectionTitle("Profitability by PO", y);

      // Table header
      const fCols = [0, 45, 90, 125, 155];
      const fHeaders = ["PO / BUYER", "OUTPUT VALUE", "OPER. COST", "MARGIN", "MARGIN %"];
      doc.setFillColor(...slate900);
      doc.roundedRect(m, y, cw, 10, 2, 2, "F");
      doc.rect(m, y + 5, cw, 5, "F");
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      fHeaders.forEach((h, i) => doc.text(h, m + fCols[i] + 4, y + 7));
      y += 13;

      doc.setFont("helvetica", "normal");
      fin.profitByPo.slice(0, 10).forEach((po, idx) => {
        if (y > ph - 28) return;
        if (idx % 2 === 0) {
          doc.setFillColor(...slate50);
          doc.rect(m, y - 4.5, cw, 10, "F");
        }
        doc.setFontSize(7);
        doc.setTextColor(...slate900);
        doc.setFont("helvetica", "bold");
        const poLabel = po.po.length > 15 ? po.po.substring(0, 13) + "..." : po.po;
        doc.text(poLabel, m + fCols[0] + 4, y - 1);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...slate500);
        doc.setFontSize(6);
        doc.text(po.buyer.substring(0, 15), m + fCols[0] + 4, y + 4);
        doc.setFontSize(7);
        doc.setTextColor(...slate700);
        doc.text(`$${po.revenue.toLocaleString()}`, m + fCols[1] + 4, y);
        doc.text(`$${po.cost.toLocaleString()}`, m + fCols[2] + 4, y);
        const profitColor: RGB = po.profit >= 0 ? green : red;
        doc.setTextColor(...profitColor);
        doc.setFont("helvetica", "bold");
        doc.text(`${po.profit < 0 ? '-' : ''}$${Math.abs(po.profit).toLocaleString()}`, m + fCols[3] + 4, y);
        const mColor: RGB = po.margin >= 20 ? green : po.margin >= 0 ? amber : red;
        const mBg: RGB = po.margin >= 20 ? greenLight : po.margin >= 0 ? amberLight : redLight;
        drawStatusBadge(m + fCols[4] + 4, y, `${po.margin.toFixed(1)}%`, mColor, mBg);
        y += 10;
      });
    }
  }

  // Save
  const fileDate = d.endDate || format(new Date(), "yyyy-MM-dd");
  doc.save(`insights-report-${d.periodDays}days-${fileDate}.pdf`);
}

// ─── CSV GENERATION ───────────────────────────────────────────────────

function buildCsvRows(d: ExportData): string[][] {
  const rows: string[][] = [];
  const exportDate = format(new Date(), "PPpp");

  rows.push(["PRODUCTION INSIGHTS REPORT"]);
  rows.push([`Factory: ${d.factoryName}`]);
  rows.push([`Period: Last ${d.periodDays} days`]);
  rows.push([`Exported: ${exportDate}`]);
  rows.push([]);

  rows.push(["EXECUTIVE SUMMARY"]);
  rows.push(["Metric", "Value"]);
  rows.push(["Total Sewing Output (pcs)", d.summary.totalSewingOutput.toLocaleString()]);
  rows.push(["Total QC Pass (pcs)", d.summary.totalFinishingQcPass.toLocaleString()]);
  rows.push(["Average Efficiency", `${d.summary.avgEfficiency}%`]);
  rows.push(["Total Blockers", String(d.summary.totalBlockers)]);
  rows.push(["Open Blockers", String(d.summary.openBlockers)]);
  rows.push(["Resolved Blockers", String(d.summary.resolvedBlockers)]);
  rows.push(["Average Manpower", String(d.summary.avgManpower)]);
  rows.push(["Days with Data", String(d.summary.daysWithData)]);
  rows.push(["Top Performing Line", d.summary.topPerformingLine || "N/A"]);
  rows.push(["Lowest Performing Line", d.summary.worstPerformingLine || "N/A"]);
  rows.push([]);

  if (d.dailyData.length > 0) {
    rows.push(["=== DAILY PRODUCTION DATA ==="]);
    rows.push(["Date", "Sewing Output", "Sewing Target", "QC Pass", "Efficiency %", "Blockers"]);
    d.dailyData.forEach((day) => {
      rows.push([
        day.date,
        String(day.sewingOutput),
        String(day.sewingTarget),
        String(day.finishingQcPass),
        `${day.efficiency}%`,
        String(day.blockers),
      ]);
    });
    rows.push([]);
  }

  if (d.linePerformance.length > 0) {
    rows.push(["=== LINE PERFORMANCE ==="]);
    rows.push(["Line", "Output (pcs)", "Target (pcs)", "Efficiency %", "Avg Manpower", "Blockers"]);
    d.linePerformance.forEach((l) => {
      rows.push([
        l.lineName,
        l.totalOutput.toLocaleString(),
        l.totalTarget.toLocaleString(),
        `${l.efficiency}%`,
        String(l.avgManpower),
        String(l.blockers),
      ]);
    });
    rows.push([]);
  }

  if (d.blockerBreakdown.length > 0) {
    rows.push(["=== BLOCKER BREAKDOWN ==="]);
    rows.push(["Blocker Type", "Count"]);
    d.blockerBreakdown.forEach((b) => {
      rows.push([b.type, String(b.count)]);
    });
    rows.push([]);
  }

  if (d.workOrderProgress.length > 0) {
    rows.push(["=== WORK ORDER PROGRESS ==="]);
    rows.push(["PO Number", "Buyer", "Style", "Order Qty", "Output (pcs)", "Progress %"]);
    d.workOrderProgress.forEach((wo) => {
      rows.push([
        wo.poNumber,
        wo.buyer,
        wo.style,
        wo.orderQty.toLocaleString(),
        wo.totalOutput.toLocaleString(),
        `${wo.progress}%`,
      ]);
    });
    rows.push([]);
  }

  rows.push(["=== END OF REPORT ==="]);
  return rows;
}

export function downloadInsightsCsv(d: ExportData) {
  const rows = buildCsvRows(d);
  const csvContent = rows.map((row) => row.map(esc).join(",")).join("\n");
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  const fileDate = d.endDate || format(new Date(), "yyyy-MM-dd");
  link.href = url;
  link.download = `insights-report-${d.periodDays}days-${fileDate}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ─── COMPONENT ────────────────────────────────────────────────────────

export function ExportInsights({ data }: ExportInsightsProps) {
  const exportPdf = async () => {
    try {
      await downloadInsightsPdf(data);
      toast.success(`${data.periodDays}-day PDF report exported`);
    } catch (error) {
      console.error("PDF export error:", error);
      toast.error("Failed to export PDF report");
    }
  };

  const exportCsv = () => {
    try {
      downloadInsightsCsv(data);
      toast.success(`${data.periodDays}-day CSV report exported`);
    } catch (error) {
      console.error("CSV export error:", error);
      toast.error("Failed to export CSV report");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export Report
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={exportPdf}>
          <FileDown className="h-4 w-4 mr-2" />
          Export as PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportCsv}>
          <Table className="h-4 w-4 mr-2" />
          Export as CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
