-- A PO number can hold multiple orders, as long as they differ by order number
-- or style. Replace the strict (factory_id, po_number) unique key with one that
-- also includes order_number + style, so only a true exact duplicate is blocked.
--   * NULLS NOT DISTINCT  → two all-null (order_number/style) rows still count as
--     duplicates of each other (otherwise NULLs would slip past the check).
--   * partial WHERE active → soft-deleted/archived orders never block a new one.

ALTER TABLE public.work_orders
  DROP CONSTRAINT IF EXISTS work_orders_factory_id_po_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS work_orders_factory_po_order_style_key
  ON public.work_orders (factory_id, po_number, order_number, style)
  NULLS NOT DISTINCT
  WHERE coalesce(is_active, true);
