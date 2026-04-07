# Finance Portal — Technical Reference
## Line Lead Hub / Production Portal

**Branch:** `Finance-portal`
**Last updated:** April 5, 2026
**Supabase project:** `varolnwetchstlfholbl`

---

## Overview

The Finance Portal is a comprehensive ERP-grade financial management system built inside the Production Portal (Line Lead Hub). It is a garment factory finance management tool designed for Bangladeshi RMG factories. It uses a **purple theme** distinct from the main production portal (blue theme), accessed at `/finance/*` routes.

**Access:** Admin and Owner roles only. Controlled by `FinancePortalGate` component (minimum tier: `starter` — available to all plans).

**Tech stack:** React + TypeScript, Supabase (Postgres + Edge Functions + Storage), shadcn/ui, Tailwind CSS, jsPDF for PDF exports, Recharts for charts, Framer Motion for animations.

---

## Architecture

### Layout
- `FinanceLayout` wraps all `/finance/*` routes with the purple-themed sidebar (`FinanceSidebar`)
- `FinancePortalContext` provides BDT/USD exchange rate state
- All routes wrapped in `SubscriptionGate > ProtectedRoute adminOnly > FinancePortalGate`

### Key Patterns
- **Hooks return `{ data, loading, refetch }`** — every mutation calls the specific `refetch` after success, NOT a full page reload
- **`as any` casts** on all Supabase `.from()` calls since generated types may not include new tables
- **SelectItem values** must NEVER be empty string `""` — use `"all"` for filter resets, `"none"` for optional FK fields
- **UUID fields** must convert empty strings to `null` before DB insert/update
- **All arrays** from hooks must use `?? []` fallback in components
- **Delete operations** require `AlertDialog` confirmation
- **Status changes** via `Select` dropdown, not buttons
- **Edge functions** deployed with `--no-verify-jwt` flag

---

## Modules

### 1. Invoicing (`/finance/invoices`)
**Files:**
- `src/pages/finance/InvoiceList.tsx` — list page
- `src/pages/finance/InvoiceForm.tsx` — create/edit
- `src/pages/finance/InvoiceDetail.tsx` — detail view with PDF export
- `src/hooks/useInvoices.ts` — CRUD hooks
- `src/lib/invoice-pdf.ts` — PDF generation

**DB Tables:** `invoices`, `invoice_line_items`, `invoice_charges`, `invoice_tax_lines`

**Features:**
- Commercial, proforma, credit note, debit note invoice types
- Line items with quantity, unit price, discount
- Additional charges and tax lines
- Buyer bank account selection
- PDF export with factory letterhead
- Signature toggle (pulls from `user_signatures` or `factory_finance_settings`)
- Link to work orders

**Key columns added post-migration:** `bank_account_name`, `bank_account_no`, `bank_routing_no`, `seller_name`, `seller_city`, `seller_country`, `seller_phone`, `seller_email`, `tin_number`, `bin_number`, `lc_number`, `lc_date`, `contract_number`, `country_of_dest`, `incoterms`, `packing_type`, `total_gross_weight`, `total_net_weight`, `total_cbm`, `discount_pct`, `show_bank_details`, `internal_notes`, plus line item `color`, `size_range`, `discount_pct`, charge `label`/`is_deduct`, tax `label`/`rate_pct`

---

### 2. Order Costing (`/finance/costing`)
**Files:**
- `src/pages/finance/CostSheetList.tsx` — list with KPIs, search, filters
- `src/pages/finance/CostSheetForm.tsx` — multi-section form (fabric, trims, CM, processes, commercial)
- `src/pages/finance/CostSheetDetail.tsx` — full breakdown view + quotation PDF + internal cost sheet PDF
- `src/hooks/useCostSheets.ts` — CRUD + cost calculation engine

**DB Tables:** `cost_sheets`, `cost_sheet_fabrics`, `cost_sheet_trims`, `cost_sheet_processes`, `cost_sheet_commercial`, `cost_sheet_cm`

