-- Per-field metric_role: let ANY custom form (not just the 6 production slots)
-- feed the canonical production_metrics layer. Lina tags each numeric field with
-- the canonical role its number represents (output, manpower, …) regardless of how
-- the form worded the label; free-form submissions then project into the view.

-- 1. The tag column on fields. Nullable: most fields carry no production metric.
ALTER TABLE public.custom_form_fields
  ADD COLUMN IF NOT EXISTS metric_role text;

-- 2. Safe text→numeric for the view: a free-form value may be any string; bad
--    casts return NULL (and get filtered) instead of failing the whole view.
CREATE OR REPLACE FUNCTION public.try_numeric(t text) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN t::numeric;
EXCEPTION WHEN others THEN
  RETURN NULL;
END $$;

-- 3. The canonical view: 6 typed-table branches (slot forms already flow through
--    these) PLUS a free-form branch for non-slot custom submissions. Full
--    redefinition so it's idempotent.
CREATE OR REPLACE VIEW public.production_metrics AS
  -- SEWING ACTUALS
  SELECT s.factory_id, s.line_id, s.work_order_id, s.production_date,
         'sewing'::text AS department, 'actual'::text AS kind,
         m.metric_role, m.value, s.submitted_at,
         COALESCE(s.custom_data->>'source' = 'custom_form', false) AS is_custom,
         (s.custom_data->>'custom_submission_id') AS custom_submission_id,
         (s.custom_data->>'template_id')          AS template_id
  FROM public.sewing_actuals s
  CROSS JOIN LATERAL (VALUES
    ('output',   s.good_today::numeric),
    ('reject',   s.reject_today::numeric),
    ('rework',   s.rework_today::numeric),
    ('manpower', s.manpower_actual::numeric),
    ('hours',    s.hours_actual::numeric),
    ('ot_hours', s.ot_hours_actual::numeric),
    ('per_hour', s.actual_per_hour::numeric)
  ) AS m(metric_role, value)
  WHERE m.value IS NOT NULL

  UNION ALL
  -- SEWING TARGETS
  SELECT s.factory_id, s.line_id, s.work_order_id, s.production_date,
         'sewing', 'target',
         m.metric_role, m.value, s.submitted_at,
         COALESCE(s.custom_data->>'source' = 'custom_form', false),
         (s.custom_data->>'custom_submission_id'),
         (s.custom_data->>'template_id')
  FROM public.sewing_targets s
  CROSS JOIN LATERAL (VALUES
    ('target_output',   s.target_total_planned::numeric),
    ('per_hour_target', s.per_hour_target::numeric),
    ('manpower',        s.manpower_planned::numeric),
    ('hours',           s.hours_planned::numeric),
    ('ot_hours',        s.ot_hours_planned::numeric)
  ) AS m(metric_role, value)
  WHERE m.value IS NOT NULL

  UNION ALL
  -- CUTTING ACTUALS
  SELECT c.factory_id, c.line_id, c.work_order_id, c.production_date,
         'cutting', 'actual',
         m.metric_role, m.value, c.submitted_at,
         COALESCE(c.custom_data->>'source' = 'custom_form', false),
         (c.custom_data->>'custom_submission_id'),
         (c.custom_data->>'template_id')
  FROM public.cutting_actuals c
  CROSS JOIN LATERAL (VALUES
    ('output',   c.day_cutting::numeric),
    ('input',    c.day_input::numeric),
    ('manpower', c.man_power::numeric),
    ('hours',    c.hours_actual::numeric),
    ('ot_hours', c.ot_hours_actual::numeric),
    ('per_hour', c.actual_per_hour::numeric)
  ) AS m(metric_role, value)
  WHERE m.value IS NOT NULL

  UNION ALL
  -- CUTTING TARGETS
  SELECT c.factory_id, c.line_id, c.work_order_id, c.production_date,
         'cutting', 'target',
         m.metric_role, m.value, c.submitted_at,
         COALESCE(c.custom_data->>'source' = 'custom_form', false),
         (c.custom_data->>'custom_submission_id'),
         (c.custom_data->>'template_id')
  FROM public.cutting_targets c
  CROSS JOIN LATERAL (VALUES
    ('target_output',   c.day_cutting::numeric),
    ('input',           c.day_input::numeric),
    ('manpower',        c.man_power::numeric),
    ('hours',           c.hours_planned::numeric),
    ('ot_hours',        c.ot_hours_planned::numeric),
    ('per_hour_target', c.target_per_hour::numeric)
  ) AS m(metric_role, value)
  WHERE m.value IS NOT NULL

  UNION ALL
  -- FINISHING OUTPUT logs → actual.  poly is the primary finishing output.
  SELECT f.factory_id, f.line_id, f.work_order_id, f.production_date,
         'finishing', 'actual',
         m.metric_role, m.value, f.submitted_at,
         COALESCE(f.custom_data->>'source' = 'custom_form', false),
         (f.custom_data->>'custom_submission_id'),
         (f.custom_data->>'template_id')
  FROM public.finishing_daily_logs f
  CROSS JOIN LATERAL (VALUES
    ('output',   f.poly::numeric),
    ('carton',   f.carton::numeric),
    ('manpower', f.m_power_actual::numeric),
    ('hours',    f.actual_hours::numeric),
    ('ot_hours', f.ot_hours_actual::numeric)
  ) AS m(metric_role, value)
  WHERE f.log_type = 'OUTPUT' AND m.value IS NOT NULL

  UNION ALL
  -- FINISHING TARGET logs → target.  poly holds a per-hour target.
  SELECT f.factory_id, f.line_id, f.work_order_id, f.production_date,
         'finishing', 'target',
         m.metric_role, m.value, f.submitted_at,
         COALESCE(f.custom_data->>'source' = 'custom_form', false),
         (f.custom_data->>'custom_submission_id'),
         (f.custom_data->>'template_id')
  FROM public.finishing_daily_logs f
  CROSS JOIN LATERAL (VALUES
    ('per_hour_target', f.poly::numeric),
    ('target_output',   (f.poly * COALESCE(NULLIF(f.planned_hours, 0), 1))::numeric),
    ('manpower',        f.m_power_planned::numeric),
    ('hours',           f.planned_hours::numeric),
    ('ot_hours',        f.ot_hours_planned::numeric)
  ) AS m(metric_role, value)
  WHERE f.log_type = 'TARGET' AND m.value IS NOT NULL

  UNION ALL
  -- FREE-FORM custom submissions (non-slot only: slot forms already flow via the
  -- typed branches above; including them here would double-count). Each numeric
  -- field tagged with a metric_role contributes one normalized row. Line/PO are
  -- not resolved for free-form, so they aggregate at factory/department/date.
  SELECT
    s.factory_id,
    NULL::uuid AS line_id,
    NULL::uuid AS work_order_id,
    s.created_at::date AS production_date,
    t.target_role AS department,
    CASE WHEN fld.metric_role IN ('target_output','per_hour_target') THEN 'target' ELSE 'actual' END AS kind,
    fld.metric_role,
    public.try_numeric(s.values->>fld.key) AS value,
    s.created_at AS submitted_at,
    true AS is_custom,
    s.id::text AS custom_submission_id,
    s.template_id::text AS template_id
  FROM public.custom_form_submissions s
  JOIN public.custom_form_templates t ON t.id = s.template_id AND t.slot_key IS NULL
  CROSS JOIN LATERAL jsonb_to_recordset(
    CASE WHEN jsonb_typeof(s.fields_snapshot) = 'array' THEN s.fields_snapshot ELSE '[]'::jsonb END
  ) AS fld(key text, metric_role text)
  WHERE fld.metric_role IS NOT NULL
    AND public.try_numeric(s.values->>fld.key) IS NOT NULL;

COMMENT ON VIEW public.production_metrics IS
  'Canonical long-format production metrics across sewing/cutting/finishing, '
  'target+actual, standard+custom (slot via typed tables, free-form via tagged '
  'fields). One vocabulary for all readers (Insights, comparison modal, Lina).';
