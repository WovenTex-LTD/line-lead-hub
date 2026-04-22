# Line Lead Hub — Project Overview

## What It Is

Line Lead Hub (branded as **Production Portal** by **WovenTex**) is a multi-platform garment factory production tracking and management system. It enables factory managers, line leads, supervisors, and buyers to track daily production across sewing, cutting, finishing, and storage departments in real time.

## Problem It Solves

Garment factories need to track daily targets and actuals across multiple production lines, departments, and purchase orders. Without a centralized system, data lives in paper forms and spreadsheets — making real-time visibility, financial analysis, and buyer communication impossible.

## Target Users

| Role | What They Do |
|------|-------------|
| **Superadmin** | Platform-wide administration |
| **Owner** | Factory owner — full factory access |
| **Admin** | Factory management, setup, reports |
| **Supervisor** | View reports, manage lines |
| **Sewing Worker** | Submit daily sewing targets & actuals |
| **Cutting Worker** | Submit daily cutting targets & actuals |
| **Finishing Worker** | Submit daily finishing targets & actuals |
| **Storage Worker** | Manage bin cards and inventory |
| **Gate Officer** | Handle dispatch requests and gate passes |
| **Buyer** | External buyer — view PO progress via buyer portal |

## Core Workflow

```
Morning: Line lead sets targets (manpower, per-hour target, PO assignment)
    ↓
During Day: Production runs against targets
    ↓
End of Day: Line lead submits actuals (output, rejects, rework, OT hours)
    ↓
Dashboard: Management sees real-time efficiency, output, blockers
    ↓
Insights: Weekly/monthly analytics, trends, comparisons
    ↓
Finances: Cost per unit, operating margin, headcount cost analysis
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + TypeScript + Vite |
| **UI** | Tailwind CSS + shadcn/ui (Radix primitives) |
| **State** | React Context + TanStack React Query v5 |
| **Backend** | Supabase (PostgreSQL + Auth + Edge Functions + Storage) |
| **Mobile** | Capacitor v8 (iOS + Android) |
| **Desktop** | Tauri v2 (macOS, Windows, Linux) |
| **i18n** | i18next — English, Bengali, Chinese |
| **Charts** | Recharts |
| **Forms** | React Hook Form + Zod |
| **AI** | RAG chatbot via Supabase Edge Functions + vector embeddings |
| **Billing** | Stripe (subscriptions, checkout, customer portal) |
| **PWA** | vite-plugin-pwa + Workbox |

## Architecture

### Multi-Tenancy

Every record is scoped by `factory_id`. RLS policies enforce tenant isolation at the database level. A factory has:
- Units → Floors → Lines (physical hierarchy)
- Stages (cutting, sewing, finishing, QC, packing)
- Work Orders (POs) assigned to lines

### Data Flow

```
Supabase DB ←→ Supabase Client (browser) ←→ React Components
                    ↓
              React Query (cache)
                    ↓
              Custom Hooks (useActiveLines, useFormConfig, etc.)
                    ↓
              Page Components (Dashboard, TodayUpdates, Insights)
```

No REST API abstraction layer — components call Supabase directly via hooks.

### Offline Support

Forms queue submissions in localStorage when offline. The offline queue syncs automatically when connectivity returns, with retry logic and cross-tab lock prevention.

### Authentication

Supabase Auth with email/password. Custom auth storage adapter supports "remember me" (localStorage vs sessionStorage). Role-based access enforced via `<ProtectedRoute>` and `<SubscriptionGate>` components.

## Key Modules

### 1. Sewing
- Morning targets: manpower, per-hour target, PO, milestones
- End-of-day actuals: good output, rejects, rework, OT hours
- Efficiency calculation: `(good_today / (manpower × hours × target_per_hour)) × 100`
- Financial tracking: estimated cost per unit

### 2. Cutting
- Daily cutting targets: pieces planned, fabric details
- End-of-day: pieces completed, rejects, fabric batch info
- Section-based organization

### 3. Finishing
- Daily targets and actuals (QC pass/fail, packed, shipped)
- Hourly log grid for granular tracking
- Department-wide logs (not line-specific)

### 4. Storage
- Bin card system: receive/issue/balance quantities per PO
- Transaction history with daily tracking
- Header locking for finalized cards

### 5. Dispatch
- Gate pass creation for shipments
- Approval workflow (pending → approved → dispatched)
- Daily sequencing and history

### 6. Buyer Portal
- Separate layout and sidebar
- PO-level access control via `buyer_po_access` table
- Today's updates, submissions, PO details
- Workspace preferences

### 7. AI Chat
- RAG-based assistant with knowledge base
- Document ingestion with vector embeddings (1536 dimensions)
- Citation system linking answers to source documents
- Multi-language support
- Feedback collection (thumbs up/down)

### 8. Insights & Analytics
- Line efficiency trends
- Period comparisons (week-over-week, month-over-month)
- Target vs actual analysis
- Line drill-down with historical data
- Exportable reports (PDF, scheduled email)

### 9. Blockers
- Issue types with default owners and impact levels
- Impact: low, medium, high, critical
- Resolution tracking and history

### 10. Production Notes
- Admin-created notes attached to lines, POs, or departments
- Comment threads with resolution workflow
- Tags and impact classification

## Database

167 migrations defining ~40+ tables. Core tables:

| Table | Purpose |
|-------|---------|
| `factory_accounts` | Multi-tenant root (subscription, settings) |
| `profiles` | Users with factory assignment |
| `user_roles` | Role assignments |
| `work_orders` | Purchase orders (POs) |
| `sewing_targets` / `sewing_actuals` | Daily sewing data |
| `cutting_targets` / `cutting_actuals` | Daily cutting data |
| `finishing_targets` / `finishing_actuals` | Daily finishing data |
| `storage_bin_cards` / `..._transactions` | Inventory tracking |
| `dispatch_requests` | Shipment management |
| `production_notes` | Issue tracking |
| `knowledge_documents` / `knowledge_chunks` | AI knowledge base |
| `chat_conversations` / `chat_messages` | Chat history |
| `notifications` | In-app notifications |

## Edge Functions (28)

- **Auth**: invite user, reset password, rate limiting
- **Billing**: Stripe checkout, subscription management, webhooks
- **AI/Chat**: chat endpoint, embeddings, document ingestion
- **Email**: welcome, insights reports, scheduled emails
- **Notifications**: push delivery, blocker alerts

## Subscription Tiers

Billing via Stripe with tiered plans based on active line count. `<SubscriptionGate>` component enforces feature limits at the UI level.

## Platforms

| Platform | Technology | Status |
|----------|-----------|--------|
| Web (PWA) | Vite + Service Worker | Production |
| iOS | Capacitor | Production |
| Android | Capacitor | Production |
| macOS | Tauri | Production |
| Windows | Tauri | Production |
| Linux | Tauri | Production |

## Development

```bash
npm run dev          # Start dev server (port 8080)
npm run build        # Production build
npm run tauri:dev    # Desktop app dev
npm run tauri:build  # Desktop app build
```

## Key Design Decisions

1. **No state management library** — Context + React Query sufficient
2. **Direct Supabase queries** — no REST abstraction layer
3. **Offline-first forms** — critical for factory environments with spotty connectivity
4. **Role-based multi-tenant** — single codebase, factory-scoped data
5. **i18n from day one** — Bengali/Chinese markets are primary
6. **Form state protection** — disabled refetchOnWindowFocus to prevent form resets on tab switch