**Features:**
- Full garment cost buildup: fabric (multi-row, wastage, consumption), trims (categorized, buyer-supplied toggle), CM (flat or SAM-based), wash/embellishment/testing, commercial costs
- Templates (save/load/duplicate)
- Live cost summary with real-time totals as user edits
- Buyer target price gap analysis
- Scenario comparison (duplicate and modify)
- Quotation PDF (buyer-facing, no internal costs)
- Internal Cost Sheet PDF (full breakdown in tables)
- Status workflow: draft → submitted → approved → sent → accepted → rejected

**Cost calculation (`calcCostSheetTotals`):**
- Fabric: consumption × price × (1 + wastage%) per dozen, converted to base currency
- Trims: qty_per_garment × 12 × unit_price (skip buyer-supplied)
- CM: flat cm_per_dozen OR (labour_cost_per_minute × SAM) / (efficiency/100) × 12 + overhead
- Processes: cost_per_piece × 12
- Commercial: per_piece × 12, per_shipment / (target_qty/12), or percentage of subtotal

---

### 3. Sales Contracts (`/finance/contracts`)
**Files:**
- `src/pages/finance/ContractList.tsx` — list with PO upload modal
- `src/pages/finance/ContractForm.tsx` — form with AI PO extraction pre-fill
- `src/pages/finance/ContractDetail.tsx` — detail with amendments, documents, PDF export
- `src/hooks/useSalesContracts.ts` — CRUD + PO extraction hooks
- `supabase/functions/extract-po/index.ts` — Claude vision edge function for PO scanning

**DB Tables:** `sales_contracts`, `sales_contract_items`, `sales_contract_amendments`, `sales_contract_documents`

**Features:**
- AI-powered PO upload: drag-and-drop PDF → Claude vision extracts buyer, PO numbers, styles, quantities, prices, terms → pre-fills form
- Full contract details: beneficiary/applicant banks, notify party, shipping terms, LC info, commission
- Line items per PO with color/size breakdown
- Amendment history with before/after tracking
- Contract PDF matching real Bangladeshi irrevocable sales contract format (16 numbered sections, signature blocks)
- Signature toggle for PDF export

**Contract PDF format:** Title → Beneficiary → Beneficiary Bank → Applicant → Applicant Bank → Notify Party → Ports → Goods table (grouped by PO with subtotals) → Total Value → Commission → Shipment → Mode → Expiry → Tolerance → Documents → Payment Terms → Additional Clauses → Signature blocks

**Edge function (`extract-po`):** Uses `claude-sonnet-4-20250514`, accepts multipart file or JSON `{ fileUrl }`, returns structured JSON with buyer, PO numbers, styles, quantities, prices, delivery terms.

**Added columns post-initial:** `contract_title`, `beneficiary_bank_*`, `applicant_*`, `notify_party_*`, `end_customer`, `shipment_mode`, `expiry_date`, `tolerance_pct`, `documents_required`, `additional_clauses`, `commission_per_piece`, `agent_bank_*`, `total_value_text`, `place_of_delivery`

---

### 4. LC Management (`/finance/lc`)
**Files:**
- `src/pages/finance/LCList.tsx` — 4-tab command centre (Active LCs, BTB Tracker, Deadlines, Settlement)
- `src/pages/finance/LCDetail.tsx` — full LC view with utilisation, doc checklist, banking costs, discrepancies, shipments, BTB LCs, amendments
- `src/pages/finance/LCForm.tsx` — upload-first LC logging (Claude vision extraction)
- `src/pages/finance/LCSettings.tsx` — bank relationships + notification preferences
- `src/pages/finance/LCReports.tsx` — 8 report types with PDF/CSV export
- `src/hooks/useLCManagement.ts` — comprehensive hooks (~1400 lines)
- `supabase/functions/extract-lc/index.ts` — Claude vision for bank LC documents

**DB Tables:** `master_lcs`, `btb_lcs`, `lc_amendments`, `lc_shipments`, `lc_documents`, `lc_doc_checklist`, `lc_banking_costs`, `lc_discrepancies`, `bank_relationships`, `lc_notification_settings`

