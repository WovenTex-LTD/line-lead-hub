# Custom Forms + Lina-from-Paper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin upload a photo/PDF of a paper form so Lina reads it and proposes a digital, fillable form (confirmed via the existing Approve card); the form then lives in a standalone Custom Forms engine where permitted users fill it and submissions are stored and viewable.

**Architecture:** Two phases of one feature. Phase 1 builds a standalone engine (3 dedicated `custom_form_*` tables + dynamic renderer + fill/submit + submissions view) with zero coupling to the production forms or QC. Phase 2 adds file upload + Claude vision to the chat function and a `propose_create_form` tool that reuses the deployed write-action foundation (preview → `pending_actions` → Approve card → `execute-action` writes as the user with RLS + audit).

**Tech Stack:** React + react-router-dom v6, Tailwind + shadcn/ui, Supabase (Postgres + RLS + Storage + Deno edge functions), Anthropic `claude-sonnet-4-6` (vision via image/document content blocks), vitest.

**Spec:** `docs/superpowers/specs/2026-06-11-custom-forms-lina-from-paper-design.md`

**Conventions (match the codebase):**
- Frontend auth/context: `import { useAuth } from "@/contexts/AuthContext";` → `{ user, profile, roles, factory, isAdminOrHigher }`; factory id is `profile.factory_id`.
- Supabase client: `import { supabase } from "@/integrations/supabase/client";`
- UI: `@/components/ui/{input,textarea,select,checkbox,calendar,label,card,button}`.
- Edge tool modules are PURE (only `import type` for Deno/jsr/https; no `Deno.env` at module scope) so vitest can import them.
- Tests: `npx vitest run <path>`; frontend build: `npm run build`. Pre-existing 2 failures in `src/components/po-control-room/po-filters.test.ts` are unrelated.

---

# PHASE 1 — The Custom Forms engine (no AI)

## Task 1: Migration — `custom_form_*` tables + RLS

**Files:**
- Create: `supabase/migrations/20260611120000_custom_forms.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Standalone custom forms (separate from production forms + QC).
-- Lina (or, later, a builder UI) defines templates; users fill them; submissions are stored.

CREATE TABLE public.custom_form_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id  UUID NOT NULL REFERENCES public.factory_accounts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  version     INT  NOT NULL DEFAULT 1,
  allowed_fill_roles TEXT[] NOT NULL DEFAULT '{}',  -- empty => app default (admin, owner, supervisor)
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_custom_form_templates_factory ON public.custom_form_templates(factory_id, status);

CREATE TABLE public.custom_form_fields (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID NOT NULL REFERENCES public.custom_form_templates(id) ON DELETE CASCADE,
  section_label TEXT,
  section_order INT  NOT NULL DEFAULT 0,
  key           TEXT NOT NULL,
  label         TEXT NOT NULL,
  field_type    TEXT NOT NULL CHECK (field_type IN ('text','number','date','dropdown','textarea','checkbox')),
  is_required   BOOLEAN NOT NULL DEFAULT false,
  options       JSONB,            -- dropdown: [{ "value": "...", "label": "..." }]
  placeholder   TEXT,
  help_text     TEXT,
  sort_order    INT  NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, key)
);
CREATE INDEX idx_custom_form_fields_template ON public.custom_form_fields(template_id, section_order, sort_order);

CREATE TABLE public.custom_form_submissions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id      UUID NOT NULL REFERENCES public.custom_form_templates(id) ON DELETE CASCADE,
  template_version INT  NOT NULL,
  factory_id       UUID NOT NULL REFERENCES public.factory_accounts(id) ON DELETE CASCADE,
  submitted_by     UUID,
  status           TEXT NOT NULL DEFAULT 'submitted',
  values           JSONB NOT NULL DEFAULT '{}'::jsonb,
  fields_snapshot  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_custom_form_submissions_template ON public.custom_form_submissions(template_id, created_at DESC);
CREATE INDEX idx_custom_form_submissions_factory ON public.custom_form_submissions(factory_id, created_at DESC);

-- updated_at trigger (reuse the project's standard set_updated_at if present; else inline)
CREATE OR REPLACE FUNCTION public.custom_forms_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER trg_custom_form_templates_updated BEFORE UPDATE ON public.custom_form_templates
  FOR EACH ROW EXECUTE FUNCTION public.custom_forms_set_updated_at();
CREATE TRIGGER trg_custom_form_submissions_updated BEFORE UPDATE ON public.custom_form_submissions
  FOR EACH ROW EXECUTE FUNCTION public.custom_forms_set_updated_at();

-- RLS
ALTER TABLE public.custom_form_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_form_fields       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_form_submissions  ENABLE ROW LEVEL SECURITY;

-- Templates: any factory member reads; admin/owner manage.
CREATE POLICY "custom_form_templates_select" ON public.custom_form_templates
  FOR SELECT TO authenticated
  USING (factory_id = public.get_user_factory_id(auth.uid()));
CREATE POLICY "custom_form_templates_write" ON public.custom_form_templates
  FOR ALL TO authenticated
  USING (public.is_admin_or_higher(auth.uid()) AND factory_id = public.get_user_factory_id(auth.uid()))
  WITH CHECK (public.is_admin_or_higher(auth.uid()) AND factory_id = public.get_user_factory_id(auth.uid()));

-- Fields: readable if the parent template is in the user's factory; admin/owner manage.
CREATE POLICY "custom_form_fields_select" ON public.custom_form_fields
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.custom_form_templates t
                 WHERE t.id = template_id AND t.factory_id = public.get_user_factory_id(auth.uid())));
CREATE POLICY "custom_form_fields_write" ON public.custom_form_fields
  FOR ALL TO authenticated
  USING (public.is_admin_or_higher(auth.uid())
         AND EXISTS (SELECT 1 FROM public.custom_form_templates t
                     WHERE t.id = template_id AND t.factory_id = public.get_user_factory_id(auth.uid())))
  WITH CHECK (public.is_admin_or_higher(auth.uid())
         AND EXISTS (SELECT 1 FROM public.custom_form_templates t
                     WHERE t.id = template_id AND t.factory_id = public.get_user_factory_id(auth.uid())));

-- Submissions: insert within own factory; read own or admin; admin update/delete.
CREATE POLICY "custom_form_submissions_insert" ON public.custom_form_submissions
  FOR INSERT TO authenticated
  WITH CHECK (factory_id = public.get_user_factory_id(auth.uid()));
CREATE POLICY "custom_form_submissions_select" ON public.custom_form_submissions
  FOR SELECT TO authenticated
  USING (factory_id = public.get_user_factory_id(auth.uid())
         AND (submitted_by = auth.uid() OR public.is_admin_or_higher(auth.uid())));
CREATE POLICY "custom_form_submissions_modify" ON public.custom_form_submissions
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_higher(auth.uid()) AND factory_id = public.get_user_factory_id(auth.uid()));
CREATE POLICY "custom_form_submissions_delete" ON public.custom_form_submissions
  FOR DELETE TO authenticated
  USING (public.is_admin_or_higher(auth.uid()) AND factory_id = public.get_user_factory_id(auth.uid()));
```

