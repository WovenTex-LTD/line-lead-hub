-- Fix notify_production_notes trigger: it references NEW.remarks but
-- production_updates_sewing and production_updates_finishing don't have
-- that column, causing "record 'new' has no field 'remarks'" on insert.
--
-- Solution: check if the column exists on the triggering table before
-- accessing it. Fall back to NULL when it doesn't exist.

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
  remarks_value TEXT;
  has_remarks_col BOOLEAN;
BEGIN
  -- Check if the triggering table has a 'remarks' column
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = TG_TABLE_NAME
      AND column_name = 'remarks'
  ) INTO has_remarks_col;

  IF has_remarks_col THEN
    EXECUTE format('SELECT ($1).%I', 'remarks') INTO remarks_value USING NEW;
  ELSE
    remarks_value := NULL;
  END IF;

  -- Only fire when remarks is not empty
  IF remarks_value IS NULL OR trim(remarks_value) = '' THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, skip if remarks haven't changed
  IF TG_OP = 'UPDATE' THEN
    DECLARE
      old_remarks TEXT;
    BEGIN
      IF has_remarks_col THEN
        EXECUTE format('SELECT ($1).%I', 'remarks') INTO old_remarks USING OLD;
      ELSE
        old_remarks := NULL;
      END IF;
      IF old_remarks IS NOT DISTINCT FROM remarks_value THEN
        RETURN NEW;
      END IF;
    END;
  END IF;

  SELECT COALESCE(l.name, l.line_id) INTO line_name
  FROM lines l WHERE l.id = NEW.line_id;

  -- Get submitter display name (use full_name)
  SELECT COALESCE(p.full_name, 'Unknown') INTO submitter_name
  FROM profiles p WHERE p.id = NEW.submitted_by;

  -- Determine department from table name
  IF TG_TABLE_NAME LIKE '%sewing%' THEN
    dept := 'Sewing';
  ELSIF TG_TABLE_NAME LIKE '%finishing%' THEN
    dept := 'Finishing';
  ELSE
    dept := 'Production';
  END IF;

  -- Notify admins/owners
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
        dept || ' – Line ' || COALESCE(line_name, 'Unknown') || ': ' || left(trim(remarks_value), 120),
        'production_notes',
        jsonb_build_object(
          'line_id', NEW.line_id,
          'line_name', line_name,
          'department', dept,
          'remarks', remarks_value,
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
