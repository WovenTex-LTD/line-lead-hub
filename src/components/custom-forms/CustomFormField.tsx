import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CustomFormField as FieldDef } from "@/types/custom-form";

interface Props {
  field: FieldDef;
  value: unknown;
  error?: string;
  onChange: (key: string, value: unknown) => void;
}

export function CustomFormField({ field, value, error, onChange }: Props) {
  const err = error ? "border-destructive" : "";
  const set = (v: unknown) => onChange(field.key, v);

  return (
    <div className="space-y-2">
      {field.field_type !== "checkbox" && (
        <Label>{field.label}{field.is_required ? " *" : ""}</Label>
      )}
      {field.field_type === "text" && (
        <Input type="text" value={(value as string) ?? ""} placeholder={field.placeholder ?? ""} className={err} onChange={(e) => set(e.target.value)} />
      )}
      {field.field_type === "number" && (
        <Input type="number" value={(value as string) ?? ""} placeholder={field.placeholder ?? ""} className={err} onChange={(e) => set(e.target.value === "" ? null : Number(e.target.value))} />
      )}
      {field.field_type === "date" && (
        <Input type="date" value={(value as string) ?? ""} className={err} onChange={(e) => set(e.target.value)} />
      )}
      {field.field_type === "textarea" && (
        <Textarea value={(value as string) ?? ""} placeholder={field.placeholder ?? ""} className={err} onChange={(e) => set(e.target.value)} />
      )}
      {field.field_type === "dropdown" && (
        <Select value={(value as string) ?? ""} onValueChange={set}>
          <SelectTrigger className={err}><SelectValue placeholder={field.placeholder ?? "Select…"} /></SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {field.field_type === "checkbox" && (
        <div className="flex items-center gap-2">
          <Checkbox checked={Boolean(value)} onCheckedChange={(c) => set(Boolean(c))} />
          <Label>{field.label}{field.is_required ? " *" : ""}</Label>
        </div>
      )}
      {field.field_type === "computed" && (
        <Input
          type="text" readOnly tabIndex={-1}
          value={value === null || value === undefined || value === "" ? "—" : String(value)}
          className="bg-muted/50 text-muted-foreground cursor-not-allowed"
          aria-label={`${field.label} (calculated)`}
        />
      )}
      {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
