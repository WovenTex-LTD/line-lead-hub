/**
 * Returns the finishing output value as entered by the linesman.
 * The linesman enters the total output for the day (including OT hours),
 * so no adjustment is needed.
 */
export function effectivePoly(
  poly: number | null | undefined,
  actual_hours?: number | null | undefined,
  ot_hours_actual?: number | null | undefined,
): number {
  return poly || 0;
}

export function effectiveCarton(
  carton: number | null | undefined,
  actual_hours: number | null | undefined,
  ot_hours_actual: number | null | undefined,
): number {
  return effectivePoly(carton, actual_hours, ot_hours_actual);
}
