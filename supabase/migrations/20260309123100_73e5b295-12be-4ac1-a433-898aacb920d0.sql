-- Add headcount cost fields to factory_accounts
ALTER TABLE factory_accounts
  ADD COLUMN IF NOT EXISTS headcount_cost_value NUMERIC,
  ADD COLUMN IF NOT EXISTS headcount_cost_currency TEXT DEFAULT 'BDT';

-- Add estimated cost fields to sewing_actuals
ALTER TABLE sewing_actuals
  ADD COLUMN IF NOT EXISTS estimated_cost_value NUMERIC,
  ADD COLUMN IF NOT EXISTS estimated_cost_currency TEXT;

-- Add estimated cost fields to finishing_actuals
ALTER TABLE finishing_actuals
  ADD COLUMN IF NOT EXISTS estimated_cost_value NUMERIC,
  ADD COLUMN IF NOT EXISTS estimated_cost_currency TEXT;

-- Add estimated cost fields to cutting_actuals
ALTER TABLE cutting_actuals
  ADD COLUMN IF NOT EXISTS estimated_cost_value NUMERIC,
  ADD COLUMN IF NOT EXISTS estimated_cost_currency TEXT;

-- Add estimated cost fields to production_updates_sewing
ALTER TABLE production_updates_sewing
  ADD COLUMN IF NOT EXISTS estimated_cost_value NUMERIC,
  ADD COLUMN IF NOT EXISTS estimated_cost_currency TEXT;

-- Add estimated cost fields to production_updates_finishing
ALTER TABLE production_updates_finishing
  ADD COLUMN IF NOT EXISTS estimated_cost_value NUMERIC,
  ADD COLUMN IF NOT EXISTS estimated_cost_currency TEXT;