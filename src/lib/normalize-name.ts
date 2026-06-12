// Normalization for buyer/style autocomplete dedup + matching.
// Rules: trim leading/trailing whitespace, collapse multi-spaces, lowercase
// for comparison. Display values keep their original casing.

export function normalizeName(s: string | null | undefined): string {
  if (!s) return "";
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

// Display-clean a value: trim + collapse spaces, but preserve casing.
// Use this on values entered by the user before saving them.
export function cleanDisplayName(s: string | null | undefined): string {
  if (!s) return "";
  return s.trim().replace(/\s+/g, " ");
}

// Search-bar normalization: lowercase and strip ALL spacing/punctuation from
// BOTH the query and the value, so "PO 1123" finds "PO1123" and "t shirt"
// finds "T-Shirt". Unicode-aware: letters, combining marks (Bengali vowel
// signs etc.) and digits in any script are kept.
export function searchNorm(s: string | null | undefined): string {
  if (!s) return "";
  return s.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, "");
}
