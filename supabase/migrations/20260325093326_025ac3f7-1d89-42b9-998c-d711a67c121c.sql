
-- Drop and recreate invoice_charges with correct schema
DROP POLICY IF EXISTS "Factory members can view charges" ON invoice_charges;
DROP POLICY IF EXISTS "Admins can manage charges" ON invoice_charges;
DROP POLICY IF EXISTS "Admins can manage invoice charges" ON invoice_charges;
DROP POLICY IF EXISTS "Factory members can view invoice charges" ON invoice_charges;
DROP TABLE IF EXISTS invoice_charges CASCADE;

CREATE TABLE invoice_charges (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  label       TEXT        NOT NULL,
  amount      NUMERIC     NOT NULL DEFAULT 0,
  is_deduct   BOOLEAN     NOT NULL DEFAULT false,
  sort_order  INTEGER     NOT NULL DEFAULT 0
);

ALTER TABLE invoice_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Factory members can view charges"
  ON invoice_charges FOR SELECT
  USING (invoice_id IN (SELECT id FROM invoices WHERE factory_id = get_user_factory_id(auth.uid())));

CREATE POLICY "Admins can manage charges"
  ON invoice_charges FOR ALL
  USING (invoice_id IN (SELECT id FROM invoices WHERE factory_id = get_user_factory_id(auth.uid())))
  WITH CHECK (invoice_id IN (SELECT id FROM invoices WHERE factory_id = get_user_factory_id(auth.uid())));

-- Drop and recreate invoice_tax_lines with correct schema
DROP POLICY IF EXISTS "Factory members can view tax lines" ON invoice_tax_lines;
DROP POLICY IF EXISTS "Admins can manage tax lines" ON invoice_tax_lines;
DROP POLICY IF EXISTS "Admins can manage invoice tax lines" ON invoice_tax_lines;
DROP POLICY IF EXISTS "Factory members can view invoice tax lines" ON invoice_tax_lines;
DROP TABLE IF EXISTS invoice_tax_lines CASCADE;

CREATE TABLE invoice_tax_lines (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  label       TEXT        NOT NULL,
  rate_pct    NUMERIC     NOT NULL DEFAULT 0,
  amount      NUMERIC     NOT NULL DEFAULT 0,
  sort_order  INTEGER     NOT NULL DEFAULT 0
);

ALTER TABLE invoice_tax_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Factory members can view tax lines"
  ON invoice_tax_lines FOR SELECT
  USING (invoice_id IN (SELECT id FROM invoices WHERE factory_id = get_user_factory_id(auth.uid())));

CREATE POLICY "Admins can manage tax lines"
  ON invoice_tax_lines FOR ALL
  USING (invoice_id IN (SELECT id FROM invoices WHERE factory_id = get_user_factory_id(auth.uid())));

-- New columns on invoices
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS invoice_type        TEXT NOT NULL DEFAULT 'commercial',
  ADD COLUMN IF NOT EXISTS buyer_address       TEXT,
  ADD COLUMN IF NOT EXISTS buyer_contact       TEXT,
  ADD COLUMN IF NOT EXISTS payment_terms       TEXT,
  ADD COLUMN IF NOT EXISTS lc_number           TEXT,
  ADD COLUMN IF NOT EXISTS lc_date             DATE,
  ADD COLUMN IF NOT EXISTS contract_number     TEXT,
  ADD COLUMN IF NOT EXISTS port_of_loading     TEXT,
  ADD COLUMN IF NOT EXISTS port_of_discharge   TEXT,
  ADD COLUMN IF NOT EXISTS country_of_origin   TEXT DEFAULT 'Bangladesh',
  ADD COLUMN IF NOT EXISTS country_of_dest     TEXT,
  ADD COLUMN IF NOT EXISTS vessel_name         TEXT,
  ADD COLUMN IF NOT EXISTS bl_number           TEXT,
  ADD COLUMN IF NOT EXISTS bl_date             DATE,
  ADD COLUMN IF NOT EXISTS incoterms           TEXT,
  ADD COLUMN IF NOT EXISTS packing_type        TEXT,
  ADD COLUMN IF NOT EXISTS total_cartons       INTEGER,
  ADD COLUMN IF NOT EXISTS total_gross_weight  NUMERIC,
  ADD COLUMN IF NOT EXISTS total_net_weight    NUMERIC,
  ADD COLUMN IF NOT EXISTS total_cbm           NUMERIC,
  ADD COLUMN IF NOT EXISTS discount_pct        NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bank_details        JSONB,
  ADD COLUMN IF NOT EXISTS show_bank_details   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS remarks             TEXT,
  ADD COLUMN IF NOT EXISTS internal_notes      TEXT;

-- New columns on invoice_line_items
ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS style_name   TEXT,
  ADD COLUMN IF NOT EXISTS hs_code      TEXT,
  ADD COLUMN IF NOT EXISTS unit         TEXT DEFAULT 'PCS',
  ADD COLUMN IF NOT EXISTS color        TEXT,
  ADD COLUMN IF NOT EXISTS size_range   TEXT,
  ADD COLUMN IF NOT EXISTS discount_pct NUMERIC NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
