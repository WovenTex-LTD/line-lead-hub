# Lina Write Actions — Foundation + PO Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Lina perform Purchase-Order writes (create / edit / assign-lines / set-status / set-ex-factory / archive) through a confirmed, permission-scoped, audited path — and ship the reusable write-action foundation every future write reuses.

**Architecture:** Preview tools validate and emit a `ProposedAction` (no write) → the chat response carries `pending_actions` → the chat UI shows an Approve/Cancel card → on Approve the client calls a new `execute-action` edge function that writes **as the user** (user-scoped Supabase client, so RLS enforces permissions), logs to `audit_log`, and returns the result. Validators are pure and shared by both the preview tool and the executor.

**Tech Stack:** Deno (Supabase edge functions), Supabase JS client (user-scoped + service-role), Postgres RLS, React + TypeScript frontend, vitest 4.

**Spec:** `docs/superpowers/specs/2026-06-11-lina-write-actions-po-design.md`

**Hard constraints (from the spec):** Do NOT touch any data-entry form. Do NOT modify the Work Orders page behavior. Additive only — existing read tools/reports/escalation/tests must stay green. Soft-delete only.

---

## Conventions

- Run one test file: `npx vitest run <path>`. Edge modules are tested via type-only-import erasure — pure modules use only `import type` for `jsr:`/`https:` and never touch `Deno.env`.
- Commit after each task.
- `ToolContext` (in `supabase/functions/_shared/tools/types.ts`) currently has: `supabase, factoryId, role, timezone, today, language, embed, escalate, requestExport`. We add `proposeAction`.
- Tool pattern: a `ToolDefinition` in `registry.ts` has `{ name, description, input_schema, allowedRoles, execute }`; executors are `(ctx, input) => Promise<string>`. Gating helpers in `tools/types.ts`: `canSeeFinancials`, `canSeeAnyProduction` exist in `insights.ts`; role checks use `ctx.role`.

## File structure

| File | Responsibility |
|------|----------------|
| `supabase/functions/_shared/actions/po.ts` | **Create.** `ProposedAction` types + pure validators for each PO action. Shared by preview tools + executor. |
| `supabase/functions/_shared/actions/po.test.ts` | **Create.** Unit tests for validators. |
| `supabase/functions/_shared/tools/types.ts` | **Modify.** Add `proposeAction` to `ToolContext`. |
| `supabase/functions/_shared/tools/actions-tools.ts` | **Create.** PO preview-tool executors (validate + role-gate + `proposeAction`; no writes). |
| `supabase/functions/_shared/tools/actions-tools.test.ts` | **Create.** Tests: gating + proposeAction called. |
| `supabase/functions/_shared/tools/registry.ts` | **Modify.** Register the 6 PO tools. |
| `supabase/functions/_shared/tools/registry.test.ts` | **Modify.** Add the new tool names; add `proposeAction` to the ctx helper. |
| `supabase/functions/_shared/tools/insights.test.ts` | **Modify.** Add `proposeAction` to its ctx helper. |
| `supabase/functions/chat/index.ts` | **Modify.** Collect proposed actions → return `pending_actions`. |
| `supabase/functions/execute-action/index.ts` | **Create.** Auth → user-scoped client → re-validate → write PO → audit → result. |
| `src/hooks/useChat.ts` | **Modify.** Capture `pending_actions`; add `runAction`; expose action state. |
| `src/components/chat/ActionConfirmCard.tsx` | **Create.** Approve/Cancel card with states. |
| `src/components/chat/ChatMessage.tsx` | **Modify.** Render pending-action cards. |
| `supabase/functions/_shared/persona.ts` | **Modify.** Tell Lina to propose PO writes via the tools. |

---

## Task 1: ProposedAction types + create_po / update_po validators

**Files:**
- Create: `supabase/functions/_shared/actions/po.ts`
- Test: `supabase/functions/_shared/actions/po.test.ts`

- [ ] **Step 1: Write the failing test** — `supabase/functions/_shared/actions/po.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateCreatePo, validateUpdatePo } from "./po";

describe("validateCreatePo", () => {
  it("accepts a valid PO and builds a human summary + payload", () => {
    const r = validateCreatePo({ po_number: "86600", buyer: "C&A", style: "S1", order_qty: 5000, planned_ex_factory: "2026-07-10" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.action.kind).toBe("create_po");
      expect(r.action.payload.po_number).toBe("86600");
      expect(r.action.humanSummary).toContain("86600");
      expect(r.action.humanSummary).toContain("C&A");
    }
  });
  it("rejects when required fields are missing", () => {
    const r = validateCreatePo({ buyer: "C&A" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toContain("po number");
  });
  it("rejects a bad ex-factory date", () => {
    const r = validateCreatePo({ po_number: "1", buyer: "B", style: "S", planned_ex_factory: "10-07-2026" });
    expect(r.ok).toBe(false);
  });
});

describe("validateUpdatePo", () => {
  it("requires a target po_number and at least one change", () => {
    expect(validateUpdatePo({ po_number: "86600" }).ok).toBe(false);
    const r = validateUpdatePo({ po_number: "86600", order_qty: 6000 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action.payload.fields).toEqual({ order_qty: 6000 });
  });
});
```

- [ ] **Step 2: Run, expect fail** — `npx vitest run supabase/functions/_shared/actions/po.test.ts` → cannot find module `./po`.

