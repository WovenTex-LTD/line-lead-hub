# ProductionPortal — Pitch Deck Source Document

> Reference material for composing investor and partner pitch decks.
> Each numbered section maps cleanly to one or more slides; the appendices are deep-dive backup material.

---

## 1. One-line pitch

**ProductionPortal is the operating system for garment-export factories — unifying the floor, the quality lab, the buyer portal, and the finance/LC desk in one multi-tenant platform built for mobile and the back office.**

---

## 2. The market we're attacking

- Global apparel manufacturing is a **~$1.5 trillion** annual industry employing roughly **70 million** workers.
- Bangladesh — the most likely anchor market — exports **>$45 billion / year** in apparel from **~4,500 active export-licensed factories**, plus thousands more sub-tier units. Vietnam, India, Cambodia, and Sri Lanka multiply this footprint.
- Today's factories run on **paper logs, WhatsApp chats, hand-printed Bin Cards, and Excel sheets**. Production-floor data is still copied by hand into spreadsheets every evening.
- The only software in the segment is heavyweight legacy ERP (FAST React, BlueCherry, ApparelMagic, etc.): expensive, web-1.0, desktop-only, and built for the office — not for the people who actually produce the garments.
- Buyers (international brands) currently get their progress updates by **Outlook email and screenshots**.

---

## 3. What ProductionPortal is

A multi-tenant SaaS that collapses four currently-siloed worlds of a garment factory into a single system:

1. **Floor execution** — hourly targets, end-of-day output, blockers, line-to-line handoffs across **Cutting → Sewing → Finishing → Storage → Dispatch**.
2. **Quality (QC)** — checklist-driven inspections at both the daily-floor level and the order-lifecycle level, with admin sign-off and audit-ready PDFs.
3. **Commercial / Finance** — POs, cost sheets, Letters of Credit (master + back-to-back), invoices, payments, multi-currency reconciliation.
4. **External visibility** — brand/buyer portal where customers see live progress on **only their POs** without ever seeing competitor data, enforced cryptographically by Row-Level Security.

It is built **mobile-first for the floor** (responsive PWA + Capacitor iOS/Android wrappers) and **desktop-grade for the office** (full web + macOS desktop via Tauri).

---

## 4. Who uses it

Twelve distinct role types, all factory-scoped:

| Role | Persona | Primary surface |
|---|---|---|
| `owner` | Factory owner / CEO | Dashboard, Insights, Finances |
| `admin` | General manager / production manager | Everything |
| `supervisor` | Floor supervisor / line lead | End-of-day, blockers |
| `worker` | Line operator (legacy) | Sewing / Finishing forms |
| `sewing` | Sewing-department operator | Morning targets, EOD |
| `cutting` | Cutting-room operator | Cutting form, handoffs |
| `finishing` | Finishing operator | Daily target & output |
| `storage` | Warehouse / store-keeper | Bin cards, history |
| `qc` | Quality-control inspector | Daily sheets, order trackers |
| `gate_officer` | Gate-keeper at factory exit | Dispatch requests, gate pass |
| `buyer` | External brand representative | Buyer portal (scoped) |
| `superadmin` | ProductionPortal internal team | All factories |

---

## 5. Product surface — feature inventory

### 5.1 Production Tracking Core *(admin / owner)*

