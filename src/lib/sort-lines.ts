/**
 * Natural sort comparator for line names/IDs.
 * Sorts primarily by the leading number, then alphabetically by suffix.
 * Examples: Line 1, Line 1A, Line 1B, Line 2, Line 10, Line 10A
 */
export function compareLineNames(a: string, b: string): number {
  const numA = parseInt(a.replace(/\D/g, "")) || 9999;
  const numB = parseInt(b.replace(/\D/g, "")) || 9999;
  if (numA !== numB) return numA - numB;
  // Same number — compare full string for suffix (A, B, etc.)
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

/**
 * Sort an array of objects by their line name/ID using natural numeric order.
 * @param items Array to sort (not mutated — returns new array)
 * @param getKey Function to extract the line name/ID from each item
 */
export function sortByLineName<T>(items: T[], getKey: (item: T) => string): T[] {
  return [...items].sort((a, b) => compareLineNames(getKey(a), getKey(b)));
}

/**
 * Extract numeric value from a line name for sorting.
 * Returns 9999 if no number found (sorts to end).
 */
export function lineNumber(name: string): number {
  return parseInt(name.replace(/\D/g, "")) || 9999;
}
