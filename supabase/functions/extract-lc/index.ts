import { createClient } from "jsr:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// CORS (inlined from admin-invite-user pattern)
// ---------------------------------------------------------------------------
const ALLOWED_ORIGINS = [
  "https://productionportal.cloud",
  "https://www.productionportal.cloud",
  "https://woventex.co",
  "https://www.woventex.co",
  "capacitor://localhost",
  "http://localhost",
  "tauri://localhost",
  "https://tauri.localhost",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:8100",
];
function getCorsHeaders(origin: string | null): Record<string, string> {
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    };
  }
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  };
}

// ---------------------------------------------------------------------------
// Anthropic API constants
// ---------------------------------------------------------------------------
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4096;

// ---------------------------------------------------------------------------
// Extraction prompt
// ---------------------------------------------------------------------------
const EXTRACTION_SYSTEM_PROMPT = `You are a specialist in reading and extracting structured data from bank Letters of Credit (LC), SWIFT MT700/MT710/MT720 messages, LC advices, and related trade finance documents commonly used in the garment and textile industry.

Your task is to examine the document image/PDF and extract every field listed below. Return ONLY a valid JSON object — no markdown fences, no commentary.

## Fields to extract

{
  "lc_number": "Letter of Credit number (field 20 in SWIFT, or LC No., Credit No., Documentary Credit No.)",
  "lc_type": "Type of LC — one of: irrevocable, revocable, confirmed, standby, transferable (field 40A in SWIFT). If multiple apply, use the most specific.",
  "buyer_name": "Applicant / opener of the LC (field 50 in SWIFT)",
  "applicant_address": "Full address of the applicant if shown",
  "applicant_bank_name": "Issuing bank name (field 51a in SWIFT)",
  "applicant_bank_swift": "Issuing bank SWIFT/BIC code",
  "advising_bank_name": "Advising bank name (field 57a in SWIFT)",
  "advising_bank_swift": "Advising bank SWIFT/BIC code",
  "beneficiary_name": "Beneficiary — the factory or exporter (field 59 in SWIFT)",
  "beneficiary_bank_name": "Beneficiary's bank name if shown",
  "beneficiary_bank_branch": "Beneficiary's bank branch name or code",
  "beneficiary_bank_swift": "Beneficiary's bank SWIFT/BIC code",
  "beneficiary_bank_account": "Beneficiary's bank account number",
  "confirming_bank_name": "Confirming bank name if the LC is confirmed",
  "confirming_bank_swift": "Confirming bank SWIFT/BIC code",
  "currency": "Currency code (field 32B in SWIFT — e.g. USD, EUR, GBP, BDT)",
  "lc_value": "Numeric LC amount (field 32B in SWIFT). Return as a number, not a string.",
  "tolerance_pct": "Tolerance percentage (+/- %) if stated (field 39A/39B in SWIFT)",
  "issue_date": "Date of issue (field 31C in SWIFT) in YYYY-MM-DD format",
  "expiry_date": "Expiry date (field 31D in SWIFT) in YYYY-MM-DD format",
  "latest_shipment_date": "Latest date of shipment (field 44C in SWIFT) in YYYY-MM-DD format",
  "presentation_period": "Period for presentation of documents in days (field 48 in SWIFT, usually 21 days). Return as a number.",
  "partial_shipment_allowed": "Whether partial shipments are allowed (field 43P in SWIFT). Return as boolean.",
  "transhipment_allowed": "Whether transhipment is allowed (field 43T in SWIFT). Return as boolean.",
  "port_of_loading": "Port of loading / dispatch (field 44A/44E in SWIFT)",
  "port_of_discharge": "Port of discharge / destination (field 44B/44F in SWIFT)",
  "incoterms": "Incoterms if stated (e.g. FOB, CIF, CFR, FCA)",
  "payment_terms": "Full text description of payment/draft terms (field 42C/42P in SWIFT)",
  "payment_type": "One of: at_sight, deferred, usance — based on the payment terms",
  "tenor_days": "Number of days if deferred/usance payment (e.g. 90, 120, 180). Return as a number or null if at sight.",
  "goods_description": "Description of goods/services (field 45A in SWIFT). Include full text.",
  "hs_code": "HS tariff code if mentioned in the goods description",
  "insurance_required": "Whether insurance is required by the LC. Return as boolean.",
  "insurance_details": "Insurance requirements or coverage details if stated",
  "documents_required": "List of required documents (field 46A in SWIFT) as an array of strings — e.g. commercial invoice, packing list, bill of lading, certificate of origin, inspection certificate, etc.",
  "special_conditions": "Any additional conditions, special clauses, or remarks (field 47A/49 in SWIFT)"
}

## Rules
1. Use null for any field not found in the document — NEVER guess or fabricate.
2. Dates should be formatted as YYYY-MM-DD when possible. If only a month/year is shown, use YYYY-MM-01.
3. For lc_value, return the numeric amount only (no currency symbol or commas).
4. For documents_required, split each distinct document requirement into a separate array element.
5. For boolean fields (partial_shipment_allowed, transhipment_allowed, insurance_required), interpret "ALLOWED"/"PERMITTED" as true and "NOT ALLOWED"/"PROHIBITED" as false.
6. SWIFT field tags (e.g. :20:, :31D:, :32B:) are hints — the document may use different labelling.
7. Look carefully for:
   - SWIFT field tags and their values
   - Bank stamps, reference numbers, and endorsements
   - Advising bank cover letters that may contain additional details
   - Amendments (if this is an amendment, extract the amended values)
8. For garment industry LCs, pay special attention to goods descriptions which typically mention garment types, fabric composition, and HS codes starting with 61xx or 62xx.
9. Return ONLY the JSON object. No explanatory text.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map common file extensions / content-types to Claude-accepted media types */
function resolveMediaType(
  contentType: string | null,
  fileName?: string
): string {
  if (contentType) {
    const ct = contentType.toLowerCase();
    if (ct.includes("pdf")) return "application/pdf";
    if (ct.includes("png")) return "image/png";
    if (ct.includes("jpeg") || ct.includes("jpg")) return "image/jpeg";
    if (ct.includes("webp")) return "image/webp";
    if (ct.includes("gif")) return "image/gif";
  }
  // Fallback: infer from file name
  if (fileName) {
    const ext = fileName.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "pdf":
        return "application/pdf";
      case "png":
        return "image/png";
      case "jpg":
      case "jpeg":
        return "image/jpeg";
      case "webp":
        return "image/webp";
      case "gif":
        return "image/gif";
    }
  }
  // Default to JPEG as a safe fallback for images
  return "image/jpeg";
}

/** Convert an ArrayBuffer to a base64 string */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicApiKey) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ------------------------------------------------------------------
    // 1. Obtain the file bytes + media type
    // ------------------------------------------------------------------
    let fileBytes: ArrayBuffer;
    let mediaType: string;

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      // ── Multipart upload ──────────────────────────────────────────
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return new Response(
          JSON.stringify({ error: "No file provided in form data" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      fileBytes = await file.arrayBuffer();
      mediaType = resolveMediaType(file.type, file.name);
    } else {
      // ── JSON body with fileUrl or file_base64 ────────────────────
      const body = await req.json();
      const fileBase64: string | undefined = body.file_base64;
      const fileUrl: string | undefined = body.fileUrl;

      if (fileBase64) {
        // Direct base64 — decode it
        const binaryStr = atob(fileBase64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        fileBytes = bytes.buffer;
        mediaType = resolveMediaType(body.file_type ?? null, body.file_name);
      } else if (!fileUrl) {
        return new Response(
          JSON.stringify({
            error:
              "Request must be multipart/form-data with a file, JSON with file_base64, or JSON with a fileUrl",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      } else {

      // If the URL is a Supabase storage path, fetch via the service client
      // so we respect RLS / signed-URL patterns.
      let fetchResponse: Response;

      if (fileUrl.startsWith(supabaseUrl)) {
        // Extract bucket and path from the URL.
        // Typical shape: <supabaseUrl>/storage/v1/object/public/<bucket>/<path>
        // or           : <supabaseUrl>/storage/v1/object/<bucket>/<path>
        const storagePrefix = "/storage/v1/object/";
        const urlObj = new URL(fileUrl);
        const pathAfterStorage = urlObj.pathname.substring(
          urlObj.pathname.indexOf(storagePrefix) + storagePrefix.length
        );
        // Strip optional "public/" prefix
        const cleanPath = pathAfterStorage.replace(/^public\//, "");
        const slashIdx = cleanPath.indexOf("/");
        const bucket = cleanPath.substring(0, slashIdx);
        const objectPath = cleanPath.substring(slashIdx + 1);

        const { data, error } = await supabase.storage
          .from(bucket)
          .download(objectPath);

        if (error || !data) {
          return new Response(
            JSON.stringify({
              error: `Failed to download file from storage: ${error?.message || "unknown"}`,
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
        fileBytes = await data.arrayBuffer();
        mediaType = resolveMediaType(null, objectPath);
      } else {
        // External URL — just fetch it
        fetchResponse = await fetch(fileUrl);
        if (!fetchResponse.ok) {
          return new Response(
            JSON.stringify({
              error: `Failed to fetch file from URL: ${fetchResponse.status}`,
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
        fileBytes = await fetchResponse.arrayBuffer();
        mediaType = resolveMediaType(
          fetchResponse.headers.get("content-type"),
          fileUrl
        );
      }
      }
    }

    // ------------------------------------------------------------------
    // 2. Encode to base64
    // ------------------------------------------------------------------
    const base64Data = arrayBufferToBase64(fileBytes);

    // ------------------------------------------------------------------
    // 3. Build the Claude vision request
    // ------------------------------------------------------------------
    const isPdf = mediaType === "application/pdf";

    const contentBlock = isPdf
      ? {
          type: "document" as const,
          source: {
            type: "base64" as const,
            media_type: "application/pdf" as const,
            data: base64Data,
          },
        }
      : {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: mediaType as
              | "image/png"
              | "image/jpeg"
              | "image/webp"
              | "image/gif",
            data: base64Data,
          },
        };

    const anthropicPayload = {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            contentBlock,
            {
              type: "text",
              text: "Extract all Letter of Credit data from this document. Return ONLY the JSON object.",
            },
          ],
        },
      ],
    };

    // ------------------------------------------------------------------
    // 4. Call Claude
    // ------------------------------------------------------------------
    const anthropicResponse = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(anthropicPayload),
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      throw new Error(
        `Anthropic API error: ${anthropicResponse.status} - ${errText}`
      );
    }

    const anthropicData = await anthropicResponse.json();
    const rawText: string = anthropicData.content[0].text;

    // ------------------------------------------------------------------
    // 5. Parse the returned JSON
    // ------------------------------------------------------------------
    let extracted: unknown;
    let parseError: string | null = null;

    try {
      // Claude may sometimes wrap in ```json ... ``` — strip that
      const cleaned = rawText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      extracted = JSON.parse(cleaned);
    } catch {
      // If JSON parsing fails, return raw text so the client can still use it
      parseError =
        "Claude returned text that could not be parsed as JSON. Raw text is included.";
      extracted = null;
    }

    // ------------------------------------------------------------------
    // 6. Return result
    // ------------------------------------------------------------------
    const result: Record<string, unknown> = {
      success: true,
      data: extracted,
      model: MODEL,
      tokens_used:
        anthropicData.usage.input_tokens + anthropicData.usage.output_tokens,
    };

    if (parseError) {
      result.success = false;
      result.parse_error = parseError;
      result.raw_text = rawText;
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("extract-lc error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
