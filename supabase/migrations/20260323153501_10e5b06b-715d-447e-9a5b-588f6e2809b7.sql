
CREATE OR REPLACE FUNCTION public.increment_dispatch_sequence(
  p_factory_id UUID,
  p_date DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sequence INTEGER;
BEGIN
  INSERT INTO public.dispatch_daily_sequence (factory_id, date, last_sequence)
  VALUES (p_factory_id, p_date, 1)
  ON CONFLICT (factory_id, date)
  DO UPDATE SET last_sequence = dispatch_daily_sequence.last_sequence + 1
  RETURNING last_sequence INTO v_sequence;

  RETURN v_sequence;
END;
$$;
