import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomFormField } from "./CustomFormField";
import type { CustomFormConfig, CustomFormField as FieldDef } from "@/types/custom-form";
import { evaluateFormula } from "@/lib/formula";

interface Props {
  config: CustomFormConfig;
  submitting?: boolean;
  onSubmit: (values: Record<string, unknown>) => void;
}

function isEmpty(field: FieldDef, v: unknown): boolean {
  if (field.field_type === "checkbox") return false; // a boolean is always "answered"
  return v === undefined || v === null || v === "";
}

function groupBySection(fields: FieldDef[]): { label: string | null; fields: FieldDef[] }[] {
  const groups: { label: string | null; fields: FieldDef[] }[] = [];
  for (const f of fields) {
    const last = groups[groups.length - 1];
    if (last && last.label === (f.section_label ?? null)) last.fields.push(f);
    else groups.push({ label: f.section_label ?? null, fields: [f] });
  }
  return groups;
}

export function CustomFormRenderer({ config, submitting, onSubmit }: Props) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const onChange = (key: string, value: unknown) => setValues((p) => ({ ...p, [key]: value }));

  // Live-derived values: user inputs plus every computed field evaluated from them.
  // A few passes let a computed field depend on another computed field.
  const derived = useMemo(() => {
    const out: Record<string, unknown> = { ...values };
    const computed = config.fields.filter((f) => f.field_type === "computed" && f.formula);
    for (let pass = 0; pass < Math.max(1, computed.length); pass++) {
      for (const f of computed) {
        const r = evaluateFormula(f.formula as string, out);
        out[f.key] = r == null ? "" : r;
      }
    }
    return out;
  }, [values, config.fields]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    for (const f of config.fields) {
      if (f.field_type === "computed") continue; // derived, never required
      if (f.is_required && isEmpty(f, values[f.key])) next[f.key] = `${f.label} is required.`;
    }
    setErrors(next);
    if (Object.keys(next).length === 0) onSubmit(derived); // submit incl. computed values
  };

  const sections = groupBySection(config.fields);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {sections.map((section, i) => (
        <Card key={`${section.label ?? ""}__${i}`}>
          {section.label && <CardHeader><CardTitle className="text-base">{section.label}</CardTitle></CardHeader>}
          <CardContent className="space-y-4 pt-4">
            {section.fields.map((f) => (
              <CustomFormField
                key={f.id}
                field={f}
                value={f.field_type === "computed" ? derived[f.key] : values[f.key]}
                error={errors[f.key]}
                onChange={onChange}
              />
            ))}
          </CardContent>
        </Card>
      ))}
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Submitting…" : "Submit"}
      </Button>
    </form>
  );
}
