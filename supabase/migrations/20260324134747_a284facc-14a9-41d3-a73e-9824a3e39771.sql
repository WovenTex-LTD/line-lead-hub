-- Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id        UUID        NOT NULL REFERENCES factory_accounts(id) ON DELETE CASCADE,
  invoice_number    TEXT        NOT NULL,
  work_order_id     UUID        REFERENCES work_orders(id) ON DELETE SET NULL,
  buyer_name        TEXT        NOT NULL,
  issue_date        DATE        NOT NULL DEFAULT CURRENT_DATE,
  due_date          DATE,
  currency          TEXT        NOT NULL DEFAULT 'USD',
  exchange_rate     NUMERIC     NOT NULL DEFAULT 110,
  status            TEXT        NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft','sent','paid','overdue')),
  notes             TEXT,
  created_by        UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (factory_id, invoice_number)
);

-- Create invoice line items table
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description   TEXT        NOT NULL,
  style_number  TEXT,
  quantity      INTEGER     NOT NULL DEFAULT 0,
  unit_price    NUMERIC     NOT NULL DEFAULT 0,
  sort_order    INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS invoices_factory_id_idx ON invoices(factory_id);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices(factory_id, status);
CREATE INDEX IF NOT EXISTS invoice_line_items_invoice_id_idx ON invoice_line_items(invoice_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_invoices_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS invoices_updated_at ON invoices;
CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_invoices_updated_at();

-- RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Factory members can view invoices" ON invoices;
CREATE POLICY "Factory members can view invoices"
  ON invoices FOR SELECT
  USING (factory_id = get_user_factory_id(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert invoices" ON invoices;
CREATE POLICY "Admins can insert invoices"
  ON invoices FOR INSERT
  WITH CHECK (factory_id = get_user_factory_id(auth.uid()) AND is_admin_or_higher(auth.uid()));

DROP POLICY IF EXISTS "Admins can update invoices" ON invoices;
CREATE POLICY "Admins can update invoices"
  ON invoices FOR UPDATE
  USING (factory_id = get_user_factory_id(auth.uid()) AND is_admin_or_higher(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete invoices" ON invoices;
CREATE POLICY "Admins can delete invoices"
  ON invoices FOR DELETE
  USING (factory_id = get_user_factory_id(auth.uid()) AND is_admin_or_higher(auth.uid()));

DROP POLICY IF EXISTS "Factory members can view line items" ON invoice_line_items;
CREATE POLICY "Factory members can view line items"
  ON invoice_line_items FOR SELECT
  USING (invoice_id IN (
    SELECT id FROM invoices WHERE factory_id = get_user_factory_id(auth.uid())
  ));

DROP POLICY IF EXISTS "Admins can manage line items" ON invoice_line_items;
CREATE POLICY "Admins can manage line items"
  ON invoice_line_items FOR ALL
  USING (invoice_id IN (
    SELECT id FROM invoices WHERE factory_id = get_user_factory_id(auth.uid())
  ))
  WITH CHECK (invoice_id IN (
    SELECT id FROM invoices WHERE factory_id = get_user_factory_id(auth.uid())
  ));

NOTIFY pgrst, 'reload schema';