import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { getCorsHeaders } from "../_shared/security.ts";
import { generateEmbedding } from "../_shared/embeddings.ts";
import { detectLanguage, createAnthropicCaller, parseSuggestedQuestions } from "../_shared/llm.ts";
import { buildLinaSystemPrompt } from "../_shared/persona.ts";
import { getToolsForRole, toAnthropicTools, dispatchTool } from "../_shared/tools/registry.ts";
import { getTodayForFactory } from "../_shared/live-data.ts";
import { runAgentLoop } from "../_shared/agent-loop.ts";
import type { ToolContext, ExportRequest } from "../_shared/tools/types.ts";

interface ChatRequest {
  message: string;
  conversation_id?: string;
  language?: "en" | "bn" | "zh";
}

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CHAT] ${step}${detailsStr}`);
};

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Chat request received");

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);

    const user = userData.user;
    if (!user) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    // Get user profile and roles
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("factory_id, full_name")
      .eq("id", user.id)
      .single();

    const { data: userRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const roles = userRoles?.map((r) => r.role) || ["worker"];
    const primaryRole = roles.includes("owner")
      ? "owner"
      : roles.includes("admin")
        ? "admin"
        : roles[0] || "worker";

    // Get factory timezone + name for date queries and report headers
    let factoryTimezone: string | null = null;
    let factoryName = "Factory";
    if (profile?.factory_id) {
      const { data: factoryData } = await supabaseAdmin
        .from("factory_accounts")
        .select("timezone, name")
        .eq("id", profile.factory_id)
        .single();
      factoryTimezone = factoryData?.timezone || null;
      factoryName = factoryData?.name || "Factory";
    }

    logStep("User context", { roles, primaryRole, factoryId: profile?.factory_id });

    // Parse request
    const body: ChatRequest = await req.json();
    const { message, conversation_id, language: requestedLanguage } = body;

    if (!message || message.trim().length === 0) {
      throw new Error("Message is required");
    }

    // Detect language
    const detectedLanguage = detectLanguage(message);
    const language = requestedLanguage || detectedLanguage;
    logStep("Language", { detected: detectedLanguage, using: language });

    // Get or create conversation
    let conversationId = conversation_id;
    if (!conversationId) {
      const { data: newConversation, error: convError } = await supabaseAdmin
        .from("chat_conversations")
        .insert({
          user_id: user.id,
          factory_id: profile?.factory_id,
          language,
          title: message.substring(0, 100),
        })
        .select("id")
        .single();

      if (convError) throw new Error(`Failed to create conversation: ${convError.message}`);
      conversationId = newConversation.id;
      logStep("Created conversation", { conversationId });
    } else {
      // Verify the conversation belongs to this user (prevent cross-factory data access)
      const { data: convOwner } = await supabaseAdmin
        .from("chat_conversations")
        .select("user_id")
        .eq("id", conversationId)
        .single();
      if (!convOwner || convOwner.user_id !== user.id) {
        throw new Error("Conversation not found");
      }
    }

    // Save user message
    await supabaseAdmin.from("chat_messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: message,
    });

    // Get conversation history (last 10 messages for context)
    const { data: historyData } = await supabaseAdmin
      .from("chat_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(10);

    const conversationHistory = (historyData || [])
      .reverse()
      .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content as string,
    }));

    // Resolve "today" in the factory's timezone for date-scoped tools.
    const today = getTodayForFactory(factoryTimezone);

    // Current factory-local date & time, so Lina can judge whether missing
    // end-of-day output is normal (early in the day) vs. a real concern.
    let localTime = today;
    try {
      localTime = new Date().toLocaleString("en-GB", {
        timeZone: factoryTimezone || "Asia/Dhaka",
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch (_e) {
      // fall back to the date string
    }

    // Lina requires a factory to scope every tool query — fail safely if absent.
    if (!profile?.factory_id) {
      throw new Error("Your account isn't linked to a factory yet, so I can't pull production data. Please contact your administrator.");
    }

    // Build the role-filtered tool set and Lina's persona prompt.
    const tools = getToolsForRole(primaryRole);
    const systemPrompt = buildLinaSystemPrompt(primaryRole, language, localTime, today);

    // Escalation: email a support ticket to the Woventex team via Resend.
    const escalate = async (ticket: { problem: string; category?: string }) => {
      try {
        const apiKey = Deno.env.get("RESEND_API_KEY");
        if (!apiKey) return { ok: false, error: "email is not configured" };
        const who = profile?.full_name || user.email || "A ProductionPortal user";
        const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
        const html = `
          <h2>Support ticket raised by Lina</h2>
          <p><strong>From:</strong> ${esc(who)} (${esc(user.email ?? "no email")})</p>
          <p><strong>Role:</strong> ${esc(primaryRole)} &nbsp;|&nbsp; <strong>Factory:</strong> ${esc(profile?.factory_id ?? "n/a")}</p>
          <p><strong>Category:</strong> ${esc(ticket.category ?? "other")} &nbsp;|&nbsp; <strong>Local time:</strong> ${esc(localTime)}</p>
          <hr/>
          <p><strong>Problem</strong></p>
          <p style="white-space:pre-wrap">${esc(ticket.problem)}</p>
          <hr/>
          <p style="color:#888;font-size:12px">Raised automatically by Lina, the ProductionPortal assistant. Reply to ${esc(user.email ?? "the user")} to follow up.</p>
        `;
        const res = await new Resend(apiKey).emails.send({
          from: "Lina (ProductionPortal) <noreply@woventex.co>",
          to: ["contact@woventex.co"],
          subject: `Lina ticket: ${ticket.problem.slice(0, 70)}`,
          html,
        });
        if ((res as { error?: { message?: string } }).error) {
          return { ok: false, error: (res as { error?: { message?: string } }).error?.message ?? "send failed" };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    };

    // Report exports Lina queued this turn; the client runs the real in-app export.
    const exportRequests: ExportRequest[] = [];

    // Write actions Lina proposes this turn; the client confirms each via a card.
    const proposedActions: import("../_shared/actions/po.ts").ProposedAction[] = [];

    // Per-request tool context (factoryId/role are server-derived — never from model input).
    const toolContext: ToolContext = {
      supabase: supabaseAdmin as unknown as ToolContext["supabase"],
      factoryId: profile?.factory_id,
      role: primaryRole,
      timezone: factoryTimezone,
      today,
      language,
      embed: async (text: string) => (await generateEmbedding(text)).embedding,
      escalate,
      requestExport: (input: ExportRequest) => { exportRequests.push(input); },
      proposeAction: (action) => { proposedActions.push(action); },
    };

    // Run the agentic loop.
    logStep("Running agent loop", { toolCount: tools.length });
    const callModel = createAnthropicCaller(systemPrompt, toAnthropicTools(tools));
    const agentResult = await runAgentLoop({
      initialMessages: conversationHistory,
      callModel,
      executeTool: (name, input) => dispatchTool(name, input, toolContext),
    });

    const parsed = parseSuggestedQuestions(agentResult.finalText);
    // Guarantee no em/en dashes in Lina's output, regardless of the model.
    const stripDashes = (s: string) => s.replace(/[—–]/g, "-");
    const content = stripDashes(parsed.content);
    const suggestedQuestions = parsed.suggestedQuestions.map(stripDashes);
    logStep("Agent loop done", {
      turns: agentResult.turns,
      tools: agentResult.toolsUsed.map((t) => t.name),
      tokens: agentResult.totalUsage,
    });

    // Save assistant message.
    const { data: assistantMessage } = await supabaseAdmin
      .from("chat_messages")
      .insert({
        conversation_id: conversationId,
        role: "assistant",
        content,
        tokens_used: agentResult.totalUsage.inputTokens + agentResult.totalUsage.outputTokens,
        model: "claude-sonnet-4-6",
        tools_used: agentResult.toolsUsed,
      })
      .select("id")
      .single();

    // Log analytics.
    await supabaseAdmin.from("chat_analytics").insert({
      message_id: assistantMessage?.id,
      conversation_id: conversationId,
      factory_id: profile?.factory_id,
      user_role: primaryRole,
      question_text: message,
      answer_length: content.length,
      citations_count: 0,
      no_evidence: false,
      language,
    });

    return new Response(
      JSON.stringify({
        message: content,
        citations: [],
        conversation_id: conversationId,
        no_evidence: false,
        suggested_questions: suggestedQuestions,
        tools_used: agentResult.toolsUsed,
        export_actions: exportRequests.map((r) => ({
          ...r,
          factoryId: profile.factory_id,
          factoryName,
        })),
        pending_actions: proposedActions,
        language,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
