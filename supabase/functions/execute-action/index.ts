import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders } from "../_shared/security.ts";
import {
  validateCreatePo, validateUpdatePo, validateAssignPoLines,
  validateSetPoStatus, validateSetPoExFactory, validateArchivePo,
  validateRecordProduction, validateResolveBlocker, validateNotifyUser, validateCreateReminder,
  type ProposedAction, type ValidationResult,
} from "../_shared/actions/po.ts";
import { validateCreateCustomForm, validateUpdateCustomForm } from "../_shared/actions/forms.ts";

const log = (s: string, d?: unknown) => console.log(`[EXECUTE-ACTION] ${s}${d ? " " + JSON.stringify(d) : ""}`);

function revalidate(kind: string, payload: Record<string, unknown>): ValidationResult {
  switch (kind) {
    case "create_po": return validateCreatePo(payload);
    case "update_po": return validateUpdatePo({ po_number: payload.po_number, ...(payload.fields as object) });
    case "assign_po_lines": return validateAssignPoLines(payload);
    case "set_po_status": return validateSetPoStatus(payload);
    case "set_po_ex_factory": return validateSetPoExFactory(payload);
    case "archive_po": return validateArchivePo(payload);
    case "record_production": return validateRecordProduction(payload);
    case "resolve_blocker": return validateResolveBlocker(payload);
    case "notify_user": return validateNotifyUser(payload);
    case "create_reminder": return validateCreateReminder(payload);
    case "create_custom_form": return validateCreateCustomForm(payload);
    case "update_custom_form": return validateUpdateCustomForm(payload);
    default: return { ok: false, error: `Unknown action: ${kind}` };
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "Not authenticated" }, 401);
    const token = authHeader.replace("Bearer ", "");

    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) return json({ ok: false, error: "Not authenticated" }, 401);
    const user = userData.user;

    const { data: profile } = await admin.from("profiles").select("factory_id").eq("id", user.id).single();
    const factoryId = profile?.factory_id;
    if (!factoryId) return json({ ok: false, error: "Your account isn't linked to a factory." }, 400);

    const body = await req.json() as { kind?: string; payload?: Record<string, unknown>; conversation_id?: string };
    const kind = String(body.kind ?? "");
    const rawPayload = (body.payload ?? {}) as Record<string, unknown>;

    // Record the approved change back into the chat so Lina knows it is done and
    // never re-proposes it on the next turn. Ownership-checked; failures are non-fatal.
    const recordApproval = async (summary: string) => {
      const convId = body.conversation_id;
      if (!convId) return;
      try {
        const { data: conv } = await admin
          .from("chat_conversations").select("user_id").eq("id", convId).single();
        if (conv?.user_id !== user.id) return;
        await admin.from("chat_messages").insert({
          conversation_id: convId,
          role: "assistant",
          content: `Applied (you approved): ${summary}`,
        });
      } catch (e) {
        log("recordApproval failed", { message: e instanceof Error ? e.message : String(e) });
      }
    };

    // Re-validate server-side (never trust the client). factory_id is server-derived.
    const v = revalidate(kind, rawPayload);
    if (!v.ok) return json({ ok: false, error: v.error });
    const action: ProposedAction = v.action;
    const p = action.payload;

    // User-scoped client → RLS enforces exactly what this user may do.
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } },
    );

    const rlsMsg = (e: { message?: string } | null) =>
      e?.message?.toLowerCase().includes("row-level security")
        ? "You don't have permission to make that change."
        : (e?.message ?? "The change could not be applied.");

    // Every line UUID must be one of THIS factory's lines (payloads come from the client).
    const linesBelongToFactory = async (lineIds: string[]): Promise<boolean> => {
      if (lineIds.length === 0) return true;
      const { data } = await userClient.from("lines").select("id").eq("factory_id", factoryId).in("id", lineIds);
      return (data?.length ?? 0) === lineIds.length;
    };

    // Custom-form creation writes to its own tables and returns early.
    if (kind === "create_custom_form") {
      const { data: tpl, error: tplErr } = await userClient
        .from("custom_form_templates")
        .insert({ factory_id: factoryId, name: p.name, description: p.description ?? null, target_role: p.target_role ?? null, slot_key: p.slot_key ?? null, production_mapping: p.production_mapping ?? null, created_by: user.id })
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
        formula: f.formula ?? null,
        auto_source: f.auto_source ?? null,
        source_key: f.source_key ?? null,
        metric_role: f.metric_role ?? null,
        sort_order: typeof f.sort_order === "number" ? f.sort_order : 0,
      }));
      const { data: inserted, error: fErr } = await userClient
        .from("custom_form_fields").insert(rows).select("id");
      if (fErr || !inserted?.length) {
        return json({ ok: false, error: rlsMsg(fErr) || "The form was created but its fields could not be added." });
      }
      await admin.from("audit_log").insert({
        factory_id: factoryId, user_id: user.id, action: "INSERT",
        table_name: "custom_form_templates", record_id: tpl.id,
        old_data: null, new_data: { name: p.name, field_count: rows.length },
      });
      log("done", { kind, recordId: tpl.id });
      await recordApproval(action.humanSummary);
      return json({ ok: true, summary: action.humanSummary, recordId: tpl.id });
    }

    // Custom-form update (edit-by-name): replace the existing form's field set. Returns early.
    // v1 notes: if two active forms share a name we intentionally edit the most-recent one;
    // and the delete+reinsert below is non-atomic (a reinsert failure leaves the form field-less
    // and returns an honest error — recoverable by re-running; past submissions keep fields_snapshot).
    if (kind === "update_custom_form") {
      const { data: tpl, error: findErr } = await userClient
        .from("custom_form_templates").select("id, version")
        .eq("factory_id", factoryId).eq("name", p.name).eq("status", "active")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (findErr) return json({ ok: false, error: rlsMsg(findErr) });
      if (!tpl) return json({ ok: false, error: `I couldn't find an active form named "${p.name}".` });

      // Replace fields (delete + reinsert; the unique (template_id, key) constraint rules out soft-replace).
      const { error: delErr } = await userClient.from("custom_form_fields").delete().eq("template_id", tpl.id);
      if (delErr) return json({ ok: false, error: rlsMsg(delErr) });
      const fields = Array.isArray(p.fields) ? (p.fields as Record<string, unknown>[]) : [];
      const rows = fields.map((f) => ({
        template_id: tpl.id,
        section_label: f.section_label ?? null,
        section_order: typeof f.section_order === "number" ? f.section_order : 0,
        key: f.key, label: f.label, field_type: f.field_type,
        is_required: f.is_required === true,
        options: f.options ?? null,
        formula: f.formula ?? null,
        auto_source: f.auto_source ?? null,
        source_key: f.source_key ?? null,
        metric_role: f.metric_role ?? null,
        sort_order: typeof f.sort_order === "number" ? f.sort_order : 0,
      }));
      const { data: inserted, error: fErr } = await userClient
        .from("custom_form_fields").insert(rows).select("id");
      if (fErr || !inserted?.length) {
        return json({ ok: false, error: rlsMsg(fErr) || "The form's fields could not be updated." });
      }
      {
        const tplUpdate: Record<string, unknown> = { version: (typeof tpl.version === "number" ? tpl.version : 1) + 1 };
        if (p.production_mapping !== undefined) tplUpdate.production_mapping = p.production_mapping ?? null;
        await userClient.from("custom_form_templates").update(tplUpdate).eq("id", tpl.id);
      }
      await admin.from("audit_log").insert({
        factory_id: factoryId, user_id: user.id, action: "UPDATE",
        table_name: "custom_form_templates", record_id: tpl.id,
        old_data: null, new_data: { name: p.name, field_count: rows.length },
      });
      log("done", { kind, recordId: tpl.id });
      await recordApproval(action.humanSummary);
      return json({ ok: true, summary: action.humanSummary, recordId: tpl.id });
    }

    // Resolve PO id (factory-scoped) for non-create actions. Match flexibly:
    // po_number is often stored as "PO 86538" while users/Lina pass the bare
    // order number "86538", so try exact, then order_number, then prefix/contains.
    let poId: string | null = null;
    let oldRow: Record<string, unknown> | null = null;
    if (kind !== "create_po" && kind !== "notify_user" && kind !== "create_reminder") {
      const raw = String(p.po_number ?? "").trim();
      const bare = raw.replace(/^po[\s#:_-]*/i, "").trim();
      const base = () => userClient.from("work_orders").select("*").eq("factory_id", factoryId);
      const attempts = [
        () => base().eq("po_number", raw),
        () => base().ilike("po_number", raw),
        () => base().eq("order_number", bare),
        () => base().or(`po_number.ilike.PO ${bare},po_number.ilike.${bare},order_number.ilike.${bare}`),
      ];
      let po: Record<string, unknown> | null = null;
      let ambiguous = false;
      for (const run of attempts) {
        const { data } = await run().limit(2);
        if (data && data.length === 1) { po = data[0] as Record<string, unknown>; break; }
        if (data && data.length > 1) { ambiguous = true; break; }
      }
      if (ambiguous) return json({ ok: false, error: `Several POs match "${p.po_number}". Please give the exact PO number.` });
      if (!po) return json({ ok: false, error: `I couldn't find PO ${p.po_number}.` });
      poId = po.id as string;
      oldRow = po;
    }

    let summary = action.humanSummary;
    let recordId: string | null = poId;
    let tableName = "work_orders";
    let newData: Record<string, unknown> | null = null;

    if (kind === "create_po") {
      const insert = {
        factory_id: factoryId,
        po_number: p.po_number, buyer: p.buyer, style: p.style,
        order_number: p.order_number ?? null,
        item: p.item, color: p.color, order_qty: p.order_qty,
        smv: p.smv, cm_per_dozen: p.cm_per_dozen,
        target_per_hour: p.target_per_hour, target_per_day: p.target_per_day,
        planned_ex_factory: p.planned_ex_factory, status: p.status, is_active: true,
        // style_order_id is nullable (migration 20260506140000) — omitted intentionally.
      };
      const { data, error } = await userClient.from("work_orders").insert(insert).select("id").single();
      if (error) {
        if (error.code === "23505") return json({ ok: false, error: `PO ${p.po_number} already exists.` });
        return json({ ok: false, error: rlsMsg(error) });
      }
      recordId = data.id;
      newData = insert;
      const lineIds = Array.isArray(p.line_ids) ? (p.line_ids as string[]) : [];
      if (lineIds.length && !(await linesBelongToFactory(lineIds))) {
        summary = `${summary} (created, but those lines aren't in your factory — please assign lines manually)`;
      } else if (lineIds.length) {
        const { data: laData, error: laError } = await userClient.from("work_order_line_assignments").insert(
          lineIds.map((line_id) => ({ work_order_id: data.id, line_id, factory_id: factoryId })),
        ).select("id");
        if (laError || !laData?.length) {
          summary = `${summary} (created, but I couldn't assign the line(s) — please set them manually)`;
        }
      }
    } else if (kind === "update_po") {
      const fields = p.fields as Record<string, unknown>;
      const { data, error } = await userClient.from("work_orders").update(fields).eq("id", poId).select("id");
      if (error) return json({ ok: false, error: rlsMsg(error) });
      if (!data?.length) return json({ ok: false, error: "You don't have permission to make that change." });
      newData = fields;
    } else if (kind === "assign_po_lines") {
      if (!(await linesBelongToFactory(p.line_ids as string[]))) {
        return json({ ok: false, error: "One or more of those lines don't exist in your factory. Please ask Lina to propose the assignment again." });
      }
      const { error: delError } = await userClient.from("work_order_line_assignments").delete().eq("work_order_id", poId);
      if (delError) return json({ ok: false, error: rlsMsg(delError) });
      const { data, error } = await userClient.from("work_order_line_assignments").insert(
        (p.line_ids as string[]).map((line_id) => ({ work_order_id: poId, line_id, factory_id: factoryId })),
      ).select("id");
      if (error) return json({ ok: false, error: rlsMsg(error) });
      if (!data?.length) return json({ ok: false, error: "You don't have permission to make that change." });
      tableName = "work_order_line_assignments";
      newData = { line_ids: p.line_ids };
    } else if (kind === "set_po_status") {
      const upd: Record<string, unknown> = {};
      if (p.status !== undefined) upd.status = p.status;
      if (p.is_active !== undefined) upd.is_active = p.is_active;
      const { data, error } = await userClient.from("work_orders").update(upd).eq("id", poId).select("id");
      if (error) return json({ ok: false, error: rlsMsg(error) });
      if (!data?.length) return json({ ok: false, error: "You don't have permission to make that change." });
      newData = upd;
    } else if (kind === "set_po_ex_factory") {
      const upd: Record<string, unknown> = {};
      if (p.planned_ex_factory !== undefined) upd.planned_ex_factory = p.planned_ex_factory;
      if (p.actual_ex_factory !== undefined) upd.actual_ex_factory = p.actual_ex_factory;
      const { data, error } = await userClient.from("work_orders").update(upd).eq("id", poId).select("id");
      if (error) return json({ ok: false, error: rlsMsg(error) });
      if (!data?.length) return json({ ok: false, error: "You don't have permission to make that change." });
      newData = upd;
    } else if (kind === "archive_po") {
      const { data, error } = await userClient.from("work_orders").update({ is_active: false, status: "deleted" }).eq("id", poId).select("id");
      if (error) return json({ ok: false, error: rlsMsg(error) });
      if (!data?.length) return json({ ok: false, error: "You don't have permission to make that change." });
      newData = { is_active: false, status: "deleted" };
    } else if (kind === "record_production") {
      // Backfill end-of-day output so the PO's progress % reflects reality.
      const orderQty = Number((oldRow as Record<string, unknown>)?.order_qty) || 0;
      const toFull = p.to_full === true;
      const prodDate = (typeof p.production_date === "string" && p.production_date) ? p.production_date : new Date().toISOString().slice(0, 10);
      const sewQty = toFull ? orderQty : (typeof p.sewing_qty === "number" ? p.sewing_qty : undefined);
      const finQty = toFull ? orderQty : (typeof p.finishing_qty === "number" ? p.finishing_qty : undefined);

      // sewing_actuals.line_id is NOT NULL; finishing_daily_logs.line_id is nullable (dept-wide).
      let lineId: string | null = null;
      const { data: la } = await userClient.from("work_order_line_assignments")
        .select("line_id").eq("factory_id", factoryId).eq("work_order_id", poId).limit(1);
      lineId = (la?.[0]?.line_id as string) ?? null;
      if (!lineId) {
        const { data: wo2 } = await userClient.from("work_orders").select("line_id").eq("id", poId).maybeSingle();
        lineId = (wo2?.line_id as string) ?? null;
      }

      const done: string[] = [];
      if (finQty !== undefined) {
        const { error } = await userClient.rpc("upsert_custom_production_row", {
          p_table: "finishing_daily_logs", p_factory_id: factoryId, p_line_id: lineId, p_work_order_id: poId,
          p_production_date: prodDate,
          p_values: { log_type: "OUTPUT", poly: finQty, m_power_actual: 1, actual_hours: 1 },
          p_custom_data: { source: "lina_backfill" },
        });
        if (error) return json({ ok: false, error: rlsMsg(error) || "Could not record finishing output." });
        done.push(`finishing ${finQty.toLocaleString()}`);
      }
      if (sewQty !== undefined) {
        if (!lineId) {
          done.push("(sewing skipped — PO has no assigned line)");
        } else {
          const { error } = await userClient.rpc("upsert_custom_production_row", {
            p_table: "sewing_actuals", p_factory_id: factoryId, p_line_id: lineId, p_work_order_id: poId,
            p_production_date: prodDate,
            p_values: { good_today: sewQty, manpower_actual: 1, hours_actual: 1, actual_stage_progress: 100 },
            p_custom_data: { source: "lina_backfill" },
          });
          if (error) return json({ ok: false, error: rlsMsg(error) || "Could not record sewing output." });
          done.push(`sewing ${sewQty.toLocaleString()}`);
        }
      }
      if (!done.length) return json({ ok: false, error: "Nothing to record — give me a sewing and/or finishing quantity." });
      summary = `Recorded production for PO ${p.po_number}: ${done.join(", ")} on ${prodDate}.`;
      tableName = finQty !== undefined ? "finishing_daily_logs" : "sewing_actuals";
      newData = { production_date: prodDate, recorded: done };
    } else if (kind === "resolve_blocker") {
      // Close every open/in-progress blocker on this PO across both update tables.
      const today = new Date().toISOString().slice(0, 10);
      const note = typeof p.resolution_note === "string" && p.resolution_note ? p.resolution_note : null;
      const upd: Record<string, unknown> = { blocker_status: "resolved", blocker_resolution_date: today };
      if (note) upd.action_taken_today = note;
      let resolved = 0;
      for (const table of ["production_updates_sewing", "production_updates_finishing"]) {
        const { data, error } = await userClient.from(table)
          .update(upd)
          .eq("factory_id", factoryId)
          .eq("work_order_id", poId)
          .eq("has_blocker", true)
          .in("blocker_status", ["open", "in_progress"])
          .select("id");
        if (error) return json({ ok: false, error: rlsMsg(error) });
        resolved += data?.length ?? 0;
      }
      if (resolved === 0) return json({ ok: false, error: `No open blockers found for PO ${p.po_number}.` });
      summary = `Resolved ${resolved} blocker${resolved === 1 ? "" : "s"} on PO ${p.po_number}${note ? ` — ${note}` : ""}.`;
      tableName = "production_updates";
      newData = upd;
    } else if (kind === "notify_user") {
      // Resolve recipients (factory-scoped) then insert one notification per user.
      // Notifications have no INSERT RLS policy, so the service client must write.
      const recipients = new Set<string>();
      const toUserName = typeof p.to_user_name === "string" ? p.to_user_name.trim() : "";
      const toLine = typeof p.to_line === "string" ? p.to_line.trim() : "";
      const toRole = typeof p.to_role === "string" ? p.to_role.trim() : "";

      if (toUserName) {
        const { data } = await admin.from("profiles")
          .select("id, full_name").eq("factory_id", factoryId)
          .ilike("full_name", `%${toUserName}%`).limit(5);
        if (!data || data.length === 0) return json({ ok: false, error: `I couldn't find anyone named "${toUserName}" in your factory.` });
        if (data.length > 1) return json({ ok: false, error: `Several people match "${toUserName}" — give the exact full name.` });
        recipients.add(data[0].id as string);
      }

      if (toLine) {
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        const n = norm(toLine);
        const { data: lines } = await admin.from("lines")
          .select("id, line_id, name").eq("factory_id", factoryId).eq("is_active", true);
        const match = (lines ?? []).find((l: Record<string, unknown>) => {
          const lid = norm(String(l.line_id ?? "")); const nm = norm(String(l.name ?? ""));
          return lid === n || nm === n || (/^\d+$/.test(n) && (lid === `line${n}` || nm === `line${n}`));
        });
        if (!match) return json({ ok: false, error: `I couldn't find line "${toLine}".` });
        const { data: assigned } = await admin.from("user_line_assignments")
          .select("user_id").eq("factory_id", factoryId).eq("line_id", (match as Record<string, unknown>).id);
        if (!assigned || assigned.length === 0) return json({ ok: false, error: `No one is assigned to ${String((match as Record<string, unknown>).name ?? toLine)} yet.` });
        assigned.forEach((r: Record<string, unknown>) => recipients.add(r.user_id as string));
      }

      if (toRole) {
        const { data: roles } = await admin.from("user_roles")
          .select("user_id").eq("factory_id", factoryId).eq("role", toRole);
        if (!roles || roles.length === 0) return json({ ok: false, error: `There are no ${toRole}s in your factory.` });
        roles.forEach((r: Record<string, unknown>) => recipients.add(r.user_id as string));
      }

      if (recipients.size === 0) return json({ ok: false, error: "I couldn't resolve any recipients." });

      const rows = Array.from(recipients).map((uid) => ({
        factory_id: factoryId, user_id: uid, type: "message",
        title: p.title ?? "Message from your team", message: p.message,
        data: { from_action: "notify_user", sent_by: user.id }, is_read: false,
      }));
      const { error: nErr } = await admin.from("notifications").insert(rows);
      if (nErr) return json({ ok: false, error: rlsMsg(nErr) });

      summary = `Sent "${p.title}" to ${recipients.size} recipient${recipients.size === 1 ? "" : "s"}.`;
      recordId = null;
      tableName = "notifications";
      newData = { recipients: recipients.size };
    } else if (kind === "create_reminder") {
      // Store via the SECURITY DEFINER RPC, which resolves the factory timezone
      // and writes a reminder for auth.uid(). The 5-min cron delivers it when due.
      const { data, error } = await userClient.rpc("create_reminder", {
        p_title: p.title ?? "Reminder",
        p_message: p.message,
        p_due_date: p.due_date,
        p_due_time: p.due_time ?? "09:00",
      });
      if (error) return json({ ok: false, error: rlsMsg(error) });
      summary = `Reminder set for ${p.due_date} at ${p.due_time ?? "09:00"}: "${p.message}".`;
      recordId = (typeof data === "string" ? data : null);
      tableName = "reminders";
      newData = { due_date: p.due_date, due_time: p.due_time ?? "09:00" };
    }

    // Audit via service client (audit_log RLS is admin-read; service bypasses).
    await admin.from("audit_log").insert({
      factory_id: factoryId, user_id: user.id,
      action: kind === "create_po" ? "INSERT" : "UPDATE",
      table_name: tableName, record_id: recordId,
      old_data: oldRow, new_data: newData,
    });

    log("done", { kind, recordId });
    await recordApproval(summary);
    return json({ ok: true, summary, recordId });
  } catch (e) {
    log("ERROR", { message: e instanceof Error ? e.message : String(e) });
    return json({ ok: false, error: "Something went wrong applying that change. Please try again." }, 500);
  }
});