- [ ] **Step 2: Verify helper functions exist** — confirm `public.is_admin_or_higher(uuid)` and `public.get_user_factory_id(uuid)` exist (they are used by existing RLS, e.g. `work_orders`). Run: `grep -rl "get_user_factory_id\|is_admin_or_higher" supabase/migrations | head`. If `get_user_factory_id` is absent but a differently-named equivalent is used by `work_orders` RLS, match that exact function instead.

- [ ] **Step 3: Commit** (migration is applied to remote in Task 13)
```bash
git add supabase/migrations/20260611120000_custom_forms.sql
git commit -m "feat(forms): custom_form_* tables + RLS (standalone custom forms)"
```

---

## Task 2: Frontend types

**Files:**
- Create: `src/types/custom-form.ts`

- [ ] **Step 1: Write the types**

```ts
export type CustomFieldType = "text" | "number" | "date" | "dropdown" | "textarea" | "checkbox";

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
}

export interface CustomFormTemplate {
  id: string;
  factory_id: string;
  name: string;
  description: string | null;
  status: "active" | "archived";
  version: number;
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
```

- [ ] **Step 2: Build** — `npm run build` → succeeds.
- [ ] **Step 3: Commit**
```bash
git add src/types/custom-form.ts
git commit -m "feat(forms): custom-form frontend types"
```

---

## Task 3: Data hook `useCustomForms`

**Files:**
- Create: `src/hooks/useCustomForms.ts`

- [ ] **Step 1: Implement** (mirrors the `useQCDailySheets` read pattern + signature-style writes)

```ts
import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  CustomFormConfig, CustomFormField, CustomFormTemplate, CustomFormSubmission, DEFAULT_FILL_ROLES,
} from "@/types/custom-form";

function orderFields(fields: CustomFormField[]): CustomFormField[] {
  return [...fields]
    .filter((f) => f.is_active)
    .sort((a, b) => a.section_order - b.section_order || a.sort_order - b.sort_order);
}

/** Templates in the user's factory the current user is allowed to FILL. */
export function useFillableForms() {
  const { profile, roles, isAdminOrHigher } = useAuth();
  const [templates, setTemplates] = useState<CustomFormTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTemplates = useCallback(async () => {
    if (!profile?.factory_id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("custom_form_templates")
      .select("*")
      .eq("factory_id", profile.factory_id)
      .eq("status", "active")
      .order("name", { ascending: true });
    if (error) { console.error("custom forms list:", error); setLoading(false); return; }

    const myRoles = new Set(roles.map((r) => r.role));
    const admin = isAdminOrHigher();
    const fillable = (data as CustomFormTemplate[]).filter((t) => {
      if (admin) return true;
      const allowed = t.allowed_fill_roles?.length ? t.allowed_fill_roles : DEFAULT_FILL_ROLES;
      return allowed.some((r) => myRoles.has(r as never));
    });
    setTemplates(fillable);
    setLoading(false);
  }, [profile?.factory_id, roles, isAdminOrHigher]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);
  return { templates, loading, refresh: fetchTemplates };
}

/** All templates (incl. archived) for admin management. */
export function useAllForms() {
  const { profile } = useAuth();
  const [templates, setTemplates] = useState<CustomFormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchAll = useCallback(async () => {
    if (!profile?.factory_id) return;
    setLoading(true);
    const { data } = await supabase
      .from("custom_form_templates").select("*")
      .eq("factory_id", profile.factory_id)
      .order("status", { ascending: true }).order("name", { ascending: true });
    setTemplates((data as CustomFormTemplate[]) || []);
    setLoading(false);
  }, [profile?.factory_id]);
  useEffect(() => { fetchAll(); }, [fetchAll]);
  return { templates, loading, refresh: fetchAll };
}

/** One template + its active fields. */
export function useCustomFormConfig(templateId: string | undefined) {
  const [config, setConfig] = useState<CustomFormConfig | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!templateId) { setLoading(false); return; }
      setLoading(true);
      const { data: template } = await supabase
        .from("custom_form_templates").select("*").eq("id", templateId).maybeSingle();
      const { data: fields } = await supabase
        .from("custom_form_fields").select("*").eq("template_id", templateId);
      if (cancelled) return;
      if (template) {
        setConfig({ template: template as CustomFormTemplate, fields: orderFields((fields as CustomFormField[]) || []) });
      } else {
        setConfig(null);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [templateId]);
  return { config, loading };
}

/** Insert a submission (values keyed by field key + a snapshot of the fields). */
export async function submitCustomForm(
  config: CustomFormConfig, values: Record<string, unknown>, userId: string | undefined,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("custom_form_submissions").insert({
    template_id: config.template.id,
    template_version: config.template.version,
    factory_id: config.template.factory_id,
    submitted_by: userId ?? null,
    values,
    fields_snapshot: config.fields,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export function useFormSubmissions(templateId: string | undefined) {
  const [submissions, setSubmissions] = useState<CustomFormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchSubs = useCallback(async () => {
    if (!templateId) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("custom_form_submissions").select("*")
      .eq("template_id", templateId).order("created_at", { ascending: false });
    setSubmissions((data as CustomFormSubmission[]) || []);
    setLoading(false);
  }, [templateId]);
  useEffect(() => { fetchSubs(); }, [fetchSubs]);
  return { submissions, loading, refresh: fetchSubs };
}

export async function getSubmission(id: string): Promise<CustomFormSubmission | null> {
  const { data } = await supabase.from("custom_form_submissions").select("*").eq("id", id).maybeSingle();
  return (data as CustomFormSubmission) || null;
}

export async function archiveTemplate(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("custom_form_templates").update({ status: "archived" }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
export async function renameTemplate(id: string, name: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("custom_form_templates").update({ name }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
```

