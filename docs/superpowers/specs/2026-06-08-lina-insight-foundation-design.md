# Lina — AI Assistant Foundation (Phase 1: Insight Foundation)

**Date:** 2026-06-08
**Status:** Design approved, pending written-spec review
**Branch:** `Chatbot`

## Summary

ProductionPortal currently ships a read-only RAG chatbot: it embeds the user's
message, runs a vector search over a knowledge base, uses a regex classifier to
pre-fetch "live" production data, makes a single Claude call, and returns text.
It cannot investigate, chain queries, or act — a regex decides what data it sees,
once, up front.

This project turns that chatbot into **Lina**, a named AI assistant built on a
**native Claude tool-calling agentic loop**. Lina decides what to investigate,
chains queries, reasons over what she finds, and delivers real production
insights, feedback, and consultation. Phase 1 is read-only by design: it builds
the agentic foundation and proves it with an insight tool-suite. Later phases
(taking tasks, altering forms, creating documents) become *additive tools on the
same loop* — no re-architecture.

This is the first of several sub-projects. The full vision was decomposed (see
[Scope & Decomposition](#scope--decomposition)); this spec covers **only Phase 1**.

## Goals

- Replace the single-shot RAG pipeline with an agentic tool-calling loop where
  Claude (not a regex) decides what data to query.
- Give the assistant a name and consistent persona: **Lina**.
- Deliver genuine, multi-step **reactive** production insights: comparisons,
  anomaly detection, trend analysis, consultation, feedback.
- Enforce the existing role + factory data boundaries **in the tool executors**,
  not just in the system prompt.
- Preserve everything that works today: auth, conversation history, analytics,
  feedback, citations, suggested questions, multi-language.
- Leave the architecture forward-compatible with write-actions, form
  customization, and document generation (Phases 2-4) as additive tools.

## Non-Goals (Phase 1)

- **No write actions.** Lina does not insert/update/delete any production data,
  forms, or records in Phase 1. (Phase 2.)
- **No proactive/background alerting.** Insights are reactive — delivered when
  the user asks. (Possible fast-follow.)
- **No form structure customization or document generation.** (Phases 3-4.)
- **No change to the knowledge-base ingestion pipeline.** RAG is reused as-is,
  exposed as a tool.

## Scope & Decomposition

The user's full vision ("a fully independent AI assistant with real effect and
control over the app") is a platform shift made of several subsystems. It was
decomposed as:

| # | Piece | Phase |
|---|-------|-------|
| 0 | Identity (name, persona) | **Phase 1** |
| 1 | Action framework (tool-calling agentic loop + safety/audit spine) | **Phase 1** |
| 2 | Reactive production insights (read tools) — proves the spine | **Phase 1** |
| 3 | Take tasks on the app (submit targets, log output, file blockers) | Phase 2 |
| 4 | Alter forms — fill/edit data entries, then customize form structure | Phase 3 |
| 5 | Create documents/reports | Phase 4 |
| 6 | Proactive insights & alerting | Fast-follow |

The action/tool-calling framework (#1) is the spine; every later capability is a
new tool registered against it. Phase 1 builds the spine and proves it with
read-only insight tools (#2), the lowest-risk way to validate the whole loop.

## Current State (for reference)

- **Frontend:** React 18 + TypeScript + Vite, Tailwind + shadcn/ui, TanStack
  Query, i18next (en/bn/zh), Capacitor (iOS/Android) + Tauri (desktop).
- **Backend:** Supabase (Postgres + pgvector), Deno edge functions, RLS on all
  tables.
- **Chat UI:** `src/components/chat/` (`ChatWidget`, `ChatPanel`, `ChatMessage`,
  `QuickActions`, `LanguageToggle`), mounted in
  `src/components/layout/AppLayout.tsx`; `src/hooks/useChat.ts`.
- **Chat backend:** `supabase/functions/chat/index.ts` (orchestrator),
  `_shared/llm.ts` (system prompt + single Claude call via raw `fetch`),
  `_shared/live-data.ts` (regex classifier + data fetchers),
  `_shared/embeddings.ts` (OpenAI `text-embedding-3-small`).
- **Model today:** `claude-sonnet-4-20250514` — **deprecated, retires
  2026-06-15**, so the model is being modernized regardless.
- **Data model:** `factory_accounts`, `profiles`, `user_roles`, `lines`,
  `work_orders`, `sewing_targets`/`sewing_actuals`,
  `cutting_targets`/`cutting_actuals`, finishing tables,
  `production_updates_sewing`/`_finishing` (blockers), `storage_*`, `qc_*`,
  `chat_conversations`/`chat_messages`/`chat_analytics`,
  `knowledge_documents`/`knowledge_chunks`, `role_feature_access`.

## Architecture

### The agentic loop

Replace the single-shot flow with a **manual agentic loop** in the `chat` edge
function:

```
user message
   ↓
resolve auth / profile / role / factory / timezone   (unchanged)
   ↓
build system prompt (Lina persona + role boundaries) + tool definitions  (cached)
   ↓
┌───────────────────────────────────────────────┐
│  Claude call  →  inspect stop_reason           │
│   • "tool_use"  → execute requested tool(s),   │
│                   append tool_result blocks,    │ ← loop, capped at
│                   continue ────────────────────┘    MAX_TURNS
│   • "end_turn"  → finalize
└───────────────────────────────────────────────┘
   ↓
parse final answer + suggested questions; record tools used
   ↓
save assistant message + analytics; return to client   (preserved)
```

**Why a manual loop, not the SDK tool-runner:** the manual loop is the exact
insertion point for the future "pause for user confirmation" gate that
write-actions (Phase 2) require. Building it now means later phases add a tool
flagged `requiresConfirmation: true` and the loop pauses before executing — no
structural change.

**Loop safety:** hard cap on iterations (`MAX_TURNS`, e.g. 6) to prevent runaway
loops; if hit, Lina returns her best answer so far with a note. Tool execution
errors are non-fatal (mirrors today's live-data error handling) — a failed tool
returns an error `tool_result` Claude can react to, rather than crashing the turn.

### Module structure

Keep `chat/index.ts` an orchestrator; put new logic in focused `_shared/`
modules:

- `_shared/agent-loop.ts` — the loop: call Claude, dispatch tool_use, append
  results, enforce `MAX_TURNS`, parse final output.
- `_shared/persona.ts` — Lina's identity + system-prompt construction (replaces
  the generic opening in `llm.ts`; role-boundary rules retained).
- `_shared/tools/registry.ts` — tool definitions (name, description, JSON input
  schema) + dispatch table mapping name → executor.
- `_shared/tools/insights.ts` — the executors (refactored from `live-data.ts`).
- `_shared/llm.ts` — trimmed to the Claude HTTP wrapper (now tool-aware) +
  language detection + suggested-question parsing.

`_shared/live-data.ts`'s data-fetch logic is **refactored into tool executors**,
not rewritten; the regex `classifyMessage` is removed (Claude replaces it).

### Tool calling & the API

- **Model:** `claude-sonnet-4-6` (chosen for cost/latency on a high-frequency
  widget; clean upgrade from the deprecated Sonnet 4). Model id is a single
  constant so a future tiered/Opus swap is one line.
- **Thinking:** adaptive (`thinking: {type: "adaptive"}`) — Claude decides depth
  per turn; good for variable-complexity analysis.
- **Tool use:** native Anthropic tool use. Each tool has a typed JSON
  `input_schema`. Tool inputs are always parsed as JSON (never string-matched).
- **Transport:** continue using `fetch` against
  `https://api.anthropic.com/v1/messages` (consistent with current code; Deno).
  Append full assistant `content` (including any `thinking`/`tool_use` blocks) to
  the running messages on each turn; return each `tool_result` with its matching
  `tool_use_id`.
- **Prompt caching:** put a `cache_control: {type: "ephemeral"}` breakpoint on
  the last system block so tools + system prompt cache together (they are stable
  across turns and across users of the same role). Volatile content (the user's
  message, tool results) stays after the breakpoint. This is the primary cost
  lever — cache reads are ~0.1× input price.
- **max_tokens:** ~2048 for the final answer (matches today); loop turns that
  only request tools need little output. Not streaming in Phase 1 (responses are
  short; the widget shows a typing indicator).

### Insight tool-suite (Phase 1)

Each executor receives a trusted context object `{ factoryId, role, timezone,
supabase }` derived server-side from the authenticated user — **never** from
model-supplied arguments — and is responsible for its own access control.

| Tool | Purpose | Access |
|------|---------|--------|
| `get_production_data` | Sewing/cutting/finishing actuals & targets by date/range/line/PO | role-scoped to permitted departments |
| `compare_periods` | Same metric across two windows (today vs last week, line vs line) | role-scoped |
| `find_anomalies` | Flag lines behind target, reject/rework spikes, open blockers, deadlines approaching | role-scoped |
| `get_blockers` | Open/recent blockers with impact, owner, status | role-scoped |
| `get_work_orders` | PO status, quantities, ex-factory dates, output rollups | role-scoped |
| `get_financials` | Revenue/cost/profit/margin, per-PO/department breakdowns | **admin/owner only** — enforced in executor |
| `search_knowledge` | Existing vector RAG over `knowledge_chunks`, invoked when Lina decides she needs docs | factory + global docs |

Tool descriptions are **prescriptive about when to call** (per current Anthropic
guidance) so Lina reaches for the right tool. `search_knowledge` embeds the query
on demand (via existing `embeddings.ts`), so embeddings only run when docs are
actually needed — a reduction from today's embed-every-message behavior.

### Identity — Lina

`_shared/persona.ts` defines a warm, sharp floor-supervisor voice: proactive
about flagging concerning trends (lines behind target, open blockers, deadlines,
negative margins), concise, bullet-friendly, never fabricates numbers, attributes
live data naturally (not `[Source:...]`). Frontend updates: FAB label/tooltip,
panel header → "Lina", greeting/empty-state copy, quick-action prompts. All
existing role/data-boundary rules from `llm.ts` are carried into the new prompt
verbatim.

## Data Flow & Security

- Auth, profile, role resolution, factory timezone, conversation get/create,
  history fetch, message persistence, analytics, feedback: **unchanged**.
- **Access control is defense-in-depth:** the system prompt states role
  boundaries *and* every tool executor independently enforces factory scoping
  and role gating. A `worker` calling `get_financials` is refused by the executor
  regardless of what the prompt says or what the model attempts.
- Tool arguments from the model are treated as untrusted input: validated against
  the schema, and `factoryId`/`role` are injected server-side — the model cannot
  widen its own scope.
- **Schema change:** extend `chat_messages` with a nullable `tools_used`
  (JSONB) column recording which tools ran and with what arguments, for the
  analytics page and debugging. Additive, backward-compatible migration.
- Secrets (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, service-role key) stay
  server-side in the edge function, never exposed to the client or the model.

## Forward-Compatibility (Phases 2-4)

- **Phase 2 (tasks):** add write-tools (e.g. `submit_sewing_output`) flagged
  `requiresConfirmation: true`. The agent loop, on encountering such a tool_use,
  pauses and returns a proposed action to the client for explicit user approval
  before executing. Add an audit-log table for all assistant-initiated mutations.
- **Phase 3 (forms):** data-entry edits, then form-structure customization, as
  further confirmation-gated tools.
- **Phase 4 (documents):** a `generate_document` tool producing downloadable
  artifacts.

None of these require changing the loop, registry, or persona modules — they
register new tools. That is the explicit payoff of building the foundation first.

## Testing

- **Tool executors:** unit-tested against seeded factory data — correct results,
  correct factory scoping, correct role gating (e.g. `get_financials` refuses
  non-admin/owner; department tools refuse out-of-department roles).
- **Agent loop:** tested with mocked Claude responses exercising
  `tool_use → tool_result → end_turn`, multi-tool turns, the `MAX_TURNS` cap, and
  tool-error handling.
- **Argument safety:** verify model-supplied args cannot widen factory/role scope.
- **Regression:** existing chat behaviors (history, analytics, feedback,
  citations, suggested questions, language detection) still pass.
- **Manual smoke test:** representative questions per role against a seeded
  factory, confirming Lina chains tools sensibly and respects boundaries.

## Open Questions / Risks

- **Latency:** multi-turn loops add round-trips. Mitigations: prompt caching,
  `MAX_TURNS` cap, concise tool outputs, a clear typing indicator in the UI.
  Revisit streaming if perceived latency is a problem.
- **Cost at scale:** estimated ~$0.04 avg/question on Sonnet 4.6 (~$40-60/mo
  light, ~$350-450/mo heavy per factory). Caching and the `MAX_TURNS` cap bound
  it; the model constant allows a tiered downgrade path if needed.
- **Tool-suite completeness:** the Phase 1 tools cover the main production
  surfaces; gaps surfaced during testing become additional executors.
