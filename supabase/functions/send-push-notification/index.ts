/**
 * send-push-notification
 *
 * Called by the database trigger `on_notification_inserted`.
 * Looks up the user's FCM push tokens and sends a native push via FCM HTTP v1 API.
 *
 * Required Supabase secrets:
 *   FIREBASE_SERVICE_ACCOUNT  - Full service account JSON string from Firebase Console
 *                               (Project Settings → Service Accounts → Generate new private key)
 *   SUPABASE_URL              - Auto-set by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY - Auto-set by Supabase
 */

import { createClient } from "npm:@supabase/supabase-js@2";

// ── FCM v1 helpers ────────────────────────────────────────────────────────────

/** Build a signed JWT for Google OAuth2 using the service account. */
async function getAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  };

  const encode = (obj: object) =>
    btoa(JSON.stringify(obj))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  const unsigned = `${encode(header)}.${encode(payload)}`;

  // Import the private key
  const pemKey = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\n/g, "");

  const keyData = Uint8Array.from(atob(pemKey), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsigned),
  );

  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const jwt = `${unsigned}.${sig}`;

  // Exchange JWT for access token
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Failed to get FCM access token: ${err}`);
  }

  const json = await resp.json();
  return json.access_token as string;
}

/** Send a single FCM message to one device token. */
async function sendFcmMessage(
  projectId: string,
  accessToken: string,
  deviceToken: string,
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<{ success: boolean; error?: string }> {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  const message = {
    message: {
      token: deviceToken,
      notification: { title, body },
      data,
      android: {
        priority: "high",
        notification: {
          sound: "default",
          channel_id: "production_portal",
          click_action: "FLUTTER_NOTIFICATION_CLICK",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
    },
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });

  if (!resp.ok) {
    const err = await resp.text();
    // Token not registered — caller should delete it
    const isInvalid =
      err.includes("UNREGISTERED") || err.includes("INVALID_ARGUMENT");
    return { success: false, error: isInvalid ? "UNREGISTERED" : err };
  }

  return { success: true };
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  // Only accept internal calls (from DB trigger via service role)
  const authHeader = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!authHeader.includes(serviceKey)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { user_id, title, message, type, data: notifData } = body;

    if (!user_id || !title) {
      return new Response(JSON.stringify({ error: "user_id and title required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Parse Firebase service account
    const serviceAccountStr = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    if (!serviceAccountStr) {
      console.warn("FIREBASE_SERVICE_ACCOUNT secret not set — skipping push");
      return new Response(JSON.stringify({ skipped: true, reason: "no_firebase" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const serviceAccount = JSON.parse(serviceAccountStr);
    const projectId = serviceAccount.project_id;

    // Get OAuth2 access token
    const accessToken = await getAccessToken(serviceAccount);

    // Look up all push tokens for this user
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: tokens, error: tokensError } = await supabase
      .from("push_tokens")
      .select("id, token, platform")
      .eq("user_id", user_id);

    if (tokensError) {
      console.error("Failed to fetch push tokens:", tokensError.message);
      return new Response(JSON.stringify({ error: tokensError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no_tokens" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Build data payload (all values must be strings for FCM)
    const fcmData: Record<string, string> = {
      type: type ?? "general",
      ...Object.fromEntries(
        Object.entries(notifData ?? {}).map(([k, v]) => [k, String(v)]),
      ),
    };

    // Send to each device token
    const staleTokenIds: string[] = [];
    let sent = 0;

    await Promise.all(
      tokens.map(async (t: { id: string; token: string; platform: string }) => {
        const result = await sendFcmMessage(
          projectId,
          accessToken,
          t.token,
          title,
          message ?? "",
          fcmData,
        );

        if (result.success) {
          sent++;
        } else if (result.error === "UNREGISTERED") {
          staleTokenIds.push(t.id);
        } else {
          console.warn(`FCM error for token ${t.id}:`, result.error);
        }
      }),
    );

    // Remove stale tokens
    if (staleTokenIds.length > 0) {
      await supabase.from("push_tokens").delete().in("id", staleTokenIds);
    }

    console.log(
      `Push sent: ${sent}/${tokens.length}, stale removed: ${staleTokenIds.length}`,
    );

    return new Response(
      JSON.stringify({ sent, total: tokens.length, stale_removed: staleTokenIds.length }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("send-push-notification error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
