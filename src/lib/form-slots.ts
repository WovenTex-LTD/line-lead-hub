// Registry of the default production form "slots". Each slot is one of the
// built-in data-entry forms; Lina-created forms tagged with the same slot_key
// are alternative VERSIONS of it, and one version per slot is active (the one
// workers see). No override row = the default form is active.

export interface SlotPreviewField {
  section: string;
  label: string;
  type: "text" | "number" | "date" | "dropdown" | "textarea" | "checkbox";
  required?: boolean;
}

export interface FormSlot {
  key: string;
  label: string;
  role: "sewing" | "cutting" | "finishing";
  defaultPath: string;
  /** Static description of the default form's fields, for the read-only preview. */
  previewFields: SlotPreviewField[];
}

const FINISHING_PROCESSES = ["Thread Cutting", "Inside Check", "Top Side Check", "Buttoning", "Iron", "Get-up", "Poly", "Carton"];

export const FORM_SLOTS: FormSlot[] = [
  {
    key: "sewing_morning_targets", label: "Sewing Morning Targets", role: "sewing", defaultPath: "/sewing/morning-targets",
    previewFields: [
      { section: "Select Line & PO", label: "Line No.", type: "dropdown", required: true },
      { section: "Select Line & PO", label: "PO Number", type: "dropdown", required: true },
      { section: "Today's Targets", label: "Per Hour Target", type: "number", required: true },
      { section: "Today's Targets", label: "Manpower Planned", type: "number", required: true },
      { section: "Today's Targets", label: "Hours Planned", type: "number", required: true },
      { section: "Today's Targets", label: "OT Hours Planned", type: "number", required: true },
      { section: "Stage & Progress", label: "Planned Stage", type: "dropdown", required: true },
      { section: "Stage & Progress", label: "Stage Progress", type: "dropdown", required: true },
      { section: "Stage & Progress", label: "Next Milestone (Tomorrow)", type: "dropdown", required: true },
    ],
  },
  {
    key: "sewing_end_of_day", label: "Sewing End of Day", role: "sewing", defaultPath: "/sewing/end-of-day",
    previewFields: [
      { section: "Select Line & PO", label: "Line No.", type: "dropdown", required: true },
      { section: "Select Line & PO", label: "PO Number", type: "dropdown", required: true },
      { section: "Today's Output", label: "Good Today", type: "number", required: true },
      { section: "Today's Output", label: "Reject Today", type: "number" },
      { section: "Today's Output", label: "Rework Today", type: "number" },
      { section: "Manpower & Hours", label: "Manpower Actual", type: "number", required: true },
      { section: "Manpower & Hours", label: "Hours Actual", type: "number", required: true },
      { section: "Manpower & Hours", label: "OT Hours Actual", type: "number" },
      { section: "Manpower & Hours", label: "OT Manpower", type: "number" },
      { section: "Stage & Progress", label: "Actual Stage", type: "dropdown", required: true },
      { section: "Stage & Progress", label: "Stage Progress", type: "dropdown", required: true },
      { section: "Notes", label: "Remarks", type: "textarea" },
    ],
  },
  {
    key: "cutting_morning_targets", label: "Cutting Morning Targets", role: "cutting", defaultPath: "/cutting/morning-targets",
    previewFields: [
      { section: "Select Line & PO", label: "Line No.", type: "dropdown", required: true },
      { section: "Select Line & PO", label: "Select PO / Work Order", type: "dropdown", required: true },
      { section: "Capacity", label: "Man Power", type: "number", required: true },
      { section: "Capacity", label: "Marker Capacity", type: "number", required: true },
      { section: "Capacity", label: "Lay Capacity", type: "number", required: true },
      { section: "Capacity", label: "Cutting Capacity", type: "number", required: true },
      { section: "Capacity", label: "Under Qty", type: "number" },
      { section: "Hours", label: "Hours Planned", type: "number", required: true },
      { section: "Hours", label: "OT Hours Planned", type: "number" },
      { section: "Hours", label: "OT Manpower Planned", type: "number" },
      { section: "Day Plan", label: "Day Cutting", type: "number", required: true },
      { section: "Day Plan", label: "Day Input", type: "number", required: true },
    ],
  },
  {
    key: "cutting_end_of_day", label: "Cutting End of Day", role: "cutting", defaultPath: "/cutting/end-of-day",
    previewFields: [
      { section: "Select Line & PO", label: "Line No.", type: "dropdown", required: true },
      { section: "Select Line & PO", label: "Select PO / Work Order", type: "dropdown", required: true },
      { section: "Capacity", label: "Man Power", type: "number", required: true },
      { section: "Capacity", label: "Marker Capacity", type: "number", required: true },
      { section: "Capacity", label: "Lay Capacity", type: "number", required: true },
      { section: "Capacity", label: "Cutting Capacity", type: "number", required: true },
      { section: "Capacity", label: "Under Qty", type: "number" },
      { section: "Hours", label: "Hours Actual", type: "number", required: true },
      { section: "Hours", label: "OT Hours Actual", type: "number" },
      { section: "Hours", label: "OT Manpower Actual", type: "number" },
      { section: "Day Output", label: "Day Cutting", type: "number", required: true },
      { section: "Day Output", label: "Day Input", type: "number", required: true },
      { section: "Left Over", label: "Left Over Recorded?", type: "checkbox" },
      { section: "Left Over", label: "Left Over Type", type: "dropdown" },
      { section: "Left Over", label: "Unit", type: "dropdown" },
      { section: "Left Over", label: "Quantity", type: "number" },
      { section: "Left Over", label: "Stored Location (optional)", type: "text" },
      { section: "Left Over", label: "Reason / Notes (optional)", type: "textarea" },
    ],
  },
  {
    key: "finishing_daily_target", label: "Finishing Daily Target", role: "finishing", defaultPath: "/finishing/daily-target",
    previewFields: [
      { section: "Select PO", label: "PO Number", type: "dropdown", required: true },
      ...FINISHING_PROCESSES.map((p) => ({ section: "Process Targets", label: p, type: "number" as const })),
      { section: "Manpower & Hours", label: "M Power Planned", type: "number", required: true },
      { section: "Manpower & Hours", label: "Total Hours Planned", type: "number", required: true },
      { section: "Manpower & Hours", label: "OT Hours Planned", type: "number" },
      { section: "Manpower & Hours", label: "OT Manpower Planned", type: "number" },
      { section: "Notes", label: "Remarks", type: "textarea" },
    ],
  },
  {
    key: "finishing_daily_output", label: "Finishing Daily Output", role: "finishing", defaultPath: "/finishing/daily-output",
    previewFields: [
      { section: "Select PO", label: "PO Number", type: "dropdown", required: true },
      ...FINISHING_PROCESSES.map((p) => ({ section: "Process Output", label: p, type: "number" as const })),
      { section: "Manpower & Hours", label: "M Power Actual", type: "number", required: true },
      { section: "Manpower & Hours", label: "Actual Hours Worked", type: "number", required: true },
      { section: "Manpower & Hours", label: "OT Hours Actual", type: "number" },
      { section: "Manpower & Hours", label: "OT Manpower Actual", type: "number" },
      { section: "Notes", label: "Remarks", type: "textarea" },
    ],
  },
];

export const FORM_SLOT_KEYS = FORM_SLOTS.map((s) => s.key);

export function getSlot(key: string | null | undefined): FormSlot | undefined {
  return FORM_SLOTS.find((s) => s.key === key);
}
