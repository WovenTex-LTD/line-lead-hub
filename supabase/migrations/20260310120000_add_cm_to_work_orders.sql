-- Add C&M (Cost & Make) per dozen field to work_orders
ALTER TABLE work_orders
  ADD COLUMN cm_per_dozen numeric DEFAULT NULL;

COMMENT ON COLUMN work_orders.cm_per_dozen IS 'Cost & Make price per dozen pieces';
