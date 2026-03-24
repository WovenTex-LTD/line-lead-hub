-- Gate Dispatch Approval System
-- Run this in the Supabase SQL editor

-- ─────────────────────────────────────────────
-- 1. dispatch_requests
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dispatch_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factory_accounts(id) ON DELETE CASCADE,
  reference_number TEXT NOT NULL,             -- DSP-YYYYMMDD-NNN
  work_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  style_name TEXT,
  buyer_name TEXT,
  dispatch_quantity INTEGER NOT NULL CHECK (dispatch_quantity > 0),
  carton_count INTEGER,
  truck_number TEXT NOT NULL,
  driver_name TEXT NOT NULL,
  driver_nid TEXT,                            -- optional National ID
  destination TEXT NOT NULL,
  remarks TEXT,
  photo_url TEXT,                             -- Supabase Storage URL (optional)
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'cancelled')),
  submitted_by UUID NOT NULL REFERENCES profiles(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  gate_pass_pdf_url TEXT,                     -- immutable; set once on approval
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (factory_id, reference_number)
);

-- ─────────────────────────────────────────────
-- 2. dispatch_daily_sequence
--    Tracks per-factory, per-day sequence counter for DSP reference numbers
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dispatch_daily_sequence (
  factory_id UUID NOT NULL REFERENCES factory_accounts(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  last_sequence INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (factory_id, date)
);

-- ─────────────────────────────────────────────
-- 3. user_signatures
--    Stores admin approval signatures (one per user)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  factory_id UUID NOT NULL REFERENCES factory_accounts(id) ON DELETE CASCADE,
  signature_url TEXT NOT NULL,               -- Supabase Storage: signatures/{user_id}.png
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

-- ─────────────────────────────────────────────
-- 4. updated_at auto-trigger (reuse pattern from existing tables)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dispatch_requests_updated_at ON dispatch_requests;
CREATE TRIGGER dispatch_requests_updated_at
  BEFORE UPDATE ON dispatch_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS user_signatures_updated_at ON user_signatures;
CREATE TRIGGER user_signatures_updated_at
  BEFORE UPDATE ON user_signatures
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────
-- 5. Indexes
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_dispatch_requests_factory_id ON dispatch_requests(factory_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_requests_status ON dispatch_requests(status);
CREATE INDEX IF NOT EXISTS idx_dispatch_requests_submitted_by ON dispatch_requests(submitted_by);
CREATE INDEX IF NOT EXISTS idx_dispatch_requests_work_order_id ON dispatch_requests(work_order_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_requests_submitted_at ON dispatch_requests(submitted_at DESC);

-- ─────────────────────────────────────────────
-- 6. Row-Level Security
-- ─────────────────────────────────────────────
ALTER TABLE dispatch_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_daily_sequence ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_signatures ENABLE ROW LEVEL SECURITY;

-- dispatch_requests: users can only see requests within their own factory
DROP POLICY IF EXISTS "dispatch_requests_factory_isolation" ON dispatch_requests;
CREATE POLICY "dispatch_requests_factory_isolation"
  ON dispatch_requests FOR ALL
  USING (
    factory_id IN (
      SELECT factory_id FROM profiles WHERE id = auth.uid()
    )
  );

-- dispatch_daily_sequence: factory-scoped (only service role writes; users read)
DROP POLICY IF EXISTS "dispatch_daily_sequence_factory_read" ON dispatch_daily_sequence;
CREATE POLICY "dispatch_daily_sequence_factory_read"
  ON dispatch_daily_sequence FOR SELECT
  USING (
    factory_id IN (
      SELECT factory_id FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "dispatch_daily_sequence_factory_write" ON dispatch_daily_sequence;
CREATE POLICY "dispatch_daily_sequence_factory_write"
  ON dispatch_daily_sequence FOR ALL
  USING (
    factory_id IN (
      SELECT factory_id FROM profiles WHERE id = auth.uid()
    )
  );

-- user_signatures: users see signatures within their factory; can only write their own
DROP POLICY IF EXISTS "user_signatures_factory_read" ON user_signatures;
CREATE POLICY "user_signatures_factory_read"
  ON user_signatures FOR SELECT
  USING (
    factory_id IN (
      SELECT factory_id FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "user_signatures_own_write" ON user_signatures;
CREATE POLICY "user_signatures_own_write"
  ON user_signatures FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_signatures_own_update" ON user_signatures;
CREATE POLICY "user_signatures_own_update"
  ON user_signatures FOR UPDATE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_signatures_own_delete" ON user_signatures;
CREATE POLICY "user_signatures_own_delete"
  ON user_signatures FOR DELETE
  USING (user_id = auth.uid());

-- ─────────────────────────────────────────────
-- 7. Storage Buckets (run separately if buckets don't exist)
--    Create via Supabase Dashboard → Storage, or with the management API:
--
--    Bucket: "dispatch-photos"   (public: false, file size limit: 10MB)
--    Bucket: "gate-passes"       (public: false, file size limit: 20MB)
--    Bucket: "signatures"        (public: false, file size limit: 5MB)
-- ─────────────────────────────────────────────
