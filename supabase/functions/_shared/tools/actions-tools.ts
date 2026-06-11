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
