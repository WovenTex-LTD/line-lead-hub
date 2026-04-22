---
name: Line Lead Hub — Project Overview
description: Core project context — garment factory production tracking SaaS by WovenTex, multi-platform (web/mobile/desktop), Supabase backend, React frontend
type: project
originSessionId: c3ab78b3-22a4-49b5-ab38-3afdf0f5ffe3
---
Line Lead Hub (branded **Production Portal** by **WovenTex**) is a multi-platform garment factory production tracking and management system.

**What it does:** Factories track daily targets (morning) and actuals (end-of-day) across sewing, cutting, finishing, and storage departments. Dashboards show real-time efficiency, financials, blockers, and buyer-facing PO progress.

**Tech stack:** React 18 + TypeScript + Vite | Tailwind + shadcn/ui | Supabase (Postgres + Auth + Edge Functions) | Capacitor (iOS/Android) | Tauri (desktop) | i18next (en/bn/zh) | Stripe billing | RAG chatbot

**Architecture:**
- Multi-tenant via `factory_id` scoping + RLS policies
- No state management library — React Context + TanStack React Query
- Direct Supabase queries in hooks (no REST abstraction)
- Offline-first form submissions via localStorage queue
- 28 Supabase Edge Functions (auth, billing, AI, email, notifications)
- 167 database migrations, ~40+ tables

**Key modules:** Sewing, Cutting, Finishing, Storage (bin cards), Dispatch (gate passes), Buyer Portal, AI Chat, Insights/Analytics, Blockers, Production Notes, Billing/Subscriptions

**Roles:** superadmin, owner, admin, supervisor, sewing/cutting/finishing/storage workers, gate officer, buyer

**Why:** Replaces paper forms and spreadsheets in garment factories. Primary markets are Bangladesh and China — hence Bengali/Chinese i18n support.

**How to apply:** This context should inform all code changes — understand the factory production domain, the role hierarchy, the department structure, and the target/actual workflow pattern.
