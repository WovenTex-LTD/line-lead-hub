import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders } from "../_shared/security.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { factoryId, referenceNumber, submittedBy, dispatchQuantity, destination, dispatchRequestId } = await req.json();

    if (!factoryId || !dispatchRequestId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find admin/owner users for this factory
    const { data: adminRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("factory_id", factoryId)
      .in("role", ["admin", "owner", "supervisor"]);

    if (rolesError) throw rolesError;

    const adminUserIds = [...new Set((adminRoles || []).map((r: any) => r.user_id))];

    if (adminUserIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No admins to notify" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check preferences (type: dispatch_submitted)
    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("user_id, in_app_enabled")
      .eq("notification_type", "dispatch_submitted")
      .in("user_id", adminUserIds);

    const prefsMap = new Map((prefs || []).map((p: any) => [p.user_id, p.in_app_enabled]));

    const notifications = [];
    for (const userId of adminUserIds) {
      const enabled = prefsMap.get(userId) ?? true;
      if (enabled === false) continue;

      notifications.push({
        factory_id: factoryId,
        user_id: userId,
        type: "dispatch_submitted",
        title: "New Dispatch Request",
        message: `${submittedBy || "Gate Officer"} submitted dispatch ${referenceNumber} — ${dispatchQuantity?.toLocaleString() ?? 0} pcs to ${destination || "unknown destination"}.`,
        data: { dispatch_request_id: dispatchRequestId, reference_number: referenceNumber },
        is_read: false,
      });
    }

    if (notifications.length > 0) {
      const { error } = await supabase.from("notifications").insert(notifications);
      if (error) throw error;
    }

    return new Response(
      JSON.stringify({ success: true, notificationsCreated: notifications.length }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    console.error("Error in notify-dispatch-submitted:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to send notification" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
