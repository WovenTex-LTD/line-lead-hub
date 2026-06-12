import { useState, useCallback, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  CustomFormConfig, CustomFormField, CustomFormTemplate, CustomFormSubmission, FormSlotOverride, PoDetail,
} from "@/types/custom-form";
import { getSlotProduction } from "@/lib/production-slots";

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

const localToday = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** A slot form (a version of a production form) carries the production form's standard
 *  fields, so on submit it writes a real row into that slot's production table and shows
 *  up natively in the production views — with real values, no empty columns. Line and PO
 *  come from the form's pickers; production_mapping supplies the rest. One row per
 *  line/PO/day (updated, not duplicated). Non-fatal: never blocks the custom submission. */
async function writeProductionRow(
  config: CustomFormConfig, values: Record<string, unknown>, userId: string,
): Promise<{ written: boolean; reason?: string }> {
  const slot = getSlotProduction(config.template.slot_key);
  if (!slot) return { written: false };
  const mapping = config.template.production_mapping ?? {};
  const factoryId = config.template.factory_id;

  const lineField = config.fields.find((f) => f.field_type === "dynamic_select" && f.source_key === "lines");
  const poField = config.fields.find((f) => f.field_type === "po_select");
  const lineName = lineField ? (values[lineField.key] as string | undefined) : undefined;
  const poNumber = poField ? (values[poField.key] as string | undefined) : undefined;
  if (!lineName || !poNumber) {
    return { written: false, reason: "This form needs a Line field and a PO field for its data to reach the production views." };
  }

  const [{ data: lineRows }, { data: poRow }] = await Promise.all([
    supabase.from("lines").select("id, line_id, name").eq("factory_id", factoryId).eq("is_active", true),
    supabase.from("work_orders").select("id").eq("factory_id", factoryId).eq("po_number", poNumber).maybeSingle(),
  ]);
  const line = ((lineRows as { id: string; line_id: string | null; name: string | null }[]) || [])
    .find((l) => l.name === lineName || l.line_id === lineName);
  const lineId = line?.id;
  const workOrderId = (poRow as { id: string } | null)?.id;
  if (!lineId || !workOrderId) {
    return { written: false, reason: "Couldn't match the selected Line or PO to a production record." };
  }

  const mapped: Record<string, number> = {};
  for (const [friendlyKey, fieldKey] of Object.entries(mapping)) {
    const target = slot.targets.find((t) => t.key === friendlyKey);
    if (!target) continue;
    const raw = values[fieldKey as string];
    const n = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(n)) mapped[target.column] = n;
  }

  const production_date = localToday();
  try {
    const { data: existing } = await supabase
      .from(slot.table as never).select("id")
      .eq("factory_id", factoryId).eq("line_id", lineId).eq("work_order_id", workOrderId)
      .eq("production_date", production_date).maybeSingle();
    if (existing && (existing as { id: string }).id) {
      const { error } = await supabase.from(slot.table as never).update(mapped as never).eq("id", (existing as { id: string }).id);
      if (error) return { written: false, reason: error.message };
    } else {
      const { error } = await supabase.from(slot.table as never).insert({
        factory_id: factoryId, line_id: lineId, work_order_id: workOrderId,
        submitted_by: userId, production_date, ...mapped,
      } as never);
      if (error) return { written: false, reason: error.message };
    }
    return { written: true };
  } catch (e) {
    return { written: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/** Insert a submission (the form keeps its own fields). For a slot form, also writes the
 *  matching production row so it appears in the production views like the default form. */
export async function submitCustomForm(
  config: CustomFormConfig, values: Record<string, unknown>, userId: string | undefined,
): Promise<{ ok: boolean; error?: string; production?: { written: boolean; reason?: string } }> {
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
  const production = await writeProductionRow(config, values, userId);
  return { ok: true, production };
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
