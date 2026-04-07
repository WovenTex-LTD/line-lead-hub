import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders } from "../_shared/security.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { factoryId, referenceNumber, approvedBy, submittedBy, dispatchRequestId } = await req.json();

    if (!factoryId || !submittedBy || !dispatchRequestId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check the gate officer's notification preference for dispatch_approved
    const { data: pref } = await supabase
      .from("notification_preferences")
      .select("in_app_enabled")
      .eq("user_id", submittedBy)
      .eq("notification_type", "dispatch_approved")
      .single();

    // Default to enabled if no preference row exists
    const inAppEnabled = pref ? pref.in_app_enabled !== false : true;

    if (!inAppEnabled) {
      return new Response(
        JSON.stringify({ success: true, message: "Notification disabled by user preference" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { error } = await supabase.from("notifications").insert({
      factory_id: factoryId,
      user_id: submittedBy,
      type: "dispatch_approved",
      title: "Dispatch Approved",
      message: `Your dispatch request ${referenceNumber} has been approved by ${approvedBy || "Admin"}.`,
      data: { dispatch_request_id: dispatchRequestId, reference_number: referenceNumber },
      is_read: false,
    });

    if (error) throw error;

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    console.error("Error in notify-dispatch-approved:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to send notification" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
