# Lina Write Actions — Foundation + PO Management (Design Spec)

**Date:** 2026-06-11
**Status:** Design approved; pending written-spec review
**Branch:** `Chatbot`
**Program:** "Lina can do anything a user can." This is **sub-project 1 of N**. It builds the shared write-action foundation and proves it with Purchase-Order management. Later sub-projects (dynamic forms, other write modules, Lina-driven form customization) reuse this foundation and get their own specs.

## Summary

Today Lina is read-only/outbound: she analyzes data, reports financials, escalates tickets, and generates the real export files. She cannot **change** anything in the app. This sub-project gives Lina the ability to perform **write actions** — starting with creating, editing, and organizing Purchase Orders (work orders) — through a path that is:

1. **Confirmed** — Lina never writes silently. She *proposes* a change; the user sees an **Approve/Cancel card** in chat; only on Approve does anything execute.
2. **Permission-scoped** — writes execute with the **user's own login** (a user-scoped Supabase client), so the database's existing row-level security (RLS) enforces exactly what that user could do in the UI. Lina can never exceed the requester's permissions.
3. **Audited** — every executed change is logged to the existing `audit_log` table (who, what table, which record, before/after).

## Goals

- A reusable **write-action framework**: preview (validate, no write) → `pending_actions` in the chat response → Approve/Cancel card → `execute-action` runs the write as the user → audit. Every future Lina write reuses it.
- **PO management** via this framework: create, edit, assign to lines, set status, set ex-factory dates, archive (soft-delete).
- Writes are safe by construction: RLS-enforced, server-derived `factory_id`, mandatory confirmation, full audit trail.

## Non-Goals (critical — do not do these here)

- **Do NOT touch the data-entry forms** (sewing/cutting/finishing/QC morning & EOD forms). This sub-project has zero changes to any form. Form customization is a separate spec (Foundation B).
- **Do NOT break the existing Work Orders page** (`src/pages/WorkOrders.tsx`) or its manual create/edit/organize flow. We mirror its logic; we do not change it (unless a small, safe shared extraction is clearly beneficial and verified non-breaking).
- **Do NOT change Lina's existing read tools, reports, escalation, or the read path** of the chat function. This is additive.
- **No hard deletes.** PO removal is the existing soft-delete (`is_active=false, status='deleted'`).
- No other write modules yet (production entry, QC, dispatch, storage, user management) — they reuse this foundation in later specs.

## Architecture

```
You: "create a PO for C&A, style 86600, 5,000 pcs, due Jul 10"
   ↓
Agent loop: Lina calls a PREVIEW tool (e.g. create_po)
   → validates fields + checks role → returns a ProposedAction
     { kind, humanSummary, payload }  (NO write)
   ↓
chat response carries pending_actions[]  → UI renders an Approve/Cancel CARD
   ↓ (user clicks Approve)
client invokes  execute-action  (with the USER's JWT)
   → user-scoped Supabase client performs the write → RLS enforces permission
   → writes audit_log (service client)
   → returns { ok, summary, recordId } | { ok:false, error }
   ↓
card → "✅ PO 86600 created"  (or a clear error)
```
Reads are unchanged. Only writes flow through this confirmed path.

## Components & Files