- [ ] **Step 3: Implement** — `supabase/functions/_shared/actions/po.ts`:

```ts
// Pure validators + types for Lina's PO write actions. Shared by the preview
// tools and the execute-action function so validation is identical on both sides.
// Pure: no Deno/runtime imports, no Deno.env.

export type PoActionKind =
  | "create_po" | "update_po" | "assign_po_lines"
  | "set_po_status" | "set_po_ex_factory" | "archive_po";

export interface ProposedAction {
  kind: PoActionKind;
  humanSummary: string;
  payload: Record<string, unknown>;
}

export type ValidationResult =
  | { ok: true; action: ProposedAction }
  | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const VALID_PO_STATUS = ["not_started", "in_progress", "completed", "on_hold"];

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (typeof v === "number" && !Number.isNaN(v) ? v : undefined);

export function validateCreatePo(input: Record<string, unknown>): ValidationResult {
  const po_number = str(input.po_number);
  const buyer = str(input.buyer);
  const style = str(input.style);
  const planned_ex_factory = str(input.planned_ex_factory);
  if (!po_number) return { ok: false, error: "A PO number is required to create a PO." };
  if (!buyer) return { ok: false, error: "A buyer is required to create a PO." };
  if (!style) return { ok: false, error: "A style is required to create a PO." };
  if (!planned_ex_factory || !DATE_RE.test(planned_ex_factory)) {
    return { ok: false, error: "A valid planned ex-factory date (YYYY-MM-DD) is required." };
  }
  const order_qty = num(input.order_qty) ?? 0;
  const status = VALID_PO_STATUS.includes(str(input.status)) ? str(input.status) : "not_started";
  const lineIds = Array.isArray(input.line_ids) ? (input.line_ids as unknown[]).map(String) : [];
  const payload: Record<string, unknown> = {
    po_number, buyer, style, order_qty, planned_ex_factory, status,
    item: str(input.item) || null,
    color: str(input.color) || null,
    smv: num(input.smv) ?? null,
    cm_per_dozen: num(input.cm_per_dozen) ?? null,
    target_per_hour: num(input.target_per_hour) ?? null,
    target_per_day: num(input.target_per_day) ?? null,
    line_ids: lineIds,
  };
  const summary = `Create PO ${po_number} — ${buyer}, style ${style}, ${order_qty.toLocaleString()} pcs, due ${planned_ex_factory}${lineIds.length ? `, ${lineIds.length} line(s)` : ""}`;
  return { ok: true, action: { kind: "create_po", humanSummary: summary, payload } };
}

export function validateUpdatePo(input: Record<string, unknown>): ValidationResult {
  const po_number = str(input.po_number);
  if (!po_number) return { ok: false, error: "Which PO should I update? I need its PO number." };
  const allowed = ["buyer", "style", "item", "color", "order_qty", "smv", "cm_per_dozen", "target_per_hour", "target_per_day"] as const;
  const fields: Record<string, unknown> = {};
  for (const k of allowed) {
    if (input[k] !== undefined) {
      fields[k] = ["order_qty", "smv", "cm_per_dozen", "target_per_hour", "target_per_day"].includes(k)
        ? num(input[k]) ?? null
        : str(input[k]);
    }
  }
  if (Object.keys(fields).length === 0) {
    return { ok: false, error: `What should I change on PO ${po_number}?` };
  }
  const summary = `Update PO ${po_number}: ${Object.entries(fields).map(([k, v]) => `${k} → ${v}`).join(", ")}`;
  return { ok: true, action: { kind: "update_po", humanSummary: summary, payload: { po_number, fields } } };
}
```

- [ ] **Step 4: Run, expect pass** — `npx vitest run supabase/functions/_shared/actions/po.test.ts`.

- [ ] **Step 5: Commit**
```bash
git add supabase/functions/_shared/actions/po.ts supabase/functions/_shared/actions/po.test.ts
git commit -m "feat(lina): ProposedAction types + create_po/update_po validators"
```

---

## Task 2: Remaining PO validators (assign_lines / status / ex-factory / archive)

**Files:**
- Modify: `supabase/functions/_shared/actions/po.ts`
- Modify: `supabase/functions/_shared/actions/po.test.ts`

- [ ] **Step 1: Add failing tests** — append to `po.test.ts`:

```ts
import { validateAssignPoLines, validateSetPoStatus, validateSetPoExFactory, validateArchivePo } from "./po";

describe("other PO validators", () => {
  it("assign_po_lines needs a PO and at least one line", () => {
    expect(validateAssignPoLines({ po_number: "1" }).ok).toBe(false);
    const r = validateAssignPoLines({ po_number: "1", line_ids: ["a", "b"] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action.payload.line_ids).toEqual(["a", "b"]);
  });
  it("set_po_status validates the status enum", () => {
    expect(validateSetPoStatus({ po_number: "1", status: "bogus" }).ok).toBe(false);
    expect(validateSetPoStatus({ po_number: "1", status: "completed" }).ok).toBe(true);
    expect(validateSetPoStatus({ po_number: "1", is_active: false }).ok).toBe(true);
  });
  it("set_po_ex_factory validates dates", () => {
    expect(validateSetPoExFactory({ po_number: "1", planned_ex_factory: "bad" }).ok).toBe(false);
    expect(validateSetPoExFactory({ po_number: "1", planned_ex_factory: "2026-07-10" }).ok).toBe(true);
  });
  it("archive_po needs a po_number", () => {
    expect(validateArchivePo({}).ok).toBe(false);
    const r = validateArchivePo({ po_number: "86600" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action.kind).toBe("archive_po");
  });
});
```