- [ ] **Step 2: Build** — `npm run build` → succeeds. (If `useAuth().isAdminOrHigher` is not a function in `AuthContext`, use `hasRole("admin") || hasRole("owner")` instead — confirm against `src/contexts/AuthContext.tsx`.)
- [ ] **Step 3: Commit**
```bash
git add src/hooks/useCustomForms.ts
git commit -m "feat(forms): useCustomForms data hooks (list/config/submit/submissions/manage)"
```

---

## Task 4: Dynamic renderer

**Files:**
- Create: `src/components/custom-forms/CustomFormField.tsx`
- Create: `src/components/custom-forms/CustomFormRenderer.tsx`

- [ ] **Step 1: Field component** — `CustomFormField.tsx`

```tsx
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
        <Input type="number" value={(value as string) ?? ""} placeholder={field.placeholder ?? ""} className={err} onChange={(e) => set(e.target.value === "" ? "" : Number(e.target.value))} />
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
      {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Renderer** — `CustomFormRenderer.tsx`

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomFormField } from "./CustomFormField";
import type { CustomFormConfig, CustomFormField as FieldDef } from "@/types/custom-form";

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    for (const f of config.fields) {
      if (f.is_required && isEmpty(f, values[f.key])) next[f.key] = `${f.label} is required.`;
    }
    setErrors(next);
    if (Object.keys(next).length === 0) onSubmit(values);
  };

  const sections = groupBySection(config.fields);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {sections.map((section, i) => (
        <Card key={i}>
          {section.label && <CardHeader><CardTitle className="text-base">{section.label}</CardTitle></CardHeader>}
          <CardContent className="space-y-4 pt-4">
            {section.fields.map((f) => (
              <CustomFormField key={f.id} field={f} value={values[f.key]} error={errors[f.key]} onChange={onChange} />
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
```

- [ ] **Step 3: Build** — `npm run build` → succeeds.
- [ ] **Step 4: Commit**
```bash
git add src/components/custom-forms/CustomFormField.tsx src/components/custom-forms/CustomFormRenderer.tsx
git commit -m "feat(forms): dynamic custom-form renderer + field component"
```

---

## Task 5: Pages + routing + nav

**Files:**
- Create: `src/pages/custom-forms/CustomFormsList.tsx`
- Create: `src/pages/custom-forms/CustomFormFill.tsx`
- Create: `src/pages/custom-forms/CustomFormSubmissions.tsx`
- Create: `src/pages/custom-forms/CustomFormSubmissionView.tsx`
- Modify: `src/App.tsx` (routes)
- Modify: `src/lib/constants.ts` (nav)

- [ ] **Step 1: List page** — `CustomFormsList.tsx`

```tsx
import { Link } from "react-router-dom";
import { useFillableForms } from "@/hooks/useCustomForms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList } from "lucide-react";

export default function CustomFormsList() {
  const { templates, loading } = useFillableForms();
  return (
    <div className="container max-w-2xl py-4 px-4 pb-24">
      <h1 className="text-xl font-bold mb-4">Forms</h1>
      {loading && <p className="text-muted-foreground">Loading…</p>}
      {!loading && templates.length === 0 && (
        <p className="text-muted-foreground">No forms available yet. An admin can create one with Lina by uploading a paper form.</p>
      )}
      <div className="space-y-3">
        {templates.map((t) => (
          <Link key={t.id} to={`/forms/${t.id}`}>
            <Card className="transition hover:bg-accent/40">
              <CardHeader className="flex flex-row items-center gap-3">
                <ClipboardList className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-base">{t.name}</CardTitle>
                  {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Fill page** — `CustomFormFill.tsx`

```tsx
import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useCustomFormConfig, submitCustomForm } from "@/hooks/useCustomForms";
import { CustomFormRenderer } from "@/components/custom-forms/CustomFormRenderer";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function CustomFormFill() {
  const { templateId } = useParams();
  const { config, loading } = useCustomFormConfig(templateId);
  const { user, isAdminOrHigher } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <div className="container max-w-2xl py-4 px-4"><p className="text-muted-foreground">Loading…</p></div>;
  if (!config) return <div className="container max-w-2xl py-4 px-4"><p>Form not found.</p></div>;

  const onSubmit = async (values: Record<string, unknown>) => {
    setSubmitting(true);
    const res = await submitCustomForm(config, values, user?.id);
    setSubmitting(false);
    if (res.ok) { toast.success("Submitted"); navigate("/forms"); }
    else toast.error(res.error || "Submission failed");
  };

  return (
    <div className="container max-w-2xl py-4 px-4 pb-24">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">{config.template.name}</h1>
        {isAdminOrHigher() && (
          <Link to={`/forms/${config.template.id}/submissions`} className="text-sm text-primary underline">Submissions</Link>
        )}
      </div>
      {config.template.description && <p className="text-sm text-muted-foreground mb-4">{config.template.description}</p>}
      <CustomFormRenderer config={config} submitting={submitting} onSubmit={onSubmit} />
    </div>
  );
}
```

- [ ] **Step 3: Submissions list** — `CustomFormSubmissions.tsx`

```tsx
import { useParams, Link } from "react-router-dom";
import { useFormSubmissions } from "@/hooks/useCustomForms";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