**Features:**

*LC List (4 views):*
- **Active LCs** — urgency-coded table (green/amber/red borders), utilization progress bars, sortable columns
- **BTB Tracker** — maturity-focused, cash outflow summary strip (this week/2 weeks/month/next month)
- **Deadlines** — chronological timeline grouping shipment dates, expiry dates, presentation deadlines, BTB maturities by week
- **Settlement** — document submission to payment receipt tracking

*LC Detail:*
- 6 KPI cards (value, utilized, shipped, amendments, days to expiry, banking costs)
- Utilisation tracker with visual progress bar and per-shipment breakdown
- Document checklist with status dropdown (not_started → in_preparation → ready → submitted) and default template (12 standard trade documents)
- Banking costs table with cost type badges
- Discrepancy management with resolution workflow
- Shipment tracking with progressive action buttons (Submit Docs → Accept Docs → Payment Received)
- BTB LC section with status dropdown and edit
- Amendment timeline with value change application to master LC

*LC Form (upload-first):*
- Drag-and-drop LC PDF upload → Claude vision extracts 33+ fields from SWIFT MT700 messages
- Pre-filled stepped form with purple sparkle icons on auto-detected fields
- "Skip — Enter manually" option
- BTB LC mode (simpler form, no upload)

*Key data flows:*
- `total_utilized` = sum of active BTB LC values (recalculated on every BTB create/update/delete/status change)
- `total_shipped` = sum of shipment invoice values (recalculated on every shipment add/delete)
- `total_banking_costs` = sum of banking cost amounts (recalculated on add/update/delete)
- `amendment_count` incremented on each amendment; `lc_value` adjusted by `value_change`; dates updated from amendment

*Reports:*
- Active LC Register, BTB LC Register, Maturity Schedule, Utilisation, Expired LCs, Discrepancy, Banking Cost Summary, Buyer-wise LC Summary
- All exportable as PDF (purple-themed jsPDF) and CSV

*Settings:*
- Bank relationships (limits, utilisation bars, RM contacts)
- Notification preferences (configurable warning days)

**Edge function (`extract-lc`):** Uses `claude-sonnet-4-20250514`, accepts base64 file or multipart, extracts all LC fields including SWIFT field tags (20, 31C, 31D, 32B, 40A, 42C, 43P, 43T, 44A-F, 45A, 46A, 47A, 48, 49, 50, 51a, 57a, 59). Returns `{ success, data: {...fields} }`.

---

### 5. Buyer Summary (`/finance/buyers`)
**Files:**
- `src/pages/finance/BuyerList.tsx` — CRM-style card grid
- `src/pages/finance/BuyerProfileDetail.tsx` — profile with tabs (orders, contracts, invoices, profitability)
- `src/hooks/useBuyerProfiles.ts` — profiles CRUD + stats + linked data

**DB Tables:** `buyer_profiles`

**Features:**
- Auto-seeded from existing `work_orders.buyer` names
- 6 KPI cards (buyers, active, order value, production value, total orders, avg/order)
- Per-buyer cards showing: contact info, financial metrics grid (order value, production value, orders, qty), avg order value, payment terms, incoterms, relationship timeline
- Detail page with 4 tabs: Orders (work orders), Contracts (sales contracts), Invoices, Profitability
- Order Value = order_qty × commercial_price (per piece)
- Production Value = actual sewing output × CM/dozen ÷ 12

**Important:** `company_name` matching to `work_orders.buyer` is case-insensitive via `ilike`. The stats hook (`useBuyerStats`) uses `UPPER()` keys in a Map.

---

### 6. Export Costs (`/finance/export-costs`)
**Files:**
- `src/pages/finance/ExportCosts.tsx` — single-page with dialog for add/edit
- `src/hooks/useExportCosts.ts` — CRUD + summary aggregation

**DB Tables:** `export_costs`