- [ ] **Step 2: Run, expect fail** — `npx vitest run supabase/functions/_shared/actions/po.test.ts` → new validators undefined.

- [ ] **Step 3: Implement** — append to `po.ts`:

```ts
export function validateAssignPoLines(input: Record<string, unknown>): ValidationResult {
  const po_number = str(input.po_number);
  if (!po_number) return { ok: false, error: "Which PO should I assign lines to?" };
  const line_ids = Array.isArray(input.line_ids) ? (input.line_ids as unknown[]).map(String).filter(Boolean) : [];
  if (line_ids.length === 0) return { ok: false, error: `Which line(s) should run PO ${po_number}?` };
  return {
    ok: true,
    action: { kind: "assign_po_lines", humanSummary: `Assign PO ${po_number} to ${line_ids.length} line(s)`, payload: { po_number, line_ids } },
  };
}

export function validateSetPoStatus(input: Record<string, unknown>): ValidationResult {
  const po_number = str(input.po_number);
  if (!po_number) return { ok: false, error: "Which PO's status should I change?" };
  const status = input.status !== undefined ? str(input.status) : undefined;
  const is_active = typeof input.is_active === "boolean" ? input.is_active : undefined;
  if (status === undefined && is_active === undefined) {
    return { ok: false, error: `What status should PO ${po_number} have?` };
  }
  if (status !== undefined && !VALID_PO_STATUS.includes(status)) {
    return { ok: false, error: `Status must be one of: ${VALID_PO_STATUS.join(", ")}.` };
  }
  const parts = [status !== undefined ? `status → ${status}` : null, is_active !== undefined ? `active → ${is_active}` : null].filter(Boolean);
  const payload: Record<string, unknown> = { po_number };
  if (status !== undefined) payload.status = status;
  if (is_active !== undefined) payload.is_active = is_active;
  return { ok: true, action: { kind: "set_po_status", humanSummary: `Set PO ${po_number} ${parts.join(", ")}`, payload } };
}

export function validateSetPoExFactory(input: Record<string, unknown>): ValidationResult {
  const po_number = str(input.po_number);
  if (!po_number) return { ok: false, error: "Which PO's ex-factory date should I change?" };
  const planned = input.planned_ex_factory !== undefined ? str(input.planned_ex_factory) : undefined;
  const actual = input.actual_ex_factory !== undefined ? str(input.actual_ex_factory) : undefined;
  if (planned === undefined && actual === undefined) return { ok: false, error: "Which date should I set?" };
  if (planned !== undefined && !DATE_RE.test(planned)) return { ok: false, error: "Planned ex-factory must be YYYY-MM-DD." };
  if (actual !== undefined && !DATE_RE.test(actual)) return { ok: false, error: "Actual ex-factory must be YYYY-MM-DD." };
  const payload: Record<string, unknown> = { po_number };
  if (planned !== undefined) payload.planned_ex_factory = planned;
  if (actual !== undefined) payload.actual_ex_factory = actual;
  const parts = [planned ? `planned → ${planned}` : null, actual ? `actual → ${actual}` : null].filter(Boolean);
  return { ok: true, action: { kind: "set_po_ex_factory", humanSummary: `Set PO ${po_number} ex-factory ${parts.join(", ")}`, payload } };
}

export function validateArchivePo(input: Record<string, unknown>): ValidationResult {
  const po_number = str(input.po_number);
  if (!po_number) return { ok: false, error: "Which PO should I archive?" };
  return {
    ok: true,
    action: { kind: "archive_po", humanSummary: `Archive PO ${po_number} (soft-delete — production history is kept)`, payload: { po_number } },
  };
}
```

- [ ] **Step 4: Run, expect pass** — `npx vitest run supabase/functions/_shared/actions/po.test.ts`.

- [ ] **Step 5: Commit**
```bash
git add supabase/functions/_shared/actions/po.ts supabase/functions/_shared/actions/po.test.ts
git commit -m "feat(lina): assign_lines/status/ex-factory/archive PO validators"
```

---

## Task 3: `proposeAction` context field + preview tools + registry

**Files:**
- Modify: `supabase/functions/_shared/tools/types.ts`
- Create: `supabase/functions/_shared/tools/actions-tools.ts`
- Test: `supabase/functions/_shared/tools/actions-tools.test.ts`
- Modify: `supabase/functions/_shared/tools/registry.ts`
- Modify: `supabase/functions/_shared/tools/registry.test.ts` and `insights.test.ts` (ctx helpers)

- [ ] **Step 1: Add `proposeAction` to `ToolContext`** — in `types.ts`, inside the `ToolContext` interface, after `requestExport`:

```ts
  /** Queue a write action for the user to confirm (no write happens here). */
  proposeAction: (action: import("../actions/po.ts").ProposedAction) => void;
```

