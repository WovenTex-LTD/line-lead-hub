import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders } from "../_shared/security.ts";
import {
  validateCreatePo, validateUpdatePo, validateAssignPoLines,
  validateSetPoStatus, validateSetPoExFactory, validateArchivePo,
  type ProposedAction, type ValidationResult,
} from "../_shared/actions/po.ts";

const log = (s: string, d?: unknown) => console.log(`[EXECUTE-ACTION] ${s}${d ? " " + JSON.stringify(d) : ""}`);

function revalidate(kind: string, payload: Record<string, unknown>): ValidationResult {
  switch (kind) {
    case "create_po": return validateCreatePo(payload);
    case "update_po": return validateUpdatePo({ po_number: payload.po_number, ...(payload.fields as object) });
    case "assign_po_lines": return validateAssignPoLines(payload);
    case "set_po_status": return validateSetPoStatus(payload);
    case "set_po_ex_factory": return validateSetPoExFactory(payload);
    case "archive_po": return validateArchivePo(payload);
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

    const body = await req.json() as { kind?: string; payload?: Record<string, unknown> };
    const kind = String(body.kind ?? "");
    const rawPayload = (body.payload ?? {}) as Record<string, unknown>;

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

    // Resolve PO id (factory-scoped) for non-create actions.
    let poId: string | null = null;
    let oldRow: Record<string, unknown> | null = null;
    if (kind !== "create_po") {
      const { data: po } = await userClient
        .from("work_orders").select("*")
        .eq("factory_id", factoryId).eq("po_number", p.po_number as string).maybeSingle();
      if (!po) return json({ ok: false, error: `I couldn't find PO ${p.po_number}.` });
      poId = po.id as string;
      oldRow = po as Record<string, unknown>;
    }

    let summary = action.humanSummary;
    let recordId: string | null = poId;
    let tableName = "work_orders";
    let newData: Record<string, unknown> | null = null;

    if (kind === "create_po") {
      const insert = {
        factory_id: factoryId,
        po_number: p.po_number, buyer: p.buyer, style: p.style,
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
      if (lineIds.length) {
        await userClient.from("work_order_line_assignments").insert(
          lineIds.map((line_id) => ({ work_order_id: data.id, line_id, factory_id: factoryId })),
        );
      }
    } else if (kind === "update_po") {
      const fields = p.fields as Record<string, unknown>;
      const { error } = await userClient.from("work_orders").update(fields).eq("id", poId);
      if (error) return json({ ok: false, error: rlsMsg(error) });
      newData = fields;
    } else if (kind === "assign_po_lines") {
      await userClient.from("work_order_line_assignments").delete().eq("work_order_id", poId);
      const { error } = await userClient.from("work_order_line_assignments").insert(
        (p.line_ids as string[]).map((line_id) => ({ work_order_id: poId, line_id, factory_id: factoryId })),
      );
      if (error) return json({ ok: false, error: rlsMsg(error) });
      tableName = "work_order_line_assignments";
      newData = { line_ids: p.line_ids };
    } else if (kind === "set_po_status") {
      const upd: Record<string, unknown> = {};
      if (p.status !== undefined) upd.status = p.status;
      if (p.is_active !== undefined) upd.is_active = p.is_active;
      const { error } = await userClient.from("work_orders").update(upd).eq("id", poId);
      if (error) return json({ ok: false, error: rlsMsg(error) });
      newData = upd;
    } else if (kind === "set_po_ex_factory") {
      const upd: Record<string, unknown> = {};
      if (p.planned_ex_factory !== undefined) upd.planned_ex_factory = p.planned_ex_factory;
      if (p.actual_ex_factory !== undefined) upd.actual_ex_factory = p.actual_ex_factory;
      const { error } = await userClient.from("work_orders").update(upd).eq("id", poId);
      if (error) return json({ ok: false, error: rlsMsg(error) });
      newData = upd;
    } else if (kind === "archive_po") {
      const { error } = await userClient.from("work_orders").update({ is_active: false, status: "deleted" }).eq("id", poId);
      if (error) return json({ ok: false, error: rlsMsg(error) });
      newData = { is_active: false, status: "deleted" };
    }

    // Audit via service client (audit_log RLS is admin-read; service bypasses).
    await admin.from("audit_log").insert({
      factory_id: factoryId, user_id: user.id,
      action: kind === "create_po" ? "INSERT" : "UPDATE",
      table_name: tableName, record_id: recordId,
      old_data: oldRow, new_data: newData,
    });

    log("done", { kind, recordId });
    return json({ ok: true, summary, recordId });
  } catch (e) {
    log("ERROR", { message: e instanceof Error ? e.message : String(e) });
    return json({ ok: false, error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
