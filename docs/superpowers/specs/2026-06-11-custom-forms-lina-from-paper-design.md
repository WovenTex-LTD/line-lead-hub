# Custom Forms + Lina-from-Paper (Design Spec)

> **Revision 2026-06-12 — Per-role catalogue model.** After implementation, the user clarified the intended UX: Lina creates **new** forms (never edits/replaces the production forms), and each form is **tagged to one role** (cutting/sewing/finishing/qc/storage/worker). The **Forms** area is a **catalogue grouped by role**: each role shows its **read-only default production form(s)** alongside the editable Lina-created forms. A custom form is edited by asking Lina **by name** (`propose_update_form`) so repeats don't duplicate. This is additive to the design below: the standalone `custom_form_*` engine stays; we added a `target_role` column, an edit-by-name tool/action, and the role-grouped catalogue UI. The production forms remain untouched. See memory `custom-forms-catalogue-model`.

**Date:** 2026-06-11
**Status:** Design approved (in conversation); pending written-spec review
**Branch:** `Chatbot` (builds on the deployed Lina write-action foundation)
**Program:** "Lina can do anything a user can." Sub-project 2 of N. Sub-project 1 (PO write-actions: preview tool -> Approve card -> `execute-action` writes as the user with RLS + audit) is built and deployed; this reuses that exact foundation.

## Summary

Let an admin upload a photo or PDF of a paper form, have **Lina** read it (vision) and propose a digital, fillable version, and after the user Approves, the form is created and immediately usable in the app. People fill it in; submissions are stored and viewable.

This requires two things, built as two phases of one feature:

1. **A standalone Custom Forms engine** (Phase 1): render a form from a stored config, let permitted users fill and submit it, and view submissions. No AI, no builder UI.
2. **Lina-from-paper** (Phase 2): upload an image/PDF in the Lina chat, Lina extracts the form structure and **proposes** it through the Approve/Cancel card already shipped in sub-project 1; on Approve, `execute-action` inserts the template as the user (RLS + audit) and it goes live in the engine.

The engine is the unavoidable substrate (a created form is useless until something can render and submit it), so it is built first and is testable on its own via a seeded sample form. The user-visible deliverable they asked for lands at the end of Phase 2.

## Goals

- A **dedicated, standalone custom-forms system** with its own tables, renderer, fill/submit flow, and submissions view, completely separate from the 4 hardcoded production forms and the QC module.
- **Lina creates these forms from an uploaded paper form** (image or PDF), via the existing confirmed-write path (propose -> Approve card -> `execute-action` -> audit).
- A **reusable file-upload + vision substrate** in the Lina chat (attach an image/PDF, store it, pass it to Claude). This later also powers PO-from-photo and contract use cases.
- Safe by construction: dedicated tables (zero collision), RLS-enforced writes, confirm-before-create, full audit, soft-delete only.

## Non-Goals (critical -- do not do these here)

- **Do NOT touch the 4 hardcoded production forms** (sewing/cutting/finishing morning targets + EOD actuals) or the QC module. This feature adds new tables/pages/tools only.
- **Do NOT reuse or modify the `form_templates` / `form_sections` / `form_fields` / `form_role_overrides` tables.** Those are claimed by the separate `feature/admin-form-config` effort (production-form config), are shaped around the fixed 8 production form types + `db_column` mapping, and a merge of that branch would conflict on them. This feature uses dedicated `custom_form_*` tables.
- **Do NOT build the rich drag-and-drop builder here.** v1 creation is via Lina; manual field-editing UI is a later, separate spec ("Custom Forms Builder"). v1 includes only minimal management (archive/rename a template).
- **No changes to the production form submission tables** (`sewing_actuals`, etc.). Custom-form submissions go to a dedicated `custom_form_submissions` table.
- **No offline support** for custom forms in v1 (production forms keep theirs; custom forms are online-only initially).
- No hard deletes. Template removal is a soft-delete (`status='archived'`).

## Architecture

