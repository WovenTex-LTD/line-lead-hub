/**
 * send-push-notification
 *
 * Called by the database trigger `on_notification_inserted`.
 * Looks up the user's FCM push tokens and sends a native push via FCM HTTP v1 API.
 *
 * Supports TWO auth methods — set whichever secrets you have:
 *
 * Method A — Service account JSON (preferred, use if org policy allows key creation):
 *   FIREBASE_SERVICE_ACCOUNT  Full service account JSON string
 *                             (Firebase → Project Settings → Service Accounts → Generate key)
 *
 * Method B — OAuth2 refresh token (use when org policy blocks service account keys):
 *   FIREBASE_PROJECT_ID       e.g. "productionportal-3f1e6"
 *   GOOGLE_CLIENT_ID          OAuth2 client ID
 *   GOOGLE_CLIENT_SECRET      OAuth2 client secret
 *   GOOGLE_REFRESH_TOKEN      Long-lived refresh token
 *
 *   How to get these for Method B:
 *   1. Google Cloud Console → APIs & Services → Credentials → Create OAuth 2.0 Client ID
 *      (type: Desktop app) → note client_id and client_secret
 *   2. Open in browser (replace YOUR_CLIENT_ID):
 *      https://accounts.google.com/o/oauth2/auth?client_id=YOUR_CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code&scope=https://www.googleapis.com/auth/firebase.messaging&access_type=offline&prompt=consent
 *   3. Sign in with the Firebase project owner account → copy the auth code
 *   4. Exchange for refresh token:
 *      curl -X POST https://oauth2.googleapis.com/token \
 *        -d "code=AUTH_CODE&client_id=CLIENT_ID&client_secret=CLIENT_SECRET&redirect_uri=urn:ietf:wg:oauth:2.0:oob&grant_type=authorization_code"
 *   5. Copy the "refresh_token" from the response → store as GOOGLE_REFRESH_TOKEN
 *
 * Auto-set by Supabase:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "npm:@supabase/supabase-js@2";

// ── Auth: Method A — service account JWT ──────────────────────────────────────

async function getTokenFromServiceAccount(serviceAccount: any): Promise<string> {
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
    btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const unsigned = `${encode(header)}.${encode(payload)}`;

  const pemKey = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\n/g, "");

  const keyData = Uint8Array.from(atob(pemKey), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", keyData.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(unsigned),
  );

  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const jwt = `${unsigned}.${sig}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!resp.ok) throw new Error(`Service account token error: ${await resp.text()}`);
  return (await resp.json()).access_token as string;
}

// ── Auth: Method B — OAuth2 refresh token ────────────────────────────────────

async function getTokenFromRefreshToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string> {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!resp.ok) throw new Error(`Refresh token error: ${await resp.text()}`);
  return (await resp.json()).access_token as string;
}

// ── Get access token (whichever method is configured) ────────────────────────

async function getAccessToken(): Promise<{ token: string; projectId: string }> {
  // Method A: service account JSON
  const saStr = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
  if (saStr) {
    const sa = JSON.parse(saStr);
    const token = await getTokenFromServiceAccount(sa);
    return { token, projectId: sa.project_id };
  }

  // Method B: refresh token
  const clientId     = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");
  const projectId    = Deno.env.get("FIREBASE_PROJECT_ID");

  if (clientId && clientSecret && refreshToken && projectId) {
    const token = await getTokenFromRefreshToken(clientId, clientSecret, refreshToken);
    return { token, projectId };
  }

  throw new Error(
    "No Firebase auth configured. Set FIREBASE_SERVICE_ACCOUNT or " +
    "FIREBASE_PROJECT_ID + GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN",
  );
}

// ── FCM send ──────────────────────────────────────────────────────────────────

async function sendFcmMessage(
  projectId: string,
  accessToken: string,
  deviceToken: string,
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<{ success: boolean; error?: string }> {
  const resp = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: { title, body },
          data,
          android: {
            priority: "high",
            notification: { sound: "default", channel_id: "production_portal" },
          },
          apns: {
            payload: { aps: { sound: "default", badge: 1 } },
          },
        },
      }),
    },
  );

  if (!resp.ok) {
    const err = await resp.text();
    const isStale = err.includes("UNREGISTERED") || err.includes("INVALID_ARGUMENT");
    return { success: false, error: isStale ? "UNREGISTERED" : err };
  }
  return { success: true };
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const authHeader = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!authHeader.includes(serviceKey)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { user_id, title, message, type, data: notifData } = await req.json();

    if (!user_id || !title) {
      return new Response(JSON.stringify({ error: "user_id and title required" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    // Get FCM access token
    let accessToken: string;
    let projectId: string;
    try {
      ({ token: accessToken, projectId } = await getAccessToken());
    } catch (authErr: any) {
      console.warn("Firebase auth not configured:", authErr.message);
      return new Response(JSON.stringify({ skipped: true, reason: authErr.message }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Fetch user's push tokens
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: tokens, error: tokensError } = await supabase
      .from("push_tokens")
      .select("id, token")
      .eq("user_id", user_id);

    if (tokensError) {
      return new Response(JSON.stringify({ error: tokensError.message }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }

    if (!tokens?.length) {
      return new Response(JSON.stringify({ sent: 0, reason: "no_tokens" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const fcmData: Record<string, string> = {
      type: type ?? "general",
      ...Object.fromEntries(
        Object.entries(notifData ?? {}).map(([k, v]) => [k, String(v)]),
      ),
    };

    const staleIds: string[] = [];
    let sent = 0;

    await Promise.all(
      tokens.map(async (t: { id: string; token: string }) => {
        const result = await sendFcmMessage(
          projectId, accessToken, t.token, title, message ?? "", fcmData,
        );
        if (result.success) sent++;
        else if (result.error === "UNREGISTERED") staleIds.push(t.id);
        else console.warn(`FCM error for token ${t.id}:`, result.error);
      }),
    );

    if (staleIds.length > 0) {
      await supabase.from("push_tokens").delete().in("id", staleIds);
    }

    console.log(`Push: sent ${sent}/${tokens.length}, stale removed: ${staleIds.length}`);
    return new Response(
      JSON.stringify({ sent, total: tokens.length, stale_removed: staleIds.length }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("send-push-notification error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
