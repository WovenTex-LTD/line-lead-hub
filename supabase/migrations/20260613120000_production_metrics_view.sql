-- Canonical production-metrics layer.
--
-- One normalized vocabulary that every department's typed table (and therefore
-- every custom slot form that writes into them) reduces to. Insights, the
-- comparison modal, and Lina read THIS instead of knowing column names per
-- table. Adding a department or a custom form never requires touching readers.
--
-- Long format: one row per (source row, metric_role). NULL metric values are
-- dropped so a sparse submission doesn't manufacture phantom zero-rows, but a
-- real 0 is kept (0 output is meaningful).
--
-- metric_role vocabulary (the "these numbers are the same even when worded
-- differently" canon):
--   output           good units produced / pieces finished
--   target_output    planned output
--   reject, rework   quality losses
--   input            pieces fed in (cutting input)
--   poly, carton     finishing pack steps
--   manpower         operators (planned on targets, actual on actuals)
--   hours, ot_hours  working / overtime hours
--   per_hour         achieved units per hour (actuals)
--   per_hour_target  planned units per hour (targets)

-- Latent-bug fix: custom cutting-target forms map to cutting_targets, but it
-- lacked the custom_data link column the upsert writer sets. Upgrade-safe.
ALTER TABLE public.cutting_targets
  ADD COLUMN IF NOT EXISTS custom_data jsonb;

-- Finishing source of truth is finishing_daily_logs (the active, log-typed
-- table standard entry writes and Insights reads). Give it the custom_data
-- link column so custom finishing forms can converge here too. Upgrade-safe.
ALTER TABLE public.finishing_daily_logs
  ADD COLUMN IF NOT EXISTS custom_data jsonb;

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
  -- FINISHING OUTPUT logs → actual.  poly is the primary finishing output
  -- (matches Insights); carton exposed alongside it.
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
  -- FINISHING TARGET logs → target.  On TARGET rows poly holds a per-hour
  -- target; daily target_output = per-hour × planned_hours (matches Insights).
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
  WHERE f.log_type = 'TARGET' AND m.value IS NOT NULL;

COMMENT ON VIEW public.production_metrics IS
  'Canonical long-format production metrics across sewing/cutting/finishing, '
  'target+actual, standard+custom. One vocabulary for all readers (Insights, '
  'comparison modal, Lina). is_custom/custom_submission_id link back to the form.';
