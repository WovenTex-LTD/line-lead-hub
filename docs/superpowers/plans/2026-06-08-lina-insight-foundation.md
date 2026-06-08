# Lina — Insight Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the read-only RAG chatbot into **Lina**, an AI assistant powered by a Claude tool-calling agentic loop that decides what production data to investigate and delivers real, multi-step insights.

**Architecture:** A manual agentic loop runs inside the existing `chat` edge function. Claude is given a registry of typed read-only tools; on each turn it either requests tools (which we execute, role- and factory-scoped, then feed results back) or finishes. The loop, registry, tool executors, and persona live in focused `_shared/` modules. Pure logic takes its dependencies (model caller, Supabase client, embed fn) as injected parameters so it is unit-testable with vitest despite the Deno runtime.

**Tech Stack:** Deno (Supabase edge functions), Claude Messages API (`claude-sonnet-4-6`, native tool use, adaptive thinking, prompt caching), Supabase Postgres + pgvector, React + TypeScript frontend, vitest 4 for tests.

**Spec:** `docs/superpowers/specs/2026-06-08-lina-insight-foundation-design.md`

---

## Conventions for this plan

- **Run a single test file:** `npx vitest run <path>` (there is no `test` npm script; vitest 4 is installed and `vitest.config.ts` uses the node environment and auto-discovers `*.test.ts` outside `node_modules`).
- **Edge-function test caveat:** Deno files import Supabase/zod via `jsr:`/`https://` specifiers and read `Deno.env`. To keep the pure modules vitest-importable: (1) only ever use `import type { ... } from "jsr:..."` (type-only imports are erased by esbuild), and (2) never touch `Deno.env` at module top level or inside pure logic — inject API keys / clients as function parameters. The thin Deno adapters that *do* call `Deno.env`/`fetch` (the real Anthropic caller, the `chat` handler) are **not** unit-tested, consistent with the rest of `supabase/functions/` which has no tests.
- **Commit after every task** (each task ends with a commit step).

## File structure (created / modified)

| File | Responsibility |
|------|----------------|
| `supabase/functions/_shared/tools/types.ts` | **Create.** Shared types: `ToolContext`, `ToolDefinition`, `UserRole`; role/department gating helpers. Pure. |
| `supabase/functions/_shared/tools/types.test.ts` | **Create.** Tests for gating helpers. |
| `supabase/functions/_shared/live-data.ts` | **Modify.** Export the existing fetcher functions so tools can reuse them. |
| `supabase/functions/_shared/tools/insights.ts` | **Create.** The tool executors (production data, blockers, work orders, financials, lines, compare, anomalies, knowledge) wrapping/extending the live-data fetchers. Pure (injected client). |
| `supabase/functions/_shared/tools/insights.test.ts` | **Create.** Tests: role/department gating, financial gating, dispatch. |
| `supabase/functions/_shared/tools/registry.ts` | **Create.** Assembles the `ToolDefinition[]`, exposes `getToolsForRole`, `dispatchTool`. Pure. |
| `supabase/functions/_shared/tools/registry.test.ts` | **Create.** Tests dispatch + role filtering + Anthropic schema export. |
| `supabase/functions/_shared/agent-loop.ts` | **Create.** The manual agentic loop. Pure (injected `callModel` + `executeTool`). |
| `supabase/functions/_shared/agent-loop.test.ts` | **Create.** Tests loop control flow, multi-tool turns, `MAX_TURNS`, tool errors. |
| `supabase/functions/_shared/persona.ts` | **Create.** Lina identity + system-prompt builder (role boundaries preserved from `llm.ts`). Pure. |
| `supabase/functions/_shared/persona.test.ts` | **Create.** Tests prompt contents. |
| `supabase/functions/_shared/llm.ts` | **Modify.** Add the tool-aware Anthropic `ModelCaller` (model → `claude-sonnet-4-6`, adaptive thinking, caching, tools); keep `detectLanguage` + suggested-question parsing. |
| `supabase/functions/chat/index.ts` | **Modify.** Replace the single-shot pipeline with: build tools+persona → run agent loop → persist (incl. `tools_used`). |
| `supabase/migrations/20260608_chat_tools_used.sql` | **Create.** Add nullable `tools_used jsonb` to `chat_messages`. |
| `src/components/chat/ChatPanel.tsx` | **Modify.** Rename to Lina (header/empty-state copy). |
| `src/components/chat/ChatWidget.tsx` | **Modify.** Rename FAB label/tooltip to Lina. |
| `src/components/chat/QuickActions.tsx` | **Modify.** Lina-flavored quick prompts. |

---

## Task 1: Shared tool types & gating helpers

**Files:**
- Create: `supabase/functions/_shared/tools/types.ts`
- Test: `supabase/functions/_shared/tools/types.test.ts`

These pure helpers decide which tools and which production departments each role may access. They are the enforcement primitive the spec requires ("enforced in the executor, not just the prompt").

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/tools/types.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isToolAllowed, allowedDepartmentsForRole, type ToolDefinition } from "./types";

const adminTool: ToolDefinition = {
  name: "get_financials",
  description: "x",
  input_schema: { type: "object", properties: {} },
  allowedRoles: ["admin", "owner"],
  execute: async () => "ok",
};

const openTool: ToolDefinition = {
  name: "get_production_data",
  description: "x",
  input_schema: { type: "object", properties: {} },
  allowedRoles: "all",
  execute: async () => "ok",
};

describe("isToolAllowed", () => {
  it("permits a role listed in allowedRoles", () => {
    expect(isToolAllowed(adminTool, "admin")).toBe(true);
    expect(isToolAllowed(adminTool, "owner")).toBe(true);
  });
  it("denies a role not listed", () => {
    expect(isToolAllowed(adminTool, "worker")).toBe(false);
    expect(isToolAllowed(adminTool, "cutting")).toBe(false);
  });
  it("permits any role when allowedRoles is 'all'", () => {
    expect(isToolAllowed(openTool, "worker")).toBe(true);
    expect(isToolAllowed(openTool, "storage")).toBe(true);
  });
});

