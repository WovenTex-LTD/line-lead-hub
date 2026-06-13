// Production integration registry. For each production slot, the table its default
// form writes to, and the friendly "targets" a custom version can map its fields onto.
// Line and PO are auto-detected from the form's line/PO picker fields, so the mapping
// only covers the numeric production columns. Keep in sync with the edge validator
// (supabase/functions/_shared/actions/forms.ts → PRODUCTION_SLOT_KEYS).

export interface SlotTarget {
  key: string;      // friendly key Lina maps to (e.g. "good_output")
  column: string;   // real production-table column
  label: string;    // human description
}

export interface SlotProduction {
  table: string;
  targets: SlotTarget[];
}

export const SLOT_PRODUCTION: Record<string, SlotProduction> = {
  sewing_morning_targets: {
    table: "sewing_targets",
    targets: [
      { key: "target_output", column: "target_total_planned", label: "Target total output" },
      { key: "per_hour_target", column: "per_hour_target", label: "Per-hour target" },
      { key: "manpower", column: "manpower_planned", label: "Manpower planned" },
      { key: "hours", column: "hours_planned", label: "Hours planned" },
      { key: "ot_hours", column: "ot_hours_planned", label: "OT hours planned" },
    ],
  },
  sewing_end_of_day: {
    table: "sewing_actuals",
    targets: [
      { key: "good_output", column: "good_today", label: "Good output today" },
      { key: "reject", column: "reject_today", label: "Reject today" },
      { key: "rework", column: "rework_today", label: "Rework today" },
      { key: "manpower", column: "manpower_actual", label: "Manpower actual" },
      { key: "hours", column: "hours_actual", label: "Hours actual" },
      { key: "ot_hours", column: "ot_hours_actual", label: "OT hours actual" },
    ],
  },
  cutting_morning_targets: {
    table: "cutting_targets",
    targets: [
      { key: "manpower", column: "man_power", label: "Manpower" },
      { key: "marker_capacity", column: "marker_capacity", label: "Marker capacity" },
      { key: "lay_capacity", column: "lay_capacity", label: "Lay capacity" },
      { key: "cutting_capacity", column: "cutting_capacity", label: "Cutting capacity" },
      { key: "day_cutting", column: "day_cutting", label: "Day cutting" },
      { key: "day_input", column: "day_input", label: "Day input" },
      { key: "hours", column: "hours_planned", label: "Hours planned" },
    ],
  },
  cutting_end_of_day: {
    table: "cutting_actuals",
    targets: [
      { key: "day_cutting", column: "day_cutting", label: "Day cutting" },
      { key: "day_input", column: "day_input", label: "Day input" },
      { key: "manpower", column: "man_power", label: "Manpower" },
      { key: "marker_capacity", column: "marker_capacity", label: "Marker capacity" },
      { key: "lay_capacity", column: "lay_capacity", label: "Lay capacity" },
      { key: "cutting_capacity", column: "cutting_capacity", label: "Cutting capacity" },
      { key: "hours", column: "hours_actual", label: "Hours actual" },
    ],
  },
  finishing_daily_target: {
    table: "finishing_targets",
    targets: [
      { key: "per_hour_target", column: "per_hour_target", label: "Per-hour target" },
      { key: "manpower", column: "m_power_planned", label: "Manpower planned" },
      { key: "hours", column: "day_hour_planned", label: "Day hours planned" },
      { key: "ot_hours", column: "day_over_time_planned", label: "Day OT planned" },
    ],
  },
  finishing_daily_output: {
    table: "finishing_actuals",
    targets: [
      { key: "qc_pass", column: "day_qc_pass", label: "QC pass today" },
      { key: "poly", column: "day_poly", label: "Poly today" },
      { key: "carton", column: "day_carton", label: "Carton today" },
      { key: "manpower", column: "m_power_actual", label: "Manpower actual" },
      { key: "hours", column: "day_hour_actual", label: "Day hours actual" },
      { key: "ot_hours", column: "day_over_time_actual", label: "Day OT actual" },
    ],
  },
};

export function getSlotProduction(slotKey: string | null | undefined): SlotProduction | undefined {
  return slotKey ? SLOT_PRODUCTION[slotKey] : undefined;
}