- [ ] **Step 2: Write the failing test** — `supabase/functions/_shared/tools/actions-tools.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createPoTool, archivePoTool } from "./actions-tools";
import type { ToolContext } from "./types";

function ctx(role: string) {
  const proposed: any[] = [];
  const c = {
    supabase: {} as any, factoryId: "f1", role, timezone: "Asia/Dhaka",
    today: "2026-06-11", language: "en",
    embed: async () => [], escalate: async () => ({ ok: true }),
    requestExport: () => {}, proposeAction: (a: any) => proposed.push(a),
  } as unknown as ToolContext;
  return { c, proposed };
}

describe("PO preview tools", () => {
  it("admin create_po proposes an action (no write)", async () => {
    const { c, proposed } = ctx("admin");
    const out = await createPoTool(c, { po_number: "86600", buyer: "C&A", style: "S1", planned_ex_factory: "2026-07-10" });
    expect(proposed.length).toBe(1);
    expect(proposed[0].kind).toBe("create_po");
    expect(out.toLowerCase()).toContain("approve");
  });
  it("worker is denied create_po", async () => {
    const { c, proposed } = ctx("worker");
    const out = await createPoTool(c, { po_number: "1", buyer: "B", style: "S", planned_ex_factory: "2026-07-10" });
    expect(proposed.length).toBe(0);
    expect(out.toLowerCase()).toContain("don't have access");
  });
  it("returns the validation error when fields are missing (no proposal)", async () => {
    const { c, proposed } = ctx("admin");
    const out = await createPoTool(c, { buyer: "C&A" });
    expect(proposed.length).toBe(0);
    expect(out.toLowerCase()).toContain("po number");
  });
  it("archive_po proposes for an owner", async () => {
    const { c, proposed } = ctx("owner");
    await archivePoTool(c, { po_number: "86600" });
    expect(proposed[0].kind).toBe("archive_po");
  });
});
```

- [ ] **Step 3: Run, expect fail** — `npx vitest run supabase/functions/_shared/tools/actions-tools.test.ts` → cannot find `./actions-tools`.

- [ ] **Step 4: Implement** — `supabase/functions/_shared/tools/actions-tools.ts`:

```ts
// PO write preview-tools. They validate + role-gate and QUEUE a ProposedAction
// for the user to confirm. They NEVER write — execution happens in execute-action.

import type { ToolContext } from "./types.ts";
import {
  validateCreatePo, validateUpdatePo, validateAssignPoLines,
  validateSetPoStatus, validateSetPoExFactory, validateArchivePo,
  type ValidationResult,
} from "../actions/po.ts";

const ADMIN_ROLES = ["admin", "owner", "superadmin"];
const DENY = "You don't have access to manage POs — that requires an admin or owner role. Please contact your administrator.";

function gate(ctx: ToolContext): boolean {
  return ADMIN_ROLES.includes(ctx.role);
}

async function propose(ctx: ToolContext, result: ValidationResult): Promise<string> {
  if (!result.ok) return result.error;
  ctx.proposeAction(result.action);
  return `${result.action.humanSummary}.\n\nReview and Approve below to apply it.`;
}

export async function createPoTool(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!gate(ctx)) return DENY;
  return propose(ctx, validateCreatePo(input));
}
export async function updatePoTool(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!gate(ctx)) return DENY;
  return propose(ctx, validateUpdatePo(input));
}
export async function assignPoLinesTool(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!gate(ctx)) return DENY;
  return propose(ctx, validateAssignPoLines(input));
}
export async function setPoStatusTool(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!gate(ctx)) return DENY;
  return propose(ctx, validateSetPoStatus(input));
}
export async function setPoExFactoryTool(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!gate(ctx)) return DENY;
  return propose(ctx, validateSetPoExFactory(input));
}
export async function archivePoTool(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!gate(ctx)) return DENY;
  return propose(ctx, validateArchivePo(input));
}
```

- [ ] **Step 5: Register the tools** — in `registry.ts`, add to the imports:

```ts
import {
  createPoTool, updatePoTool, assignPoLinesTool,
  setPoStatusTool, setPoExFactoryTool, archivePoTool,
} from "./actions-tools.ts";
```

and append these six entries to the `ALL_TOOLS` array (before the closing `];`):

