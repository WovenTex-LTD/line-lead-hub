import { useState, useCallback, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  CustomFormConfig, CustomFormField, CustomFormTemplate, CustomFormSubmission, FormSlotOverride, PoDetail,
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

/** Insert a submission. The form keeps its OWN fields — the submission is displayed
 *  by reading those fields back (the detail view pulls fields from the form), never by
 *  forcing the form to match a fixed layout. */
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

/** Fetch options for each requested dynamic-select source (lines, stages, …),
 *  returned as a source_key -> options map. Driven live so Dropdown-Settings edits
 *  and new lines show up automatically. */
export function useDynamicSourceOptions(sourceKeys: string[]) {
  const { profile } = useAuth();
  const [optionsBySource, setOptionsBySource] = useState<Record<string, { value: string; label: string }[]>>({});
  const wanted = [...new Set(sourceKeys)].filter(Boolean).sort();
  const cacheKey = wanted.join(",");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!profile?.factory_id || wanted.length === 0) { setOptionsBySource({}); return; }
      const { DYNAMIC_SOURCES } = await import("@/lib/dynamic-sources");
      const out: Record<string, { value: string; label: string }[]> = {};
      await Promise.all(wanted.map(async (key) => {
        const def = DYNAMIC_SOURCES.find((d) => d.key === key);
        if (!def) { out[key] = []; return; }
        let q = supabase.from(def.table as never).select(def.selectCols).eq("factory_id", profile.factory_id);
        if (def.activeOnly) q = q.eq("is_active", true);
        const { data, error } = await q.order(def.orderCol, { ascending: true });
        if (error) { console.error(`dynamic source ${key}:`, error.message); out[key] = []; return; }
        const seen = new Set<string>();
        out[key] = ((data as Record<string, unknown>[]) || [])
          .map((r) => def.toOption(r))
          .filter((o): o is { value: string; label: string } => !!o && !seen.has(o.value) && (seen.add(o.value), true));
      }));
      if (!cancelled) setOptionsBySource(out);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.factory_id, cacheKey]);
  return optionsBySource;
}

/** The factory's active purchase orders: dropdown options for a po_select field,
 *  plus a po_number -> details map so the form can show the PO's info read-only. */
export function useFactoryPOs() {
  const { profile } = useAuth();
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [details, setDetails] = useState<Record<string, PoDetail>>({});
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!profile?.factory_id) { setLoading(false); return; }
      const { data } = await supabase
        .from("work_orders")
        .select("po_number, buyer, style, item, color, order_qty, planned_ex_factory, status")
        .eq("factory_id", profile.factory_id).eq("is_active", true)
        .order("po_number", { ascending: true });
      if (cancelled) return;
      const seen = new Set<string>();
      const opts: { value: string; label: string }[] = [];
      const map: Record<string, PoDetail> = {};
      for (const w of (data as PoDetail[]) || []) {
        if (!w.po_number || seen.has(w.po_number)) continue;
        seen.add(w.po_number);
        const extra = [w.buyer, w.style].filter(Boolean).join(" · ");
        opts.push({ value: w.po_number, label: extra ? `${w.po_number} — ${extra}` : w.po_number });
        map[w.po_number] = w;
      }
      setOptions(opts);
      setDetails(map);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [profile?.factory_id]);
  return { options, details, loading };
}

export interface CustomSubmissionEntry {
  id: string;
  templateId: string;
  formName: string;
  targetRole: string | null;
  submitterName: string | null;
  createdAt: string;
}

/** Custom-form submissions for the factory, scoped to today / this week / all,
 *  with the form name and submitter resolved — for surfacing them in the records
 *  pages alongside production data. Read-only; never touches production tables. */
export function useCustomSubmissions(scope: "today" | "week" | "all") {
  const { profile } = useAuth();
  const [entries, setEntries] = useState<CustomSubmissionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!profile?.factory_id) { setLoading(false); return; }
      setLoading(true);
      let q = supabase
        .from("custom_form_submissions" as never)
        .select("id, template_id, submitted_by, created_at, custom_form_templates(name, target_role, slot_key)")
        .eq("factory_id", profile.factory_id)
        .order("created_at", { ascending: false });
      const now = new Date();
      if (scope === "today") {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        q = q.gte("created_at", start.toISOString());
      } else if (scope === "week") {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
        q = q.gte("created_at", start.toISOString());
      } else {
        q = q.limit(100);
      }
      const { data, error } = await q;
      if (error) { console.error("custom submissions:", error.message); if (!cancelled) { setEntries([]); setLoading(false); } return; }
      const rows = (data as Record<string, unknown>[]) || [];
      const ids = [...new Set(rows.map((r) => r.submitted_by).filter(Boolean) as string[])];
      let names: Record<string, string> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        names = Object.fromEntries(((profs as { id: string; full_name: string }[]) || []).map((p) => [p.id, p.full_name]));
      }
      if (cancelled) return;
      // Show ALL custom-form submissions (slot versions + standalone) — each renders its
      // OWN fields when opened, rather than being forced into a typed production table.
      setEntries(rows.map((r) => {
        const tpl = r.custom_form_templates as { name?: string; target_role?: string | null } | null;
        const by = r.submitted_by as string | null;
        return {
          id: r.id as string,
          templateId: r.template_id as string,
          formName: tpl?.name ?? "Form",
          targetRole: tpl?.target_role ?? null,
          submitterName: by ? (names[by] ?? null) : null,
          createdAt: r.created_at as string,
        };
      }));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [profile?.factory_id, scope]);
  return { entries, loading };
}

/** All slot overrides for the user's factory, as a slot_key -> template_id map. */
export function useSlotOverrides() {
  const { profile } = useAuth();
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const fetchOverrides = useCallback(async () => {
    if (!profile?.factory_id) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("form_slot_overrides" as never).select("*")
      .eq("factory_id", profile.factory_id);
    if (error) console.error("slot overrides:", error);
    const m: Record<string, string> = {};
    for (const o of (data as FormSlotOverride[]) || []) {
      if (o.active_template_id) m[o.slot_key] = o.active_template_id;
    }
    setOverrides(m);
    setLoading(false);
  }, [profile?.factory_id]);
  useEffect(() => { fetchOverrides(); }, [fetchOverrides]);
  return { overrides, loading, refresh: fetchOverrides };
}

/** Set the active version for a slot: a template id, or null to restore the default form. */
export async function setSlotActive(
  factoryId: string, slotKey: string, templateId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (templateId === null) {
    const { error } = await supabase
      .from("form_slot_overrides" as never).delete()
      .eq("factory_id", factoryId).eq("slot_key", slotKey);
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  const { error } = await supabase
    .from("form_slot_overrides" as never)
    .upsert({ factory_id: factoryId, slot_key: slotKey, active_template_id: templateId } as never,
      { onConflict: "factory_id,slot_key" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function archiveTemplate(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("custom_form_templates" as never).update({ status: "archived" }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
export async function renameTemplate(id: string, name: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("custom_form_templates" as never).update({ name }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
