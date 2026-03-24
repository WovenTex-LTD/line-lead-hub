import { Download, FileDown, Table } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import type { LinePerformanceData, TimeRange } from "./types";

interface LineExportButtonProps {
  lines: LinePerformanceData[];
  timeRange: TimeRange;
  dateLabel: string;
}

type RGB = [number, number, number];

// ── Shared helpers ──

function computeSummary(lines: LinePerformanceData[]) {
  // Only include lines with EOD submitted so target-only submissions don't skew achievement/variance
  const linesWithEOD = lines.filter((l) => l.dataState === "eod-submitted");
  const totalTarget = linesWithEOD.reduce((s, l) => s + l.totalTarget, 0);
  const totalOutput = linesWithEOD.reduce((s, l) => s + l.totalOutput, 0);
  const overallAchievement = totalTarget > 0 ? Math.round((totalOutput / totalTarget) * 100) : 0;
  const activeLines = lines.filter((l) => l.isActive).length;
  const linesOnTarget = linesWithEOD.filter((l) => l.isActive && l.achievementPct >= 85).length;
  const totalBlockers = lines.reduce((s, l) => s + l.totalBlockers, 0);
  const avgManpower =
    lines.length > 0 ? Math.round(lines.reduce((s, l) => s + l.avgManpower, 0) / lines.length) : 0;
  const sorted = [...linesWithEOD.filter((l) => l.isActive)].sort((a, b) => b.achievementPct - a.achievementPct);
  const bestLine = sorted[0] ?? null;
  const worstLine = sorted.length > 1 ? sorted[sorted.length - 1] : null;
  const targetSubmitted = lines.filter((l) => l.targetSubmitted).length;
  const eodSubmitted = lines.filter((l) => l.eodSubmitted).length;
  return {
    totalTarget,
    totalOutput,
    overallAchievement,
    activeLines,
    linesOnTarget,
    totalBlockers,
    avgManpower,
    bestLine,
    worstLine,
    targetSubmitted,
    eodSubmitted,
  };
}

// ── CSV Export ──

async function exportCsv(lines: LinePerformanceData[], timeRange: TimeRange, dateLabel: string) {
  const s = computeSummary(lines);
  const esc = (cell: string) => `"${String(cell).replace(/"/g, '""')}"`;

  const summaryRows = [
    ["LINE PERFORMANCE REPORT"],
    [`Period: ${dateLabel}`],
    [`Exported: ${format(new Date(), "PPpp")}`],
    [],
    ["FACTORY SUMMARY"],
    ["Metric", "Value"],
    ["Total Lines", String(lines.length)],
    ["Active Lines", String(s.activeLines)],
    ["Total Target (pcs)", s.totalTarget.toLocaleString()],
    ["Total Output (pcs)", s.totalOutput.toLocaleString()],
    ["Overall Achievement", `${s.overallAchievement}%`],
    ["Lines On Target (85%+)", `${s.linesOnTarget} of ${lines.length}`],
    ["Lines Below Target", `${lines.length - s.linesOnTarget} of ${lines.length}`],
    ["Total Blockers", String(s.totalBlockers)],
    ["Avg Manpower / Line", String(s.avgManpower)],
    ...(s.bestLine
      ? [["Best Performing Line", `${s.bestLine.name || s.bestLine.lineId} (${s.bestLine.achievementPct}%)`]]
      : []),
    ...(s.worstLine && s.worstLine !== s.bestLine
      ? [["Lowest Performing Line", `${s.worstLine.name || s.worstLine.lineId} (${s.worstLine.achievementPct}%)`]]
      : []),
    [],
    ["LINE DETAIL"],
  ];

  const headers = [
    "Line", "Unit", "Floor", "Status",
    "PO Number", "Buyer", "Style", "Item",
    "Target (pcs)", "Output (pcs)", "Achievement %", "Variance",
    "Avg Manpower", "Blockers",
    "Target Submitted", "EOD Submitted",
  ];

  const rows: string[][] = [];
  lines.forEach((line) => {
    const status = !line.isActive
      ? "Inactive"
      : line.anomaly === "no-output"
        ? "No Output"
        : line.anomaly === "critically-low"
          ? "Critical"
          : line.achievementPct >= 85
            ? "On Target"
            : "Below Target";

    if (line.poBreakdown.length === 0) {
      rows.push([
        line.name || line.lineId, line.unitName || "", line.floorName || "",
        status, "", "", "", "",
        line.totalTarget.toLocaleString(), line.totalOutput.toLocaleString(),
        line.totalTarget > 0 ? `${line.achievementPct}%` : "N/A",
        String(line.variance),
        String(line.avgManpower), String(line.totalBlockers),
        line.targetSubmitted ? "Yes" : "No", line.eodSubmitted ? "Yes" : "No",
      ]);
    } else {
      line.poBreakdown.forEach((po, idx) => {
        rows.push([
          idx === 0 ? (line.name || line.lineId) : "",
          idx === 0 ? (line.unitName || "") : "",
          idx === 0 ? (line.floorName || "") : "",
          idx === 0 ? status : "",
          po.poNumber, po.buyer, po.style, po.item || "",
          po.target.toLocaleString(), po.output.toLocaleString(),
          po.target > 0 ? `${po.achievementPct}%` : "N/A",
          String(po.output - po.target),
          idx === 0 ? String(line.avgManpower) : "",
          idx === 0 ? String(line.totalBlockers) : "",
          idx === 0 ? (line.targetSubmitted ? "Yes" : "No") : "",
          idx === 0 ? (line.eodSubmitted ? "Yes" : "No") : "",
        ]);
      });
    }
  });

  const csvContent = [
    ...summaryRows.map((row) => row.map(esc).join(",")),
    headers.map(esc).join(","),
    ...rows.map((row) => row.map(esc).join(",")),
  ].join("\n");

  const rangeLabel = timeRange === "daily" ? "daily" : `${timeRange}d`;
  const { downloadCsv } = await import("@/lib/capacitor");
  await downloadCsv(csvContent, `line_performance_${rangeLabel}_${format(new Date(), "yyyy-MM-dd")}.csv`);
}

