-- Atomic sequence increment for DSP-YYYYMMDD-NNN reference numbers.
-- Called from the client via supabase.rpc('increment_dispatch_sequence', {...})
-- Returns the new sequence number as an integer.

CREATE OR REPLACE FUNCTION increment_dispatch_sequence(
  p_factory_id UUID,
  p_date DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sequence INTEGER;
BEGIN
  INSERT INTO dispatch_daily_sequence (factory_id, date, last_sequence)
  VALUES (p_factory_id, p_date, 1)
  ON CONFLICT (factory_id, date)
  DO UPDATE SET last_sequence = dispatch_daily_sequence.last_sequence + 1
  RETURNING last_sequence INTO v_sequence;

  RETURN v_sequence;
END;
$$;
