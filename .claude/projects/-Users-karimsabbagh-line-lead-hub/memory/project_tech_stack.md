---
name: Tech Stack and Architecture Details
description: Detailed tech stack, key file locations, dev commands, and architectural patterns for line-lead-hub
type: project
originSessionId: c3ab78b3-22a4-49b5-ab38-3afdf0f5ffe3
---
**Frontend:** React 18.3.1, TypeScript 5.8.3, Vite 5.4.19, Tailwind CSS 3.4.17
**UI:** shadcn/ui (60+ Radix-based components in src/components/ui/)
**State:** React Context (AuthContext, OnboardingContext, TourContext) + TanStack React Query v5
**Forms:** React Hook Form + Zod validation
**Charts:** Recharts 2.15.4
**i18n:** i18next — en.json, bn.json, zh.json in src/i18n/locales/
**Mobile:** Capacitor v8 (app ID: com.woventex.productionportal)
**Desktop:** Tauri v2.9.1
**Backend:** Supabase (project: varolnwetchstlfholbl)

**Key paths:**
- Entry: src/main.tsx → src/App.tsx (router)
- Auth: src/contexts/AuthContext.tsx
- Supabase client: src/integrations/supabase/client.ts
- DB types: src/integrations/supabase/types.ts
- Constants/roles: src/lib/constants.ts
- Offline queue: src/lib/offline-queue.ts
- Error logging: src/lib/error-logger.ts
- Pages: src/pages/ (50+ files)
- Hooks: src/hooks/ (25+ custom hooks)

**Dev commands:**
- `npm run dev` — port 8080
- `npm run build` — production
- `npm run tauri:dev` — desktop dev (port 8082)

**Why:** Understanding file locations and stack choices prevents searching and wrong assumptions.
**How to apply:** Use these paths directly when reading/editing code. Respect the existing patterns (no Redux, no REST abstraction, direct Supabase queries in hooks).
