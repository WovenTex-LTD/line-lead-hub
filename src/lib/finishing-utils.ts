/**
 * Adjusts a finishing output value (poly or carton) to include OT hours.
 * In finishing_daily_logs OUTPUT records, `poly`/`carton` are stored based on
 * regular hours only. When OT hours are present, the effective total is:
 *   effectiveValue = (value / actual_hours) * (actual_hours + ot_hours_actual)
 */
export function effectivePoly(
  poly: number | null | undefined,
  actual_hours: number | null | undefined,
  ot_hours_actual: number | null | undefined,
): number {
  const p = poly || 0;
  const h = actual_hours || 0;
  const ot = ot_hours_actual || 0;
  if (h > 0 && ot > 0) return Math.round((p / h) * (h + ot));
  return p;
}

export function effectiveCarton(
  carton: number | null | undefined,
  actual_hours: number | null | undefined,
  ot_hours_actual: number | null | undefined,
): number {
  return effectivePoly(carton, actual_hours, ot_hours_actual);
}
