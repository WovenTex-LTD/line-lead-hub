// PO write preview-tools. They validate + role-gate and QUEUE a ProposedAction
// for the user to confirm. They NEVER write — execution happens in execute-action.

import type { ToolContext } from "./types.ts";
import {
  validateCreatePo, validateUpdatePo, validateAssignPoLines,
  validateSetPoStatus, validateSetPoExFactory, validateArchivePo,
  UUID_RE, type ValidationResult,
} from "../actions/po.ts";
import { validateCreateCustomForm, validateUpdateCustomForm } from "../actions/forms.ts";

const ADMIN_ROLES = ["admin", "owner", "superadmin"];
const DENY = "You don't have access to make that change. It requires an admin or owner role. Please contact your administrator.";

function gate(ctx: ToolContext): boolean {
  return ADMIN_ROLES.includes(ctx.role);
}

async function propose(ctx: ToolContext, result: ValidationResult): Promise<string> {
  if (!result.ok) return result.error;
  ctx.proposeAction(result.action);
  return `${result.action.humanSummary}.\n\nReview and Approve below to apply it.`;
}

const normalizeLineRef = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Resolve human line references ("Line 2", "2", "line_2", a UUID) to the factory's
 *  real line UUIDs. Unmatched references return an error listing the active lines,
 *  so the model can ask the user instead of guessing. */
async function resolveLineIds(
  ctx: ToolContext,
  raw: string[],
): Promise<{ ids: string[]; names: string[] } | { error: string }> {
  const { data } = await ctx.supabase
    .from("lines").select("id, line_id, name")
    .eq("factory_id", ctx.factoryId).eq("is_active", true);
  const lines = (data ?? []) as { id: string; line_id: string | null; name: string | null }[];
  const ids: string[] = [];
  const names: string[] = [];
  const unmatched: string[] = [];
  for (const r of raw) {
    const n = normalizeLineRef(r);
    const hit = lines.find((l) =>
      (UUID_RE.test(r) && l.id.toLowerCase() === r.toLowerCase()) ||
      (n !== "" && (normalizeLineRef(l.line_id ?? "") === n || normalizeLineRef(l.name ?? "") === n)) ||
      (/^\d+$/.test(n) && (normalizeLineRef(l.line_id ?? "") === `line${n}` || normalizeLineRef(l.name ?? "") === `line${n}`))
    );
    if (!hit) { unmatched.push(r); continue; }
    if (!ids.includes(hit.id)) { ids.push(hit.id); names.push(hit.name || hit.line_id || hit.id); }
  }
  if (unmatched.length) {
    const available = lines.map((l) => l.name || l.line_id || l.id).join(", ");
    return {
      error: `I couldn't match ${unmatched.map((u) => `"${u}"`).join(", ")} to a production line in this factory. ` +
        (available ? `The active lines are: ${available}. Ask the user which to use, then propose again.` : "No active lines were found — the user may need to set up lines first."),
    };
  }
  return { ids, names };
}

export async function createPoTool(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!gate(ctx)) return DENY;
  let patched = input;
  const raw = Array.isArray(input.line_ids) ? (input.line_ids as unknown[]).map(String).filter(Boolean) : [];
  if (raw.length > 0) {
    const resolved = await resolveLineIds(ctx, raw);
    if ("error" in resolved) return resolved.error;
    patched = { ...input, line_ids: resolved.ids };
  }
  return propose(ctx, validateCreatePo(patched));
}
export async function updatePoTool(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!gate(ctx)) return DENY;
  return propose(ctx, validateUpdatePo(input));
}
export async function assignPoLinesTool(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!gate(ctx)) return DENY;
  const raw = Array.isArray(input.line_ids) ? (input.line_ids as unknown[]).map(String).filter(Boolean) : [];
  if (raw.length === 0) return propose(ctx, validateAssignPoLines(input));
  const resolved = await resolveLineIds(ctx, raw);
  if ("error" in resolved) return resolved.error;
  const result = validateAssignPoLines({ ...input, line_ids: resolved.ids });
  if (result.ok) {
    result.action.humanSummary = `Assign PO ${String(input.po_number ?? "").trim()} to ${resolved.names.join(", ")}`;
  }
  return propose(ctx, result);
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

export async function proposeCreateFormTool(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!gate(ctx)) return DENY;
  return propose(ctx, validateCreateCustomForm(input));
}
export async function proposeUpdateFormTool(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!gate(ctx)) return DENY;
  return propose(ctx, validateUpdateCustomForm(input));
}
