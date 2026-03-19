/**
 * Hook to resolve custom_data JSONB fields for submission viewing modals.
 * Groups custom fields by their form section and resolves dropdown UUIDs to labels.
 */

import { useState, useEffect } from "react";
import { useFormConfig } from "./useFormConfig";
import { supabase } from "@/integrations/supabase/client";
import type { FormType, FormFieldConfig } from "@/types/form-config";

export interface ResolvedField {
  key: string;
  label: string;
  value: string;
}

/** sectionKey → resolved fields */
export type ResolvedCustomFields = Record<string, ResolvedField[]>;

function resolveLabel(labelKey: string): string {
  const lastPart = labelKey.includes(".") ? labelKey.split(".").pop()! : labelKey;
  return lastPart
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export function useResolvedCustomFields(
  formType: FormType,
  customData: Record<string, unknown> | null | undefined
): ResolvedCustomFields {
  const { config } = useFormConfig(formType);
  const [resolved, setResolved] = useState<ResolvedCustomFields>({});

  useEffect(() => {
    if (!config || !customData || Object.keys(customData).length === 0) {
      setResolved({});
      return;
    }

    // Map custom field keys → section key + field config
    const fieldMap: {
      sectionKey: string;
      field: FormFieldConfig;
      value: unknown;
    }[] = [];

    for (const section of config.sections) {
      for (const field of section.fields) {
        if (field.is_custom && customData[field.key] !== undefined) {
          fieldMap.push({ sectionKey: section.key, field, value: customData[field.key] });
        }
      }
    }

    if (fieldMap.length === 0) {
      setResolved({});
      return;
    }

    // Collect dropdown lookups needed (UUID values that need label resolution)
    const lookups: {
      table: string;
      valueColumn: string;
      labelColumn: string;
      rawValue: string;
    }[] = [];

    for (const { field, value } of fieldMap) {
      if (
        field.data_source &&
        typeof value === "string" &&
        value.length > 0
      ) {
        lookups.push({
          table: field.data_source.table as string,
          valueColumn: (field.data_source.value_column ?? "id") as string,
          labelColumn: (field.data_source.label_column ?? "label") as string,
          rawValue: value,
        });
      }
    }

    // Batch-fetch dropdown labels grouped by table
    const resolveDropdowns = async (): Promise<Map<string, string>> => {
      const labelMap = new Map<string, string>();
      if (lookups.length === 0) return labelMap;

      // Group by table+columns for efficient fetching
      const groups = new Map<string, typeof lookups>();
      for (const lookup of lookups) {
        const key = `${lookup.table}:${lookup.valueColumn}:${lookup.labelColumn}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(lookup);
      }

      await Promise.all(
        Array.from(groups.entries()).map(async ([, items]) => {
          const { table, valueColumn, labelColumn } = items[0];
          const rawValues = [...new Set(items.map((i) => i.rawValue))];

          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data } = await (supabase as any)
              .from(table)
              .select(`${valueColumn}, ${labelColumn}`)
              .in(valueColumn, rawValues);

            if (data) {
              for (const row of data) {
                const key = String(row[valueColumn]);
                labelMap.set(key, String(row[labelColumn] ?? key));
              }
            }
          } catch {
            // Silently fail — will show raw value
          }
        })
      );

      return labelMap;
    };

    resolveDropdowns().then((labelMap) => {
      const result: ResolvedCustomFields = {};

      for (const { sectionKey, field, value } of fieldMap) {
        let displayValue: string;
        if (typeof value === "string" && labelMap.has(value)) {
          displayValue = labelMap.get(value)!;
        } else if (typeof value === "boolean") {
          displayValue = value ? "Yes" : "No";
        } else if (typeof value === "number") {
          displayValue = value.toLocaleString();
        } else {
          displayValue = String(value ?? "-");
        }

        if (!result[sectionKey]) result[sectionKey] = [];
        result[sectionKey].push({
          key: field.key,
          label: resolveLabel(field.label_key ?? field.key),
          value: displayValue,
        });
      }

      setResolved(result);
    });
  }, [config, customData]);

  return resolved;
}
