
-- 1. dispatch_requests
CREATE TABLE IF NOT EXISTS public.dispatch_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES public.factory_accounts(id) ON DELETE CASCADE,
  reference_number TEXT NOT NULL,
  work_order_id UUID REFERENCES public.work_orders(id) ON DELETE SET NULL,
  style_name TEXT,
  buyer_name TEXT,
  dispatch_quantity INTEGER NOT NULL DEFAULT 1,
  carton_count INTEGER,
  truck_number TEXT NOT NULL,
  driver_name TEXT NOT NULL,
  driver_nid TEXT,
  destination TEXT NOT NULL,
  remarks TEXT,
  photo_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_by UUID NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  gate_pass_pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (factory_id, reference_number)
);

-- Validation trigger for dispatch_quantity > 0
CREATE OR REPLACE FUNCTION public.validate_dispatch_quantity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.dispatch_quantity <= 0 THEN
    RAISE EXCEPTION 'dispatch_quantity must be greater than 0';
  END IF;
  IF NEW.status NOT IN ('draft', 'pending', 'approved', 'rejected', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid status value: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_dispatch_requests
  BEFORE INSERT OR UPDATE ON public.dispatch_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_dispatch_quantity();

-- 2. dispatch_daily_sequence
CREATE TABLE IF NOT EXISTS public.dispatch_daily_sequence (
  factory_id UUID NOT NULL REFERENCES public.factory_accounts(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  last_sequence INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (factory_id, date)
);

-- 3. user_signatures
CREATE TABLE IF NOT EXISTS public.user_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  factory_id UUID NOT NULL REFERENCES public.factory_accounts(id) ON DELETE CASCADE,
  signature_url TEXT NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

-- 4. updated_at triggers
CREATE TRIGGER dispatch_requests_updated_at
  BEFORE UPDATE ON public.dispatch_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER user_signatures_updated_at
  BEFORE UPDATE ON public.user_signatures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_dispatch_requests_factory_id ON public.dispatch_requests(factory_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_requests_status ON public.dispatch_requests(status);
CREATE INDEX IF NOT EXISTS idx_dispatch_requests_submitted_by ON public.dispatch_requests(submitted_by);
CREATE INDEX IF NOT EXISTS idx_dispatch_requests_work_order_id ON public.dispatch_requests(work_order_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_requests_submitted_at ON public.dispatch_requests(submitted_at DESC);

-- 6. Row-Level Security
ALTER TABLE public.dispatch_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_daily_sequence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_signatures ENABLE ROW LEVEL SECURITY;

-- RLS using existing helper functions
CREATE POLICY "dispatch_requests_factory_isolation"
  ON public.dispatch_requests FOR ALL
  TO authenticated
  USING (factory_id = public.get_user_factory_id(auth.uid()));

CREATE POLICY "dispatch_daily_sequence_factory_access"
  ON public.dispatch_daily_sequence FOR ALL
  TO authenticated
  USING (factory_id = public.get_user_factory_id(auth.uid()));

CREATE POLICY "user_signatures_factory_read"
  ON public.user_signatures FOR SELECT
  TO authenticated
  USING (factory_id = public.get_user_factory_id(auth.uid()));

CREATE POLICY "user_signatures_own_write"
  ON public.user_signatures FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_signatures_own_update"
  ON public.user_signatures FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "user_signatures_own_delete"
  ON public.user_signatures FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
