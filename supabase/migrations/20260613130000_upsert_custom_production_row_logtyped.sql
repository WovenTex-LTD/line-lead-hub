-- Extend the custom production writer to support log-typed tables, specifically
-- finishing_daily_logs (now the finishing source of truth). Two changes vs. the
-- prior version:
--   1. finishing_daily_logs added to the allowlist.
--   2. When the supplied values carry a log_type, it joins the natural key so an
--      OUTPUT log and a TARGET log for the same line/PO/date are distinct rows
--      and don't overwrite each other.
-- Everything else (introspect + default required columns, SECURITY INVOKER, RLS)
-- is unchanged. Safe to re-run.

CREATE OR REPLACE FUNCTION public.upsert_custom_production_row(
  p_table           text,
  p_factory_id      uuid,
  p_line_id         uuid,
  p_work_order_id   uuid,
  p_production_date date,
  p_values          jsonb,   -- the form's mapped columns { column: value }, may include log_type
  p_custom_data     jsonb    -- link back to the custom submission
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  allowed   text[] := ARRAY['sewing_targets','sewing_actuals','cutting_targets','cutting_actuals','finishing_targets','finishing_actuals','finishing_daily_logs'];
  full_vals jsonb;
  upd_vals  jsonb;
  rec       record;
  existing_id uuid;
  collist   text;
  coldef    text;
  upd_set   text;
  upd_coldef text;
  v_log_type text := p_values->>'log_type';
BEGIN
  IF p_table IS NULL OR NOT (p_table = ANY(allowed)) THEN
    RAISE EXCEPTION 'Table % is not allowed for custom production writes', p_table;
  END IF;

  -- Values the form supplies, plus the natural key, ownership, and the submission link.
  full_vals := coalesce(p_values, '{}'::jsonb) || jsonb_build_object(
    'factory_id', p_factory_id,
    'line_id', p_line_id,
    'work_order_id', p_work_order_id,
    'production_date', p_production_date,
    'submitted_by', auth.uid(),
    'custom_data', coalesce(p_custom_data, '{}'::jsonb)
  );

  -- Fill any NOT-NULL/no-default column we didn't supply, defaulted by type.
  FOR rec IN
    SELECT a.attname AS col, format_type(a.atttypid, a.atttypmod) AS typ
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = p_table
      AND a.attnum > 0 AND NOT a.attisdropped AND a.attnotnull
      AND NOT EXISTS (SELECT 1 FROM pg_attrdef d WHERE d.adrelid = a.attrelid AND d.adnum = a.attnum)
  LOOP
    IF NOT (full_vals ? rec.col) THEN
      full_vals := full_vals || jsonb_build_object(rec.col,
        CASE
          WHEN rec.typ IN ('integer','bigint','smallint','numeric','real','double precision') THEN to_jsonb(0)
          WHEN rec.typ = 'boolean' THEN to_jsonb(false)
          WHEN rec.typ = 'date' THEN to_jsonb(CURRENT_DATE)
          WHEN rec.typ LIKE 'timestamp%' THEN to_jsonb(now())
          WHEN rec.typ = 'text' OR rec.typ LIKE 'character%' THEN to_jsonb(''::text)
          ELSE 'null'::jsonb
        END);
    END IF;
  END LOOP;

  -- One row per natural key: update the supplied columns, else insert. log_type
  -- joins the key for log-typed tables so OUTPUT/TARGET stay distinct.
  IF v_log_type IS NOT NULL THEN
    EXECUTE format('SELECT id FROM public.%I WHERE factory_id=$1 AND line_id=$2 AND work_order_id=$3 AND production_date=$4 AND log_type::text=$5 LIMIT 1', p_table)
      INTO existing_id USING p_factory_id, p_line_id, p_work_order_id, p_production_date, v_log_type;
  ELSE
    EXECUTE format('SELECT id FROM public.%I WHERE factory_id=$1 AND line_id=$2 AND work_order_id=$3 AND production_date=$4 LIMIT 1', p_table)
      INTO existing_id USING p_factory_id, p_line_id, p_work_order_id, p_production_date;
  END IF;

  IF existing_id IS NOT NULL THEN
    upd_vals := coalesce(p_values, '{}'::jsonb) || jsonb_build_object('custom_data', coalesce(p_custom_data, '{}'::jsonb));
    SELECT string_agg(format('%I = r.%I', a.attname, a.attname), ', ' ORDER BY a.attnum),
           string_agg(format('%I %s', a.attname, format_type(a.atttypid, a.atttypmod)), ', ' ORDER BY a.attnum)
      INTO upd_set, upd_coldef
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname=p_table AND a.attnum>0 AND NOT a.attisdropped
      AND a.attname IN (SELECT jsonb_object_keys(upd_vals));
    IF upd_set IS NOT NULL THEN
      EXECUTE format('UPDATE public.%I t SET %s FROM jsonb_to_record($1) AS r(%s) WHERE t.id=$2', p_table, upd_set, upd_coldef)
        USING upd_vals, existing_id;
    END IF;
  ELSE
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum),
           string_agg(format('%I %s', a.attname, format_type(a.atttypid, a.atttypmod)), ', ' ORDER BY a.attnum)
      INTO collist, coldef
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname=p_table AND a.attnum>0 AND NOT a.attisdropped
      AND a.attname IN (SELECT jsonb_object_keys(full_vals));
    EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_to_record($1) AS r(%s)', p_table, collist, collist, coldef)
      USING full_vals;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.upsert_custom_production_row(text, uuid, uuid, uuid, date, jsonb, jsonb) TO authenticated;