### Backend
- **`supabase/functions/_shared/actions/po.ts`** (new, pure): `ProposedAction` types + per-action **validators** (`validateCreatePo`, `validateUpdatePo`, etc.) that check required fields and shape and produce the `ProposedAction` (kind, humanSummary, payload). Pure → unit-testable with vitest (type-only Deno imports). Shared by both the preview tools and `execute-action` so validation is identical on both sides.
- **`supabase/functions/_shared/tools/actions-tools.ts`** (new) or extend `insights.ts`: the PO **preview tool executors** (`create_po`, `update_po`, `assign_po_lines`, `set_po_status`, `set_po_ex_factory`, `archive_po`). Each: gate by role (admin/owner — matching RLS), validate via `actions/po.ts`, call `ctx.proposeAction(action)`, and return a short ack string ("I've prepared this change — review and Approve below."). **No writes.**
- **`ToolContext`** (`_shared/tools/types.ts`): add `proposeAction: (action: ProposedAction) => void` (a collector, like `requestExport`).
- **`chat/index.ts`**: collect proposed actions and return them as `pending_actions` in the response JSON (enriched with `factoryId` server-side). No write logic here.
- **`supabase/functions/execute-action/index.ts`** (new edge function):
  1. Authenticate the user (Bearer JWT), load profile (`factory_id`) + roles — same pattern as `chat`.
  2. Build a **user-scoped** Supabase client: `createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: 'Bearer <user JWT>' } } })`. All writes use this client so RLS applies.
  3. **Re-validate** the action payload server-side (via `actions/po.ts`); never trust the client blindly. `factory_id` is taken from the user's profile, never from the payload.
  4. Switch on `action.kind` → perform the write (see "PO actions" below).
  5. Write to **`audit_log`** via a **service-role client** (bypasses the admin-only RLS on audit_log) with `{ factory_id, user_id, action, table_name, record_id, old_data, new_data }`.
  6. Return `{ ok, summary, recordId }` or `{ ok:false, error }` with an RLS-aware friendly message.
  - CORS via the shared `getCorsHeaders`. Same auth/error conventions as `chat`.

### Frontend
- **`useChat.ts`**: capture `data.pending_actions` and attach to the assistant `ChatMessage` (`message.pendingActions`). Add `runAction(action)` that invokes `execute-action` with the user's token and resolves to a result; expose per-action state so the card can show pending → executing → done/error. Re-load nothing else.
- **`src/components/chat/ActionConfirmCard.tsx`** (new): renders one pending action — the human summary + **Approve** / **Cancel** buttons; states: `pending` (buttons), `executing` (spinner), `done` (✅ + result), `cancelled`, `error` (message + Retry). Styled in the existing dock idiom (premium card).
- **`ChatMessage.tsx`**: render `message.pendingActions` as `ActionConfirmCard`s beneath the bubble (only for assistant, non-loading).

## Data Flow — create PO (worked example)

1. User asks Lina to create a PO. Lina calls `create_po` (preview) with `{ po_number, buyer, style, order_qty, planned_ex_factory, ...optional, line_ids? }`.
2. `validateCreatePo` checks required fields (po_number, buyer, style, planned_ex_factory) → returns `ProposedAction { kind:'create_po', humanSummary:'Create PO 86600 — C&A, style 86600, 5,000 pcs, due 2026-07-10', payload }`. Tool gates on admin/owner; pushes via `proposeAction`.
3. Response: `pending_actions:[{...}]`; Lina's text: "I've prepared this PO — review and Approve below." Card renders.
4. User clicks **Approve** → `execute-action({ kind:'create_po', payload })` with JWT.
5. `execute-action`: user-scoped client. `style_order_id` is **nullable** (per migration `20260506140000`), so create inserts `work_orders` with the core fields directly. (Optional, lower-priority: resolve/create a `style_order` for grouping, mirroring `WorkOrders.tsx`; only if it does not add risk. For v1, inserting with `style_order_id = null` is acceptable and safe.) Insert any `work_order_line_assignments`. If `po_number` already exists for the factory → unique-violation → friendly "PO 86600 already exists" error.
6. RLS: if the user is not admin/owner → insert blocked → return "You don't have permission to create POs."
7. On success: write `audit_log` (service client), return `{ ok, summary:'PO 86600 created', recordId }`. Card → ✅.

## PO Actions in Scope

| Tool (preview) | Execute action | Notes |
|---|---|---|
| `create_po` | insert `work_orders` (+ optional line assignments) | required: po_number, buyer, style, planned_ex_factory; `style_order_id` nullable |
| `update_po` | update `work_orders` fields by id | target located by `po_number`→id; only provided fields changed |
| `assign_po_lines` | replace rows in `work_order_line_assignments` | set which lines run the PO |
| `set_po_status` | update `status` (enum) / `is_active` | activate/deactivate; valid statuses only |
| `set_po_ex_factory` | update `planned_ex_factory` / `actual_ex_factory` | date validation |
| `archive_po` | soft-delete: `is_active=false, status='deleted'` | never hard-delete (preserves history) |