```
PHASE 2 (Lina-from-paper)                         PHASE 1 (engine)
You attach a photo/PDF of a paper form in Lina
   |
   v
upload -> Supabase Storage (lina-uploads, factory-scoped RLS)
   |  (chat request carries the stored file path)
   v
chat function fetches the file, includes it as a Claude
image/PDF content block in the user turn
   |
   v
Lina calls preview tool  propose_create_form
   -> validateCreateCustomForm() shapes a ProposedAction
      { kind:'create_custom_form', humanSummary, payload:{name, fields[]} }   (NO write)
   |
   v
chat response carries pending_actions[]  ->  Approve/Cancel CARD  (already built)
   |  (Approve)
   v
execute-action  (USER's JWT)  -> user-scoped client
   -> insert custom_form_templates + custom_form_fields  (RLS: admin/owner only)
   -> audit_log (service client)
   |
   v
the form is now live  ------------------------------>  CustomFormsList -> Fill -> Submit
                                                        renders from custom_form_fields,
                                                        writes custom_form_submissions,
                                                        viewable in submissions view
```

Reads and the existing chat path are otherwise unchanged. Form creation flows through the same confirmed-write path as PO actions.

## Data Model (new, dedicated tables)

One additive migration creates three tables (RLS enabled on all):

### `custom_form_templates`
- `id uuid pk`
- `factory_id uuid not null` -> `factory_accounts(id)`
- `name text not null`
- `description text`
- `status text not null default 'active'` CHECK in (`'active'`, `'archived'`) -- soft-delete via `archived`
- `version int not null default 1`
- `allowed_fill_roles text[] not null default '{}'` -- roles permitted to FILL; empty is interpreted by the app as the default set (admin, owner, supervisor)
- `created_by uuid`, `created_at timestamptz default now()`, `updated_at timestamptz default now()`

### `custom_form_fields`
(one row per field; sections are modeled inline via `section_label`/`section_order`, mirroring the QC items pattern -- no separate sections table)
- `id uuid pk`
- `template_id uuid not null` -> `custom_form_templates(id)` ON DELETE CASCADE
- `section_label text` (nullable -> ungrouped)
- `section_order int not null default 0`
- `key text not null` -- stable key used in submission `values`; **UNIQUE(template_id, key)**
- `label text not null`
- `field_type text not null` CHECK in (`'text'`,`'number'`,`'date'`,`'dropdown'`,`'textarea'`,`'checkbox'`)
- `is_required boolean not null default false`
- `options jsonb` -- for `dropdown`: array of `{ value, label }`
- `placeholder text`, `help_text text`
- `sort_order int not null default 0`
- `is_active boolean not null default true`
- `created_at timestamptz default now()`

### `custom_form_submissions`
- `id uuid pk`
- `template_id uuid not null` -> `custom_form_templates(id)`
- `template_version int not null`
- `factory_id uuid not null` -> `factory_accounts(id)`
- `submitted_by uuid`
- `status text not null default 'submitted'`
- `values jsonb not null default '{}'` -- keyed by field `key`
- `fields_snapshot jsonb not null default '[]'` -- the field definitions at submit time, so a past submission renders faithfully even after the template is later edited
- `created_at timestamptz default now()`, `updated_at timestamptz default now()`

### RLS
- `custom_form_templates`, `custom_form_fields`: **SELECT** allowed to any authenticated user in the same factory (so users can discover and fill forms; the app filters the fill list by `allowed_fill_roles`). **INSERT/UPDATE** (manage) only `is_admin_or_higher(auth.uid())` + factory match -- identical authority to the PO write path. No DELETE (archive only).
- `custom_form_submissions`: **INSERT** allowed when factory matches and the user is authenticated (filling your own form; the fill-role gate is enforced in the app/edge). **SELECT** allowed to the submitter OR `is_admin_or_higher` + factory match. **UPDATE/DELETE** admin-only (v1 has no edit-after-submit).

