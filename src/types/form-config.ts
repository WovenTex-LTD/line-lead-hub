export type FormType = "sewing_target" | "sewing_actual" | "cutting_target" | "cutting_actual" | "finishing_target" | "finishing_actual";

export interface FormFieldConfig {
  key: string;
  label: string;
  type: "text" | "number" | "dropdown" | "date" | "textarea";
  section?: string;
  required?: boolean;
  dropdownListId?: string;
  defaultValue?: string | number;
}
