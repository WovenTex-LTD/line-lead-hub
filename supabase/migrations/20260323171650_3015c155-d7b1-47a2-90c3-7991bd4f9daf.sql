
-- 1. Tables
CREATE TABLE IF NOT EXISTS dispatch_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factory_accounts(id) ON DELETE CASCADE,
  reference_number TEXT NOT NULL,
  work_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  style_name TEXT, buyer_name TEXT,
  dispatch_quantity INTEGER NOT NULL CHECK (dispatch_quantity > 0),
  carton_count INTEGER, truck_number TEXT NOT NULL, driver_name TEXT NOT NULL,
  driver_nid TEXT, destination TEXT NOT NULL, remarks TEXT, photo_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('draft','pending','approved','rejected','cancelled')),
  submitted_by UUID NOT NULL REFERENCES profiles(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ, rejection_reason TEXT, gate_pass_pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (factory_id, reference_number)
);

CREATE TABLE IF NOT EXISTS dispatch_daily_sequence (
  factory_id UUID NOT NULL REFERENCES factory_accounts(id) ON DELETE CASCADE,
  date DATE NOT NULL, last_sequence INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (factory_id, date)
);

CREATE TABLE IF NOT EXISTS user_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  factory_id UUID NOT NULL REFERENCES factory_accounts(id) ON DELETE CASCADE,
  signature_url TEXT NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

-- 2. Sequence function
CREATE OR REPLACE FUNCTION increment_dispatch_sequence(p_factory_id UUID, p_date DATE)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_sequence INTEGER;
BEGIN
  INSERT INTO dispatch_daily_sequence (factory_id, date, last_sequence)
  VALUES (p_factory_id, p_date, 1)
  ON CONFLICT (factory_id, date)
  DO UPDATE SET last_sequence = dispatch_daily_sequence.last_sequence + 1
  RETURNING last_sequence INTO v_sequence;
  RETURN v_sequence;
END; $$;

-- 3. RLS
ALTER TABLE dispatch_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_daily_sequence ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dispatch_requests_factory_isolation" ON dispatch_requests;
CREATE POLICY "dispatch_requests_factory_isolation" ON dispatch_requests FOR ALL
  USING (factory_id IN (SELECT factory_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "dispatch_daily_sequence_factory_rw" ON dispatch_daily_sequence;
CREATE POLICY "dispatch_daily_sequence_factory_rw" ON dispatch_daily_sequence FOR ALL
  USING (factory_id IN (SELECT factory_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "user_signatures_factory_read" ON user_signatures;
CREATE POLICY "user_signatures_factory_read" ON user_signatures FOR SELECT
  USING (factory_id IN (SELECT factory_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "user_signatures_own_write" ON user_signatures;
CREATE POLICY "user_signatures_own_write" ON user_signatures FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_signatures_own_update" ON user_signatures;
CREATE POLICY "user_signatures_own_update" ON user_signatures FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_signatures_own_delete" ON user_signatures;
CREATE POLICY "user_signatures_own_delete" ON user_signatures FOR DELETE USING (user_id = auth.uid());

-- 4. Storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('signatures', 'signatures', true, 5242880),
  ('dispatch-photos', 'dispatch-photos', false, 10485760),
  ('gate-passes', 'gate-passes', false, 20971520)
ON CONFLICT (id) DO NOTHING;

-- 5. Storage RLS
DROP POLICY IF EXISTS "signatures_factory_read" ON storage.objects;
CREATE POLICY "signatures_factory_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'signatures');

DROP POLICY IF EXISTS "signatures_own_upload" ON storage.objects;
CREATE POLICY "signatures_own_upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'signatures' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "dispatch_photos_factory" ON storage.objects;
CREATE POLICY "dispatch_photos_factory" ON storage.objects FOR ALL
  USING (bucket_id = 'dispatch-photos');

DROP POLICY IF EXISTS "gate_passes_factory" ON storage.objects;
CREATE POLICY "gate_passes_factory" ON storage.objects FOR ALL
  USING (bucket_id = 'gate-passes');

-- 6. app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gate_officer';