export default function CustomFormSubmissions() {
  const { templateId } = useParams();
  const { submissions, loading } = useFormSubmissions(templateId);
  return (
    <div className="container max-w-2xl py-4 px-4 pb-24">
      <h1 className="text-xl font-bold mb-4">Submissions</h1>
      {loading && <p className="text-muted-foreground">Loading…</p>}
      {!loading && submissions.length === 0 && <p className="text-muted-foreground">No submissions yet.</p>}
      <div className="space-y-3">
        {submissions.map((s) => (
          <Link key={s.id} to={`/forms/submissions/${s.id}`}>
            <Card className="transition hover:bg-accent/40">
              <CardHeader>
                <CardTitle className="text-sm font-medium">{new Date(s.created_at).toLocaleString()}</CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Submission view** — `CustomFormSubmissionView.tsx`

```tsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getSubmission } from "@/hooks/useCustomForms";
import type { CustomFormSubmission } from "@/types/custom-form";
import { Card, CardContent } from "@/components/ui/card";

export default function CustomFormSubmissionView() {
  const { submissionId } = useParams();
  const [sub, setSub] = useState<CustomFormSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { if (submissionId) setSub(await getSubmission(submissionId)); setLoading(false); })(); }, [submissionId]);

  if (loading) return <div className="container max-w-2xl py-4 px-4"><p className="text-muted-foreground">Loading…</p></div>;
  if (!sub) return <div className="container max-w-2xl py-4 px-4"><p>Submission not found.</p></div>;

  return (
    <div className="container max-w-2xl py-4 px-4 pb-24">
      <h1 className="text-xl font-bold mb-1">Submission</h1>
      <p className="text-sm text-muted-foreground mb-4">{new Date(sub.created_at).toLocaleString()}</p>
      <Card><CardContent className="space-y-3 pt-4">
        {sub.fields_snapshot.map((f) => {
          const v = sub.values[f.key];
          const display = f.field_type === "checkbox" ? (v ? "Yes" : "No") : (v === undefined || v === null || v === "" ? "—" : String(v));
          return (
            <div key={f.key} className="flex flex-col">
              <span className="text-xs text-muted-foreground">{f.label}</span>
              <span className="text-sm">{display}</span>
            </div>
          );
        })}
      </CardContent></Card>
    </div>
  );
}
```

- [ ] **Step 5: Register routes** — in `src/App.tsx`, add lazy imports near the other page imports:
```ts
const CustomFormsList = lazy(() => import("./pages/custom-forms/CustomFormsList"));
const CustomFormFill = lazy(() => import("./pages/custom-forms/CustomFormFill"));
const CustomFormSubmissions = lazy(() => import("./pages/custom-forms/CustomFormSubmissions"));
const CustomFormSubmissionView = lazy(() => import("./pages/custom-forms/CustomFormSubmissionView"));
```
and add these routes inside the authenticated `AppLayout`/`Routes` block, mirroring the existing `<SubscriptionGate><ProtectedRoute ...>` wrapper (read an existing route line first to copy the exact wrapper). Use a broad `allowedRoles` for fill, admin-gating is enforced inside pages:
```tsx
<Route path="/forms" element={<SubscriptionGate><ProtectedRoute allowedRoles={['worker','admin','owner','sewing','finishing','cutting','qc','storage']}><CustomFormsList /></ProtectedRoute></SubscriptionGate>} />
<Route path="/forms/:templateId" element={<SubscriptionGate><ProtectedRoute allowedRoles={['worker','admin','owner','sewing','finishing','cutting','qc','storage']}><CustomFormFill /></ProtectedRoute></SubscriptionGate>} />
<Route path="/forms/:templateId/submissions" element={<SubscriptionGate><ProtectedRoute adminOnly><CustomFormSubmissions /></ProtectedRoute></SubscriptionGate>} />
<Route path="/forms/submissions/:submissionId" element={<SubscriptionGate><ProtectedRoute adminOnly><CustomFormSubmissionView /></ProtectedRoute></SubscriptionGate>} />
```
(If `ProtectedRoute` uses a different prop than `allowedRoles`/`adminOnly`, match the exact prop names used by sibling routes.)

- [ ] **Step 6: Nav** — in `src/lib/constants.ts`, add to the `NAV_ITEMS.admin`, `NAV_ITEMS.owner`, and `NAV_ITEMS.worker` arrays (match the existing item shape `{ path, label, icon, group }`):
```ts
  { path: '/forms', label: 'Forms', icon: 'ClipboardList', group: 'Production' },
```
(Confirm `ClipboardList` is a valid icon key in the sidebar's icon map; if the map is explicit, add `ClipboardList` to it. Otherwise use an icon already present, e.g. `'FileText'`.)

- [ ] **Step 7: Build + manual sanity** — `npm run build` → succeeds. (Engine is exercised end-to-end in Task 13 after a template exists; to test now, an admin can hand-insert a row via the dashboard, or wait for Lina in Phase 2.)
- [ ] **Step 8: Commit**
```bash
git add src/pages/custom-forms/ src/App.tsx src/lib/constants.ts
git commit -m "feat(forms): custom forms pages (list/fill/submissions/view) + routes + nav"
```

---

# PHASE 2 — Lina creates forms from paper

## Task 6: Pure validator `validateCreateCustomForm`

**Files:**
- Create: `supabase/functions/_shared/actions/forms.ts`
- Create: `supabase/functions/_shared/actions/forms.test.ts`
- Modify: `supabase/functions/_shared/actions/po.ts` (add the new action kind to the shared union)

- [ ] **Step 1: Extend the shared action kind** — in `po.ts`, change the `PoActionKind` union to also include the form action (the `ProposedAction` shape is shared across all Lina write actions):
```ts
export type PoActionKind =
  | "create_po" | "update_po" | "assign_po_lines"
  | "set_po_status" | "set_po_ex_factory" | "archive_po"
  | "create_custom_form";
```

- [ ] **Step 2: Write failing tests** — `forms.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { validateCreateCustomForm } from "./forms";

describe("validateCreateCustomForm", () => {
  it("requires a name", () => {
    expect(validateCreateCustomForm({ fields: [{ label: "A", type: "text" }] }).ok).toBe(false);
  });
  it("requires at least one field", () => {
    expect(validateCreateCustomForm({ name: "Form", fields: [] }).ok).toBe(false);
  });
  it("rejects an invalid field type", () => {
    expect(validateCreateCustomForm({ name: "F", fields: [{ label: "X", type: "bogus" }] }).ok).toBe(false);
  });
  it("requires options on a dropdown field", () => {
    expect(validateCreateCustomForm({ name: "F", fields: [{ label: "Pick", type: "dropdown" }] }).ok).toBe(false);
    const ok = validateCreateCustomForm({ name: "F", fields: [{ label: "Pick", type: "dropdown", options: ["a", "b"] }] });
    expect(ok.ok).toBe(true);
  });
  it("builds a proposal with unique slug keys and a field count summary", () => {
    const r = validateCreateCustomForm({
      name: "Line QA",
      fields: [
        { label: "Operator Name", type: "text", required: true },
        { label: "Operator Name", type: "text" }, // duplicate label -> deduped key
        { label: "Pass?", type: "checkbox" },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.action.kind).toBe("create_custom_form");
      const keys = (r.action.payload.fields as Array<{ key: string }>).map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length); // all unique
      expect(r.action.humanSummary).toContain("3");
    }
  });
});
```

- [ ] **Step 3: Run, expect FAIL** — `npx vitest run supabase/functions/_shared/actions/forms.test.ts`.

- [ ] **Step 4: Implement** — `forms.ts`

```ts
// Pure validator + types for Lina's custom-form write action. Shared by the preview
// tool and execute-action so validation is identical on both sides. No Deno/runtime imports.
import type { ProposedAction, ValidationResult } from "./po.ts";

const VALID_TYPES = ["text", "number", "date", "dropdown", "textarea", "checkbox"];
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "field";
}

interface NormalizedField {
  key: string; label: string; field_type: string; is_required: boolean;
  options: { value: string; label: string }[] | null;
  section_label: string | null; section_order: number; sort_order: number;
}

export function validateCreateCustomForm(input: Record<string, unknown>): ValidationResult {
  const name = str(input.name);
  if (!name) return { ok: false, error: "What should the form be called?" };
  const rawFields = Array.isArray(input.fields) ? (input.fields as Record<string, unknown>[]) : [];
  if (rawFields.length === 0) return { ok: false, error: `What fields should "${name}" have?` };

  const usedKeys = new Set<string>();
  const fields: NormalizedField[] = [];
  let sectionOrder = -1;
  let lastSection: string | null = " "; // sentinel so the first section bumps the order

  for (let i = 0; i < rawFields.length; i++) {
    const f = rawFields[i];
    const label = str(f.label);
    if (!label) return { ok: false, error: `Field ${i + 1} needs a label.` };
    const type = str(f.type) || str(f.field_type);
    if (!VALID_TYPES.includes(type)) {
      return { ok: false, error: `Field "${label}" has an unsupported type. Use one of: ${VALID_TYPES.join(", ")}.` };
    }
    let options: { value: string; label: string }[] | null = null;
    if (type === "dropdown") {
      const rawOpts = Array.isArray(f.options) ? (f.options as unknown[]) : [];
      const norm = rawOpts.map((o) => {
        if (typeof o === "string") return { value: o, label: o };
        const ov = o as Record<string, unknown>;
        const val = str(ov.value) || str(ov.label);
        return val ? { value: val, label: str(ov.label) || val } : null;
      }).filter(Boolean) as { value: string; label: string }[];
      if (norm.length === 0) return { ok: false, error: `Dropdown "${label}" needs at least one option.` };
      options = norm;
    }
    // unique key
    let key = slug(label); let n = 2;
    while (usedKeys.has(key)) key = `${slug(label)}_${n++}`;
    usedKeys.add(key);
    // section
    const section = str(f.section) || null;
    if (section !== lastSection) { sectionOrder++; lastSection = section; }
    fields.push({
      key, label, field_type: type, is_required: f.required === true,
      options, section_label: section, section_order: Math.max(0, sectionOrder), sort_order: i,
    });
  }

  const action: ProposedAction = {
    kind: "create_custom_form",
    humanSummary: `Create form "${name}" with ${fields.length} field${fields.length === 1 ? "" : "s"}`,
    payload: { name, description: str(input.description) || null, allowed_fill_roles: [], fields },
  };
  return { ok: true, action };
}
```

- [ ] **Step 5: Run, expect PASS** — `npx vitest run supabase/functions/_shared/actions/forms.test.ts`.
- [ ] **Step 6: Commit**
```bash
git add supabase/functions/_shared/actions/forms.ts supabase/functions/_shared/actions/forms.test.ts supabase/functions/_shared/actions/po.ts
git commit -m "feat(forms): validateCreateCustomForm pure validator + create_custom_form kind"
```

---

## Task 7: `propose_create_form` preview tool + registry

**Files:**
- Modify: `supabase/functions/_shared/tools/actions-tools.ts`
- Modify: `supabase/functions/_shared/tools/actions-tools.test.ts`
- Modify: `supabase/functions/_shared/tools/registry.ts`
- Modify: `supabase/functions/_shared/tools/registry.test.ts`

- [ ] **Step 1: Add failing test** — append to `actions-tools.test.ts`:
```ts
import { proposeCreateFormTool } from "./actions-tools";

describe("propose_create_form tool", () => {
  it("admin proposes a form (no write)", async () => {
    const { c, proposed } = ctx("admin");
    const out = await proposeCreateFormTool(c, { name: "QA", fields: [{ label: "Op", type: "text" }] });
    expect(proposed.length).toBe(1);
    expect(proposed[0].kind).toBe("create_custom_form");
    expect(out.toLowerCase()).toContain("approve");
  });
  it("worker is denied", async () => {
    const { c, proposed } = ctx("worker");
    const out = await proposeCreateFormTool(c, { name: "QA", fields: [{ label: "Op", type: "text" }] });
    expect(proposed.length).toBe(0);
    expect(out.toLowerCase()).toContain("don't have access");
  });
});
```

- [ ] **Step 2: Implement** — in `actions-tools.ts`, add the import and the tool (reusing the existing `gate`/`propose`/`DENY` helpers in that file):
```ts
import { validateCreateCustomForm } from "../actions/forms.ts";

export async function proposeCreateFormTool(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!gate(ctx)) return DENY;
  return propose(ctx, validateCreateCustomForm(input));
}
```

- [ ] **Step 3: Register** — in `registry.ts`, add `proposeCreateFormTool` to the `actions-tools.ts` import block and append this entry to `ALL_TOOLS`:
```ts
  {
    name: "propose_create_form",
    description: "Create a new custom digital form from a description or an uploaded paper form image. Admin/owner only. Use when the user uploads a photo/PDF of a form, or asks to build a new form/checklist. Extract a name and the list of fields. This PROPOSES the form for the user to approve — it does not create it directly.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The form's title." },
        description: { type: "string" },
        fields: {
          type: "array",
          description: "The fields, in order, as they appear on the form.",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              type: { type: "string", enum: ["text", "number", "date", "dropdown", "textarea", "checkbox"] },
              required: { type: "boolean" },
              section: { type: "string", description: "Optional group/section heading this field belongs under." },
              options: { type: "array", items: { type: "string" }, description: "Choices for a dropdown field." },
            },
            required: ["label", "type"],
          },
        },
      },
      required: ["name", "fields"],
    },
    allowedRoles: ["admin", "owner", "superadmin"],
    execute: proposeCreateFormTool,
  },
```

- [ ] **Step 4: Update the name assertion** — in `registry.test.ts`, add `"propose_create_form"` to the expected sorted tool-name list (it should now total 17).

- [ ] **Step 5: Run** — `npx vitest run supabase/functions` → all pass.
- [ ] **Step 6: Commit**
```bash
git add supabase/functions/_shared/tools/
git commit -m "feat(forms): propose_create_form preview tool + registry entry"
```

---

## Task 8: `execute-action` — handle `create_custom_form`

**Files:**
- Modify: `supabase/functions/execute-action/index.ts`

- [ ] **Step 1: Import the form validator** — add to the imports:
```ts
import { validateCreateCustomForm } from "../_shared/actions/forms.ts";
```

- [ ] **Step 2: Add to `revalidate`** — add a case before `default`:
```ts
    case "create_custom_form": return validateCreateCustomForm(payload);
```

- [ ] **Step 3: Handle the write** — `create_custom_form` writes to `custom_form_*`, not `work_orders`, so handle it in its OWN block BEFORE the existing `if (kind !== "create_po")` PO-resolution block, and `return` from it directly. Insert this immediately after `const p = action.payload;` and the `userClient` is constructed (place it right after the `rlsMsg` helper definition, before the `// Resolve PO id` block):

```ts
    // Custom-form creation writes to its own tables and returns early.
    if (kind === "create_custom_form") {
      const { data: tpl, error: tplErr } = await userClient
        .from("custom_form_templates")
        .insert({ factory_id: factoryId, name: p.name, description: p.description ?? null, created_by: user.id })
        .select("id")
        .single();
      if (tplErr || !tpl) return json({ ok: false, error: rlsMsg(tplErr) });

      const fields = Array.isArray(p.fields) ? (p.fields as Record<string, unknown>[]) : [];
      const rows = fields.map((f) => ({
        template_id: tpl.id,
        section_label: f.section_label ?? null,
        section_order: typeof f.section_order === "number" ? f.section_order : 0,
        key: f.key, label: f.label, field_type: f.field_type,
        is_required: f.is_required === true,
        options: f.options ?? null,
        sort_order: typeof f.sort_order === "number" ? f.sort_order : 0,
      }));
      const { data: inserted, error: fErr } = await userClient
        .from("custom_form_fields").insert(rows).select("id");
      if (fErr || !inserted?.length) {
        // The template exists but fields failed — surface honestly.
        return json({ ok: false, error: rlsMsg(fErr) || "The form was created but its fields could not be added." });
      }
      await admin.from("audit_log").insert({
        factory_id: factoryId, user_id: user.id, action: "INSERT",
        table_name: "custom_form_templates", record_id: tpl.id,
        old_data: null, new_data: { name: p.name, field_count: rows.length },
      });
      log("done", { kind, recordId: tpl.id });
      return json({ ok: true, summary: action.humanSummary, recordId: tpl.id });
    }
```

- [ ] **Step 4: Sanity** — `npx vitest run supabase/functions` still green (file not imported by tests). Behavior verified in Task 13.
- [ ] **Step 5: Commit**
```bash
git add supabase/functions/execute-action/index.ts
git commit -m "feat(forms): execute-action creates custom form template + fields as the user + audit"
```

---

## Task 9: `lina-uploads` storage bucket

**Files:**
- Create: `supabase/migrations/20260611120500_lina_uploads_bucket.sql`

- [ ] **Step 1: Write the migration** (mirror the `signatures` bucket pattern; factory-scoped folder RLS)

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('lina-uploads', 'lina-uploads', false, 52428800)  -- 50 MB
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "lina_uploads_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'lina-uploads' AND (storage.foldername(name))[1] IN (
    SELECT factory_id::text FROM public.profiles WHERE id = auth.uid()
  ));
CREATE POLICY "lina_uploads_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lina-uploads' AND (storage.foldername(name))[1] IN (
    SELECT factory_id::text FROM public.profiles WHERE id = auth.uid()
  ));
CREATE POLICY "lina_uploads_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'lina-uploads' AND (storage.foldername(name))[1] IN (
    SELECT factory_id::text FROM public.profiles WHERE id = auth.uid()
  ));
