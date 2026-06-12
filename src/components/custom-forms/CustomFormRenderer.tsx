import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomFormField } from "./CustomFormField";
import type { CustomFormConfig, CustomFormField as FieldDef } from "@/types/custom-form";
import { evaluateFormula } from "@/lib/formula";
import { resolveAutoValue, type AutoContext } from "@/lib/auto-fields";

interface Props {
  config: CustomFormConfig;
  submitting?: boolean;
  onSubmit: (values: Record<string, unknown>) => void;
  autoContext?: AutoContext;
  poOptions?: { value: string; label: string }[];
  dynamicOptions?: Record<string, { value: string; label: string }[]>;
}

/** User inputs + every derived field (auto-filled from context, then computed). */
function buildDerived(fields: FieldDef[], values: Record<string, unknown>, autoContext: AutoContext, now: Date) {
  const out: Record<string, unknown> = { ...values };
  for (const f of fields) {
    if (f.field_type === "auto" && f.auto_source) out[f.key] = resolveAutoValue(f.auto_source, autoContext, now);
  }
  const computed = fields.filter((f) => f.field_type === "computed" && f.formula);
  for (let pass = 0; pass < Math.max(1, computed.length); pass++) {
    for (const f of computed) {
      const r = evaluateFormula(f.formula as string, out);
      out[f.key] = r == null ? "" : r;
    }
  }
  return out;
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

export function CustomFormRenderer({ config, submitting, onSubmit, autoContext, poOptions, dynamicOptions }: Props) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const ctx = autoContext ?? {};

  const onChange = (key: string, value: unknown) => setValues((p) => ({ ...p, [key]: value }));

  // Live preview of derived values (auto-filled from context, then computed).
  // Captured at render; resolved fresh at submit so timestamps reflect submission time.
  const derived = useMemo(
    () => buildDerived(config.fields, values, ctx, new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values, config.fields, ctx.userName, ctx.userEmail, ctx.factoryName],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    for (const f of config.fields) {
      if (f.field_type === "computed" || f.field_type === "auto") continue; // derived, never required
      if (f.is_required && isEmpty(f, values[f.key])) next[f.key] = `${f.label} is required.`;
    }
    setErrors(next);
    if (Object.keys(next).length === 0) {
      onSubmit(buildDerived(config.fields, values, ctx, new Date())); // fresh derived incl. auto + computed
    }
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
                value={f.field_type === "computed" || f.field_type === "auto" ? derived[f.key] : values[f.key]}
                error={errors[f.key]}
                onChange={onChange}
                poOptions={poOptions}
                dynamicOptions={dynamicOptions}
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
