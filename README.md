# ProductionPortal — WovenTex

Factory production management SaaS. Live at **https://productionportal.cloud**.

## Stack

- React 18 + Vite + TypeScript + Tailwind + shadcn/ui
- Supabase (project `varolnwetchstlfholbl`, region ap-south-1)
- Hosted on Cloudflare Pages (auto-deploys from `main`)
- Native apps: Capacitor (iOS/Android), Tauri (Desktop)

## Local Development

```sh
# Install dependencies
npm install

# Start dev server (http://localhost:8080)
npm run dev

# Production build
npm run build
```

Requires a `.env` file with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