```

- [ ] **Step 2: Commit** (applied to remote in Task 13)
```bash
git add supabase/migrations/20260611120500_lina_uploads_bucket.sql
git commit -m "feat(forms): lina-uploads storage bucket (factory-scoped RLS)"
```

---

## Task 10: Frontend upload in the Lina composer

**Files:**
- Modify: `src/hooks/useChat.ts`
- Modify: `src/components/chat/ChatPanel.tsx`

- [ ] **Step 1: `useChat` — accept an attachment** — change `sendMessage` to accept an optional attachment and include it in the invoke body. Update the signature in `UseChatReturn` and the implementation:
```ts
// type:
sendMessage: (content: string, attachment?: { path: string; mime: string }) => Promise<void>;
```
```ts
// implementation — update the signature and the invoke body:
const sendMessage = useCallback(async (content: string, attachment?: { path: string; mime: string }) => {
  // ...existing guard/loading code unchanged...
  const { data, error: invokeError } = await supabase.functions.invoke("chat", {
    body: {
      message: content,
      conversation_id: conversationId,
      language,
      attachment: attachment ?? null,
    },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // ...rest unchanged...
}, [conversationId, language, isLoading]);
```

- [ ] **Step 2: `ChatPanel` — attach button + upload** — add an attach control to the composer. Add imports:
```ts
import { useRef, useState } from "react"; // (merge with existing imports)
import { Paperclip, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
```
Add state + handlers inside the component:
```ts
  const { profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachment, setAttachment] = useState<{ path: string; mime: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const handlePickFile = () => fileInputRef.current?.click();
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !profile?.factory_id) return;
    if (file.size > 50 * 1024 * 1024) { toast.error("File is too large (max 50 MB)."); return; }
    setUploading(true);
    const path = `${profile.factory_id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error } = await supabase.storage.from("lina-uploads").upload(path, file, { contentType: file.type, upsert: false });
    setUploading(false);
    if (error) { toast.error("Upload failed: " + error.message); return; }
    setAttachment({ path, mime: file.type, name: file.name });
  };
```
Wire the existing submit handler to pass and clear the attachment (update `handleSubmit`):
```ts
  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!input.trim() && !attachment) || isLoading) return;
    const message = input.trim() || "Please digitize this form.";
    const att = attachment ? { path: attachment.path, mime: attachment.mime } : undefined;
    setInput("");
    setAttachment(null);
    shouldAutoScroll.current = true;
    await sendMessage(message, att);
  };
```
Add the destructured `sendMessage` (already present) and render the control near the composer textarea (an attachment chip + a paperclip button + the hidden input):
```tsx
        <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileChange} />
        {attachment && (
          <div className="flex items-center gap-2 rounded-md bg-muted px-2 py-1 text-xs">
            <span className="truncate max-w-[200px]">{attachment.name}</span>
            <button type="button" onClick={() => setAttachment(null)}><X className="h-3 w-3" /></button>
          </div>
        )}
        <Button type="button" variant="ghost" size="icon" onClick={handlePickFile} disabled={uploading} title="Attach a form image or PDF">
          <Paperclip className="h-4 w-4" />
        </Button>
```
(Place the paperclip button alongside the existing send button; match the composer's layout. Read the current composer JSX first and slot these in without disturbing existing controls.)

- [ ] **Step 3: Build** — `npm run build` → succeeds.
- [ ] **Step 4: Commit**
```bash
git add src/hooks/useChat.ts src/components/chat/ChatPanel.tsx
git commit -m "feat(forms): attach an image/PDF to Lina (upload to lina-uploads)"
```

---

## Task 11: Chat function — accept attachment + vision block

**Files:**
- Modify: `supabase/functions/chat/index.ts`
- Modify: `supabase/functions/_shared/agent-loop.ts` (widen the message content type)

- [ ] **Step 1: Widen the message content type** — in `agent-loop.ts`, find the message/`ModelTurn` type whose `content` is typed `string` and widen it to `string | unknown[]` so a multimodal content array is allowed. (If `initialMessages` is typed inline in `runAgentLoop`'s params, widen there too.)

- [ ] **Step 2: Accept the attachment in `ChatRequest`** — extend the interface (around line 13):
```ts
interface ChatRequest {
  message: string;
  conversation_id?: string;
  language?: "en" | "bn" | "zh";
  attachment?: { path: string; mime: string } | null;
}
```
and read it:
```ts
const { message, conversation_id, language: requestedLanguage, attachment } = body;
```

- [ ] **Step 3: Build the vision block + inject into the current turn** — add this import at the top:
```ts
import { encodeBase64 } from "https://deno.land/std@0.190.0/encoding/base64.ts";
```
After `conversationHistory` is built (just before `const today = ...`), add:
```ts
    // If the user attached an image/PDF, fetch it and attach it to the CURRENT user turn
    // (the last item in conversationHistory) as a Claude vision content block.
    if (attachment?.path) {
      try {
        const dl = await supabaseAdmin.storage.from("lina-uploads").download(attachment.path);
        if (dl.data) {
          const bytes = new Uint8Array(await dl.data.arrayBuffer());
          const b64 = encodeBase64(bytes);
          const mime = attachment.mime || "image/jpeg";
          const block = mime === "application/pdf"
            ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
            : { type: "image", source: { type: "base64", media_type: mime, data: b64 } };
          // Replace the last user message's content with [block, text].
          for (let i = conversationHistory.length - 1; i >= 0; i--) {
            if (conversationHistory[i].role === "user") {
              const text = conversationHistory[i].content as string;
              (conversationHistory[i] as { role: "user"; content: unknown }).content = [block, { type: "text", text }];
              break;
            }
          }
          logStep("Attached vision block", { mime, bytes: bytes.length });
        }
      } catch (e) {
        logStep("Attachment fetch failed", { error: e instanceof Error ? e.message : String(e) });
      }
    }
```

- [ ] **Step 4: Sanity** — `npx tsc` is not run for edge functions; instead `npx vitest run supabase/functions` stays green (this file isn't imported by tests). Confirm no syntax errors by re-reading the edited region. Behavior verified in Task 13.
- [ ] **Step 5: Commit**
```bash
git add supabase/functions/chat/index.ts supabase/functions/_shared/agent-loop.ts
git commit -m "feat(forms): chat accepts an image/PDF attachment as a Claude vision block"
```

---

## Task 12: Persona — Lina builds forms from paper

**Files:**
- Modify: `supabase/functions/_shared/persona.ts`

- [ ] **Step 1: Add guidance** — after the "Managing purchase orders (writes)" section, add (keep it em-dash-free):
```
## Building custom forms (from a photo or description)
- When the user attaches a photo or PDF of a paper form, or asks you to build a form or checklist, read it and call the propose_create_form tool with a clear name and the list of fields in order (label, type, whether required, and dropdown options where the paper shows choices). Group related fields with a section heading when the paper has sections.
- Pick the closest field type for each: short answers are text, paragraphs are textarea, quantities are number, dates are date, yes/no or tick boxes are checkbox, and a fixed set of choices is dropdown (with options).
- This tool does NOT create the form immediately. It PROPOSES it, and the user sees an Approve card. So after calling it, briefly tell the user what you captured (form name and how many fields) and ask them to review and Approve. Never say the form is created before they approve. If they say something is wrong, adjust and propose again.
```

- [ ] **Step 2: Test** — `npx vitest run supabase/functions/_shared/persona.test.ts` → still passes.
- [ ] **Step 3: Commit**
```bash
git add supabase/functions/_shared/persona.ts
git commit -m "feat(forms): persona guidance for building custom forms from paper"
```

---

## Task 13: Remote verification, deploy, per-role smoke test

**Files:** none (verification/deploy).

- [ ] **Step 1: Apply the two migrations to remote** (`varolnwetchstlfholbl`) via the dashboard SQL editor (the repo has migration-tracking drift, so apply the SQL directly): paste the contents of `20260611120000_custom_forms.sql` then `20260611120500_lina_uploads_bucket.sql`. Then verify:
```sql
select table_name from information_schema.tables where table_name like 'custom_form_%';
select polname from pg_policies where tablename in ('custom_form_templates','custom_form_fields','custom_form_submissions');
select id from storage.buckets where id = 'lina-uploads';
```
Expected: 3 tables, their policies, and the bucket. If `is_admin_or_higher`/`get_user_factory_id` names differ on remote, adjust the policy SQL to match before applying.

- [ ] **Step 2: Full suite + build** — `npx vitest run` (Lina edge tests + new forms tests pass; the 2 `po-filters` failures are pre-existing) and `npm run build` → succeeds.

- [ ] **Step 3: Deploy** — `supabase functions deploy execute-action --project-ref varolnwetchstlfholbl` and `supabase functions deploy chat --project-ref varolnwetchstlfholbl`.

- [ ] **Step 4: Per-role smoke test (manual, in the app on the `Chatbot` branch — `npm run dev`):**
  - As **admin/owner**: open Lina, attach a photo/PDF of a simple paper form (or type "build a QA checklist with operator name (text), line (text), defects found (number), pass? (checkbox)"). Lina calls `propose_create_form` → an Approve card appears summarizing the form → **Approve** → "Create form … " success. Then open **/forms**, confirm the form is listed, fill it, submit, and view the submission. Confirm an `audit_log` row exists for the template.
  - As a **worker**: ask Lina to "build a form" → she should decline (no permission) or the Approve action should be denied; confirm a worker cannot create a form (RLS). Confirm a worker can FILL a form whose `allowed_fill_roles` permit it.
  - **Regression:** the 4 production forms and the QC module still work unchanged; the existing PO write-actions still work.

- [ ] **Step 5: (If remote helper names required a migration tweak) commit it**
```bash
git add supabase/migrations/
git commit -m "chore(forms): align custom-forms RLS with remote helper names"
```

---

## Self-review notes (author)

- **Spec coverage:** engine tables + RLS (Task 1), types (2), data hook (3), renderer (4), pages/routes/nav (5); Lina path: validator (6), preview tool + registry (7), execute-action write + audit + no-op guard (8), storage bucket (9), composer upload (10), chat vision block (11), persona (12); remote verify + deploy + per-role smoke incl. worker-denied + regression (13). Non-goals respected: dedicated `custom_form_*` tables (no touch to `form_templates`, production forms, or QC); confirm-before-create via the existing Approve card; soft-delete (archive) only.
- **Type consistency:** `ProposedAction`/`ValidationResult` reused from `po.ts` with the added `create_custom_form` kind; `forms.ts` payload field shape (`key,label,field_type,is_required,options,section_label,section_order,sort_order`) matches the columns inserted by `execute-action` (Task 8) and the `CustomFormField` type (Task 2). `sendMessage(content, attachment?)` signature updated in both `useChat` and its callers.
- **Reuse:** the Approve card, `PendingAction`, and `runAction` are unchanged (generic over `{kind,humanSummary,payload}`); only a new tool + a new execute-action branch + a new validator are added.
- **Risk control:** worker-denied smoke proves RLS governs form creation; row-count guard on the fields insert avoids false success; vision mis-reads are caught by the Approve gate; dedicated tables guarantee zero impact on existing forms.
