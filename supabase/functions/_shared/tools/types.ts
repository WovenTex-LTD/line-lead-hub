// Shared types and access-control helpers for Lina's tool layer.
// Pure: only type-only Deno imports (erased at build), no Deno.env access.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type UserRole = "worker" | "storage" | "cutting" | "admin" | "owner" | string;
export type Department = "sewing" | "cutting" | "finishing";

export interface SupportTicket {
  problem: string;
  category?: string;
}

export interface ExportRequest {
  reportType: "production" | "insights" | "finance";
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  format: "pdf" | "csv";
}

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
  /** Escalate an unresolved problem to the Woventex team (sends an email). */
  escalate: (ticket: SupportTicket) => Promise<{ ok: boolean; error?: string }>;
  /** Queue a report export for the client to run (produces the real in-app file). */
  requestExport: (input: ExportRequest) => void;
  /** Queue a write action for the user to confirm (no write happens here). */
  proposeAction: (action: import("../actions/po.ts").ProposedAction) => void;
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

/** Which production departments a role may see. admin/owner/superadmin and
 *  supervisors see all production; workers see sewing + finishing; the cutting
 *  role sees cutting; storage and everyone else see none. (Financials, voice
 *  notes, dispatch and write actions are gated separately — not by this map.) */
export function allowedDepartmentsForRole(role: UserRole): Department[] {
  switch (role) {
    case "admin":
    case "owner":
    case "superadmin":
    case "supervisor":
      return ["sewing", "cutting", "finishing"];
    case "worker":
      return ["sewing", "finishing"];
    case "cutting":
      return ["cutting"];
    default:
      return [];
  }
}