```ts
  {
    name: "create_po",
    description: "Create a new purchase order (work order). Admin/owner only. Use when the user asks to add/create a PO. Required: po_number, buyer, style, planned_ex_factory (YYYY-MM-DD). Optional: order_qty, item, color, smv, cm_per_dozen, target_per_hour, target_per_day, line_ids. This PROPOSES the change for the user to approve — it does not write directly.",
    input_schema: {
      type: "object",
      properties: {
        po_number: { type: "string" }, buyer: { type: "string" }, style: { type: "string" },
        planned_ex_factory: { type: "string", description: "YYYY-MM-DD" },
        order_qty: { type: "number" }, item: { type: "string" }, color: { type: "string" },
        smv: { type: "number" }, cm_per_dozen: { type: "number" },
        target_per_hour: { type: "number" }, target_per_day: { type: "number" },
        line_ids: { type: "array", items: { type: "string" }, description: "Line IDs to assign." },
      },
      required: ["po_number", "buyer", "style", "planned_ex_factory"],
    },
    allowedRoles: ["admin", "owner", "superadmin"],
    execute: createPoTool,
  },
  {
    name: "update_po",
    description: "Edit fields on an existing PO. Admin/owner only. Identify the PO by po_number; provide only the fields to change (buyer, style, item, color, order_qty, smv, cm_per_dozen, target_per_hour, target_per_day). Proposes the change for approval.",
    input_schema: {
      type: "object",
      properties: {
        po_number: { type: "string" }, buyer: { type: "string" }, style: { type: "string" },
        item: { type: "string" }, color: { type: "string" }, order_qty: { type: "number" },
        smv: { type: "number" }, cm_per_dozen: { type: "number" },
        target_per_hour: { type: "number" }, target_per_day: { type: "number" },
      },
      required: ["po_number"],
    },
    allowedRoles: ["admin", "owner", "superadmin"],
    execute: updatePoTool,
  },
  {
    name: "assign_po_lines",
    description: "Set which production lines run a PO. Admin/owner only. Proposes the change for approval.",
    input_schema: {
      type: "object",
      properties: { po_number: { type: "string" }, line_ids: { type: "array", items: { type: "string" } } },
      required: ["po_number", "line_ids"],
    },
    allowedRoles: ["admin", "owner", "superadmin"],
    execute: assignPoLinesTool,
  },
  {
    name: "set_po_status",
    description: "Change a PO's status (not_started, in_progress, completed, on_hold) and/or active flag. Admin/owner only. Proposes the change for approval.",
    input_schema: {
      type: "object",
      properties: { po_number: { type: "string" }, status: { type: "string", enum: ["not_started", "in_progress", "completed", "on_hold"] }, is_active: { type: "boolean" } },
      required: ["po_number"],
    },
    allowedRoles: ["admin", "owner", "superadmin"],
    execute: setPoStatusTool,
  },
  {
    name: "set_po_ex_factory",
    description: "Set a PO's planned and/or actual ex-factory date (YYYY-MM-DD). Admin/owner only. Proposes the change for approval.",
    input_schema: {
      type: "object",
      properties: { po_number: { type: "string" }, planned_ex_factory: { type: "string" }, actual_ex_factory: { type: "string" } },
      required: ["po_number"],
    },
    allowedRoles: ["admin", "owner", "superadmin"],
    execute: setPoExFactoryTool,
  },
  {
    name: "archive_po",
    description: "Archive (soft-delete) a PO — sets it inactive and status 'deleted'; production history is preserved. Admin/owner only. Proposes the change for approval. Never hard-deletes.",
    input_schema: { type: "object", properties: { po_number: { type: "string" } }, required: ["po_number"] },
    allowedRoles: ["admin", "owner", "superadmin"],
    execute: archivePoTool,
  },
```

- [ ] **Step 6: Update test ctx helpers** — in BOTH `registry.test.ts` and `insights.test.ts`, add to the `ctx(...)` helper object literal (next to `requestExport: () => {}`):

```ts
    proposeAction: () => {},
```

In `registry.test.ts`, update the tool-name assertion list to include the six new names. The full sorted expected array becomes:

```ts
    expect(names).toEqual([
      "archive_po", "assign_po_lines", "compare_periods", "create_po",
      "find_anomalies", "generate_report", "get_blockers", "get_financials",
      "get_lines", "get_production_data", "get_work_orders", "raise_support_ticket",
      "search_knowledge", "set_po_ex_factory", "set_po_status", "update_po",
    ].sort());
```

- [ ] **Step 7: Run tests** — `npx vitest run supabase/functions` → all pass (new actions-tools tests + existing).

- [ ] **Step 8: Commit**
```bash
git add supabase/functions/_shared/tools/
git commit -m "feat(lina): PO preview tools + proposeAction context + registry entries"
```

---

## Task 4: Chat function returns `pending_actions`

**Files:**
- Modify: `supabase/functions/chat/index.ts`

- [ ] **Step 1: Add the collector** — near the `exportRequests` collector (just before `const toolContext: ToolContext = {`), add:

```ts
    // Write actions Lina proposes this turn; the client confirms each via a card.
    const proposedActions: import("../_shared/actions/po.ts").ProposedAction[] = [];
```

- [ ] **Step 2: Wire it into the tool context** — in the `toolContext` object literal, after `requestExport: ...,`, add:

```ts
      proposeAction: (action) => { proposedActions.push(action); },
```

- [ ] **Step 3: Return it** — in the success `Response` JSON (where `export_actions` is returned), add a line after `export_actions: ...,`:

```ts
        pending_actions: proposedActions,
```

- [ ] **Step 4: Sanity compile** — `npx tsc --noEmit -p tsconfig.json 2>/dev/null; echo "exit $?"` → no new errors mentioning `chat/index.ts`. `npx vitest run supabase/functions` → still green.

- [ ] **Step 5: Commit**
```bash
git add supabase/functions/chat/index.ts
git commit -m "feat(lina): chat function returns pending_actions for confirmation"
```

---

## Task 5: `execute-action` edge function (writes as the user + audit)

**Files:**
- Create: `supabase/functions/execute-action/index.ts`

This function is a Deno adapter (auth, user-scoped + service clients, RLS-enforced writes). It is NOT unit-tested; it reuses the pure validators (already tested) and is verified by the manual per-role smoke test in Task 9.

- [ ] **Step 1: Create the function** — `supabase/functions/execute-action/index.ts`:

