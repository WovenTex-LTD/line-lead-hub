import { useState, useCallback, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  CustomFormConfig, CustomFormField, CustomFormTemplate, CustomFormSubmission,
} from "@/types/custom-form";

function orderFields(fields: CustomFormField[]): CustomFormField[] {
  return [...fields]
    .filter((f) => f.is_active)
    .sort((a, b) => a.section_order - b.section_order || a.sort_order - b.sort_order);
}

/** Templates in the user's factory the current user is allowed to FILL. */
export function useFillableForms() {
  const { profile, roles } = useAuth();
  const [templates, setTemplates] = useState<CustomFormTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const admin = useMemo(() => roles.some((r) => ["admin", "owner", "superadmin"].includes(r.role)), [roles]);

  const fetchTemplates = useCallback(async () => {
    if (!profile?.factory_id) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("custom_form_templates" as never)
      .select("*")
      .eq("factory_id", profile.factory_id)
      .eq("status", "active")
      .order("name", { ascending: true });
    if (error) { console.error("custom forms list:", error); setLoading(false); return; }

    const myRoles = new Set(roles.map((r) => r.role));
    const fillable = (data as CustomFormTemplate[]).filter((t) => admin || (t.target_role != null && myRoles.has(t.target_role as never)));
    setTemplates(fillable);
    setLoading(false);
  }, [profile?.factory_id, roles, admin]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);
  return { templates, loading, refresh: fetchTemplates };
}

/** All templates (incl. archived) for admin management. */
export function useAllForms() {
  const { profile } = useAuth();
  const [templates, setTemplates] = useState<CustomFormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchAll = useCallback(async () => {
    if (!profile?.factory_id) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("custom_form_templates" as never).select("*")
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
        .from("custom_form_templates" as never).select("*").eq("id", templateId).maybeSingle();
      const { data: fields } = await supabase
        .from("custom_form_fields" as never).select("*").eq("template_id", templateId);
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

/** Insert a submission. The authenticated user's id is REQUIRED (RLS enforces submitted_by = auth.uid()). */
export async function submitCustomForm(
  config: CustomFormConfig, values: Record<string, unknown>, userId: string | undefined,
): Promise<{ ok: boolean; error?: string }> {
  if (!userId) return { ok: false, error: "You must be signed in to submit." };
  const { error } = await supabase.from("custom_form_submissions" as never).insert({
    template_id: config.template.id,
    template_version: config.template.version,
    factory_id: config.template.factory_id,
    submitted_by: userId,
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
      .from("custom_form_submissions" as never).select("*")
      .eq("template_id", templateId).order("created_at", { ascending: false });
    setSubmissions((data as CustomFormSubmission[]) || []);
    setLoading(false);
  }, [templateId]);
  useEffect(() => { fetchSubs(); }, [fetchSubs]);
  return { submissions, loading, refresh: fetchSubs };
}

export async function getSubmission(id: string): Promise<CustomFormSubmission | null> {
  const { data } = await supabase.from("custom_form_submissions" as never).select("*").eq("id", id).maybeSingle();
  return (data as CustomFormSubmission) || null;
}

export async function archiveTemplate(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("custom_form_templates" as never).update({ status: "archived" }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
export async function renameTemplate(id: string, name: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("custom_form_templates" as never).update({ name }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