Lina resolves the target PO by `po_number` (look up the id within the user's factory). Buyer/style normalization for create mirrors the Work Orders page.

## Permissions & Safety

- **RLS is the authority.** Writes use the user-scoped client; RLS policies (`is_admin_or_higher(auth.uid())` + factory match for `work_orders`) decide. Lina cannot exceed the user.
- **`factory_id` is server-derived** from the authenticated user's profile in `execute-action` — never from the model or client payload.
- **Confirmation is mandatory.** Preview tools never write; `execute-action` only runs when the client calls it after Approve.
- **Re-validation server-side** in `execute-action` (client payloads are treated as untrusted; RLS is the backstop against tampering).
- **Audit everything**: every successful write logs to `audit_log` with before/after.
- **Graceful failures**: unique-violation, RLS denial, and validation errors return clear messages shown on the card; never a raw stack trace.

## Supabase Prerequisites & Verification

All required objects exist in the committed schema:
- Tables: `work_orders`, `style_orders`, `work_order_line_assignments`, `audit_log`, `profiles`, `user_roles`.
- `work_orders.style_order_id` is **nullable** (migration `20260506140000`).
- Helper fns: `is_admin_or_higher`, `get_user_factory_id`, `is_superadmin`, `has_role`.
- RLS: `work_orders` "Admins can manage work orders" (FOR ALL, admin/owner + factory); `audit_log` admin-read.

**Verification step (in the plan, before relying on them):** confirm in the **remote** project (the migration history has drifted from local before) that (a) `audit_log` exists and accepts a service-role insert, (b) `work_orders` RLS allows an admin insert and blocks a worker, (c) `style_order_id` is nullable. A quick dashboard SQL check (like the `tools_used` column check) suffices. **No new migration is expected**; if a gap is found (e.g., audit_log missing a needed column), add a minimal additive migration and apply it via the dashboard.

## Care Requirements (explicit)

- The existing **Work Orders page must keep working** — we mirror its insert logic; we do not modify its behavior. If we extract any shared helper, the page must still produce identical results (verify by using it after the change).
- **No data-entry form is touched.**
- The chat function's **existing read path, tools, reports, and escalation must be unaffected** — this is purely additive (new tools + a new collector + a new function).
- Deploy `chat` and `execute-action`, then **smoke-test per role**: an admin creates/edits/organizes/archives a PO via Lina (each via the Approve card) and the changes appear correctly in the Work Orders page + an `audit_log` row exists; a worker is declined.

## Testing

- **Pure validators** (`actions/po.ts`): unit tests — required-field validation, status/date validation, the `ProposedAction` shape, and that no write happens. (vitest, type-only imports.)
- **Preview tools**: unit tests — role gating (worker denied create), `proposeAction` called with the right action, ack message.
- **`execute-action`**: the pure validators are tested; the actual Supabase writes + RLS are covered by the **manual per-role smoke test** (Deno + RLS can't be meaningfully unit-tested here, consistent with the rest of `supabase/functions`).
- **Frontend `ActionConfirmCard`**: manual (pending → Approve → executing → done; Cancel; error/Retry).
- **Regression**: existing edge-function tests stay green; the Work Orders page and a couple of data-entry forms still submit correctly after deploy.

## Risks & Mitigations

- **Risk: corrupting/duplicating real PO data.** Mitigation: mandatory Approve card; RLS; server-side re-validation; soft-delete only; audit trail; per-role smoke test before sign-off.
- **Risk: breaking the Work Orders page via a shared extraction.** Mitigation: prefer replicating insert logic in `execute-action` over refactoring the page; if extracting, verify the page still works.
- **Risk: user-scoped client misconfigured (writes silently use service role / bypass RLS).** Mitigation: a test that a worker's create is **denied** (proves RLS is in force, not bypassed).
- **Risk: remote schema drift.** Mitigation: the explicit remote-verification step before relying on `audit_log`/RLS.

## Out of Scope → Next Specs
- Foundation B: dynamic/customizable forms (admin builder), then Lina-driven form customization (reuses this foundation + B).
- Additional write modules: production data entry, blockers, QC records, dispatch, storage, user management — each a small add-on reusing this foundation.
