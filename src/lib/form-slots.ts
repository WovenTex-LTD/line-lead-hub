// Registry of the default production form "slots". Each slot is one of the
// built-in data-entry forms; Lina-created forms tagged with the same slot_key
// are alternative VERSIONS of it, and one version per slot is active (the one
// workers see). No override row = the default form is active.

export interface FormSlot {
  key: string;
  label: string;
  role: "sewing" | "cutting" | "finishing";
  defaultPath: string;
}

export const FORM_SLOTS: FormSlot[] = [
  { key: "sewing_morning_targets", label: "Sewing Morning Targets", role: "sewing", defaultPath: "/sewing/morning-targets" },
  { key: "sewing_end_of_day", label: "Sewing End of Day", role: "sewing", defaultPath: "/sewing/end-of-day" },
  { key: "cutting_morning_targets", label: "Cutting Morning Targets", role: "cutting", defaultPath: "/cutting/morning-targets" },
  { key: "cutting_end_of_day", label: "Cutting End of Day", role: "cutting", defaultPath: "/cutting/end-of-day" },
  { key: "finishing_daily_target", label: "Finishing Daily Target", role: "finishing", defaultPath: "/finishing/daily-target" },
  { key: "finishing_daily_output", label: "Finishing Daily Output", role: "finishing", defaultPath: "/finishing/daily-output" },
];

export const FORM_SLOT_KEYS = FORM_SLOTS.map((s) => s.key);

export function getSlot(key: string | null | undefined): FormSlot | undefined {
  return FORM_SLOTS.find((s) => s.key === key);
}
