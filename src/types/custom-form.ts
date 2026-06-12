export type CustomFieldType = "text" | "number" | "date" | "dropdown" | "textarea" | "checkbox" | "computed" | "auto" | "po_select" | "dynamic_select";

export interface CustomFieldOption { value: string; label: string; }

export interface CustomFormField {
  id: string;
  template_id: string;
  section_label: string | null;
  section_order: number;
  key: string;
  label: string;
  field_type: CustomFieldType;
  is_required: boolean;
  options: CustomFieldOption[] | null;
  placeholder: string | null;
  help_text: string | null;
  sort_order: number;
  is_active: boolean;
  formula: string | null; // computed fields only: arithmetic over other field keys
  auto_source: string | null; // auto fields only: which submission-context value fills this field
  source_key: string | null;  // dynamic_select only: which live factory list feeds the options
}

export interface CustomFormTemplate {
  id: string;
  factory_id: string;
  name: string;
  description: string | null;
  status: "active" | "archived";
  version: number;
  target_role: string | null;
  slot_key: string | null;
  allowed_fill_roles: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** A template plus its ordered, section-grouped fields — what the renderer consumes. */
export interface CustomFormConfig {
  template: CustomFormTemplate;
  fields: CustomFormField[]; // active fields, ordered by section_order then sort_order
}

export interface CustomFormSubmission {
  id: string;
  template_id: string;
  template_version: number;
  factory_id: string;
  submitted_by: string | null;
  status: string;
  values: Record<string, unknown>;
  fields_snapshot: CustomFormField[];
  created_at: string;
}

/** Roles allowed to fill a form when a template lists none explicitly. */
export const DEFAULT_FILL_ROLES = ["admin", "owner", "supervisor"];

/** Per-slot active-version override. Absent row (or null template) = default form active. */
export interface FormSlotOverride {
  factory_id: string;
  slot_key: string;
  active_template_id: string | null;
  updated_at: string;
}

/** Snapshot of a selected PO's details, shown read-only on the form and stored
 *  with the submission (under a "__po:<fieldKey>" value key). */
export interface PoDetail {
  po_number: string;
  buyer?: string | null;
  style?: string | null;
  item?: string | null;
  color?: string | null;
  order_qty?: number | null;
  planned_ex_factory?: string | null;
  status?: string | null;
}
