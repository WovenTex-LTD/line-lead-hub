import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/security.ts";

interface InviteRequest {
  email: string;
  fullName: string;
  factoryId: string;
  role: string;
  department?: string;
  lineIds?: string[];
  temporaryPassword?: string; // Optional: if provided, use this instead of random password
  buyerCompanyName?: string;
  workOrderIds?: string[]; // PO access for buyer role
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Admin client with service role
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify the caller is authenticated and has admin rights
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: callerUser }, error: authError } = await adminClient.auth.getUser(token);
    
    if (authError || !callerUser) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if caller has admin role for the factory
    const { data: callerRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUser.id);

    const isAdminOrHigher = callerRoles?.some(r => 
      ["admin", "owner"].includes(r.role)
    );

    if (!isAdminOrHigher) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: InviteRequest = await req.json();
    const { email, fullName, factoryId, role, department, lineIds, temporaryPassword, buyerCompanyName, workOrderIds } = body;

    if (!email || !fullName || !factoryId || !role) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let userId: string;
    let isExistingUser = false;

    // Look up user by email via the profiles table (avoids listUsers pagination limits)
    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    let existingUser: { id: string } | null = null;
    if (existingProfile) {
      // Verify user still exists in auth
      const { data: authUser } = await adminClient.auth.admin.getUserById(existingProfile.id);
      if (authUser?.user) {
        existingUser = { id: authUser.user.id };
      }
    }

    if (existingUser) {
      userId = existingUser.id;
      isExistingUser = true;
    } else {
      // Create user with admin API (doesn't trigger client-side auth change)
      // Use provided password or generate a random one
      const password = temporaryPassword || (crypto.randomUUID() + crypto.randomUUID());
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto-confirm since admin is inviting
        user_metadata: {
          full_name: fullName,
          invited_by_admin: "true",
          factory_id: factoryId,
        },
      });

      if (createError) {
        console.error("Create user error:", createError);
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      userId = newUser.user.id;
    }

    // ── BUYER-SPECIFIC BRANCH ──────────────────────────────────────────────
    // Buyers can belong to multiple factories. We must NOT delete old factory
    // associations (they belong to other workspaces). Only set factory_id on
    // profile if user is new or has no factory_id yet.
    if (role === "buyer") {
      const { data: existingProfile } = await adminClient
        .from("profiles")
        .select("factory_id")
        .eq("id", userId)
        .single();

      // Only set factory_id if not already set (new user or first workspace)
      const profileUpdate: Record<string, unknown> = {
        full_name: fullName,
        invitation_status: isExistingUser ? undefined : "pending",
      };
      if (!existingProfile?.factory_id) {
        profileUpdate.factory_id = factoryId;
      }
      if (buyerCompanyName) {
        profileUpdate.buyer_company_name = buyerCompanyName;
      }

      const { error: profileError } = await adminClient
        .from("profiles")
        .update(profileUpdate)
        .eq("id", userId);

      if (profileError) {
        console.error("Profile update error:", profileError);
      }

      // Ensure buyer role exists for this factory (don't delete other factory roles)
      const { data: existingRole } = await adminClient
        .from("user_roles")
        .select("id")
        .eq("user_id", userId)
        .eq("role", "buyer")
        .eq("factory_id", factoryId)
        .maybeSingle();

      if (!existingRole) {
        const { error: roleError } = await adminClient
          .from("user_roles")
          .insert({ user_id: userId, role: "buyer", factory_id: factoryId });

        if (roleError) {
          console.error("Role assignment error:", roleError);
          return new Response(JSON.stringify({ error: "Failed to assign role" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Create or reactivate factory membership
      await adminClient
        .from("buyer_factory_memberships")
        .upsert({
          user_id: userId,
          factory_id: factoryId,
          is_active: true,
          company_name: buyerCompanyName || null,
          invited_by: callerUser.id,
        }, { onConflict: "user_id,factory_id" });

      // Handle buyer PO access
      if (workOrderIds && workOrderIds.length > 0) {
        // Delete existing PO access for this user in THIS factory only
        await adminClient
          .from("buyer_po_access")
          .delete()
          .eq("user_id", userId)
          .eq("factory_id", factoryId);

        // Insert new PO access rows
        const poAccess = workOrderIds.map(woId => ({
          user_id: userId,
          work_order_id: woId,
          factory_id: factoryId,
          granted_by: callerUser.id,
        }));

        const { error: poError } = await adminClient
          .from("buyer_po_access")
          .insert(poAccess);

        if (poError) {
          console.error("Buyer PO access error:", poError);
        }
      }
    }
    // ── NON-BUYER BRANCH (factory users) ────────────────────────────────────
    else {
      const { data: existingProfile } = await adminClient
        .from("profiles")
        .select("factory_id")
        .eq("id", userId)
        .single();

      if (existingProfile?.factory_id && existingProfile.factory_id !== factoryId) {
        await adminClient
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("factory_id", existingProfile.factory_id);

        await adminClient
          .from("user_line_assignments")
          .delete()
          .eq("user_id", userId)
          .eq("factory_id", existingProfile.factory_id);

        await adminClient
          .from("notification_preferences")
          .delete()
          .eq("user_id", userId)
          .eq("factory_id", existingProfile.factory_id);

        console.log("Cleaned up old factory associations", {
          userId,
          oldFactoryId: existingProfile.factory_id,
          newFactoryId: factoryId,
        });
      }

      const profileUpdate: Record<string, unknown> = {
        factory_id: factoryId,
        full_name: fullName,
        department: role === "sewing" ? "sewing"
          : role === "finishing" ? "finishing"
          : role === "worker" ? (department || null)
          : null,
        invitation_status: "pending",
      };

      const { error: profileError } = await adminClient
        .from("profiles")
        .update(profileUpdate)
        .eq("id", userId);

      if (profileError) {
        console.error("Profile update error:", profileError);
      }

      // Remove existing roles for this factory
      await adminClient
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("factory_id", factoryId);

      // Remove accidental global admin role
      await adminClient
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .is("factory_id", null)
        .eq("role", "admin");

      // Assign new role
      const { error: roleError } = await adminClient
        .from("user_roles")
        .insert({
          user_id: userId,
          role: role,
          factory_id: factoryId,
        });

      if (roleError) {
        console.error("Role assignment error:", roleError);
        return new Response(JSON.stringify({ error: "Failed to assign role" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Handle line assignments
      if (lineIds && lineIds.length > 0) {
        await adminClient
          .from("user_line_assignments")
          .delete()
          .eq("user_id", userId);

        const assignments = lineIds.map(lineId => ({
          user_id: userId,
          line_id: lineId,
          factory_id: factoryId,
        }));

        await adminClient.from("user_line_assignments").insert(assignments);
      }
    }

    // Send password reset email so user can set their password
    const origin = req.headers.get("origin") || "https://productionportal.cloud";
    const { error: resetError } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${origin}/reset-password`,
      },
    });

    if (resetError) {
      console.error("Reset link error:", resetError);
    }

    // Also trigger a password reset email
    await adminClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/reset-password`,
    });

    return new Response(
      JSON.stringify({
        success: true,
        userId,
        isExistingUser,
        message: `User ${isExistingUser ? "updated" : "created"} successfully`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
