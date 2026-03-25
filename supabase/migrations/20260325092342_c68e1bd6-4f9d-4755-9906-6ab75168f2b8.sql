
-- Drop existing table and policies to recreate with new schema
DROP POLICY IF EXISTS "Factory members can view finance settings" ON factory_finance_settings;
DROP POLICY IF EXISTS "Admins can manage finance settings" ON factory_finance_settings;
DROP TABLE IF EXISTS factory_finance_settings CASCADE;

CREATE TABLE factory_finance_settings (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id        UUID        NOT NULL UNIQUE REFERENCES factory_accounts(id) ON DELETE CASCADE,
  invoice_prefix    TEXT        NOT NULL DEFAULT 'INV',
  seller_name       TEXT,
  seller_address    TEXT,
  seller_city       TEXT,
  seller_country    TEXT        DEFAULT 'Bangladesh',
  seller_phone      TEXT,
  seller_email      TEXT,
  tin_number        TEXT,
  bin_number        TEXT,
  bank_name         TEXT,
  bank_account_name TEXT,
  bank_account_no   TEXT,
  bank_routing_no   TEXT,
  bank_swift        TEXT,
  bank_branch       TEXT,
  stamp_url         TEXT,
  signature_url     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE factory_finance_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Factory members can view finance settings"
  ON factory_finance_settings FOR SELECT
  USING (factory_id = get_user_factory_id(auth.uid()));

CREATE POLICY "Admins can manage finance settings"
  ON factory_finance_settings FOR ALL
  USING (factory_id = get_user_factory_id(auth.uid()) AND is_admin_or_higher(auth.uid()))
  WITH CHECK (factory_id = get_user_factory_id(auth.uid()) AND is_admin_or_higher(auth.uid()));

-- Recreate updated_at trigger
CREATE OR REPLACE FUNCTION update_factory_finance_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS factory_finance_settings_updated_at ON factory_finance_settings;
CREATE TRIGGER factory_finance_settings_updated_at
  BEFORE UPDATE ON factory_finance_settings
  FOR EACH ROW EXECUTE FUNCTION update_factory_finance_settings_updated_at();

NOTIFY pgrst, 'reload schema';
