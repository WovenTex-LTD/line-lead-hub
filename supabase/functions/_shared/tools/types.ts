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
