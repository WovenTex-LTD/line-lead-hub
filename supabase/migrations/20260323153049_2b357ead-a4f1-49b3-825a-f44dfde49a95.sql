
CREATE OR REPLACE FUNCTION public.validate_dispatch_quantity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.dispatch_quantity <= 0 THEN
    RAISE EXCEPTION 'dispatch_quantity must be greater than 0';
  END IF;
  IF NEW.status NOT IN ('draft', 'pending', 'approved', 'rejected', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid status value: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;