| Page | What it does |
|---|---|
| **Dashboard** | Real-time KPIs (today's updates, blockers, sewing/finishing output, active POs, storage moves), production-notes panel, onboarding checklist for new tenants. |
| **Lines** | Per-line cards (achievement %, output vs target, manpower, PO contribution, anomaly flags). Drill-down drawer with 30-day trends, PO breakdown, and a **QC quality badge** that turns green when a daily sheet has been submitted, deep-linking to the QC review page. PDF + CSV export. |
| **Schedule** | Drag-and-drop Gantt timeline. PO ↔ Line assignment with **visual conflict detection**, ghost-overlay drag preview, multi-grouping (by buyer / by line), KPI strip (on-time delivery %, at-risk orders, delays). |
| **Work Orders** | Dual-view (style-order hierarchy or PO clusters), health-status badges (Not Started · Running · At Risk · Completed), Extras Ledger modal for above-order production. |
| **Today / This Week** | Tabbed views (cutting/sewing/finishing) with daily and weekly summaries; PDF export including revenue and per-line cost in native currency. |
| **Insights** | Multi-chart dashboard (line efficiency, blocker breakdown by type/impact, 30-day volume trend, PO progress pie). Recharts library, drill-down per line, period comparison. |
| **Blockers / Report Blocker** | Unified inbox merging sewing + finishing blockers; impact pills (critical/high/medium/low); bulk-dismiss resolved; quick-submit form with offline-tolerant queue. |
| **Morning Targets / End of Day** | Admin-facing tabbed forms to push targets and capture actuals for the floor. |

**Standouts:** drag-and-drop scheduling with conflict detection · multi-format exports (PDF + CSV) · timezone-aware date handling per factory · QC integration · financial overlay (BDT cost / USD revenue) on every view.

---

### 5.2 Department workflows *(operators)*

| Department | What the operator does |
|---|---|
| **Cutting** | Morning targets (manpower, marker/lay/cutting capacity, hours, OT); end-of-day actuals with auto-cumulative balance; **handoff acknowledgement** for downstream lines; leftover-fabric logging with photo upload and bin assignment. |
| **Sewing** | Per-hour target + manpower + OT; end-of-day good/reject/rework; system auto-calculates cumulative good total; stage / progress / milestone tracking. |
| **Finishing** | Logs across **8 process categories** (thread cutting, inside check, top side check, buttoning, iron, get-up, poly, carton); planned vs actual variance with icons; optional hourly grid. |
| **Storage** | **Bin Cards** with single-PO or bulk-PO mode; running balance recalculated on every receive/issue; full transaction audit trail; dashboard groups bin cards by PO-set signature. |

**Operator-side capabilities:**
- Mobile-first responsive forms (collapsible sections, touch targets).
- **Offline-tolerant** submission queue (`useOfflineSubmission`) — works in dead-zone factory floors.
- **Line-assignment filtering** — non-admin operators see only their assigned lines (via `user_line_assignments`).
- **Deadline cutoffs** per factory — late submissions flagged `is_late=true`, edit window locks after cutoff.
- Auto-calculations server-side: cumulative good, balance, process totals.
- **Headcount-cost calculation** displayed inline using factory's headcount_cost_value (BDT or USD).

---

### 5.3 Quality Control *(QC role + admin)*

The newest module, shipped fully in this development cycle.

**Inspector surface (`qc` role):**
- **Daily QC Sheets** — one sheet per (PO, line, date, shift). Template-driven checklist with sections (Fabric Inspection, In-line QC, Final). Status pills `pending → in_progress → awaiting_signoff → signed_off`.
- **Order Manager Trackers** — one tracker per PO; long-lifecycle phases (Fabric Inspection, Pre-production, In-line, Final Audit). Inspector marks `done / issue / N/A`.
- **My Records** — inspector's own history.

**Admin / reviewer surface:**
- **Admin Sheet Review** — tabbed list (Today, All, Awaiting Sign-off, In Progress, Signed Off) with per-line grouping toggle, date filter, search. Inline sign-off button.
- **Admin Tracker Review** — same pattern for order trackers.
- **Bulk PDF export** — checkbox-select multiple signed-off sheets, generate combined audit-ready PDF with per-item pass/fail, inspector signature, and manager sign-off stamp.
- **Issue dashboard** — filterable by severity (minor / major / critical) and status (open / reviewed / resolved); links back to source sheet/tracker.

**Engineering standouts unique to QC:**
- **Locking triggers** — once a sheet is signed off, Postgres triggers (`qc_block_writes_when_locked`, `qc_block_daily_item_when_locked`) refuse any non-admin write. Read-only by enforcement, not by convention.
- **Orphan-resolution triggers** — deleting a failed item auto-resolves the linked open issue; no broken pointers.
- **Activity-bump triggers** — every item change updates parent `last_activity_at`, powering "Active in 7d" KPIs without app-level bookkeeping.
- **Template versioning** — `template_version` is snapshotted at sheet creation, so future template edits never mutate closed records.
- **Polymorphic issue tracking** — one `qc_issues` table serves both order trackers and daily sheets via `source_type` + `source_record_id` + `source_item_id`.

---

### 5.4 Buyer Portal *(external brand users)*

- **Workspace selector** — buyers with memberships at multiple factories switch tenants without re-authenticating.
- **Today's updates** — sewing output / cutting progress / finishing carton & poly count, scoped to that buyer's POs only.
- **PO drilldown** — cumulative good, reject rate, QC pass rate, storage bin movements per PO.
- **Submissions history** — 30+ day filterable table.
- **Live alerts** — auto-classified risk levels (Healthy / Watch / At Risk / Deadline Passed) based on deadline vs cumulative %.

**RLS-enforced data isolation** is the headline: a buyer at the same factory as a competitor literally cannot query the competitor's POs — enforced by `buyer_po_access` row-level policies.

---

### 5.5 Gate / Dispatch *(gate_officer + admin)*

- **Gate-officer form** to create dispatch requests with PO, qty, truck, driver, destination, photo, remarks. Soft warning if qty exceeds remaining order.
- **Atomic daily auto-sequencing** — Postgres RPC increments `dispatch_daily_sequence` to generate unique `DSP-YYYYMMDD-NNN` reference numbers with zero collisions across concurrent gate officers.
- **Admin approvals queue** — KPI summary (count · total pieces · oldest waiting), search across reference / truck / driver / destination / style / buyer.
- **Approval workflow** — admin signs with stored signature image; generates immutable **gate-pass PDF** that lives in object storage.
- **Rejection with structured reason code**, history view per role, factory-scoped RLS.

---

### 5.6 Finance & Commercial *(admin / owner finance team)*

This is the export-back-office backbone — purpose-built for the LC-driven Bangladesh / South-Asian garment-export model.

| Sub-module | Capability |
|---|---|
| **Cost Sheets** | Per-style costing across CM, fabrics (greige + dyeing), trims, processes (in-house/outsourced), commercial charges. Target price tracking, desired-margin %, template mode, approval workflow. |
| **Sales Contracts** | Line items with delivery & ex-factory dates, amendments with change deltas, attached docs with extraction metadata, applicant/agent/beneficiary bank details. |
| **Letters of Credit** | Master LC + back-to-back LC, lifecycle dates (issue/expiry/presentation), tolerance %, partial-shipment/transhipment rules, amendment count, status. |
| **LC Discrepancies** | Industry-defining detail: discrepancy type, items (JSON), notice date, resolution, root cause, bank charges, link to specific shipment. |
| **LC Document Checklists** | Per-LC required-document list with originals/copies tally and completion tracking. |
| **Banking** | Bank relationships with LC/BTB limits and current utilization, RM contact, SWIFT, branch. Bank-statement transactions with match-confidence reconciliation. |
| **Payments** | Inbound/outbound, multi-currency with FX rates, BDT/USD equivalents, approval status, full audit log (`payment_audit_log`). |
| **Payment Allocations** | Map payments to invoices with forex gain/loss, short-payment reasons and notes. |
| **Invoices** | Commercial / proforma / credit-note / debit-note, with vessel / port / BL / container / carton / weight / CBM, buyer & seller addresses, payment terms, incoterms. Separate child tables for line items, charges, and tax lines. |
| **Buyer Credits** | Track unallocated buyer overpayments, remaining balance, source payment. |
| **Export Costs** | Shipping, documentation, insurance, certification, handling, clearance — linked to LC/contract/PO/shipment. |
| **Factory Bank Accounts & Finance Settings** | Multiple bank accounts (IBAN, routing, SWIFT, currency, default flag), invoice prefix, TIN/BIN, stamp & signature URLs. |

**Differentiator:** the **LC discrepancy + back-to-back LC + amendment + bank-utilization** model is the single most painful workflow in garment export, and no SaaS we're aware of has modeled it this completely.

---

### 5.7 AI Knowledge Base + Chat *(admin)*

- **Document ingestion** — admins upload SOPs / manuals / contracts; client-side chunking, then per-chunk embedding via `ingest-chunk` edge function (service-role inserts avoid edge-function resource limits).
- **Vector storage** — pgvector + cosine similarity.
- **Multi-language** — English + Bengali; language field drives retrieval filtering.
- **Global + factory-scoped** — admins can mark documents as global (factory_id null) to share across deployments.
- **Chat with citations** — RAG-style answers with source citation count and a `no_evidence` flag for unanswered questions.
- **Chat Analytics dashboard** — total / unanswered / 👍 / 👎 counts; filterable question log; feeds future knowledge-base improvements.

---

### 5.8 Dynamic Forms & Admin Customization

- **Form Templates** — admins define their own production-submission forms per factory (sections + fields) without code changes. Field types: text, textarea, select (bound to custom dropdowns), number, date, checkbox.
- **Per-role overrides** — hide fields for some roles, lock fields for others (`form_role_overrides`).
- **Custom Dropdowns** — six configurable dropdown sets per factory: stages, stage progress, next milestones, blocker types, blocker owners, blocker impacts. Drag-and-drop reordering (dnd-kit) with active/inactive soft-delete.
- **User Management** — invitations with role + department + line assignment, signature capture, factory-scoped or global role assignment, orphan cleanup utility.

---

## 6. Platform & Architecture

### Multi-tenancy
Factory-scoped on every table via `factory_id`. Row-Level Security enforces isolation through two SQL functions used in nearly every policy:

```sql
get_user_factory_id(auth.uid())  -- returns the user's tenant
is_admin_or_higher(auth.uid())   -- role gate
```

Cross-factory leakage is **impossible** under the current policy set.

### Stack snapshot

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + TypeScript |
| UI | Tailwind + shadcn/ui + Radix |
| Data viz | Recharts |
| PDF | jsPDF + html2canvas |
| Drag-and-drop | dnd-kit |
| State | TanStack Query + React Context |
| Auth + DB + Storage | Supabase (Postgres + GoTrue + Storage + Realtime) |
| Serverless | 27 Supabase Edge Functions (Deno) |
| Billing | Stripe (Checkout + Customer Portal + Webhooks) |
| i18n | i18next, 3 languages (EN / BN / ZH) |
| Native shells | Capacitor (iOS + Android), Tauri (macOS) |
| CI/CD | Cloudflare Pages with per-branch preview deployments |

### Subscription model
Three tiers, billed by Stripe:

| Tier | Lines | Price |
|---|---|---|
| Starter | 30 | $399 / month |
| Growth | 60 | $549 / month |
| Scale | 100 | $629 / month |

Plus: 14-day free trial · 7-day grace period for past-due · free-access allowlist for internal accounts · Apple-compliant native flow (no in-app payment links, mobile users routed to `productionportal.co` for billing).

---

## 7. Defensible differentiators

1. **LC discrepancy + back-to-back LC modeling** — the most painful, opaque workflow in garment export, fully modeled. No competitor we've found has this depth.
2. **Buyer portal with RLS** — brands get live insight without leaking competitor data, enforced cryptographically.
3. **Locked QC sign-offs with Postgres triggers** — buyer- and regulator-friendly tamper-evident audit trail.
4. **Mobile-first floor UX** — legacy ERPs are desktop-only and can't be used at the cutting table or sewing station.
5. **Dynamic forms** — every factory has its own paperwork; the system adapts without engineering touching code.
6. **Native multi-currency with FX gain/loss** — first-class BDT ↔ USD with forex tracked at payment-allocation level.
7. **Per-branch preview deployments** — `qc.line-lead-hub.pages.dev`, `auth.line-lead-hub.pages.dev`, etc. Every developer (or AI agent) ships preview environments before merging to production. Internal QA velocity multiplier.
8. **27 edge functions** giving a serverless cron, webhook, email, push-notification, and AI-ingestion layer with zero VPS to operate.

---

## 8. Traction & status

- **Live in production** at [productionportal.cloud](https://productionportal.cloud).
- **Anchor customer:** Murad Apparels Limited (Dhaka, Bangladesh).
- **Subscription infrastructure** fully wired with Stripe — ready for self-serve onboarding.
- **iOS / Android** Capacitor builds packaged and ready for app-store distribution.
- **8 cohesive product modules** shipped, including the newest Quality Control module.

---

## 9. Roadmap hooks already in code

- **AI chat over factory data** — embeddings + chat surface already plumbed; can move from documents-only to live operational data.
- **Mobile push notifications** — `push_tokens` table, `send-push-notification` edge function, and notification-preferences UI all in place.
- **Buyer-facing analytics** — `chat_analytics` and the buyer portal create the foundation for brand-side performance benchmarking across factories.
- **Scheduled emails / digests** — `email_schedules` table and `process-scheduled-emails` cron function ready for buyer/admin digests.

---

## Appendix A — Supabase Edge Function inventory (27)

| Function | Domain |
|---|---|
| `check-subscription` | Subscription status (authoritative, Stripe-backed) |
| `create-checkout` | Stripe Checkout Session |
| `stripe-webhook` | Sync subscription events to `factory_accounts` |
| `customer-portal` | Stripe Customer Portal redirect |
| `get-billing-history` | Invoice / payment-method fetch |
| `change-subscription` · `cancel-subscription` | Plan-change & cancel flows |
| `link-factory-subscription` | Link Stripe customer to factory after signup |
| `send-billing-notification` | Failed-payment etc. emails |
| `admin-invite-user` · `admin-reset-password` · `remove-user-access` · `terminate-account` | User management |
| `auth-rate-limit` | Brute-force protection |
| `send-welcome-email` · `send-push-notification` · `send-insights-report` | User engagement |
| `notify-blocker` | Push when a blocker is logged |
| `process-scheduled-emails` · `process-scheduled-notifications` | Cron-triggered batch comms |
| `chat` · `chat-feedback` · `generate-embedding` · `ingest-document` · `ingest-chunk` · `get-source` | AI knowledge base + RAG |

---

## Appendix B — Database surface (98 tables grouped by domain)

> Counts and table names verified by `information_schema` query.

| Domain | Representative tables |
|---|---|
| Tenancy / users | `factory_accounts` · `profiles` · `user_roles` · `user_line_assignments` · `user_signatures` · `floors` · `units` · `lines` |
| Buyer portal | `buyer_profiles` · `buyer_factory_memberships` · `buyer_po_access` · `buyer_workspace_prefs` · `buyer_credits` |
| Work orders | `work_orders` · `style_orders` · `work_order_line_assignments` · `production_schedule` |
| Sewing | `sewing_targets` · `sewing_actuals` · `production_updates_sewing` |
| Cutting | `cutting_targets` · `cutting_actuals` · `cutting_sections` |
| Finishing | `finishing_targets` · `finishing_actuals` · `finishing_daily_sheets` · `finishing_daily_logs` · `finishing_hourly_logs` · `finishing_daily_log_history` · `production_updates_finishing` |
| Storage | `storage_bin_cards` · `storage_bin_card_transactions` |
| Dispatch | `dispatch_requests` · `dispatch_daily_sequence` |
| Quality control | `qc_checklist_templates` · `qc_checklist_template_items` · `qc_daily_sheets` · `qc_daily_sheet_items` · `qc_order_trackers` · `qc_order_tracker_items` · `qc_issues` |
| Cost sheets | `cost_sheets` · `cost_sheet_cm` · `cost_sheet_commercial` · `cost_sheet_fabrics` · `cost_sheet_processes` · `cost_sheet_trims` · `export_costs` |
| Sales contracts | `sales_contracts` · `sales_contract_items` · `sales_contract_amendments` · `sales_contract_documents` |
| Letters of credit | `master_lcs` · `btb_lcs` · `lc_amendments` · `lc_banking_costs` · `lc_discrepancies` · `lc_doc_checklist` · `lc_documents` · `lc_shipments` · `lc_notification_settings` |
| Banking & payments | `bank_relationships` · `bank_transactions` · `factory_bank_accounts` · `factory_finance_settings` · `payments` · `payment_allocations` · `payment_audit_log` · `invoices` · `invoice_line_items` · `invoice_tax_lines` · `invoice_charges` · `extras_ledger` |
| Blockers | `blocker_types` · `blocker_owner_options` · `blocker_impact_options` · `production_notes` · `production_note_comments` |
| Dropdowns / forms | `custom_dropdown_lists` · `custom_dropdown_options` · `form_templates` · `form_sections` · `form_fields` · `form_role_overrides` · `stages` · `stage_progress_options` · `next_milestone_options` |
| AI / knowledge | `knowledge_documents` · `knowledge_chunks` · `document_ingestion_queue` · `chat_conversations` · `chat_messages` · `chat_analytics` |
| Notifications | `notifications` · `notification_preferences` · `push_tokens` · `email_schedules` |
| Security & audit | `audit_log` · `security_events` · `rate_limits` · `app_error_logs` · `role_feature_access` |
| Insights | `daily_insights` |

---

## Appendix C — Suggested slide order for the deck

1. **Cover** — name, tagline, market context
2. **The problem** — paper, WhatsApp, Excel, legacy ERP — concrete photo if possible
3. **Market size** — $1.5T global apparel, $45B Bangladesh export, 4,500+ factories
4. **The pivot moment** — buyers (H&M, Inditex, etc.) demanding real-time data
5. **Our solution** — one screen of dashboard + line drilldown + QC badge
6. **Module tour 1** — Floor execution
7. **Module tour 2** — Quality Control
8. **Module tour 3** — Finance / LC
9. **Module tour 4** — Buyer Portal
10. **Architecture** — multi-tenant, RLS, mobile + desktop, 27 edge functions
11. **Differentiators** — LC depth, buyer RLS, mobile-first, dynamic forms
12. **Traction** — productionportal.cloud, Murad Apparels, ready for self-serve
13. **Business model** — three tiers, $399–$629/mo, 14-day trial
14. **Team & roadmap** — AI on operational data, push notifications, brand benchmarking
15. **Ask** — investment amount, use of funds (sales, factory onboarding, AI investment)

---

*Document version: 1.0 · Source-of-truth for all marketing materials. Update whenever a major module ships.*
