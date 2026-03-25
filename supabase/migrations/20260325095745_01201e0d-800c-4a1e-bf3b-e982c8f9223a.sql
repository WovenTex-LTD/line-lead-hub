CREATE TABLE factory_bank_accounts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id      UUID        NOT NULL REFERENCES factory_accounts(id) ON DELETE CASCADE,
  account_label   TEXT        NOT NULL DEFAULT 'Primary Account',
  bank_name       TEXT,
  bank_address    TEXT,
  account_name    TEXT,
  account_number  TEXT,
  iban            TEXT,
  routing_number  TEXT,
  swift_bic       TEXT,
  branch          TEXT,
  currency        TEXT        DEFAULT 'USD',
  is_default      BOOLEAN     NOT NULL DEFAULT false,
  sort_order      INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE factory_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Factory members can view bank accounts"
  ON factory_bank_accounts FOR SELECT
  USING (factory_id = get_user_factory_id(auth.uid()));

CREATE POLICY "Admins can manage bank accounts"
  ON factory_bank_accounts FOR ALL
  USING (factory_id = get_user_factory_id(auth.uid()) AND is_admin_or_higher(auth.uid()))
  WITH CHECK (factory_id = get_user_factory_id(auth.uid()) AND is_admin_or_higher(auth.uid()));

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS selected_bank_account_id UUID REFERENCES factory_bank_accounts(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';