**Features:**
- 13 cost categories: cnf, freight, port, transport, testing, inspection, courier, insurance, documentation, certification, customs, warehousing, other
- Payment status tracking (unpaid/paid/partial) with inline Select dropdown
- Links to work orders, sales contracts, master LCs
- Summary charts: category bar chart, paid/unpaid donut, monthly trend
- CSV and PDF export
- Filters: search, category, payment status, date range, work order

---

### 7. Payments (`/finance/payments`)
**Files:**
- `src/pages/finance/Payments.tsx` — 4-tab command centre
- `src/hooks/usePayments.ts` — 11 hooks

**DB Tables:** `payments` (unified, direction='in'|'out'), `payment_allocations`, `buyer_credits`, `bank_transactions`, `payment_audit_log`

**Features:**

*Unified payments table:* Single `payments` table with `direction` field ('in' or 'out') and 9 categories: invoice_payment, advance, supplier, btb_lc_maturity, payroll, export_cost, bank_charge, overhead, tax.

*Cash Position Summary:* Total receivables, total payables, net position, received/paid this month.

*Upcoming & Outstanding section:* Shows unpaid invoices (with due date and overdue highlighting), active master LCs (expected proceeds), BTB LC maturities (upcoming outflows).

*4 tabs:*
- **Money In** — ageing bucket pills, incoming payment recording with invoice allocation (auto-allocate oldest first), method/status badges
- **Money Out** — categorized outgoing payments, BTB LC/work order linking
- **Reconciliation** — two-column bank statement vs system records matching
- **Cash Flow** — weekly/monthly projection with opening balance and threshold warnings

*Payment recording:* Step wizard (direction → form → invoice allocation for incoming).

*Key fields:* `original_amount`, `original_currency`, `exchange_rate`, `bdt_equivalent`, `usd_equivalent`, `bank_deductions`, `net_amount_credited`. The page maps these to `amount`/`currency` for display.

*Approval workflow:* `pending_approval` → `approved` → `matched`/`unmatched`/`partial`. Soft delete with `deleted_at`/`deleted_by`/`deletion_reason`.

---

### 8. Finance Dashboard (`/finance/dashboard`)
**Files:** `src/pages/finance/FinanceDashboard.tsx`
- Overview of all finance modules
- Links to each module with live/coming-soon badges

### 9. Finance Settings (`/finance/settings`)
**Files:** `src/pages/finance/FinanceSettings.tsx`
- Factory finance configuration: invoice prefix, seller info, bank details, stamp/signature URLs

---

## Database Schema Summary

### Tables created for Finance Portal:
```
invoices, invoice_line_items, invoice_charges, invoice_tax_lines
cost_sheets, cost_sheet_fabrics, cost_sheet_trims, cost_sheet_processes, cost_sheet_commercial, cost_sheet_cm
sales_contracts, sales_contract_items, sales_contract_amendments, sales_contract_documents
master_lcs, btb_lcs, lc_amendments, lc_shipments, lc_documents, lc_doc_checklist, lc_banking_costs, lc_discrepancies
bank_relationships, lc_notification_settings
buyer_profiles
export_costs
payments, payment_allocations, buyer_credits, bank_transactions, payment_audit_log
factory_finance_settings, factory_bank_accounts
```

### RLS Pattern:
- Main tables: `factory_id = get_user_factory_id(auth.uid())` for SELECT, `is_admin_or_higher(auth.uid())` for write
- Child tables: `EXISTS (SELECT 1 FROM parent WHERE parent.id = child.parent_id AND parent.factory_id = get_user_factory_id(auth.uid()))` for SELECT, same + `is_admin_or_higher` for write

### Key columns on `work_orders` added:
- `commercial_price` — buyer's selling price per piece (used for order value calculation)
- `selling_price`, `style_number`, `hs_code` — used by invoice form

### Key columns on `factory_accounts` added:
- `bdt_to_usd_rate` — exchange rate for finance calculations
- `finance_enabled` — feature flag (not currently enforced since all tiers have access)

---

## Edge Functions

