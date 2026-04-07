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
const EXTRACTION_SYSTEM_PROMPT = `You are a specialist in reading and extracting structured data from garment industry Purchase Orders (POs), contracts, and related commercial documents.

Your task is to examine the document image/PDF and extract every field listed below. Return ONLY a valid JSON object — no markdown fences, no commentary.

## Fields to extract

{
  "buyer_name": "Company or brand placing the order (e.g. H&M, Zara, Primark, Next, Li & Fung)",
  "buyer_address": "Full address of the buyer if shown",
  "po_number": "Purchase Order number (may be labelled PO#, PO No., Order No., Purchase Order Number)",
  "contract_number": "Separate contract or agreement number if present",
  "style_ref": "Style reference / style number (may be labelled Style#, Art No., Article No., Ref#)",
  "style_description": "Name or description of the garment style",
  "garment_type": "Type of garment (e.g. T-shirt, Polo, Trouser, Jacket, Hoodie, Shorts, Dress)",
  "fabric_composition": "Fabric content (e.g. 100% Cotton, 60/40 CVC, 95% Cotton 5% Elastane)",
  "colors": ["Array of color names or codes found in the order"],
  "sizes": "Size range or list (e.g. S-XL, 2-16, 38-48)",
  "quantity_total": "Total order quantity in pieces",
  "quantity_breakdown": [
    {
      "color": "color name",
      "size": "size",
      "qty": "number of pieces"
    }
  ],
  "unit_price": "Price per piece or per dozen",
  "price_type": "Pricing basis — FOB, CM, CMT, CIF, CFR, FAS, EXW, DDP, or other Incoterm",
  "currency": "Currency code (USD, EUR, GBP, BDT, etc.)",
  "delivery_date": "Required delivery / ship date / ex-factory date (ISO format YYYY-MM-DD if possible)",
  "ship_date": "Ship-by date if different from delivery date",
  "ex_factory_date": "Ex-factory date if explicitly labelled",
  "payment_terms": "e.g. LC at sight, 60 days DA, TT 30 days, CAD",
  "delivery_terms": "Incoterms or delivery terms (FOB Chittagong, CIF Rotterdam, etc.)",
  "port_of_loading": "Port of loading / shipment port",
  "port_of_discharge": "Destination port",
  "country_of_origin": "Manufacturing country (usually Bangladesh, China, Vietnam, etc.)",
  "lc_number": "Letter of Credit number if present",
  "special_instructions": "Any special remarks, packing instructions, labelling notes, wash care, or QC requirements",
  "additional_fields": {
    "description": "Any other relevant data found in the document that does not fit above (key-value pairs)"
  }
}

## Rules
1. Use null for any field not found in the document — NEVER guess or fabricate.
2. For quantity_breakdown, include as many rows as appear. If the PO only shows a total, set quantity_breakdown to null.
3. Dates should be formatted as YYYY-MM-DD when possible. If only a month/year is shown, use YYYY-MM-01.
4. For colors, normalise names to English where possible (e.g. "Noir" -> "Black").
5. If the document contains multiple POs or styles, return an array of objects — one per PO/style.
6. Look carefully for:
   - Header tables with PO metadata
   - Size/color breakdowns in grid or matrix format
   - Footer sections with shipping and payment terms
   - Stamps, annotations, or handwritten additions
7. Return ONLY the JSON object (or array). No explanatory text.`;

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
      // ── JSON body with fileUrl ────────────────────────────────────
      const body = await req.json();
      const fileUrl: string | undefined = body.fileUrl;
      if (!fileUrl) {
        return new Response(
          JSON.stringify({
            error:
              "Request must be multipart/form-data with a file, or JSON with a fileUrl",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

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
              text: "Extract all purchase order data from this document. Return ONLY the JSON object.",
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
    console.error("extract-po error:", error);
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
