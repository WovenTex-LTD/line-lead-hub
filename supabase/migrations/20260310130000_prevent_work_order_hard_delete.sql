-- Prevent hard deletion of work orders to preserve production history.
-- Work orders should be soft-deleted by setting is_active = false and status = 'deleted'.

CREATE OR REPLACE FUNCTION prevent_work_order_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Work orders cannot be deleted. Set is_active = false and status = ''deleted'' instead.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_work_order_hard_delete
  BEFORE DELETE ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION prevent_work_order_delete();