| Function | Purpose | Auth | Imports |
|----------|---------|------|---------|
| `extract-po` | Scan PO documents with Claude vision | `--no-verify-jwt` | `jsr:@supabase/supabase-js@2` |
| `extract-lc` | Scan bank LC documents with Claude vision | `--no-verify-jwt` | `jsr:@supabase/supabase-js@2` |
| `admin-invite-user` | Create users with admin API | `--no-verify-jwt` | `jsr:@supabase/supabase-js@2` |

All edge functions use inlined CORS headers (not `_shared/security.ts`) and `ANTHROPIC_API_KEY` from Deno.env for AI extraction.

---

## Financial Calculations

### CM Rule
`PRODUCTION_CM_SHARE = 1.0` (100% of entered CM/dozen is used). Previously was 0.70 (70%). Changed across all pages, exports, and reports. The constant lives in `src/lib/sewing-financials.ts`.

Formula: `output_value = output_pieces × (cm_per_dozen / 12)`

### Order Value vs Production Value
- **Order Value** = `order_qty × commercial_price` (what the buyer pays)
- **Production Value** = `actual_sewing_output × cm_per_dozen / 12` (what factory earns from production)

---

## Known Issues / Technical Debt

1. **Supabase types not generated** — all table operations use `as any` casts. Run `npx supabase gen types` to fix.
2. **LC Detail page complexity** — ~2500 lines, could be split into sub-components.
3. **Payment page uses old field names internally** — maps `original_amount` → `amount`, `original_currency` → `currency` etc. at fetch time.
4. **Edge function imports** — `_shared/security.ts` uses `esm.sh` which can fail on Supabase edge runtime. Functions that inline CORS headers work reliably.
5. **RLS infinite recursion** — `work_orders` had a recursive policy via `buyer_po_access` that was fixed by dropping the pre-existing `Factory admins can manage buyer PO access` policy.

---

## Deployment

```bash
# Deploy edge functions
npx supabase functions deploy extract-po --no-verify-jwt
npx supabase functions deploy extract-lc --no-verify-jwt
npx supabase functions deploy admin-invite-user --no-verify-jwt

# Link project
npx supabase link --project-ref varolnwetchstlfholbl

# Push DB migrations
npx supabase db push

# Run SQL directly
npx supabase db query --linked "SQL HERE"

# Reload PostgREST schema cache after DB changes
npx supabase db query --linked "NOTIFY pgrst, 'reload schema';"
```

---

## File Structure

```
src/
├── pages/finance/
│   ├── FinanceDashboard.tsx
│   ├── FinanceSettings.tsx
│   ├── InvoiceList.tsx / InvoiceForm.tsx / InvoiceDetail.tsx
│   ├── CostSheetList.tsx / CostSheetForm.tsx / CostSheetDetail.tsx
│   ├── ContractList.tsx / ContractForm.tsx / ContractDetail.tsx
│   ├── LCList.tsx / LCDetail.tsx / LCForm.tsx / LCSettings.tsx / LCReports.tsx
│   ├── BuyerList.tsx / BuyerProfileDetail.tsx
│   ├── ExportCosts.tsx
│   └── Payments.tsx
├── hooks/
│   ├── useInvoices.ts
│   ├── useCostSheets.ts
│   ├── useSalesContracts.ts
│   ├── useLCManagement.ts (~1400 lines)
│   ├── useBuyerProfiles.ts
│   ├── useExportCosts.ts
│   ├── usePayments.ts
│   ├── useFactoryFinanceSettings.ts
│   ├── useFactoryBankAccounts.ts
│   └── useUserSignature.ts
├── components/
│   ├── FinancePortalGate.tsx
│   └── layout/
│       ├── FinanceLayout.tsx
│       └── FinanceSidebar.tsx
├── contexts/
│   └── FinancePortalContext.tsx
└── lib/
    ├── invoice-pdf.ts
    └── sewing-financials.ts

supabase/functions/
├── extract-po/index.ts
├── extract-lc/index.ts
└── admin-invite-user/index.ts
```
