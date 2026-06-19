-- Reminders: user-set follow-ups created by Lina ("remind me tomorrow to ...").
-- Stored here, then delivered as a normal notification by a 5-minute pg_cron job
-- once due_at passes. Reminders always target the user who created them.

CREATE TABLE IF NOT EXISTS public.reminders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id   UUID NOT NULL REFERENCES public.factory_accounts(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL DEFAULT 'Reminder',
  message      TEXT,
  due_at       TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reminders_due ON public.reminders (due_at) WHERE delivered_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_reminders_user ON public.reminders (user_id, due_at);

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reminders_select_own" ON public.reminders;
CREATE POLICY "reminders_select_own" ON public.reminders FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "reminders_insert_own" ON public.reminders;
CREATE POLICY "reminders_insert_own" ON public.reminders FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND factory_id = public.get_user_factory_id(auth.uid()));

DROP POLICY IF EXISTS "reminders_update_own" ON public.reminders;
CREATE POLICY "reminders_update_own" ON public.reminders FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR created_by = auth.uid());

DROP POLICY IF EXISTS "reminders_delete_own" ON public.reminders;
CREATE POLICY "reminders_delete_own" ON public.reminders FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR created_by = auth.uid());

-- Create a reminder for the calling user. Interprets the wall-clock due date/time
-- in the factory's timezone and stores it as an absolute instant.
CREATE OR REPLACE FUNCTION public.create_reminder(
  p_title text, p_message text, p_due_date date, p_due_time time
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_factory uuid;
  v_tz text;
  v_due timestamptz;
  v_id uuid;
BEGIN
  SELECT factory_id INTO v_factory FROM public.profiles WHERE id = auth.uid();
  IF v_factory IS NULL THEN RAISE EXCEPTION 'Your account is not linked to a factory.'; END IF;
  SELECT COALESCE(timezone, 'Asia/Dhaka') INTO v_tz FROM public.factory_accounts WHERE id = v_factory;
  v_due := (p_due_date + COALESCE(p_due_time, '09:00'::time)) AT TIME ZONE v_tz;
  INSERT INTO public.reminders (factory_id, user_id, created_by, title, message, due_at)
  VALUES (v_factory, auth.uid(), auth.uid(), COALESCE(NULLIF(p_title, ''), 'Reminder'), p_message, v_due)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_reminder(text, text, date, time) TO authenticated;

-- Deliver due reminders as notifications, then mark them delivered. Runs on cron.
CREATE OR REPLACE FUNCTION public.process_reminders()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT id, factory_id, user_id, title, message
    FROM public.reminders
    WHERE due_at <= now() AND delivered_at IS NULL
    ORDER BY due_at
    LIMIT 500
  LOOP
    INSERT INTO public.notifications (factory_id, user_id, type, title, message, data, is_read)
    VALUES (r.factory_id, r.user_id, 'reminder', COALESCE(r.title, 'Reminder'), r.message,
            jsonb_build_object('reminder_id', r.id), false);
    UPDATE public.reminders SET delivered_at = now() WHERE id = r.id;
  END LOOP;
END;
$$;

-- pg_cron is already installed by the notifications migration. Fire every 5 min.
SELECT cron.schedule('process-reminders', '*/5 * * * *', $$SELECT public.process_reminders()$$);
