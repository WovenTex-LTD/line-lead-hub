// Live lookup sources for a custom-form `dynamic_select` field. Each source pulls
// the factory's current options from a table at fill time, so options added or
// removed in Setup → Dropdown Settings (or new lines) appear automatically.
// Keep DYNAMIC_SOURCE_KEYS in sync with the edge validator
// (supabase/functions/_shared/actions/forms.ts).

export interface DynamicSourceDef {
  key: string;
  label: string;        // human name (used in UI and Lina guidance)
  table: string;
  selectCols: string;   // columns to fetch
  orderCol: string;
  activeOnly: boolean;   // filter is_active = true
  /** Build an option from a row; return null to skip. The value is the stored text. */
  toOption: (row: Record<string, unknown>) => { value: string; label: string } | null;
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));

export const DYNAMIC_SOURCES: DynamicSourceDef[] = [
  {
    key: "lines", label: "Production lines", table: "lines",
    selectCols: "line_id, name", orderCol: "line_id", activeOnly: true,
    toOption: (r) => {
      const name = text(r.name) || text(r.line_id);
      return name ? { value: name, label: name } : null;
    },
  },
  {
    key: "stages", label: "Stages", table: "stages",
    selectCols: "name, sequence", orderCol: "sequence", activeOnly: true,
    toOption: (r) => { const v = text(r.name); return v ? { value: v, label: v } : null; },
  },
  {
    key: "stage_progress", label: "Stage progress options", table: "stage_progress_options",
    selectCols: "label, sort_order", orderCol: "sort_order", activeOnly: true,
    toOption: (r) => { const v = text(r.label); return v ? { value: v, label: v } : null; },
  },
  {
    key: "milestones", label: "Next-milestone options", table: "next_milestone_options",
    selectCols: "label, sort_order", orderCol: "sort_order", activeOnly: true,
    toOption: (r) => { const v = text(r.label); return v ? { value: v, label: v } : null; },
  },
  {
    key: "blocker_types", label: "Blocker types", table: "blocker_types",
    selectCols: "name, sort_order", orderCol: "sort_order", activeOnly: true,
    toOption: (r) => { const v = text(r.name); return v ? { value: v, label: v } : null; },
  },
  {
    key: "blocker_owners", label: "Blocker owners", table: "blocker_owner_options",
    selectCols: "label, sort_order", orderCol: "sort_order", activeOnly: true,
    toOption: (r) => { const v = text(r.label); return v ? { value: v, label: v } : null; },
  },
  {
    key: "blocker_impacts", label: "Blocker impact levels", table: "blocker_impact_options",
    selectCols: "label, sort_order", orderCol: "sort_order", activeOnly: true,
    toOption: (r) => { const v = text(r.label); return v ? { value: v, label: v } : null; },
  },
];

export const DYNAMIC_SOURCE_KEYS = DYNAMIC_SOURCES.map((s) => s.key) as string[];

export function getDynamicSource(key: string | null | undefined): DynamicSourceDef | undefined {
  return DYNAMIC_SOURCES.find((s) => s.key === key);
}