// ── PDF Export ──

async function exportPdf(lines: LinePerformanceData[], timeRange: TimeRange, dateLabel: string) {
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 18;
  const cw = pw - m * 2;
  let pageNum = 0;

  const s = computeSummary(lines);

  // Palette
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

  // Helpers
  const drawPageFooter = () => {
    pageNum++;
    doc.setDrawColor(...slate200);
    doc.setLineWidth(0.3);
    doc.line(m, ph - 18, pw - m, ph - 18);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...slate500);
    doc.text(dateLabel, m, ph - 12);
    doc.text(`Page ${pageNum}`, pw - m, ph - 12, { align: "right" });
  };

  const drawPageHeader = (title: string, subtitle?: string) => {
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
    x: number, y: number, w: number, h: number,
    label: string, value: string, sub?: string, accent?: RGB,
  ) => {
    doc.setFillColor(...white);
    doc.setDrawColor(...slate200);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, w, h, 3, 3, "FD");
    if (accent) {
      doc.setFillColor(...accent);
      doc.roundedRect(x, y, w, 3, 3, 3, "F");
      doc.rect(x, y + 2, w, 1, "F");
    }
    doc.setTextColor(...slate500);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text(label.toUpperCase(), x + w / 2, y + 14, { align: "center" });
    doc.setTextColor(...slate900);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(value, x + w / 2, y + 28, { align: "center" });
    if (sub) {
      doc.setTextColor(...slate500);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(sub, x + w / 2, y + 35, { align: "center" });
    }
  };

  const drawProgressBar = (x: number, y: number, w: number, h: number, pct: number, fg: RGB, bg: RGB) => {
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

  // Sort lines by number
  const { compareLineNames: cmpLines } = await import("@/lib/sort-lines");
  const ranked = [...lines]
    .filter((l) => l.isActive)
    .sort((a, b) => cmpLines(a.name || a.lineId, b.name || b.lineId));

  // ========== PAGE 1: COVER ==========
  doc.setFillColor(...blue);
  doc.rect(0, 0, pw, ph, "F");

  // Subtle circles
  doc.setFillColor(255, 255, 255);
  doc.setGState(new (doc as any).GState({ opacity: 0.04 }));
  for (let i = 0; i < 8; i++) doc.circle(pw * 0.8 + i * 15, 40 + i * 20, 60 + i * 10, "F");
  doc.setGState(new (doc as any).GState({ opacity: 1 }));

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("LINE PERFORMANCE", pw / 2, 72, { align: "center" });
  doc.setFontSize(38);
  doc.setFont("helvetica", "bold");
  doc.text("Report", pw / 2, 95, { align: "center" });

  // Date card
  doc.setFillColor(255, 255, 255);
  doc.setGState(new (doc as any).GState({ opacity: 0.15 }));
  doc.roundedRect(pw / 2 - 60, 115, 120, 25, 5, 5, "F");
  doc.setGState(new (doc as any).GState({ opacity: 1 }));
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(dateLabel, pw / 2, 129, { align: "center" });
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated: ${format(new Date(), "PPpp")}`, pw / 2, 137, { align: "center" });

  // Cover KPI cards
  const coverCardW = (cw - 15) / 4;
  const ccY = 160;
  const coverCards = [
    { label: "Total Output", value: s.totalOutput.toLocaleString(), sub: "pieces" },
    { label: "Achievement", value: s.overallAchievement + "%", sub: `vs ${s.totalTarget.toLocaleString()} target` },
    { label: "Active Lines", value: `${s.activeLines}`, sub: `${s.linesOnTarget} on target` },
    { label: "Blockers", value: String(s.totalBlockers), sub: `across ${lines.length} lines` },
  ];
  coverCards.forEach((c, i) => {
    const cx = m + i * (coverCardW + 5);
    doc.setFillColor(255, 255, 255);
    doc.setGState(new (doc as any).GState({ opacity: 0.15 }));
    doc.roundedRect(cx, ccY, coverCardW, 42, 4, 4, "F");
    doc.setGState(new (doc as any).GState({ opacity: 1 }));
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(c.label.toUpperCase(), cx + coverCardW / 2, ccY + 12, { align: "center" });
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(c.value, cx + coverCardW / 2, ccY + 27, { align: "center" });
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(c.sub, cx + coverCardW / 2, ccY + 35, { align: "center" });
  });

  // Highlights
  const hlY = 218;
  doc.setFillColor(255, 255, 255);
  doc.setGState(new (doc as any).GState({ opacity: 0.1 }));
  doc.roundedRect(m, hlY, cw, 36, 5, 5, "F");
  doc.setGState(new (doc as any).GState({ opacity: 1 }));
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("KEY HIGHLIGHTS", m + 8, hlY + 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const hl: string[] = [];
  if (s.bestLine) hl.push(`Top performer: ${s.bestLine.name || s.bestLine.lineId} (${s.bestLine.achievementPct}%)`);
  if (s.worstLine) hl.push(`Needs attention: ${s.worstLine.name || s.worstLine.lineId} (${s.worstLine.achievementPct}%)`);
  hl.push(`${s.linesOnTarget} of ${s.activeLines} active lines meeting 85% target`);
  hl.push(`${s.targetSubmitted} targets submitted, ${s.eodSubmitted} EOD reports submitted`);
  hl.slice(0, 4).forEach((h, i) => doc.text(`  -  ${h}`, m + 8, hlY + 19 + i * 7));

  pageNum++;

  // ========== PAGE 2: EXECUTIVE SUMMARY ==========
  doc.addPage();
  let y = drawPageHeader("Executive Summary", `${dateLabel} overview`);

  const kw = (cw - 10) / 3;
  const kh = 40;
  const variance = s.totalOutput - s.totalTarget;
  const kpiData = [
    { label: "Total Output", value: s.totalOutput.toLocaleString() + " pcs", sub: `${s.activeLines} active lines`, accent: blue },
    { label: "Total Target", value: s.totalTarget.toLocaleString() + " pcs", sub: `${s.targetSubmitted} submissions`, accent: blue },
    { label: "Overall Achievement", value: s.overallAchievement + "%", sub: s.overallAchievement >= 85 ? "On Target" : "Below Target", accent: s.overallAchievement >= 85 ? green : s.overallAchievement >= 60 ? amber : red },
    { label: "Target Variance", value: (variance >= 0 ? "+" : "") + variance.toLocaleString(), sub: variance >= 0 ? "Ahead of target" : "Behind target", accent: variance >= 0 ? green : red },
    { label: "Avg Manpower / Line", value: String(s.avgManpower), sub: `${lines.length} lines tracked`, accent: blue },
    { label: "Total Blockers", value: String(s.totalBlockers), sub: `across all lines`, accent: s.totalBlockers > 0 ? red : green },
  ];
  kpiData.forEach((k, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    drawKpiCard(m + col * (kw + 5), y + row * (kh + 6), kw, kh, k.label, k.value, k.sub, k.accent);
  });
  y += 2 * (kh + 6) + 8;

  // Target achievement breakdown
  y = drawSectionTitle("Target Achievement", y);
  const onTargetPct = s.activeLines > 0 ? Math.round((s.linesOnTarget / s.activeLines) * 100) : 0;
  doc.setFillColor(...slate50);
  doc.setDrawColor(...slate200);
  doc.setLineWidth(0.3);
  doc.roundedRect(m, y, cw / 2 - 3, 28, 3, 3, "FD");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...slate700);
  doc.text("Lines Meeting Target (85%+)", m + 6, y + 10);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...slate500);
  doc.text(`${s.linesOnTarget} of ${s.activeLines} active lines (${onTargetPct}%)`, m + 6, y + 18);
  drawProgressBar(m + 6, y + 22, cw / 2 - 15, 3, onTargetPct, green, slate200);

  // Submission status
  doc.setFillColor(...slate50);
  doc.roundedRect(m + cw / 2 + 3, y, cw / 2 - 3, 28, 3, 3, "FD");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...slate700);
  doc.text("Submission Status", m + cw / 2 + 9, y + 10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...slate500);
  doc.text(`Targets: ${s.targetSubmitted}/${lines.length}  |  EOD: ${s.eodSubmitted}/${lines.length}`, m + cw / 2 + 9, y + 18);
  const submPct = lines.length > 0 ? Math.round((s.eodSubmitted / lines.length) * 100) : 0;
  drawProgressBar(m + cw / 2 + 9, y + 22, cw / 2 - 15, 3, submPct, blue, slate200);

  y += 36;

  // Top / bottom performers
  if (s.bestLine || s.worstLine) {
    y = drawSectionTitle("Line Highlights", y);
    if (s.bestLine) {
      doc.setFillColor(...greenLight);
      doc.roundedRect(m, y, cw, 14, 3, 3, "F");
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...green);
      doc.text("TOP PERFORMER", m + 6, y + 9);
      doc.setTextColor(...slate900);
      doc.setFont("helvetica", "normal");
      doc.text(
        `${s.bestLine.name || s.bestLine.lineId} - ${s.bestLine.achievementPct}% achievement, ${s.bestLine.totalOutput.toLocaleString()} pcs`,
        m + 50, y + 9,
      );
      y += 17;
    }
    if (s.worstLine && s.worstLine !== s.bestLine) {
      doc.setFillColor(...redLight);
      doc.roundedRect(m, y, cw, 14, 3, 3, "F");
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...red);
      doc.text("NEEDS ATTENTION", m + 6, y + 9);
      doc.setTextColor(...slate900);
      doc.setFont("helvetica", "normal");
      doc.text(
        `${s.worstLine.name || s.worstLine.lineId} - ${s.worstLine.achievementPct}% achievement, ${s.worstLine.totalOutput.toLocaleString()} pcs`,
        m + 55, y + 9,
      );
      y += 17;
    }
  }

  // ========== PAGE 3: LINE RANKING ==========
  if (ranked.length > 0) {
    doc.addPage();
    y = drawPageHeader("Line Performance Ranking", `${ranked.length} active lines sorted by achievement`);

    drawStatusBadge(m, y, `${s.linesOnTarget} ON TARGET`, green, greenLight);
    drawStatusBadge(m + 40, y, `${s.activeLines - s.linesOnTarget} BELOW`, s.activeLines - s.linesOnTarget > 0 ? red : green, s.activeLines - s.linesOnTarget > 0 ? redLight : greenLight);
    y += 10;

    // Table header
    const cols = [0, 15, 55, 88, 118, 145];
    const colHeaders = ["#", "LINE", "OUTPUT", "TARGET", "ACHV %", "BLOCKERS"];
    doc.setFillColor(...slate900);
    doc.roundedRect(m, y, cw, 10, 2, 2, "F");
    doc.rect(m, y + 5, cw, 5, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    colHeaders.forEach((h, i) => doc.text(h, m + cols[i] + 4, y + 7));
    y += 13;

    ranked.forEach((line, idx) => {
      if (y > ph - 28) {
        doc.addPage();
        y = drawPageHeader("Line Performance Ranking (cont.)", "");
        // Re-draw table header
        doc.setFillColor(...slate900);
        doc.roundedRect(m, y, cw, 10, 2, 2, "F");
        doc.rect(m, y + 5, cw, 5, "F");
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        colHeaders.forEach((h, i) => doc.text(h, m + cols[i] + 4, y + 7));
        y += 13;
      }

      if (idx % 2 === 0) {
        doc.setFillColor(...slate50);
        doc.rect(m, y - 4.5, cw, 10, "F");
      }

      doc.setFontSize(8);
      const rank = idx + 1;
      if (rank === 1) {
        doc.setTextColor(202, 138, 4);
        doc.setFont("helvetica", "bold");
      } else if (rank === 2) {
        doc.setTextColor(...slate500);
        doc.setFont("helvetica", "bold");
      } else if (rank === 3) {
        doc.setTextColor(180, 83, 9);
        doc.setFont("helvetica", "bold");
      } else {
        doc.setTextColor(...slate500);
        doc.setFont("helvetica", "normal");
      }
      doc.text(String(rank), m + cols[0] + 4, y);

      doc.setTextColor(...slate900);
      doc.setFont(rank <= 3 ? "helvetica" : "helvetica", rank <= 3 ? "bold" : "normal");
      doc.text((line.name || line.lineId).substring(0, 20), m + cols[1] + 4, y);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(...slate700);
      doc.text(line.totalOutput.toLocaleString(), m + cols[2] + 4, y);
      doc.text(line.totalTarget.toLocaleString(), m + cols[3] + 4, y);

      const effColor: RGB = line.achievementPct >= 85 ? green : line.achievementPct >= 60 ? amber : red;
      const effBg: RGB = line.achievementPct >= 85 ? greenLight : line.achievementPct >= 60 ? amberLight : redLight;
      drawStatusBadge(m + cols[4] + 4, y, line.achievementPct + "%", effColor, effBg);

      doc.setTextColor(...(line.totalBlockers > 0 ? red : slate500));
      doc.setFont("helvetica", line.totalBlockers > 0 ? "bold" : "normal");
      doc.text(String(line.totalBlockers), m + cols[5] + 4, y);

      y += 10;
    });
  }

  // ========== PAGE 4: PO BREAKDOWN ==========
  const linesWithPO = lines.filter((l) => l.poBreakdown.length > 0);
  if (linesWithPO.length > 0) {
    doc.addPage();
    y = drawPageHeader("PO Breakdown by Line", `${linesWithPO.length} lines with work order data`);

    linesWithPO.forEach((line) => {
      // Check if we need a new page (header + at least 2 rows)
      if (y > ph - 50) {
        doc.addPage();
        y = drawPageHeader("PO Breakdown by Line (cont.)", "");
      }

      // Line name header
      const achvColor: RGB = line.achievementPct >= 85 ? green : line.achievementPct >= 60 ? amber : red;
      doc.setFillColor(...blueLight);
      doc.roundedRect(m, y, cw, 12, 3, 3, "F");
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...slate900);
      doc.text(line.name || line.lineId, m + 6, y + 8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...slate500);
      doc.setFontSize(7.5);
      doc.text(
        `Output: ${line.totalOutput.toLocaleString()} / Target: ${line.totalTarget.toLocaleString()}`,
        m + 60, y + 8,
      );
      // Achievement badge
      doc.setFontSize(6.5);
      drawStatusBadge(m + cw - 30, y + 8, line.achievementPct + "%", achvColor, line.achievementPct >= 85 ? greenLight : line.achievementPct >= 60 ? amberLight : redLight);
      y += 15;

      // PO rows
      line.poBreakdown.forEach((po) => {
        if (y > ph - 25) {
          doc.addPage();
          y = drawPageHeader("PO Breakdown by Line (cont.)", "");
        }

        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...slate700);
        doc.text(po.poNumber, m + 6, y);
        doc.text(po.buyer.substring(0, 12), m + 38, y);
        doc.text(po.style.substring(0, 12), m + 68, y);
        doc.text(po.output.toLocaleString(), m + 100, y);
        doc.text(po.target.toLocaleString(), m + 125, y);

        const poPct = po.achievementPct;
        const poColor: RGB = poPct >= 85 ? green : poPct >= 60 ? amber : red;
        doc.setTextColor(...poColor);
        doc.setFont("helvetica", "bold");
        doc.text(po.target > 0 ? poPct + "%" : "N/A", m + 150, y);

        y += 8;
      });

      y += 5;
    });
  }

  // Footer on last page (already drawn by drawPageHeader)
  const fileDate = format(new Date(), "yyyy-MM-dd");
  const rangeLabel = timeRange === "daily" ? "daily" : `${timeRange}d`;
  const { savePdf } = await import("@/lib/capacitor");
  await savePdf(doc, `line_performance_${rangeLabel}_${fileDate}.pdf`);
}

// ── Component ──

export function LineExportButton({ lines, timeRange, dateLabel }: LineExportButtonProps) {
  const handlePdf = () => {
    try {
      exportPdf(lines, timeRange, dateLabel);
      toast.success("PDF report exported");
    } catch (err) {
      console.error("PDF export error:", err);
      toast.error("Export failed");
    }
  };

  const handleCsv = () => {
    try {
      exportCsv(lines, timeRange, dateLabel);
      toast.success("CSV exported");
    } catch {
      toast.error("Export failed");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="default" size="sm">
          <Download className="h-4 w-4 mr-1" />
          Export Report
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={handlePdf}>
          <FileDown className="h-4 w-4 mr-2" />
          Export as PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCsv}>
          <Table className="h-4 w-4 mr-2" />
          Export as CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
