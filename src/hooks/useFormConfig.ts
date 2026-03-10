import { useAuth } from "@/contexts/AuthContext";
import type { FormType, FormFieldConfig } from "@/types/form-config";

export function useFormConfig(formType: FormType) {
  const { factory } = useAuth();
  // Stub — dynamic form config not yet implemented
  return {
    fields: [] as FormFieldConfig[],
    loading: false,
  };
}