```ts
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders } from "../_shared/security.ts";
import {
  validateCreatePo, validateUpdatePo, validateAssignPoLines,
  validateSetPoStatus, validateSetPoExFactory, validateArchivePo,
  type ProposedAction, type ValidationResult,
} from "../_shared/actions/po.ts";

const log = (s: string, d?: unknown) => console.log(`[EXECUTE-ACTION] ${s}${d ? " " + JSON.stringify(d) : ""}`);

function revalidate(kind: string, payload: Record<string, unknown>): ValidationResult {
  switch (kind) {
    case "create_po": return validateCreatePo(payload);
    case "update_po": return validateUpdatePo({ po_number: payload.po_number, ...(payload.fields as object) });
    case "assign_po_lines": return validateAssignPoLines(payload);
    case "set_po_status": return validateSetPoStatus(payload);
    case "set_po_ex_factory": return validateSetPoExFactory(payload);
    case "archive_po": return validateArchivePo(payload);
    default: return { ok: false, error: `Unknown action: ${kind}` };
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "Not authenticated" }, 401);
    const token = authHeader.replace("Bearer ", "");

    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) return json({ ok: false, error: "Not authenticated" }, 401);
    const user = userData.user;

    const { data: profile } = await admin.from("profiles").select("factory_id").eq("id", user.id).single();
    const factoryId = profile?.factory_id;
    if (!factoryId) return json({ ok: false, error: "Your account isn't linked to a factory." }, 400);

    const body = await req.json() as { kind?: string; payload?: Record<string, unknown> };
    const kind = String(body.kind ?? "");
    const rawPayload = (body.payload ?? {}) as Record<string, unknown>;

    // Re-validate server-side (never trust the client). factory_id is server-derived.
    const v = revalidate(kind, rawPayload);
    if (!v.ok) return json({ ok: false, error: v.error });
    const action: ProposedAction = v.action;
    const p = action.payload;

    // User-scoped client → RLS enforces exactly what this user may do.
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } },
    );

    const rlsMsg = (e: { message?: string } | null) =>
      e?.message?.toLowerCase().includes("row-level security")
        ? "You don't have permission to make that change."
        : (e?.message ?? "The change could not be applied.");

    // Resolve PO id (factory-scoped) for non-create actions.
    let poId: string | null = null;
    let oldRow: Record<string, unknown> | null = null;
    if (kind !== "create_po") {
      const { data: po } = await userClient
        .from("work_orders").select("*")
        .eq("factory_id", factoryId).eq("po_number", p.po_number as string).maybeSingle();
      if (!po) return json({ ok: false, error: `I couldn't find PO ${p.po_number}.` });
      poId = po.id as string;
      oldRow = po as Record<string, unknown>;
    }

    let summary = action.humanSummary;
    let recordId: string | null = poId;
    let tableName = "work_orders";
    let newData: Record<string, unknown> | null = null;

    if (kind === "create_po") {
      const insert = {
        factory_id: factoryId,
        po_number: p.po_number, buyer: p.buyer, style: p.style,
        item: p.item, color: p.color, order_qty: p.order_qty,
        smv: p.smv, cm_per_dozen: p.cm_per_dozen,
        target_per_hour: p.target_per_hour, target_per_day: p.target_per_day,
        planned_ex_factory: p.planned_ex_factory, status: p.status, is_active: true,
        // style_order_id is nullable (migration 20260506140000) — omitted intentionally.
      };
      const { data, error } = await userClient.from("work_orders").insert(insert).select("id").single();
      if (error) {
        if (error.code === "23505") return json({ ok: false, error: `PO ${p.po_number} already exists.` });
        return json({ ok: false, error: rlsMsg(error) });
      }
      recordId = data.id;
      newData = insert;
      const lineIds = Array.isArray(p.line_ids) ? (p.line_ids as string[]) : [];
      if (lineIds.length) {
        await userClient.from("work_order_line_assignments").insert(
          lineIds.map((line_id) => ({ work_order_id: data.id, line_id, factory_id: factoryId })),
        );
      }
    } else if (kind === "update_po") {
      const fields = p.fields as Record<string, unknown>;
      const { error } = await userClient.from("work_orders").update(fields).eq("id", poId);
      if (error) return json({ ok: false, error: rlsMsg(error) });
      newData = fields;
    } else if (kind === "assign_po_lines") {
      await userClient.from("work_order_line_assignments").delete().eq("work_order_id", poId);
      const { error } = await userClient.from("work_order_line_assignments").insert(
        (p.line_ids as string[]).map((line_id) => ({ work_order_id: poId, line_id, factory_id: factoryId })),
      );
      if (error) return json({ ok: false, error: rlsMsg(error) });
      tableName = "work_order_line_assignments";
      newData = { line_ids: p.line_ids };
    } else if (kind === "set_po_status") {
      const upd: Record<string, unknown> = {};
      if (p.status !== undefined) upd.status = p.status;
      if (p.is_active !== undefined) upd.is_active = p.is_active;
      const { error } = await userClient.from("work_orders").update(upd).eq("id", poId);
      if (error) return json({ ok: false, error: rlsMsg(error) });
      newData = upd;
    } else if (kind === "set_po_ex_factory") {
      const upd: Record<string, unknown> = {};
      if (p.planned_ex_factory !== undefined) upd.planned_ex_factory = p.planned_ex_factory;
      if (p.actual_ex_factory !== undefined) upd.actual_ex_factory = p.actual_ex_factory;
      const { error } = await userClient.from("work_orders").update(upd).eq("id", poId);
      if (error) return json({ ok: false, error: rlsMsg(error) });
      newData = upd;
    } else if (kind === "archive_po") {
      const { error } = await userClient.from("work_orders").update({ is_active: false, status: "deleted" }).eq("id", poId);
      if (error) return json({ ok: false, error: rlsMsg(error) });
      newData = { is_active: false, status: "deleted" };
    }

    // Audit via service client (audit_log RLS is admin-read; service bypasses).
    await admin.from("audit_log").insert({
      factory_id: factoryId, user_id: user.id,
      action: kind === "create_po" ? "INSERT" : "UPDATE",
      table_name: tableName, record_id: recordId,
      old_data: oldRow, new_data: newData,
    });

    log("done", { kind, recordId });
    return json({ ok: true, summary, recordId });
  } catch (e) {
    log("ERROR", { message: e instanceof Error ? e.message : String(e) });
    return json({ ok: false, error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
```

- [ ] **Step 2: Sanity** — `npx vitest run supabase/functions` still green (this file isn't imported by tests). Note: actual behavior is verified in Task 9 (deploy + smoke).

- [ ] **Step 3: Commit**
```bash
git add supabase/functions/execute-action/index.ts
git commit -m "feat(lina): execute-action function — confirmed PO writes as the user + audit"
```

---

## Task 6: `useChat` captures pending_actions + `runAction`

**Files:**
- Modify: `src/hooks/useChat.ts`

- [ ] **Step 1: Add the types + message field** — add an interface near `ChatToolUse`:

```ts
export interface PendingAction {
  kind: string;
  humanSummary: string;
  payload: Record<string, unknown>;
}
```
and add to the `ChatMessage` interface: `pendingActions?: PendingAction[];`.

- [ ] **Step 2: Capture on response** — in `sendMessage`, where the assistant message object is built, add `pendingActions: data.pending_actions,`.

- [ ] **Step 3: Add `runAction`** — add this `useCallback` (near `submitFeedback`) and expose it in the returned object + `UseChatReturn`:

```ts
  const runAction = useCallback(
    async (action: PendingAction): Promise<{ ok: boolean; summary?: string; error?: string }> => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) return { ok: false, error: "Please sign in." };
        const { data, error } = await supabase.functions.invoke("execute-action", {
          body: { kind: action.kind, payload: action.payload },
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (error) return { ok: false, error: error.message || "The change could not be applied." };
        return data as { ok: boolean; summary?: string; error?: string };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Unexpected error" };
      }
    },
    [],
  );
```
Add `runAction: (action: PendingAction) => Promise<{ ok: boolean; summary?: string; error?: string }>;` to `UseChatReturn`, and `runAction,` to the returned object.

- [ ] **Step 4: Build** — `npm run build` → succeeds.

- [ ] **Step 5: Commit**
```bash
git add src/hooks/useChat.ts
git commit -m "feat(lina): useChat captures pending_actions + runAction(execute-action)"
```

---

## Task 7: `ActionConfirmCard` + render in messages

**Files:**
- Create: `src/components/chat/ActionConfirmCard.tsx`
- Modify: `src/components/chat/ChatPanel.tsx` (pass `runAction` down) and `src/components/chat/ChatMessage.tsx` (render cards)

- [ ] **Step 1: Create the card** — `src/components/chat/ActionConfirmCard.tsx`:

```tsx
import { useState } from "react";
import { Check, X, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PendingAction } from "@/hooks/useChat";

interface Props {
  action: PendingAction;
  onRun: (action: PendingAction) => Promise<{ ok: boolean; summary?: string; error?: string }>;
}

type State = "pending" | "executing" | "done" | "cancelled" | "error";

export function ActionConfirmCard({ action, onRun }: Props) {
  const [state, setState] = useState<State>("pending");
  const [message, setMessage] = useState<string>("");

  const approve = async () => {
    setState("executing");
    const res = await onRun(action);
    if (res.ok) { setState("done"); setMessage(res.summary || "Done"); }
    else { setState("error"); setMessage(res.error || "The change could not be applied."); }
  };

  return (
    <div className="mt-2 w-full rounded-xl border border-primary/30 bg-card p-3 shadow-premium-sm">
      <p className="text-sm text-foreground leading-snug">{action.humanSummary}</p>
      {state === "pending" && (
        <div className="mt-2.5 flex items-center gap-2">
          <Button size="sm" className="h-8 gap-1 bg-gradient-to-br from-primary to-primary/80" onClick={approve}>
            <Check className="h-3.5 w-3.5" /> Approve
          </Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-muted-foreground" onClick={() => setState("cancelled")}>
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
        </div>
      )}
      {state === "executing" && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Applying…</p>
      )}
      {state === "done" && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"><Check className="h-3.5 w-3.5" /> {message}</p>
      )}
      {state === "cancelled" && <p className="mt-2 text-xs text-muted-foreground">Cancelled — nothing was changed.</p>}
      {state === "error" && (
        <div className="mt-2">
          <p className="flex items-center gap-1.5 text-xs text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> {message}</p>
          <Button size="sm" variant="ghost" className="mt-1 h-7 text-xs" onClick={approve}>Retry</Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Thread `runAction` through ChatPanel** — in `ChatPanel.tsx`, destructure `runAction` from `useChat()`, and pass it to each `<ChatMessage ... onRunAction={runAction} />`.

- [ ] **Step 3: Render cards in ChatMessage** — in `ChatMessage.tsx`: add `onRunAction?` to its props interface (`(action: PendingAction) => Promise<{ ok: boolean; summary?: string; error?: string }>`), import `ActionConfirmCard` and `type { PendingAction }`, and after the tool-activity chip block (still inside the assistant message body, before Suggested Questions) add:

```tsx
        {!isUser && message.pendingActions && message.pendingActions.length > 0 && onRunAction && (
          <div className="w-full space-y-2">
            {message.pendingActions.map((a, i) => (
              <ActionConfirmCard key={i} action={a} onRun={onRunAction} />
            ))}
          </div>
        )}
```

- [ ] **Step 4: Build** — `npm run build` → succeeds.

- [ ] **Step 5: Commit**
```bash
git add src/components/chat/ActionConfirmCard.tsx src/components/chat/ChatPanel.tsx src/components/chat/ChatMessage.tsx
git commit -m "feat(lina): Approve/Cancel action card rendered under Lina's messages"
```

---

## Task 8: Persona — Lina proposes PO writes

**Files:**
- Modify: `supabase/functions/_shared/persona.ts`

- [ ] **Step 1: Add guidance** — after the "Raising support tickets" section, add a new section:

```
## Managing purchase orders (writes)
- You can create, edit, organize (assign lines, set status, set ex-factory dates) and archive POs using the PO tools. These require admin/owner; if the user lacks permission the tool will say so — relay it politely.
- These tools do NOT change anything immediately. They PROPOSE the change, and the user sees an Approve/Cancel card. So: gather the needed details, call the tool, then tell the user to review and Approve the card. Never claim the change is done before they approve.
- Always confirm the key facts back in your message (which PO, what change). Identify an existing PO by its PO number.
```

- [ ] **Step 2: Tests** — `npx vitest run supabase/functions/_shared/persona.test.ts` → still passes (existing assertions unaffected).

- [ ] **Step 3: Commit**
```bash
git add supabase/functions/_shared/persona.ts
git commit -m "feat(lina): persona guidance for proposing PO writes via the confirm card"
```

---

## Task 9: Remote verification, deploy, and per-role smoke test

**Files:** none (verification/deploy).

- [ ] **Step 1: Verify remote schema** — in the Supabase dashboard SQL editor (project `varolnwetchstlfholbl`), run and confirm:

```sql
-- audit_log exists with the expected columns
select column_name from information_schema.columns where table_name='audit_log';
-- work_orders.style_order_id is nullable
select is_nullable from information_schema.columns where table_name='work_orders' and column_name='style_order_id';
-- the admin-manage RLS policy exists on work_orders
select polname from pg_policies where tablename='work_orders';
```
Expected: `audit_log` has `factory_id,user_id,action,table_name,record_id,old_data,new_data,created_at`; `style_order_id` is `YES` (nullable); a "manage work orders" policy exists. If `audit_log` is missing a column, add a minimal additive migration and apply it via the dashboard before proceeding.

- [ ] **Step 2: Full test suite** — `npx vitest run` → Lina edge tests + existing pass (the 2 pre-existing `po-control-room` failures are unrelated). `npm run build` → succeeds.

- [ ] **Step 3: Deploy** — `supabase functions deploy chat --project-ref varolnwetchstlfholbl` and `supabase functions deploy execute-action --project-ref varolnwetchstlfholbl`.

- [ ] **Step 4: Per-role smoke test (manual, in the app)** — hard-refresh the app, open Lina:
  - As **admin/owner**: "create a PO 99001 for buyer TestCo, style ABC, 1000 pcs, due 2026-07-20" → an Approve card appears → click Approve → "✅ PO 99001 created". Confirm it shows on the **Work Orders page** and an `audit_log` row exists. Then test edit ("change PO 99001 qty to 1500"), set status, assign a line, and archive — each via the card.
  - As a **worker**: "create a PO …" → the card's Approve returns "You don't have permission" (RLS denial), proving writes are user-scoped, not service-role.
  - Confirm the **Work Orders page still creates/edits POs normally** (untouched) and a **data-entry form** (e.g. sewing morning targets) still submits (untouched).

- [ ] **Step 5: Commit** (if Step 1 required a migration)
```bash
git add supabase/migrations/
git commit -m "chore(lina): additive migration for write-action prerequisites"
```

---

## Self-review notes (author)

- **Spec coverage:** preview→card→execute-as-user→audit (Tasks 3-7), PO actions create/update/assign/status/ex-factory/archive (Tasks 1-2 validators, 5 executor), RLS-enforced user-scoped writes + server-derived factory_id + re-validation (Task 5), audit (Task 5), pending_actions plumbing (Tasks 4,6), confirm card (Task 7), persona (Task 8), Supabase verification + deploy + per-role smoke incl. worker-denied + Work-Orders-page/forms regression (Task 9). Non-goals respected: no form code, no Work Orders page changes, additive only.
- **Type consistency:** `ProposedAction`/`ValidationResult`/`PoActionKind` defined in `actions/po.ts` (Task 1) and reused by tools (Task 3) and executor (Task 5); `PendingAction` (frontend) mirrors `{kind, humanSummary, payload}`; `proposeAction` added to `ToolContext` (Task 3) and supplied in chat (Task 4) and all test ctx helpers (Task 3).
- **Placeholder scan:** none — full code in every step.
- **Risk control:** worker-denied smoke test proves RLS (not service-role) governs writes; soft-delete only; audit on every write; remote-schema verification before reliance.
