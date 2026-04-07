-- Finance Portal: add exchange rate and feature flag to factory_accounts
-- bdt_to_usd_rate: used across all finance modules for currency conversion
-- finance_enabled: feature flag — set to true per factory when Finance Portal is ready to use

ALTER TABLE factory_accounts
  ADD COLUMN IF NOT EXISTS bdt_to_usd_rate NUMERIC DEFAULT 110,
  ADD COLUMN IF NOT EXISTS finance_enabled BOOLEAN DEFAULT false;

COMMENT ON COLUMN factory_accounts.bdt_to_usd_rate IS 'BDT to USD conversion rate used in Finance Portal calculations. Updated manually by admin.';
COMMENT ON COLUMN factory_accounts.finance_enabled IS 'Feature flag: enables the Finance Portal for this factory.';
