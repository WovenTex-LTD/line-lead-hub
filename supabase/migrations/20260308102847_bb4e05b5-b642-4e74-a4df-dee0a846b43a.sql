-- ============================================================
-- Fix and add production-related notification triggers
-- ============================================================

-- 1. REWRITE notify_low_efficiency() for actuals tables
CREATE OR REPLACE FUNCTION public.notify_low_efficiency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_efficiency INTEGER;
  daily_target NUMERIC;
  daily_output NUMERIC;
  calculated_efficiency NUMERIC;
  admin_record RECORD;
  line_name TEXT;
  pref_enabled BOOLEAN;
BEGIN
  IF TG_TABLE_NAME = 'sewing_actuals' THEN
    daily_output := COALESCE(NEW.good_today, 0);
    SELECT COALESCE(st.target_total_planned, st.per_hour_target * COALESCE(st.hours_planned, 8))
    INTO daily_target
    FROM sewing_targets st
    WHERE st.factory_id = NEW.factory_id
      AND st.production_date = NEW.production_date
      AND st.line_id = NEW.line_id
      AND st.work_order_id = NEW.work_order_id;
  ELSIF TG_TABLE_NAME = 'finishing_actuals' THEN
    daily_output := COALESCE(NEW.day_qc_pass, 0);
    SELECT ft.per_hour_target * COALESCE(ft.day_hour_planned, 8)
    INTO daily_target
    FROM finishing_targets ft
    WHERE ft.factory_id = NEW.factory_id
      AND ft.production_date = NEW.production_date
      AND ft.line_id = NEW.line_id
      AND ft.work_order_id = NEW.work_order_id;
  ELSIF TG_TABLE_NAME = 'production_updates_sewing' THEN
    daily_output := COALESCE(NEW.output_qty, 0);
    daily_target := COALESCE(NEW.target_qty, 0);
  ELSIF TG_TABLE_NAME = 'production_updates_finishing' THEN
    daily_output := COALESCE(NEW.qc_pass_qty, 0);
    daily_target := COALESCE(NEW.per_hour_target, 0);
  ELSE
    RETURN NEW;
  END IF;

  IF COALESCE(daily_target, 0) <= 0 OR daily_output <= 0 THEN
    RETURN NEW;
  END IF;

  calculated_efficiency := (daily_output / daily_target) * 100;

  SELECT COALESCE(l.target_efficiency, 85), COALESCE(l.name, l.line_id)
  INTO target_efficiency, line_name
  FROM lines l WHERE l.id = NEW.line_id;

  target_efficiency := COALESCE(target_efficiency, 85);

  IF calculated_efficiency < target_efficiency THEN
    FOR admin_record IN
      SELECT p.id as user_id
      FROM profiles p
      JOIN user_roles ur ON ur.user_id = p.id
      WHERE p.factory_id = NEW.factory_id
        AND ur.role IN ('admin', 'owner')
        AND p.is_active = true
    LOOP
      SELECT COALESCE(in_app_enabled, true) INTO pref_enabled
      FROM notification_preferences
      WHERE user_id = admin_record.user_id AND notification_type = 'low_efficiency';

      IF pref_enabled IS NULL OR pref_enabled = true THEN
        INSERT INTO notifications (factory_id, user_id, title, message, type, data)
        VALUES (
          NEW.factory_id,
          admin_record.user_id,
          'Low Efficiency Alert',
          'Line ' || COALESCE(line_name, 'Unknown') || ' efficiency at ' || round(calculated_efficiency, 1) || '% (target: ' || target_efficiency || '%)',
          'low_efficiency',
          jsonb_build_object(
            'line_id', NEW.line_id,
            'efficiency', round(calculated_efficiency, 1),
            'target', target_efficiency,
            'submission_id', NEW.id,
            'table_name', TG_TABLE_NAME
          )
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_low_efficiency_sewing_actuals ON sewing_actuals;
CREATE TRIGGER trigger_notify_low_efficiency_sewing_actuals
  AFTER INSERT ON sewing_actuals
  FOR EACH ROW
  EXECUTE FUNCTION notify_low_efficiency();

DROP TRIGGER IF EXISTS trigger_notify_low_efficiency_finishing_actuals ON finishing_actuals;
CREATE TRIGGER trigger_notify_low_efficiency_finishing_actuals
  AFTER INSERT ON finishing_actuals
  FOR EACH ROW
  EXECUTE FUNCTION notify_low_efficiency();


-- 2. REWRITE notify_critical_blocker()
CREATE OR REPLACE FUNCTION public.notify_critical_blocker()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_record RECORD;
  line_name TEXT;
  blocker_name TEXT;
  pref_enabled BOOLEAN;
BEGIN
  IF NEW.has_blocker IS NOT TRUE OR NEW.blocker_impact NOT IN ('critical', 'high') THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(l.name, l.line_id) INTO line_name
  FROM lines l WHERE l.id = NEW.line_id;

  IF NEW.blocker_type_id IS NOT NULL THEN
    SELECT COALESCE(bt.name, 'Unknown') INTO blocker_name
    FROM blocker_types bt WHERE bt.id = NEW.blocker_type_id;
  ELSE
    blocker_name := 'Unknown';
  END IF;

  FOR admin_record IN
    SELECT p.id as user_id
    FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.id
    WHERE p.factory_id = NEW.factory_id
      AND ur.role IN ('admin', 'owner')
      AND p.is_active = true
  LOOP
    SELECT COALESCE(in_app_enabled, true) INTO pref_enabled
    FROM notification_preferences
    WHERE user_id = admin_record.user_id AND notification_type = 'critical_blocker';

    IF pref_enabled IS NULL OR pref_enabled = true THEN
      INSERT INTO notifications (factory_id, user_id, title, message, type, data)
      VALUES (
        NEW.factory_id,
        admin_record.user_id,
        'Critical Blocker Reported',
        'Line ' || COALESCE(line_name, 'Unknown') || ': ' || COALESCE(blocker_name, 'Unknown') || ' (' || NEW.blocker_impact || ' impact)',
        'critical_blocker',
        jsonb_build_object(
          'line_id', NEW.line_id,
          'blocker_type', blocker_name,
          'impact', NEW.blocker_impact,
          'description', NEW.blocker_description,
          'submission_id', NEW.id,
          'table_name', TG_TABLE_NAME
        )
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_critical_blocker_sewing_actuals ON sewing_actuals;
CREATE TRIGGER trigger_notify_critical_blocker_sewing_actuals
  AFTER INSERT ON sewing_actuals
  FOR EACH ROW
  EXECUTE FUNCTION notify_critical_blocker();

DROP TRIGGER IF EXISTS trigger_notify_critical_blocker_finishing_actuals ON finishing_actuals;
CREATE TRIGGER trigger_notify_critical_blocker_finishing_actuals
  AFTER INSERT ON finishing_actuals
  FOR EACH ROW
  EXECUTE FUNCTION notify_critical_blocker();


-- 3. NEW: notify_target_achieved()
CREATE OR REPLACE FUNCTION public.notify_target_achieved()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  daily_target NUMERIC;
  daily_output NUMERIC;
  achievement_pct NUMERIC;
  line_name TEXT;
  user_record RECORD;
  pref_enabled BOOLEAN;
BEGIN
  IF TG_TABLE_NAME = 'sewing_actuals' THEN
    daily_output := COALESCE(NEW.good_today, 0);
    SELECT COALESCE(st.target_total_planned, st.per_hour_target * COALESCE(st.hours_planned, 8))
    INTO daily_target
    FROM sewing_targets st
    WHERE st.factory_id = NEW.factory_id
      AND st.production_date = NEW.production_date
      AND st.line_id = NEW.line_id
      AND st.work_order_id = NEW.work_order_id;
  ELSIF TG_TABLE_NAME = 'finishing_actuals' THEN
    daily_output := COALESCE(NEW.day_qc_pass, 0);
    SELECT ft.per_hour_target * COALESCE(ft.day_hour_planned, 8)
    INTO daily_target
    FROM finishing_targets ft
    WHERE ft.factory_id = NEW.factory_id
      AND ft.production_date = NEW.production_date
      AND ft.line_id = NEW.line_id
      AND ft.work_order_id = NEW.work_order_id;
  ELSE
    RETURN NEW;
  END IF;

  IF COALESCE(daily_target, 0) <= 0 OR daily_output < daily_target THEN
    RETURN NEW;
  END IF;

  achievement_pct := round((daily_output / daily_target) * 100, 1);

  SELECT COALESCE(l.name, l.line_id) INTO line_name
  FROM lines l WHERE l.id = NEW.line_id;

  FOR user_record IN
    SELECT DISTINCT sub.user_id
    FROM (
      SELECT ula.user_id
      FROM user_line_assignments ula
      JOIN profiles p ON p.id = ula.user_id
      WHERE ula.line_id = NEW.line_id
        AND p.factory_id = NEW.factory_id
        AND p.is_active = true
      UNION
      SELECT p.id AS user_id
      FROM profiles p
      WHERE p.assigned_unit_id = NEW.line_id
        AND p.factory_id = NEW.factory_id
        AND p.is_active = true
      UNION
      SELECT p.id AS user_id
      FROM profiles p
      JOIN user_roles ur ON ur.user_id = p.id
      WHERE p.factory_id = NEW.factory_id
        AND ur.role IN ('admin', 'owner')
        AND p.is_active = true
    ) sub
  LOOP
    SELECT COALESCE(in_app_enabled, true) INTO pref_enabled
    FROM notification_preferences
    WHERE user_id = user_record.user_id AND notification_type = 'target_achieved';

    IF pref_enabled IS NULL OR pref_enabled = true THEN
      INSERT INTO notifications (factory_id, user_id, title, message, type, data)
      VALUES (
        NEW.factory_id,
        user_record.user_id,
        'Target Achieved',
        'Line ' || COALESCE(line_name, 'Unknown') || ' hit ' || achievement_pct || '% of target (' || round(daily_output) || '/' || round(daily_target) || ')',
        'target_achieved',
        jsonb_build_object(
          'line_id', NEW.line_id,
          'line_name', line_name,
          'output', daily_output,
          'target', daily_target,
          'achievement_pct', achievement_pct,
          'submission_id', NEW.id,
          'table_name', TG_TABLE_NAME
        )
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_target_achieved_sewing ON sewing_actuals;
CREATE TRIGGER trigger_notify_target_achieved_sewing
  AFTER INSERT ON sewing_actuals
  FOR EACH ROW
  EXECUTE FUNCTION notify_target_achieved();

DROP TRIGGER IF EXISTS trigger_notify_target_achieved_finishing ON finishing_actuals;
CREATE TRIGGER trigger_notify_target_achieved_finishing
  AFTER INSERT ON finishing_actuals
  FOR EACH ROW
  EXECUTE FUNCTION notify_target_achieved();


-- 4. NEW: notify_blocker_resolved()
CREATE OR REPLACE FUNCTION public.notify_blocker_resolved()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  line_name TEXT;
  blocker_name TEXT;
  admin_record RECORD;
  pref_enabled BOOLEAN;
BEGIN
  IF NOT (
    (OLD.has_blocker = true AND NEW.has_blocker = false) OR
    (OLD.has_blocker = true AND OLD.blocker_resolution_date IS NULL AND NEW.blocker_resolution_date IS NOT NULL)
  ) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(l.name, l.line_id) INTO line_name
  FROM lines l WHERE l.id = NEW.line_id;

  IF OLD.blocker_type_id IS NOT NULL THEN
    SELECT COALESCE(bt.name, 'Unknown') INTO blocker_name
    FROM blocker_types bt WHERE bt.id = OLD.blocker_type_id;
  ELSE
    blocker_name := 'Unknown';
  END IF;

  FOR admin_record IN
    SELECT p.id as user_id
    FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.id
    WHERE p.factory_id = NEW.factory_id
      AND ur.role IN ('admin', 'owner')
      AND p.is_active = true
  LOOP
    SELECT COALESCE(in_app_enabled, true) INTO pref_enabled
    FROM notification_preferences
    WHERE user_id = admin_record.user_id AND notification_type = 'blocker_resolved';

    IF pref_enabled IS NULL OR pref_enabled = true THEN
      INSERT INTO notifications (factory_id, user_id, title, message, type, data)
      VALUES (
        NEW.factory_id,
        admin_record.user_id,
        'Blocker Resolved',
        'Line ' || COALESCE(line_name, 'Unknown') || ': ' || COALESCE(blocker_name, 'Unknown') || ' has been resolved',
        'blocker_resolved',
        jsonb_build_object(
          'line_id', NEW.line_id,
          'line_name', line_name,
          'blocker_type', blocker_name,
          'impact', OLD.blocker_impact,
          'submission_id', NEW.id,
          'table_name', TG_TABLE_NAME
        )
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_blocker_resolved_sewing ON sewing_actuals;
CREATE TRIGGER trigger_notify_blocker_resolved_sewing
  AFTER UPDATE ON sewing_actuals
  FOR EACH ROW
  EXECUTE FUNCTION notify_blocker_resolved();

DROP TRIGGER IF EXISTS trigger_notify_blocker_resolved_finishing ON finishing_actuals;
CREATE TRIGGER trigger_notify_blocker_resolved_finishing
  AFTER UPDATE ON finishing_actuals
  FOR EACH ROW
  EXECUTE FUNCTION notify_blocker_resolved();

DROP TRIGGER IF EXISTS trigger_notify_blocker_resolved_prod_sewing ON production_updates_sewing;
CREATE TRIGGER trigger_notify_blocker_resolved_prod_sewing
  AFTER UPDATE ON production_updates_sewing
  FOR EACH ROW
  EXECUTE FUNCTION notify_blocker_resolved();

DROP TRIGGER IF EXISTS trigger_notify_blocker_resolved_prod_finishing ON production_updates_finishing;
CREATE TRIGGER trigger_notify_blocker_resolved_prod_finishing
  AFTER UPDATE ON production_updates_finishing
  FOR EACH ROW
  EXECUTE FUNCTION notify_blocker_resolved();


-- 5. NEW: notify_production_notes()
CREATE OR REPLACE FUNCTION public.notify_production_notes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  line_name TEXT;
  submitter_name TEXT;
  admin_record RECORD;
  pref_enabled BOOLEAN;
  dept TEXT;
BEGIN
  IF NEW.remarks IS NULL OR trim(NEW.remarks) = '' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.remarks IS NOT DISTINCT FROM NEW.remarks THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(l.name, l.line_id) INTO line_name
  FROM lines l WHERE l.id = NEW.line_id;

  SELECT COALESCE(p.display_name, p.full_name, 'Unknown') INTO submitter_name
  FROM profiles p WHERE p.id = NEW.submitted_by;

  IF TG_TABLE_NAME LIKE '%sewing%' THEN
    dept := 'Sewing';
  ELSIF TG_TABLE_NAME LIKE '%finishing%' THEN
    dept := 'Finishing';
  ELSE
    dept := 'Production';
  END IF;

  FOR admin_record IN
    SELECT p.id as user_id
    FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.id
    WHERE p.factory_id = NEW.factory_id
      AND ur.role IN ('admin', 'owner')
      AND p.is_active = true
      AND p.id IS DISTINCT FROM NEW.submitted_by
  LOOP
    SELECT COALESCE(in_app_enabled, true) INTO pref_enabled
    FROM notification_preferences
    WHERE user_id = admin_record.user_id AND notification_type = 'production_notes';

    IF pref_enabled IS NULL OR pref_enabled = true THEN
      INSERT INTO notifications (factory_id, user_id, title, message, type, data)
      VALUES (
        NEW.factory_id,
        admin_record.user_id,
        'Production Note Added',
        dept || ' – Line ' || COALESCE(line_name, 'Unknown') || ': ' || left(trim(NEW.remarks), 120),
        'production_notes',
        jsonb_build_object(
          'line_id', NEW.line_id,
          'line_name', line_name,
          'department', dept,
          'remarks', NEW.remarks,
          'submitted_by', NEW.submitted_by,
          'submitter_name', submitter_name,
          'production_date', NEW.production_date,
          'submission_id', NEW.id,
          'table_name', TG_TABLE_NAME
        )
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_production_notes_sewing ON sewing_actuals;
CREATE TRIGGER trigger_notify_production_notes_sewing
  AFTER INSERT OR UPDATE ON sewing_actuals
  FOR EACH ROW
  EXECUTE FUNCTION notify_production_notes();

DROP TRIGGER IF EXISTS trigger_notify_production_notes_finishing ON finishing_actuals;
CREATE TRIGGER trigger_notify_production_notes_finishing
  AFTER INSERT OR UPDATE ON finishing_actuals
  FOR EACH ROW
  EXECUTE FUNCTION notify_production_notes();

DROP TRIGGER IF EXISTS trigger_notify_production_notes_prod_sewing ON production_updates_sewing;
CREATE TRIGGER trigger_notify_production_notes_prod_sewing
  AFTER INSERT OR UPDATE ON production_updates_sewing
  FOR EACH ROW
  EXECUTE FUNCTION notify_production_notes();

DROP TRIGGER IF EXISTS trigger_notify_production_notes_prod_finishing ON production_updates_finishing;
CREATE TRIGGER trigger_notify_production_notes_prod_finishing
  AFTER INSERT OR UPDATE ON production_updates_finishing
  FOR EACH ROW
  EXECUTE FUNCTION notify_production_notes();

NOTIFY pgrst, 'reload schema';