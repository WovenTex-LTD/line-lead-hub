import type { LucideIcon } from "lucide-react";
import type { POWorkflowState, POCluster, POWorkflowTab } from "./po-state";

// Re-export from po-state so consumers can import from one place
export type { POWorkflowState, POCluster, POWorkflowTab } from "./po-state";

// ── Legacy view tab (kept for backwards-compat; new UI uses POWorkflowTab) ───
export type POViewTab =
  | "all"
  | "at_risk"
  | "ex_factory_soon"
  | "no_line"
  | "updated_today"
  | "on_target";

// ── Health status ─────────────────────────────────────
export type HealthStatus = "healthy" | "watch" | "at_risk" | "no_deadline" | "deadline_passed" | "completed";

export interface HealthReason {
  status: HealthStatus;
  reasons: string[];
}

// ── List-level PO data (fetched on mount) ─────────────
export interface POControlRoomData {
  id: string;
  po_number: string;
  buyer: string;
  style: string;
  item: string | null;
  color: string | null;
  order_qty: number;
  status: string | null;
  planned_ex_factory: string | null;
  line_names: string[]; // from work_order_line_assignments
  unit_names: string[]; // units of assigned lines
  floor_names: string[]; // floors of assigned lines
  line_id: string | null; // direct FK on work_orders (legacy)

  // Aggregated production
  sewingOutput: number;
  finishedOutput: number;
  extrasConsumed: number;

  // Quality
  totalRejects: number;
  totalRework: number;

  // Derived
  health: HealthReason;
  hasEodToday: boolean;
  progressPct: number;

  // Workflow state & cluster (new)
  workflowState: POWorkflowState;
  cluster: POCluster;
  started: boolean;         // any sewing_actual exists
  remaining: number;        // order_qty − finishedOutput
  avgPerDay: number;        // effective (3d or 7d fallback)
  neededPerDay: number;     // remaining / days_to_ex_factory (fallback /7)
  forecastFinishDate: string | null;
}

// ── KPI summary ───────────────────────────────────────
export interface POKPIs {
  activeOrders: number;
  totalQty: number;
  sewingOutput: number;
  finishedOutput: number;
  totalExtras: number;
}

// ── Needs-action card ─────────────────────────────────
export interface NeedsActionCard {
  key: string;
  title: string;
  count: number;
  description: string;
  icon: LucideIcon;
  variant: "warning" | "destructive" | "info";
  targetTab: POWorkflowTab;
}

// ── Detail data (fetched on row expand) ───────────────
export interface PODetailData {
  submissions: POSubmissionRow[];
  pipeline: POPipelineStage[];
  quality: POQualityData;
}

// ── Submission rows (clickable list in expanded panel) ─
export type SubmissionType =
  | "sewing_target"
  | "sewing_actual"
  | "cutting_target"
  | "cutting_actual"
  | "finishing_target"
  | "finishing_actual";

export interface POSubmissionRow {
  id: string;
  type: SubmissionType;
  date: string;
  lineName: string;
  submittedAt: string | null;
  headline: string; // e.g. "Target 1,100" or "Output 920"
  raw: Record<string, unknown>; // full record for modal rendering
}

export interface POPipelineStage {
  stage: "storage" | "cutting" | "sewing" | "finishing";
  label: string;
  qty: number;
  pct: number;
  lastDate: string | null;
}

export interface POQualityData {
  totalOutput: number;
  totalRejects: number;
  totalRework: number;
  rejectRate: number;
  reworkRate: number;
  extrasTotal: number;
  extrasConsumed: number;
  extrasAvailable: number;
}