`factory_id` is always server-derived (from the user's profile) on any Lina-driven write -- never from the model or client payload.

## Components & Files

### Phase 1 -- the engine (app only, no AI)
- **Migration** `supabase/migrations/<ts>_custom_forms.sql` -- the 3 tables + RLS + `updated_at` triggers. (`factory_id` is `NOT NULL`, so no migration-level seed; the engine is tested before Lina exists via a small dev/QA insert against a chosen test factory, or by temporarily exercising the renderer with a fixture config.) Applied to the remote project via the dashboard (the repo has migration-tracking drift; this is a fresh additive migration with no dependencies, so it applies cleanly).
- **Types** `src/types/custom-form.ts` -- `FieldType`, `CustomFormField`, `CustomFormTemplate`, `CustomFormConfig` (template + ordered fields grouped by section), `CustomFormSubmission`.
- **Hook** `src/hooks/useCustomForms.ts` -- list fillable templates (active, factory-scoped, filtered by `allowed_fill_roles`), load one template+fields as a `CustomFormConfig`, submit (insert a submission with `values` + `fields_snapshot`), list submissions, load one submission. Admin helpers: archive/rename a template.
- **Renderer** `src/components/custom-forms/CustomFormRenderer.tsx` -- given a `CustomFormConfig`, render fields grouped by section; field types: text, number, date, dropdown, textarea, checkbox. Required-field validation built dynamically (a small zod schema generated from the field list, or equivalent inline validation). Styled in the app's existing idiom.
- **Field component** `src/components/custom-forms/CustomFormField.tsx` -- renders/binds a single field by type.
- **Pages** under `src/pages/custom-forms/`:
  - `CustomFormsList.tsx` -- forms the user can fill; admins also see archived + a manage affordance (rename/archive).
  - `CustomFormFill.tsx` -- fill + submit one form.
  - `CustomFormSubmissions.tsx` -- submissions for a template (admins) / the user's own submissions.
  - `CustomFormSubmissionView.tsx` -- read-only view of one submission, rendered from its `fields_snapshot`.
- **Nav/route** -- add a "Forms" entry + route, gated to roles (admins/owners + roles in any template's `allowed_fill_roles`).

### Phase 2 -- Lina-from-paper (AI + upload), reuses the write-action foundation
- **Storage** -- new bucket `lina-uploads` with factory-scoped folder RLS (same pattern as the existing `dispatch-photos`/`gate-passes` buckets); created in a small additive migration. Accepts images and PDF.
- **Frontend upload** -- an attach control in `src/components/chat/ChatPanel.tsx` composer: pick an image/PDF (Capacitor camera/file picker on iOS, file input on web), upload to `lina-uploads`, and pass the stored path on the chat request. `src/hooks/useChat.ts` `sendMessage` gains an optional `attachment` (path + mime) that is sent in the request body.
- **Chat function** `supabase/functions/chat/index.ts` -- accept an optional attachment reference; fetch the file (signed URL / service client) and include it as a Claude **image** content block (or **document** block for PDF) in the user turn. Additive; the text path is unchanged.
- **Pure validator** `supabase/functions/_shared/actions/forms.ts` (mirrors `actions/po.ts`) -- `validateCreateCustomForm(input)` validating the extracted shape `{ name, fields: [{ section?, label, type, required, options? }] }`: non-empty name, at least one field, each field has a label and a valid `type`, dropdown fields have options; produces a stable `key` per field (slug of label, de-duplicated); returns a `ProposedAction { kind:'create_custom_form', humanSummary, payload }`. Pure -> vitest-testable.
- **Preview tool + registry** -- `propose_create_form` tool executor (gate to admin/owner/superadmin, validate, `ctx.proposeAction`, return an "Approve below" ack -- no write); registered in `registry.ts` with an `input_schema` matching the extracted shape and `allowedRoles: ["admin","owner","superadmin"]`.
- **`execute-action`** `supabase/functions/execute-action/index.ts` -- handle `kind === 'create_custom_form'`: re-validate via `forms.ts`, insert `custom_form_templates` (factory_id server-derived, `created_by=user`) then `custom_form_fields` (with row-count guards, same no-op-detection pattern as the PO writes), audit via service client, return `{ ok, summary, recordId }`. Soft-delete/archive for custom forms can be added later; create is the v1 action.
- **Frontend card path is reused as-is** -- `PendingAction` is already generic `{kind, humanSummary, payload}`, `ActionConfirmCard` renders any pending action, and `runAction` already posts to `execute-action`. No card changes needed; the humanSummary describes the proposed form (name + field count).
- **Persona** `supabase/functions/_shared/persona.ts` -- a short section: when the user uploads a paper form, read it, call `propose_create_form` with the extracted structure, confirm the form name + fields back, and tell them to Approve the card; never claim the form is created before approval.

### Field types (v1)
text, number, date, dropdown (single-select with options), textarea, checkbox (boolean). Deferred: file/photo answer fields, signature, computed/auto-fill, conditional visibility, multi-select.

## Data Flow -- two worked examples

**A. Fill a custom form (engine):** user opens "Forms" -> sees forms their role may fill -> opens one -> `CustomFormRenderer` renders fields from `custom_form_fields` -> required validation on submit -> `useCustomForms.submit` inserts a `custom_form_submissions` row (`values` keyed by field key + `fields_snapshot`) -> confirmation; the submission appears in the submissions view.

**B. Lina creates a form from paper (the deliverable):** admin attaches a photo of a paper QA checklist in Lina -> file uploads to `lina-uploads`, path sent with the message -> chat function includes the image as a vision block -> Lina extracts `{name:"Line QA Checklist", fields:[{label:"Operator", type:"text", required:true}, {label:"Defect type", type:"dropdown", options:[...]}, {label:"Pass?", type:"checkbox"}, ...]}` and calls `propose_create_form` -> Approve card shows "Create form 'Line QA Checklist' with 7 fields" -> Approve -> `execute-action` inserts the template + fields as the user (RLS admin-only) + audit -> the form is immediately live in "Forms" for permitted roles to fill.

## Permissions & Safety

- **RLS is the authority** for every Lina-driven write (user-scoped client in `execute-action`); only `is_admin_or_higher` can create/manage templates -- Lina can never exceed the user. `factory_id` is server-derived.
- **Confirmation is mandatory** -- `propose_create_form` never writes; creation happens only after Approve.
- **Re-validation server-side** in `execute-action` via the pure `forms.ts` validators.
- **Audit** every created form. **Soft-delete only** (archive).
- **Dedicated tables** -> no collision with the production-form-config tables or any risk to the hardcoded forms/QC.
- **Storage** -- `lina-uploads` is factory-scoped; users upload only their own files; the chat function reads them server-side.
- **Vision accuracy** is mitigated by the Approve gate: the user reviews the proposed form before it is created. If wrong, they Cancel and ask Lina to adjust (re-propose). Inline editing of the proposed structure is deferred to the later builder spec.

## Supabase Prerequisites & Verification

- **New objects only** -- 3 `custom_form_*` tables + RLS, and the `lina-uploads` storage bucket. No existing object is modified.
- Reused existing objects: `audit_log`, `factory_accounts`, `profiles`, the `is_admin_or_higher` helper, and the deployed `execute-action`/`chat` functions + Approve-card path.
- **Verification step (in the plan):** after applying the migration to the remote project (`varolnwetchstlfholbl`), confirm via dashboard SQL that the 3 tables + RLS policies exist and that the `lina-uploads` bucket exists; confirm an admin can insert a template and a worker cannot (RLS), as part of the per-role smoke test.

## Testing

- **Pure validators** (`actions/forms.ts`): unit tests -- name/field validation, key generation + de-duplication, dropdown-options requirement, the `ProposedAction` shape, and that no write happens.
- **Preview tool** (`propose_create_form`): unit tests -- role gating (worker denied), `proposeAction` called with the right action, ack message.
- **Engine**: a seeded sample template drives a manual fill -> submit -> view test; a light unit test for the dynamic required-field validation builder.
- **`execute-action` create_custom_form**: pure validators tested; the actual insert + RLS verified by the per-role smoke test (admin creates; worker denied), consistent with the rest of `supabase/functions`.
- **Regression**: existing edge tests stay green; the 4 production forms, the QC module, and the PO write-actions are unaffected (dedicated, additive surface).

## Risks & Mitigations

- **Vision mis-reads the paper form** -> Approve gate lets the user review/cancel before anything is created; iterate by re-prompting Lina.
- **Many-field forms are awkward to confirm on a card** -> the humanSummary lists the form name + field count; the user can ask Lina to list the fields before approving. Inline edit deferred to the builder.
- **File upload edge cases** (size, multi-page PDF, iOS permissions) -> enforce size/type limits; accept common image types + PDF; handle Capacitor camera/file permissions.
- **Migration drift on remote** -> this is a fresh, dependency-free additive migration; apply and verify via the dashboard before relying on it.
- **Branch state** -> this builds on the unmerged `Chatbot` branch (which holds the write-action foundation). Sequencing/merge handled at plan time; the PO work and this can merge together as the "Lina capabilities" set.

## Out of Scope -> Next Specs

- **Custom Forms Builder**: the rich drag-and-drop manual builder (create/edit fields, reorder, edit what Lina generated), plus inline editing of a Lina-proposed form before creation.
- **More field types**: file/photo answers, signature, computed/auto-fill, conditional visibility, multi-select.
- **Other Lina-from-upload use cases** that reuse the same upload+vision substrate: log a PO from a photo (extract -> propose `create_po`), generate documents/contracts.
- **Offline support** for custom forms.