describe("allowedDepartmentsForRole", () => {
  it("gives admin/owner all departments", () => {
    expect(allowedDepartmentsForRole("admin")).toEqual(["sewing", "cutting", "finishing"]);
    expect(allowedDepartmentsForRole("owner")).toEqual(["sewing", "cutting", "finishing"]);
  });
  it("restricts worker to sewing + finishing", () => {
    expect(allowedDepartmentsForRole("worker")).toEqual(["sewing", "finishing"]);
  });
  it("restricts cutting role to cutting", () => {
    expect(allowedDepartmentsForRole("cutting")).toEqual(["cutting"]);
  });
  it("gives storage role no production departments", () => {
    expect(allowedDepartmentsForRole("storage")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/tools/types.test.ts`
Expected: FAIL — cannot find module `./types`.

- [ ] **Step 3: Write minimal implementation**

Create `supabase/functions/_shared/tools/types.ts`:

```ts
// Shared types and access-control helpers for Lina's tool layer.
// Pure: only type-only Deno imports (erased at build), no Deno.env access.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type UserRole = "worker" | "storage" | "cutting" | "admin" | "owner" | string;
export type Department = "sewing" | "cutting" | "finishing";

/** Per-request, server-derived context handed to every tool executor.
 *  factoryId/role come from the authenticated user — NEVER from model input. */
export interface ToolContext {
  supabase: SupabaseClient;
  factoryId: string;
  role: UserRole;
  timezone: string | null;
  today: string; // YYYY-MM-DD for the factory's timezone
  language: string;
  embed: (text: string) => Promise<number[]>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  allowedRoles: UserRole[] | "all";
  execute: (ctx: ToolContext, input: Record<string, unknown>) => Promise<string>;
}

export function isToolAllowed(def: ToolDefinition, role: UserRole): boolean {
  if (def.allowedRoles === "all") return true;
  return def.allowedRoles.includes(role);
}

/** Which production departments a role may see. Mirrors the role boundaries
 *  in the existing system prompt: workers see sewing + finishing, cutting role
 *  sees cutting, storage sees none, admin/owner see all. */
export function allowedDepartmentsForRole(role: UserRole): Department[] {
  switch (role) {
    case "admin":
    case "owner":
      return ["sewing", "cutting", "finishing"];
    case "worker":
      return ["sewing", "finishing"];
    case "cutting":
      return ["cutting"];
    default:
      return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/_shared/tools/types.test.ts`
Expected: PASS (10 assertions).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/tools/types.ts supabase/functions/_shared/tools/types.test.ts
git commit -m "feat(lina): tool context types + role/department gating helpers"
```

---

## Task 2: Export existing live-data fetchers for reuse

**Files:**
- Modify: `supabase/functions/_shared/live-data.ts`

The insight tools reuse the battle-tested query+aggregate logic already in `live-data.ts` (DRY). Those functions are currently module-private. Export them. No behavior change.

- [ ] **Step 1: Add `export` to the fetcher declarations**

In `supabase/functions/_shared/live-data.ts`, change each of these function declarations from `async function` to `export async function` (they currently start at the lines noted):

- `fetchSewingOutput` (line ~304)
- `fetchSewingTargets` (line ~341)
- `fetchBlockers` (line ~372)
- `fetchWorkOrders` (line ~442)
- `fetchCutting` (line ~642)
- `fetchFinishing` (line ~679)
- `fetchLines` (line ~729)
- `fetchFactorySummary` (line ~796)
- `fetchFinancials` (line ~902)

Example (apply the same edit to each):

```ts
// before
async function fetchSewingOutput(
// after
export async function fetchSewingOutput(
```

- [ ] **Step 2: Verify the file still type-checks against the rest of the build**

Run: `npx tsc --noEmit -p tsconfig.json 2>/dev/null; echo "tsc exit: $?"`
Expected: no NEW errors referencing `live-data.ts` (edge functions are excluded from the app tsconfig, so this mainly confirms nothing else broke). If `tsc` reports pre-existing unrelated errors, that's fine — confirm none mention `live-data.ts`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/live-data.ts
git commit -m "refactor(lina): export live-data fetchers for tool reuse"
```

---

## Task 3: Insight tool executors (production, blockers, work orders, financials, lines)

**Files:**
- Create: `supabase/functions/_shared/tools/insights.ts`
- Test: `supabase/functions/_shared/tools/insights.test.ts`

Each executor wraps an exported live-data fetcher, applies role/department gating, and returns the fetcher's `summary` string (already LLM-formatted). The Supabase client is injected via `ToolContext`, so a fake client makes these unit-testable.

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/tools/insights.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getProductionData, getFinancials, getBlockers } from "./insights";
import type { ToolContext } from "./types";

// Minimal fake Supabase query builder that returns canned rows.
function fakeSupabase(rowsByTable: Record<string, any[]>) {
  const make = (table: string) => {
    const builder: any = {
      _rows: rowsByTable[table] ?? [],
      select() { return builder; },
      eq() { return builder; },
      in() { return builder; },
      ilike() { return builder; },
      order() { return builder; },
      limit() { return Promise.resolve({ data: builder._rows, error: null }); },
      single() { return Promise.resolve({ data: builder._rows[0] ?? null, error: null }); },
      then(resolve: any) { return resolve({ data: builder._rows, error: null }); },
    };
    return builder;
  };
  return { from: (t: string) => make(t) } as any;
}

function ctx(role: string, supabase: any): ToolContext {
  return {
    supabase,
    factoryId: "fac-1",
    role,
    timezone: "Asia/Dhaka",
    today: "2026-06-08",
    language: "en",
    embed: async () => new Array(1536).fill(0),
  };
}

describe("getProductionData", () => {
  it("returns a sewing summary string for an admin", async () => {
    const sb = fakeSupabase({
      sewing_actuals: [{ good_today: 100, reject_today: 2, rework_today: 1, manpower_actual: 10, cumulative_good_total: 500, lines: { name: "Line A" }, work_orders: { po_number: "PO1" } }],
    });
    const out = await getProductionData(ctx("admin", sb), { department: "sewing" });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });

  it("denies a worker asking for cutting data", async () => {
    const sb = fakeSupabase({});
    const out = await getProductionData(ctx("worker", sb), { department: "cutting" });
    expect(out.toLowerCase()).toContain("don't have access");
  });

  it("denies a storage role asking for any production data", async () => {
    const sb = fakeSupabase({});
    const out = await getProductionData(ctx("storage", sb), { department: "sewing" });
    expect(out.toLowerCase()).toContain("don't have access");
  });
});

describe("getFinancials", () => {
  it("denies a non-admin/owner", async () => {
    const sb = fakeSupabase({});
    const out = await getFinancials(ctx("worker", sb), {});
    expect(out.toLowerCase()).toContain("don't have access");
  });
});

describe("getBlockers", () => {
  it("returns a blockers summary for a worker", async () => {
    const sb = fakeSupabase({ production_updates_sewing: [], production_updates_finishing: [] });
    const out = await getBlockers(ctx("worker", sb), {});
    expect(typeof out).toBe("string");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/tools/insights.test.ts`
Expected: FAIL — cannot find module `./insights`.

- [ ] **Step 3: Write minimal implementation**

Create `supabase/functions/_shared/tools/insights.ts`:

```ts
// Lina insight tool executors. Each wraps an exported live-data fetcher and
// enforces role/department access. Pure: Supabase client comes from ToolContext.

import type { ToolContext, Department } from "./types";
import { allowedDepartmentsForRole } from "./types";
import {
  fetchSewingOutput,
  fetchCutting,
  fetchFinishing,
  fetchBlockers,
  fetchWorkOrders,
  fetchLines,
  fetchFinancials,
} from "../live-data.ts";

const DENY = (what: string) =>
  `You don't have access to ${what}. This data is restricted for your role — please contact your administrator if you need it.`;

/** get_production_data(department, [date]) — sewing/cutting/finishing actuals. */
export async function getProductionData(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  const dept = String(input.department ?? "sewing") as Department;
  const date = typeof input.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.date)
    ? input.date
    : ctx.today;

  if (!allowedDepartmentsForRole(ctx.role).includes(dept)) {
    return DENY(`${dept} production data`);
  }

  let result;
  if (dept === "sewing") result = await fetchSewingOutput(ctx.supabase, ctx.factoryId, date);
  else if (dept === "cutting") result = await fetchCutting(ctx.supabase, ctx.factoryId, date);
  else result = await fetchFinishing(ctx.supabase, ctx.factoryId, date);

  return result.error ? `(${result.error})` : result.summary;
}

/** get_blockers() — open/in-progress blockers across sewing + finishing. */
export async function getBlockers(ctx: ToolContext, _input: Record<string, unknown>): Promise<string> {
  if (allowedDepartmentsForRole(ctx.role).length === 0) return DENY("blocker data");
  const result = await fetchBlockers(ctx.supabase, ctx.factoryId);
  return result.error ? `(${result.error})` : result.summary;
}

/** get_work_orders([po], [buyer]) — PO status, quantities, progress, ex-factory. */
export async function getWorkOrders(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (allowedDepartmentsForRole(ctx.role).length === 0) return DENY("work order data");
  const po = typeof input.po === "string" ? input.po : null;
  const buyer = typeof input.buyer === "string" ? input.buyer : null;
  const result = await fetchWorkOrders(ctx.supabase, ctx.factoryId, po, buyer, ctx.today);
  return result.error ? `(${result.error})` : result.summary;
}

/** get_lines() — per-line efficiency overview (sewing). */
export async function getLines(ctx: ToolContext, _input: Record<string, unknown>): Promise<string> {
  if (!allowedDepartmentsForRole(ctx.role).includes("sewing")) return DENY("line performance data");
  const result = await fetchLines(ctx.supabase, ctx.factoryId, ctx.today);
  return result.error ? `(${result.error})` : result.summary;
}

/** get_financials() — admin/owner only. Revenue/cost/profit/margin. */
export async function getFinancials(ctx: ToolContext, _input: Record<string, unknown>): Promise<string> {
  if (ctx.role !== "admin" && ctx.role !== "owner") return DENY("financial data");
  const result = await fetchFinancials(ctx.supabase, ctx.factoryId, ctx.today);
  return result.error ? `(${result.error})` : result.summary;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/_shared/tools/insights.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/tools/insights.ts supabase/functions/_shared/tools/insights.test.ts
git commit -m "feat(lina): production/blocker/work-order/lines/financials tool executors"
```

---

## Task 4: `compare_periods` and `find_anomalies` executors

**Files:**
- Modify: `supabase/functions/_shared/tools/insights.ts`
- Modify: `supabase/functions/_shared/tools/insights.test.ts`

Two analysis tools that don't map 1:1 to an existing fetcher. `compare_periods` sums sewing good-output between two date ranges and reports the delta. `find_anomalies` flags lines behind target and reject spikes for today.

- [ ] **Step 1: Add failing tests**

Append to `supabase/functions/_shared/tools/insights.test.ts`:

```ts
import { comparePeriods, findAnomalies } from "./insights";

describe("comparePeriods", () => {
  it("reports the delta between two windows for an admin", async () => {
    // Builder returns different rows per call via a queue.
    let call = 0;
    const sb: any = {
      from() {
        const b: any = {
          select() { return b; }, eq() { return b; }, gte() { return b; }, lte() { return b; },
          then(resolve: any) {
            call += 1;
            const data = call === 1
              ? [{ good_today: 100 }, { good_today: 50 }]   // period A = 150
              : [{ good_today: 80 }, { good_today: 40 }];   // period B = 120
            return resolve({ data, error: null });
          },
        };
        return b;
      },
    };
    const out = await comparePeriods(ctx("admin", sb), {
      metric: "sewing_good",
      period_a_start: "2026-06-01", period_a_end: "2026-06-01",
      period_b_start: "2026-05-25", period_b_end: "2026-05-25",
    });
    expect(out).toContain("150");
    expect(out).toContain("120");
  });

  it("denies storage role", async () => {
    const out = await comparePeriods(ctx("storage", fakeSupabase({})), { metric: "sewing_good", period_a_start: "2026-06-01", period_a_end: "2026-06-01", period_b_start: "2026-05-25", period_b_end: "2026-05-25" });
    expect(out.toLowerCase()).toContain("don't have access");
  });
});

describe("findAnomalies", () => {
  it("flags a line behind target", async () => {
    const sb = fakeSupabase({
      lines: [{ id: "l1", line_id: "A", name: "Line A", is_active: true }],
      sewing_actuals: [{ line_id: "l1", good_today: 200 }],
      sewing_targets: [{ line_id: "l1", per_hour_target: 100 }], // daily target 800 → 25%
    });
    const out = await findAnomalies(ctx("admin", sb), {});
    expect(out.toLowerCase()).toContain("line a");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/tools/insights.test.ts`
Expected: FAIL — `comparePeriods`/`findAnomalies` not exported.

- [ ] **Step 3: Implement**

Append to `supabase/functions/_shared/tools/insights.ts`:

```ts
/** compare_periods(metric, period_a_*, period_b_*) — currently supports the
 *  "sewing_good" metric (sum of good_today). Returns a delta summary. */
export async function comparePeriods(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!allowedDepartmentsForRole(ctx.role).includes("sewing")) return DENY("production comparison data");

  const metric = String(input.metric ?? "sewing_good");
  if (metric !== "sewing_good") {
    return `Comparison for metric "${metric}" isn't available yet. Supported: sewing_good.`;
  }
  const aStart = String(input.period_a_start);
  const aEnd = String(input.period_a_end);
  const bStart = String(input.period_b_start);
  const bEnd = String(input.period_b_end);

  const sumGood = async (start: string, end: string): Promise<number> => {
    const { data, error } = await ctx.supabase
      .from("sewing_actuals")
      .select("good_today")
      .eq("factory_id", ctx.factoryId)
      .gte("production_date", start)
      .lte("production_date", end);
    if (error) return 0;
    return (data ?? []).reduce((s: number, r: any) => s + (r.good_today || 0), 0);
  };

  const a = await sumGood(aStart, aEnd);
  const b = await sumGood(bStart, bEnd);
  const delta = a - b;
  const pct = b > 0 ? Math.round((delta / b) * 1000) / 10 : null;
  const dir = delta > 0 ? "up" : delta < 0 ? "down" : "unchanged";

  return [
    `Sewing good output comparison:`,
    `- Period A (${aStart}…${aEnd}): ${a} pcs`,
    `- Period B (${bStart}…${bEnd}): ${b} pcs`,
    `- Change: ${dir} ${Math.abs(delta)} pcs${pct !== null ? ` (${pct}%)` : ""}`,
  ].join("\n");
}

/** find_anomalies() — flags sewing lines below 80% of daily target and reject
 *  rates over 5% for today. */
export async function findAnomalies(ctx: ToolContext, _input: Record<string, unknown>): Promise<string> {
  if (!allowedDepartmentsForRole(ctx.role).includes("sewing")) return DENY("anomaly data");

  const [linesR, actR, tgtR] = await Promise.all([
    ctx.supabase.from("lines").select("id, line_id, name, is_active").eq("factory_id", ctx.factoryId).eq("is_active", true),
    ctx.supabase.from("sewing_actuals").select("line_id, good_today, reject_today").eq("factory_id", ctx.factoryId).eq("production_date", ctx.today),
    ctx.supabase.from("sewing_targets").select("line_id, per_hour_target").eq("factory_id", ctx.factoryId).eq("production_date", ctx.today),
  ]);

  const lines = (linesR.data ?? []) as any[];
  const actuals = (actR.data ?? []) as any[];
  const targets = (tgtR.data ?? []) as any[];

  const goodByLine = new Map<string, number>();
  const rejectByLine = new Map<string, number>();
  for (const a of actuals) {
    goodByLine.set(a.line_id, (goodByLine.get(a.line_id) || 0) + (a.good_today || 0));
    rejectByLine.set(a.line_id, (rejectByLine.get(a.line_id) || 0) + (a.reject_today || 0));
  }
  const dailyTargetByLine = new Map<string, number>();
  for (const t of targets) {
    dailyTargetByLine.set(t.line_id, (dailyTargetByLine.get(t.line_id) || 0) + (t.per_hour_target || 0) * 8);
  }

  const flags: string[] = [];
  for (const line of lines) {
    const name = line.name || line.line_id;
    const good = goodByLine.get(line.id) || 0;
    const reject = rejectByLine.get(line.id) || 0;
    const target = dailyTargetByLine.get(line.id) || 0;
    if (target > 0) {
      const eff = Math.round((good / target) * 100);
      if (eff < 80) flags.push(`- ${name}: behind target at ${eff}% (${good}/${target} pcs)`);
    }
    const produced = good + reject;
    if (produced > 0) {
      const rejRate = Math.round((reject / produced) * 1000) / 10;
      if (rejRate > 5) flags.push(`- ${name}: high reject rate ${rejRate}% (${reject} rejects)`);
    }
  }

  if (flags.length === 0) return "No anomalies detected today — all reporting lines are at or near target with normal reject rates.";
  return `Anomalies detected today (${ctx.today}):\n${flags.join("\n")}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/_shared/tools/insights.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/tools/insights.ts supabase/functions/_shared/tools/insights.test.ts
git commit -m "feat(lina): compare_periods and find_anomalies analysis tools"
```

---

## Task 5: `search_knowledge` executor (RAG on demand)

**Files:**
- Modify: `supabase/functions/_shared/tools/insights.ts`
- Modify: `supabase/functions/_shared/tools/insights.test.ts`

Exposes the existing vector search as a tool Lina calls only when she needs docs. Embedding happens via the injected `ctx.embed` (so tests don't hit OpenAI).

- [ ] **Step 1: Add failing test**

Append to `supabase/functions/_shared/tools/insights.test.ts`:

```ts
import { searchKnowledge } from "./insights";

describe("searchKnowledge", () => {
  it("embeds the query and returns formatted chunks", async () => {
    let embedded = "";
    const rpcCalls: any[] = [];
    const sb: any = {
      rpc(name: string, args: any) {
        rpcCalls.push({ name, args });
        return Promise.resolve({
          data: [{ document_title: "Safety Manual", section_heading: "Fire", content: "Use exit B.", similarity: 0.42 }],
          error: null,
        });
      },
    };
    const c = ctx("worker", sb);
    c.embed = async (t: string) => { embedded = t; return new Array(1536).fill(0.1); };
    const out = await searchKnowledge(c, { query: "fire exit" });
    expect(embedded).toBe("fire exit");
    expect(rpcCalls[0].name).toBe("search_knowledge");
    expect(out).toContain("Safety Manual");
  });

  it("reports when nothing relevant is found", async () => {
    const sb: any = { rpc: () => Promise.resolve({ data: [], error: null }) };
    const c = ctx("worker", sb);
    c.embed = async () => new Array(1536).fill(0);
    const out = await searchKnowledge(c, { query: "xyz" });
    expect(out.toLowerCase()).toContain("no");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/tools/insights.test.ts`
Expected: FAIL — `searchKnowledge` not exported.

- [ ] **Step 3: Implement**

Append to `supabase/functions/_shared/tools/insights.ts`:

```ts
function formatChunks(rows: any[]): string {
  return rows
    .map((r, i) => {
      const loc = r.page_number ? `Page ${r.page_number}` : r.section_heading || "General";
      return `[${i + 1}] ${r.document_title} (${loc}, ${(r.similarity * 100).toFixed(0)}% match):\n${r.content}`;
    })
    .join("\n\n");
}

/** search_knowledge(query) — vector RAG over knowledge_chunks. Embeds on demand. */
export async function searchKnowledge(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  const query = String(input.query ?? "").trim();
  if (!query) return "No search query was provided.";

  const embedding = await ctx.embed(query);
  const embeddingStr = `[${embedding.join(",")}]`;

  const primary = await ctx.supabase.rpc("search_knowledge", {
    query_embedding: embeddingStr,
    match_threshold: 0.3,
    match_count: 8,
    p_factory_id: ctx.factoryId,
    p_language: null,
  });
  let rows = (primary.data ?? []) as any[];

  if (rows.length === 0) {
    const fallback = await ctx.supabase.rpc("search_knowledge", {
      query_embedding: embeddingStr,
      match_threshold: 0.15,
      match_count: 5,
      p_factory_id: ctx.factoryId,
      p_language: null,
    });
    rows = (fallback.data ?? []) as any[];
  }

  if (rows.length === 0) {
    return "No relevant documentation was found in the knowledge base for that query.";
  }
  return formatChunks(rows);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/_shared/tools/insights.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/tools/insights.ts supabase/functions/_shared/tools/insights.test.ts
git commit -m "feat(lina): search_knowledge RAG-on-demand tool"
```

---

## Task 6: Tool registry

**Files:**
- Create: `supabase/functions/_shared/tools/registry.ts`
- Test: `supabase/functions/_shared/tools/registry.test.ts`

Assembles all executors into `ToolDefinition`s with Anthropic-shaped `input_schema` and prescriptive descriptions, and exposes `getToolsForRole` (for the API request) and `dispatchTool` (used by the loop).

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/tools/registry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ALL_TOOLS, getToolsForRole, toAnthropicTools, dispatchTool } from "./registry";
import type { ToolContext } from "./types";

function ctx(role: string): ToolContext {
  return {
    supabase: {} as any,
    factoryId: "fac-1",
    role,
    timezone: "Asia/Dhaka",
    today: "2026-06-08",
    language: "en",
    embed: async () => [],
  };
}

describe("registry", () => {
  it("includes the seven Phase-1 tools", () => {
    const names = ALL_TOOLS.map((t) => t.name).sort();
    expect(names).toEqual([
      "compare_periods", "find_anomalies", "get_blockers", "get_financials",
      "get_lines", "get_production_data", "get_work_orders", "search_knowledge",
    ].sort());
  });

  it("hides get_financials from a worker but shows it to an owner", () => {
    expect(getToolsForRole("worker").map((t) => t.name)).not.toContain("get_financials");
    expect(getToolsForRole("owner").map((t) => t.name)).toContain("get_financials");
  });

  it("emits Anthropic tool schema with name/description/input_schema only", () => {
    const schema = toAnthropicTools(getToolsForRole("admin"));
    for (const t of schema) {
      expect(Object.keys(t).sort()).toEqual(["description", "input_schema", "name"]);
    }
  });

  it("dispatchTool returns an access-denied string for an unknown tool", async () => {
    const out = await dispatchTool("not_a_tool", {}, ctx("admin"));
    expect(out.toLowerCase()).toContain("unknown tool");
  });

  it("dispatchTool refuses a tool the role may not use", async () => {
    const out = await dispatchTool("get_financials", {}, ctx("worker"));
    expect(out.toLowerCase()).toContain("don't have access");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/tools/registry.test.ts`
Expected: FAIL — cannot find module `./registry`.

- [ ] **Step 3: Write minimal implementation**

Create `supabase/functions/_shared/tools/registry.ts`:

```ts
// Lina tool registry: assembles executors into role-filtered ToolDefinitions,
// exposes Anthropic schema export + dispatch with access control.

import type { ToolContext, ToolDefinition, UserRole } from "./types";
import { isToolAllowed } from "./types";
import {
  getProductionData, getBlockers, getWorkOrders, getLines,
  getFinancials, comparePeriods, findAnomalies, searchKnowledge,
} from "./insights";

export const ALL_TOOLS: ToolDefinition[] = [
  {
    name: "get_production_data",
    description: "Get a department's production output for a day. Call this when the user asks how much was sewn/cut/finished, today's output, rejects, rework, or manpower. department is required.",
    input_schema: {
      type: "object",
      properties: {
        department: { type: "string", enum: ["sewing", "cutting", "finishing"], description: "Which department's data to fetch." },
        date: { type: "string", description: "Production date YYYY-MM-DD. Defaults to today." },
      },
      required: ["department"],
    },
    allowedRoles: "all",
    execute: getProductionData,
  },
  {
    name: "get_blockers",
    description: "List open and in-progress production blockers across sewing and finishing. Call this when the user asks about issues, delays, problems, what's blocked, or bottlenecks.",
    input_schema: { type: "object", properties: {} },
    allowedRoles: "all",
    execute: getBlockers,
  },
  {
    name: "get_work_orders",
    description: "Get purchase-order / work-order status: quantities, progress, buyers, ex-factory dates. Call this for questions about POs, orders, buyers, shipment readiness, or order progress. Optionally filter by po or buyer.",
    input_schema: {
      type: "object",
      properties: {
        po: { type: "string", description: "PO number to filter by." },
        buyer: { type: "string", description: "Buyer/brand name to filter by." },
      },
    },
    allowedRoles: "all",
    execute: getWorkOrders,
  },
  {
    name: "get_lines",
    description: "Get a per-line efficiency overview for today (output vs target). Call this for questions about line performance, which lines are behind, best/worst line, or efficiency.",
    input_schema: { type: "object", properties: {} },
    allowedRoles: "all",
    execute: getLines,
  },
  {
    name: "get_financials",
    description: "Get today's revenue, cost, profit, and margin with per-PO and per-department breakdowns. Call this for any money/financial question. Restricted to admin and owner.",
    input_schema: { type: "object", properties: {} },
    allowedRoles: ["admin", "owner"],
    execute: getFinancials,
  },
  {
    name: "compare_periods",
    description: "Compare sewing good output between two date ranges and report the delta. Call this when the user wants a trend, a week-over-week change, or 'vs last week/month'. Provide period_a (more recent) and period_b (baseline) date ranges.",
    input_schema: {
      type: "object",
      properties: {
        metric: { type: "string", enum: ["sewing_good"], description: "Metric to compare." },
        period_a_start: { type: "string", description: "YYYY-MM-DD" },
        period_a_end: { type: "string", description: "YYYY-MM-DD" },
        period_b_start: { type: "string", description: "YYYY-MM-DD" },
        period_b_end: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["metric", "period_a_start", "period_a_end", "period_b_start", "period_b_end"],
    },
    allowedRoles: "all",
    execute: comparePeriods,
  },
  {
    name: "find_anomalies",
    description: "Scan today's sewing lines for problems: lines below 80% of target and reject rates over 5%. Call this when the user asks what's wrong, what needs attention, or for a health check.",
    input_schema: { type: "object", properties: {} },
    allowedRoles: "all",
    execute: findAnomalies,
  },
  {
    name: "search_knowledge",
    description: "Search the factory knowledge base (manuals, policies, FAQs, certificates) for documentation. Call this when the user asks how to do something, about compliance/certifications, or for guidance not answerable from live production numbers.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "What to search for." } },
      required: ["query"],
    },
    allowedRoles: "all",
    execute: searchKnowledge,
  },
];

export function getToolsForRole(role: UserRole): ToolDefinition[] {
  return ALL_TOOLS.filter((t) => isToolAllowed(t, role));
}

export function toAnthropicTools(tools: ToolDefinition[]): { name: string; description: string; input_schema: Record<string, unknown> }[] {
  return tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
}

export async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const tool = ALL_TOOLS.find((t) => t.name === name);
  if (!tool) return `Unknown tool: ${name}.`;
  if (!isToolAllowed(tool, ctx.role)) {
    return `You don't have access to ${name}. This tool is restricted for your role.`;
  }
  try {
    return await tool.execute(ctx, input ?? {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `(Tool ${name} failed: ${msg})`;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/_shared/tools/registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/tools/registry.ts supabase/functions/_shared/tools/registry.test.ts
git commit -m "feat(lina): tool registry with role filtering, schema export, dispatch"
```

---

## Task 7: The agentic loop

**Files:**
- Create: `supabase/functions/_shared/agent-loop.ts`
- Test: `supabase/functions/_shared/agent-loop.test.ts`

The loop calls the model, executes any requested tools, feeds results back, and repeats up to `MAX_TURNS`. Both the model caller and the tool executor are injected, so it is fully testable with mocks.

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/agent-loop.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { runAgentLoop, type ModelTurn } from "./agent-loop";

function turn(partial: Partial<ModelTurn>): ModelTurn {
  return {
    stopReason: "end_turn",
    text: "",
    toolUses: [],
    assistantContent: [],
    usage: { inputTokens: 0, outputTokens: 0 },
    ...partial,
  };
}

describe("runAgentLoop", () => {
  it("returns immediately when the model ends the turn with no tools", async () => {
    const callModel = vi.fn(async () => turn({ stopReason: "end_turn", text: "Hello!" }));
    const executeTool = vi.fn(async () => "unused");
    const res = await runAgentLoop({ initialMessages: [], callModel, executeTool });
    expect(res.finalText).toBe("Hello!");
    expect(res.turns).toBe(1);
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("executes a requested tool then finishes on the next turn", async () => {
    const calls: ModelTurn[] = [
      turn({ stopReason: "tool_use", text: "", toolUses: [{ id: "tu1", name: "get_blockers", input: {} }], assistantContent: [{ type: "tool_use", id: "tu1", name: "get_blockers", input: {} }] }),
      turn({ stopReason: "end_turn", text: "There are 2 blockers." }),
    ];
    let i = 0;
    const callModel = vi.fn(async () => calls[i++]);
    const executeTool = vi.fn(async (name: string) => `result for ${name}`);
    const res = await runAgentLoop({ initialMessages: [{ role: "user", content: "blockers?" }], callModel, executeTool });
    expect(executeTool).toHaveBeenCalledWith("get_blockers", {});
    expect(res.finalText).toBe("There are 2 blockers.");
    expect(res.toolsUsed).toEqual([{ name: "get_blockers", input: {} }]);
    expect(res.turns).toBe(2);
  });

  it("handles multiple tool_uses in one turn", async () => {
    const calls: ModelTurn[] = [
      turn({ stopReason: "tool_use", toolUses: [
        { id: "a", name: "get_lines", input: {} },
        { id: "b", name: "get_blockers", input: {} },
      ], assistantContent: [] }),
      turn({ stopReason: "end_turn", text: "done" }),
    ];
    let i = 0;
    const callModel = vi.fn(async () => calls[i++]);
    const executeTool = vi.fn(async (name: string) => `r:${name}`);
    const res = await runAgentLoop({ initialMessages: [], callModel, executeTool });
    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(res.toolsUsed.map((t) => t.name)).toEqual(["get_lines", "get_blockers"]);
  });

  it("stops at MAX_TURNS even if the model keeps requesting tools", async () => {
    const callModel = vi.fn(async () => turn({ stopReason: "tool_use", text: "still working", toolUses: [{ id: "x", name: "get_lines", input: {} }] }));
    const executeTool = vi.fn(async () => "r");
    const res = await runAgentLoop({ initialMessages: [], callModel, executeTool, maxTurns: 3 });
    expect(callModel).toHaveBeenCalledTimes(3);
    expect(res.turns).toBe(3);
    expect(res.finalText).toContain("still working");
  });

  it("feeds a failed tool result back as an error block without crashing", async () => {
    const calls: ModelTurn[] = [
      turn({ stopReason: "tool_use", toolUses: [{ id: "z", name: "boom", input: {} }] }),
      turn({ stopReason: "end_turn", text: "recovered" }),
    ];
    let i = 0;
    const callModel = vi.fn(async () => calls[i++]);
    const executeTool = vi.fn(async () => { throw new Error("kaboom"); });
    const res = await runAgentLoop({ initialMessages: [], callModel, executeTool });
    expect(res.finalText).toBe("recovered");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/agent-loop.test.ts`
Expected: FAIL — cannot find module `./agent-loop`.

- [ ] **Step 3: Write minimal implementation**

Create `supabase/functions/_shared/agent-loop.ts`:

```ts
// Manual Claude tool-calling loop. Pure: callModel and executeTool are injected.
// This is the insertion point for future confirmation-gated write actions.

export interface ToolUseRequest {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ModelTurn {
  stopReason: string;            // "tool_use" | "end_turn" | ...
  text: string;                  // concatenated text blocks for this turn
  toolUses: ToolUseRequest[];
  assistantContent: unknown[];   // raw content array to append to messages verbatim
  usage: { inputTokens: number; outputTokens: number };
}

export type ModelCaller = (messages: unknown[]) => Promise<ModelTurn>;
export type ToolExecutor = (name: string, input: Record<string, unknown>) => Promise<string>;

export interface AgentResult {
  finalText: string;
  toolsUsed: { name: string; input: Record<string, unknown> }[];
  turns: number;
  totalUsage: { inputTokens: number; outputTokens: number };
}

export const DEFAULT_MAX_TURNS = 6;

export async function runAgentLoop(opts: {
  initialMessages: unknown[];
  callModel: ModelCaller;
  executeTool: ToolExecutor;
  maxTurns?: number;
}): Promise<AgentResult> {
  const maxTurns = opts.maxTurns ?? DEFAULT_MAX_TURNS;
  const messages: unknown[] = [...opts.initialMessages];
  const toolsUsed: { name: string; input: Record<string, unknown> }[] = [];
  const totalUsage = { inputTokens: 0, outputTokens: 0 };
  let finalText = "";
  let turns = 0;

  while (turns < maxTurns) {
    turns += 1;
    const turn = await opts.callModel(messages);
    totalUsage.inputTokens += turn.usage.inputTokens;
    totalUsage.outputTokens += turn.usage.outputTokens;
    if (turn.text) finalText = turn.text;

    if (turn.stopReason !== "tool_use" || turn.toolUses.length === 0) {
      return { finalText, toolsUsed, turns, totalUsage };
    }

    // Append the assistant turn (carries the tool_use blocks) verbatim.
    messages.push({ role: "assistant", content: turn.assistantContent });

    // Execute each requested tool, collect tool_result blocks.
    const resultBlocks: unknown[] = [];
    for (const tu of turn.toolUses) {
      toolsUsed.push({ name: tu.name, input: tu.input });
      let content: string;
      let isError = false;
      try {
        content = await opts.executeTool(tu.name, tu.input);
      } catch (err) {
        content = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
        isError = true;
      }
      resultBlocks.push({ type: "tool_result", tool_use_id: tu.id, content, is_error: isError });
    }
    messages.push({ role: "user", content: resultBlocks });
  }

  // Hit the turn cap — return the best text so far with a gentle note.
  return {
    finalText: finalText || "I gathered some data but couldn't fully finish — could you narrow the question?",
    toolsUsed,
    turns,
    totalUsage,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/_shared/agent-loop.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/agent-loop.ts supabase/functions/_shared/agent-loop.test.ts
git commit -m "feat(lina): manual agentic tool-calling loop"
```

---

## Task 8: Lina persona & system prompt

**Files:**
- Create: `supabase/functions/_shared/persona.ts`
- Test: `supabase/functions/_shared/persona.test.ts`

Builds Lina's system prompt: identity + voice + the existing role/data boundaries + language instruction + the mandatory suggested-questions block. Pure string building.

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/persona.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildLinaSystemPrompt } from "./persona";

describe("buildLinaSystemPrompt", () => {
  it("introduces Lina by name", () => {
    const p = buildLinaSystemPrompt("admin", "en");
    expect(p).toContain("Lina");
  });

  it("includes the role boundary for a worker and the worker's role label", () => {
    const p = buildLinaSystemPrompt("worker", "en");
    expect(p).toContain("worker");
    expect(p.toLowerCase()).toContain("cannot");
  });

  it("instructs Bengali responses when language is bn", () => {
    const p = buildLinaSystemPrompt("admin", "bn");
    expect(p.toLowerCase()).toContain("bengali");
  });

  it("includes the suggested-questions block marker", () => {
    const p = buildLinaSystemPrompt("admin", "en");
    expect(p).toContain("---SUGGESTED_QUESTIONS---");
  });

  it("tells Lina to use tools for live data", () => {
    const p = buildLinaSystemPrompt("admin", "en");
    expect(p.toLowerCase()).toContain("tool");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/persona.test.ts`
Expected: FAIL — cannot find module `./persona`.

- [ ] **Step 3: Write minimal implementation**

Create `supabase/functions/_shared/persona.ts`:

```ts
// Lina's identity and system-prompt construction. Pure string building.
// Role/data boundaries are carried over from the previous llm.ts prompt.

const ROLE_BOUNDARIES: Record<string, string> = {
  worker: `**Role: worker (Line Manager)**
- CAN discuss: sewing & finishing output/targets, blockers, line performance, work order status (read-only).
- CANNOT discuss: cutting data, storage/bin cards, factory setup, user management, billing, factory-wide financials.`,
  cutting: `**Role: cutting**
- CAN discuss: cutting targets & output, cutting capacity, blockers, related work order context.
- CANNOT discuss: sewing/finishing output, storage, factory setup, user management, billing, financials.`,
  storage: `**Role: storage**
- CAN discuss: storage bin cards, fabric inventory, material tracking, related work order context.
- CANNOT discuss: sewing/cutting/finishing production data, line performance, blockers, billing, financials.`,
  admin: `**Role: admin**
- CAN discuss: all production data, all departments, analytics, knowledge base, and full financials (revenue, cost, profit, margin, per-PO/department breakdowns).`,
  owner: `**Role: owner**
- CAN discuss: everything an admin can, plus full billing access. Full access to all data.`,
};

export function buildLinaSystemPrompt(role: string, language: string): string {
  const boundary = ROLE_BOUNDARIES[role] ?? ROLE_BOUNDARIES.worker;
  const languageInstruction =
    language === "bn"
      ? "The user prefers Bengali (Bangla). Respond in Bengali using proper Bengali script."
      : language === "zh"
        ? "The user prefers Chinese. Respond in Chinese."
        : "Respond in English.";

  return `You are **Lina**, the AI production assistant for ProductionPortal, a garment-factory management system. Think of yourself as a sharp, warm line-lead who knows the floor and the numbers cold.

## Voice
- Warm, direct, and practical — like a trusted supervisor, not a corporate bot.
- Concise. Use bullet points for lists and lead with the answer.
- Proactively flag concerning trends (lines behind target, open blockers, approaching ex-factory dates, negative margins).
- Never fabricate numbers. If a tool returns no data, say nothing was submitted for that period.

## How you work
- You have TOOLS that query live factory data and the knowledge base. USE THEM to answer — do not guess production numbers from memory.
- Investigate properly: chain tool calls when a question needs comparison or root-cause (e.g. pull output, then targets, then blockers).
- Attribute live data naturally ("According to today's data…"); do NOT cite it as [Source:...].
- For documentation/how-to/compliance questions, use the search_knowledge tool and cite the document title.

## User Context
- User Role: ${role}
- ${languageInstruction}

## Role Boundaries (STRICT)
Only discuss what this role is permitted to see. The tools also enforce this — if a tool denies access, relay that politely and suggest contacting an administrator.
${boundary}

## Response Format
- Be concise but complete. Bullets for lists. Bold key numbers.

## Suggested Questions
At the END of every response, include 2-4 suggested follow-up questions in this exact format:

---SUGGESTED_QUESTIONS---
First suggested question here?
Second suggested question here?

Rules: keep each under 80 characters, tailor to the user's role and context, never repeat the user's exact question. This block is mandatory.`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/_shared/persona.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/persona.ts supabase/functions/_shared/persona.test.ts
git commit -m "feat(lina): Lina persona + system-prompt builder"
```

---

## Task 9: Tool-aware Anthropic model caller

**Files:**
- Modify: `supabase/functions/_shared/llm.ts`

Add a `ModelCaller` factory that performs one Claude request with tools, adaptive thinking, and prompt caching, and parses the response into the loop's `ModelTurn` shape. This is a Deno adapter (reads `Deno.env`, calls `fetch`) and is **not** unit-tested — it is exercised by the manual smoke test in Task 12.

- [ ] **Step 1: Update the model constant and imports**

In `supabase/functions/_shared/llm.ts`, replace the model constant near the top:

```ts
// before
const MODEL = "claude-sonnet-4-20250514";
// after
const MODEL = "claude-sonnet-4-6";
```

Add this import near the other imports at the top of the file:

```ts
import type { ModelTurn } from "./agent-loop.ts";
```

- [ ] **Step 2: Append the model-caller factory**

Add to the end of `supabase/functions/_shared/llm.ts`:

```ts
const ANTHROPIC_VERSION = "2023-06-01";

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** Build a ModelCaller bound to this request's system prompt + tools.
 *  The returned function takes the running messages array and returns one
 *  parsed assistant turn. System + tools are stable across the loop, so they
 *  are cached (cache_control on the last system block). */
export function createAnthropicCaller(
  systemPrompt: string,
  tools: AnthropicTool[],
): (messages: unknown[]) => Promise<ModelTurn> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  return async (messages: unknown[]): Promise<ModelTurn> => {
    const body = {
      model: MODEL,
      max_tokens: 2048,
      thinking: { type: "adaptive" as const },
      system: [
        { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
      ],
      tools,
      messages,
    };

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const content: any[] = data.content ?? [];

    const textParts: string[] = [];
    const toolUses: { id: string; name: string; input: Record<string, unknown> }[] = [];
    for (const block of content) {
      if (block.type === "text") textParts.push(block.text);
      else if (block.type === "tool_use") {
        toolUses.push({ id: block.id, name: block.name, input: block.input ?? {} });
      }
    }

    return {
      stopReason: data.stop_reason ?? "end_turn",
      text: textParts.join("\n").trim(),
      toolUses,
      assistantContent: content,
      usage: {
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
      },
    };
  };
}
```

> `ANTHROPIC_API_URL` is already declared at the top of `llm.ts`. Keep the existing `detectLanguage` export and the suggested-question parsing helper — Task 11 reuses them. Leave the old `generateChatResponse` in place for now (removed in Task 12 cleanup) to avoid breaking imports mid-stream.

- [ ] **Step 3: Smoke-compile check**

Run: `npx tsc --noEmit -p tsconfig.json 2>/dev/null; echo "exit $?"`
Expected: no new errors mentioning `llm.ts` (edge files are outside the app tsconfig; this is a sanity check only).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/llm.ts
git commit -m "feat(lina): tool-aware Anthropic model caller on claude-sonnet-4-6"
```

---

## Task 10: DB migration — `tools_used` column

**Files:**
- Create: `supabase/migrations/20260608_chat_tools_used.sql`

Records which tools ran for each assistant message (analytics + debugging). Additive and backward-compatible.

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/20260608_chat_tools_used.sql`:

```sql
-- Lina: record which tools each assistant message invoked.
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS tools_used jsonb;

COMMENT ON COLUMN chat_messages.tools_used IS
  'Array of {name, input} for tools Lina invoked while producing this message.';
```

- [ ] **Step 2: Apply the migration**

Run (whichever matches this project's workflow):
`supabase db push`
Expected: migration applies; `chat_messages.tools_used` exists. If the project applies migrations via the Supabase dashboard instead, paste the SQL there. Verify with:
`supabase db diff` (expect no pending diff for this column) or inspect the table in the dashboard.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260608_chat_tools_used.sql
git commit -m "feat(lina): add tools_used column to chat_messages"
```

---

## Task 11: Wire the `chat` edge function to the agent loop

**Files:**
- Modify: `supabase/functions/chat/index.ts`

Replace the embed → RAG → regex live-data → single Claude call pipeline with: resolve context → build tools (role-filtered) + Lina prompt → run the agent loop → parse suggested questions → persist (incl. `tools_used`). Auth/profile/role/timezone/conversation/history/analytics stay.

- [ ] **Step 1: Replace the imports block**

In `supabase/functions/chat/index.ts`, replace the existing import block (lines ~1-12) with:

```ts
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders } from "../_shared/security.ts";
import { generateEmbedding } from "../_shared/embeddings.ts";
import { detectLanguage, createAnthropicCaller, parseSuggestedQuestions } from "../_shared/llm.ts";
import { buildLinaSystemPrompt } from "../_shared/persona.ts";
import { getToolsForRole, toAnthropicTools, dispatchTool } from "../_shared/tools/registry.ts";
import { getTodayForFactory } from "../_shared/live-data.ts";
import { runAgentLoop } from "../_shared/agent-loop.ts";
import type { ToolContext } from "../_shared/tools/types.ts";
```

- [ ] **Step 2: Export the suggested-questions parser from `llm.ts`**

The old single-shot path parsed the `---SUGGESTED_QUESTIONS---` block inline. Extract it as an exported helper so the new handler reuses it. Add to `supabase/functions/_shared/llm.ts`:

```ts
/** Split Lina's reply into the visible answer and the suggested-questions list. */
export function parseSuggestedQuestions(raw: string): { content: string; suggestedQuestions: string[] } {
  const separator = "---SUGGESTED_QUESTIONS---";
  const idx = raw.indexOf(separator);
  if (idx === -1) return { content: raw, suggestedQuestions: [] };
  const content = raw.substring(0, idx).trimEnd();
  const suggestedQuestions = raw
    .substring(idx + separator.length)
    .trim()
    .split("\n")
    .map((q) => q.trim())
    .filter((q) => q.length > 0 && q.length < 120);
  return { content, suggestedQuestions };
}
```

- [ ] **Step 3: Replace the pipeline body**

In `supabase/functions/chat/index.ts`, replace everything from the comment `// Generate embedding for the query` (line ~150) down to the end of the `// Log analytics` insert (line ~277) — i.e. the embed + knowledge-search + live-data + buildSystemPrompt + generateChatResponse + save + analytics block — with:

```ts
    // Resolve "today" in the factory's timezone for date-scoped tools.
    const today = getTodayForFactory(factoryTimezone);

    // Build the role-filtered tool set and Lina's persona prompt.
    const tools = getToolsForRole(primaryRole);
    const systemPrompt = buildLinaSystemPrompt(primaryRole, language);

    // Per-request tool context (factoryId/role are server-derived — never from model input).
    const toolContext: ToolContext = {
      supabase: supabaseAdmin as unknown as ToolContext["supabase"],
      factoryId: profile?.factory_id,
      role: primaryRole,
      timezone: factoryTimezone,
      today,
      language,
      embed: async (text: string) => (await generateEmbedding(text)).embedding,
    };

    // Run the agentic loop.
    logStep("Running agent loop", { toolCount: tools.length });
    const callModel = createAnthropicCaller(systemPrompt, toAnthropicTools(tools));
    const agentResult = await runAgentLoop({
      initialMessages: conversationHistory,
      callModel,
      executeTool: (name, input) => dispatchTool(name, input, toolContext),
    });

    const { content, suggestedQuestions } = parseSuggestedQuestions(agentResult.finalText);
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
```

- [ ] **Step 4: Update the success response**

Replace the final `return new Response(JSON.stringify({ ... }))` success block (lines ~285-298) with:

```ts
    return new Response(
      JSON.stringify({
        message: content,
        citations: [],
        conversation_id: conversationId,
        no_evidence: false,
        suggested_questions: suggestedQuestions,
        language,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
```

> `conversationHistory` is built earlier in the handler (the existing "last 10 messages" fetch) and already ends with the current user message because the user message is inserted before the history fetch. The agent loop appends assistant/tool turns onto a copy, so history is preserved unchanged in the DB. `citations` is returned empty in Phase 1 (knowledge results arrive via the `search_knowledge` tool inside the answer text); the frontend already treats `citations` as optional.

- [ ] **Step 5: Manual deploy + smoke check is covered in Task 12.** For now, sanity-check imports resolve:

Run: `npx tsc --noEmit -p tsconfig.json 2>/dev/null; echo "exit $?"`
Expected: no new errors mentioning `chat/index.ts`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/chat/index.ts supabase/functions/_shared/llm.ts
git commit -m "feat(lina): wire chat function to the agentic loop"
```

---

## Task 12: Cleanup — remove the dead single-shot path

**Files:**
- Modify: `supabase/functions/_shared/llm.ts`
- Modify: `supabase/functions/_shared/live-data.ts`

Now that the loop is wired, remove the now-unused single-shot helpers so the code has one path. Do this only after Task 11 is committed and verified to compile.

- [ ] **Step 1: Remove unused exports from `llm.ts`**

Delete `generateChatResponse`, `buildSystemPrompt`, `buildContextFromSources`, and `buildLiveDataContext` from `supabase/functions/_shared/llm.ts` (the agent loop + persona + tools replace them). Keep: `MODEL`, `ANTHROPIC_API_URL`, `detectLanguage`, `parseSuggestedQuestions`, `createAnthropicCaller`, and the shared interfaces still referenced.

- [ ] **Step 2: Remove the regex classifier + orchestrator from `live-data.ts`**

Delete `classifyMessage` and `fetchLiveData` (the top-level orchestrator that consumed the classifier) from `supabase/functions/_shared/live-data.ts`. Keep the exported `fetch*` functions (used by tools) and `getTodayForFactory`. If `fetchLiveData` is not present as a named export, search the file for the orchestrator that calls `classifyMessage` and remove it.

- [ ] **Step 3: Grep for stragglers**

Run: `grep -rn "generateChatResponse\|classifyMessage\|fetchLiveData\|buildSystemPrompt" supabase/functions`
Expected: no matches (all references removed).

- [ ] **Step 4: Re-run the full edge-function test suite**

Run: `npx vitest run supabase/functions`
Expected: PASS — all tool/loop/persona tests still green.

- [ ] **Step 5: Manual smoke test (deploy the function)**

Deploy: `supabase functions deploy chat`
Then, signed in to the app as an **admin**, open the assistant and ask: "Lina, how is sewing doing today and is anything behind target?" Confirm: (a) a coherent answer using real numbers, (b) the Supabase function logs show `Running agent loop` and one or more tool names, (c) no errors. Then sign in as a **worker** and ask a financial question ("what's our profit today?") — confirm Lina declines politely (financials are admin/owner-only).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/llm.ts supabase/functions/_shared/live-data.ts
git commit -m "refactor(lina): remove dead single-shot chat path"
```

---

## Task 13: Frontend — rename the assistant to Lina

**Files:**
- Modify: `src/components/chat/ChatPanel.tsx`
- Modify: `src/components/chat/ChatWidget.tsx`
- Modify: `src/components/chat/QuickActions.tsx`

Cosmetic rename + copy so the assistant presents as Lina. No logic change; the hook/API contract is unchanged.

- [ ] **Step 1: Update the empty-state copy in `ChatPanel.tsx`**

In `src/components/chat/ChatPanel.tsx`, replace the empty-state heading/subtext (lines ~92-101) with:

```tsx
            <h3 className="text-lg font-semibold text-foreground mb-1">
              {language === "bn"
                ? "আমি লিনা — কীভাবে সাহায্য করতে পারি?"
                : "I'm Lina — how can I help?"}
            </h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-[280px]">
              {language === "bn"
                ? "প্রোডাকশন, লাইন পারফরম্যান্স, ব্লকার বা অর্ডার সম্পর্কে জিজ্ঞাসা করুন"
                : "Ask me about production, line performance, blockers, orders, or how things work"}
            </p>
```

- [ ] **Step 2: Update the footer disclaimer in `ChatPanel.tsx`**

Replace the disclaimer paragraph (lines ~186-190) with:

```tsx
        <p className="text-[10px] text-muted-foreground/70 text-center leading-tight">
          {language === "bn"
            ? "লিনা ভুল করতে পারে। গুরুত্বপূর্ণ সিদ্ধান্তের আগে যাচাই করুন।"
            : "Lina is AI-powered and can make mistakes. Verify important figures."}
        </p>
```

- [ ] **Step 3: Update the header title in `ChatWidget.tsx`**

In `src/components/chat/ChatWidget.tsx`, replace the header title span (line ~57-59):

```tsx
// before
                <span className="font-semibold text-sm leading-none">
                  ProductionPortal Assistant
                </span>
// after
                <span className="font-semibold text-sm leading-none">
                  Lina
                </span>
```

Then add an accessible label to the floating action button (line ~103-107). Replace:

```tsx
// before
          <Button
            onClick={() => setIsOpen(true)}
            className="relative h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 active:scale-95"
            size="icon"
          >
// after
          <Button
            onClick={() => setIsOpen(true)}
            aria-label="Open Lina, the production assistant"
            className="relative h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 active:scale-95"
            size="icon"
          >
```

- [ ] **Step 4: Update quick prompts in `QuickActions.tsx`**

In `src/components/chat/QuickActions.tsx`, replace the entire `QUICK_ACTIONS` object (lines ~9-70) with insight-oriented prompts (icons swapped to fit; component body below it is unchanged):

```tsx
import { TrendingUp, AlertTriangle, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuickActionsProps {
  onSelect: (prompt: string) => void;
  language: "en" | "bn" | "zh";
}

const QUICK_ACTIONS = {
  en: [
    {
      icon: TrendingUp,
      label: "Today's production",
      hint: "Output & efficiency",
      prompt: "How is production doing today?",
    },
    {
      icon: Activity,
      label: "Line performance",
      hint: "Who's behind target",
      prompt: "Which lines are behind target right now?",
    },
    {
      icon: AlertTriangle,
      label: "Open blockers",
      hint: "Issues to resolve",
      prompt: "Are there any open blockers I should know about?",
    },
  ],
  bn: [
    {
      icon: TrendingUp,
      label: "আজকের প্রোডাকশন",
      hint: "আউটপুট ও দক্ষতা",
      prompt: "আজ প্রোডাকশন কেমন চলছে?",
    },
    {
      icon: Activity,
      label: "লাইন পারফরম্যান্স",
      hint: "কারা টার্গেটের পিছনে",
      prompt: "এখন কোন লাইনগুলো টার্গেটের পিছনে আছে?",
    },
    {
      icon: AlertTriangle,
      label: "ওপেন ব্লকার",
      hint: "সমাধানের সমস্যা",
      prompt: "আমার জানা উচিত এমন কোনো ওপেন ব্লকার আছে কি?",
    },
  ],
  zh: [
    {
      icon: TrendingUp,
      label: "今日生产",
      hint: "产量与效率",
      prompt: "今天生产情况如何？",
    },
    {
      icon: Activity,
      label: "生产线表现",
      hint: "哪些落后于目标",
      prompt: "现在哪些生产线落后于目标？",
    },
    {
      icon: AlertTriangle,
      label: "未解决的阻碍",
      hint: "需要解决的问题",
      prompt: "有什么我应该知道的未解决的阻碍吗？",
    },
  ],
};
```

> The component body (the `export function QuickActions` below the object) is unchanged — it already renders `action.icon`, `action.label`, `action.hint`, and calls `onSelect(action.prompt)`.

- [ ] **Step 5: Verify the app builds**

Run: `npm run build`
Expected: build succeeds with no type errors in the chat components.

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/ChatPanel.tsx src/components/chat/ChatWidget.tsx src/components/chat/QuickActions.tsx
git commit -m "feat(lina): rename assistant UI to Lina with insight-focused prompts"
```

---

## Task 14: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: PASS — new edge-function tests (types, insights, registry, agent-loop, persona) plus the existing frontend tests are all green.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: End-to-end manual check (per role)**

With the function deployed, verify against a seeded factory:
- **admin:** "Why might rejects be up this week?" → Lina chains tools (e.g. `compare_periods` + `find_anomalies` + `get_blockers`) and gives a reasoned answer with real numbers.
- **worker:** "Show me cutting output" → declined (workers don't see cutting); "Show me sewing output" → answered.
- **worker:** "What's our profit?" → declined (financials admin/owner-only).
- Confirm suggested questions render and feedback thumbs still post (unchanged paths).

- [ ] **Step 4: Confirm analytics + tools_used**

In Supabase, inspect the latest `chat_messages` row: `tools_used` is a JSON array of `{name, input}`, `model` is `claude-sonnet-4-6`. `chat_analytics` has a matching row.

---

## Self-review notes (author)

- **Spec coverage:** agentic loop (Task 7), Lina identity (Task 8), all 7 insight tools (Tasks 3-5), role/factory enforcement in executors (Tasks 1,3-6), preserved auth/history/analytics/feedback/suggested-questions (Task 11), Sonnet 4.6 + adaptive thinking + caching (Task 9), `tools_used` schema (Task 10), forward-compatible loop (Task 7 note), tests (Tasks 1,3-8). All present.
- **Known Phase-1 limitations (by design, from the spec):** storage-role insight tools are out of scope (storage role is denied production tools); `compare_periods` supports the `sewing_good` metric only; `get_financials` reuses today's snapshot. These are noted for Phase 2+.
- **Type consistency:** `ToolContext`, `ToolDefinition`, `ModelTurn`, `ModelCaller` are defined once (Tasks 1, 7) and imported everywhere; the model caller returns exactly the `ModelTurn` shape the loop consumes.
