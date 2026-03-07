-- Production Notes: admin-only structured notes for production context
-- Supports anchoring to lines, departments, and/or work orders

CREATE TABLE IF NOT EXISTS public.production_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES public.factory_accounts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  line_id UUID NULL REFERENCES public.lines(id) ON DELETE SET NULL,
  department TEXT NULL,
  work_order_id UUID NULL REFERENCES public.work_orders(id) ON DELETE SET NULL,
  tag TEXT NOT NULL DEFAULT 'other',
  impact TEXT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  resolution_summary TEXT NULL,
  action_taken TEXT NULL,
  resolved_at TIMESTAMPTZ NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT production_notes_anchor_check
    CHECK (line_id IS NOT NULL OR work_order_id IS NOT NULL OR department IS NOT NULL),
  CONSTRAINT production_notes_tag_check
    CHECK (tag IN ('output', 'delay', 'quality', 'material', 'machine', 'staffing', 'buyer_change', 'other')),
  CONSTRAINT production_notes_impact_check
    CHECK (impact IS NULL OR impact IN ('low', 'medium', 'high')),
  CONSTRAINT production_notes_status_check
    CHECK (status IN ('open', 'monitoring', 'resolved')),
  CONSTRAINT production_notes_department_check
    CHECK (department IS NULL OR department IN ('cutting', 'sewing', 'finishing', 'qc', 'storage'))
);

CREATE TABLE IF NOT EXISTS public.production_note_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES public.production_notes(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_production_notes_factory_date ON public.production_notes(factory_id, created_at DESC);
CREATE INDEX idx_production_notes_factory_status ON public.production_notes(factory_id, status);
CREATE INDEX idx_production_notes_factory_line ON public.production_notes(factory_id, line_id) WHERE line_id IS NOT NULL;
CREATE INDEX idx_production_notes_factory_wo ON public.production_notes(factory_id, work_order_id) WHERE work_order_id IS NOT NULL;
CREATE INDEX idx_production_note_comments_note ON public.production_note_comments(note_id, created_at);

-- RLS
ALTER TABLE public.production_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_note_comments ENABLE ROW LEVEL SECURITY;

-- Notes: admin-or-higher can read
CREATE POLICY "Admins can view factory production notes"
  ON public.production_notes FOR SELECT
  TO authenticated
  USING (
    factory_id IN (
      SELECT p.factory_id FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id
      WHERE p.id = auth.uid() AND ur.role IN ('admin', 'owner', 'superadmin')
    )
  );

-- Notes: admin-or-higher can insert
CREATE POLICY "Admins can create production notes"
  ON public.production_notes FOR INSERT
  TO authenticated
  WITH CHECK (
    factory_id IN (
      SELECT p.factory_id FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id
      WHERE p.id = auth.uid() AND ur.role IN ('admin', 'owner', 'superadmin')
    )
  );

-- Notes: admin-or-higher can update
CREATE POLICY "Admins can update production notes"
  ON public.production_notes FOR UPDATE
  TO authenticated
  USING (
    factory_id IN (
      SELECT p.factory_id FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id
      WHERE p.id = auth.uid() AND ur.role IN ('admin', 'owner', 'superadmin')
    )
  );

-- Notes: admin-or-higher can delete
CREATE POLICY "Admins can delete production notes"
  ON public.production_notes FOR DELETE
  TO authenticated
  USING (
    factory_id IN (
      SELECT p.factory_id FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id
      WHERE p.id = auth.uid() AND ur.role IN ('admin', 'owner', 'superadmin')
    )
  );

-- Comments: admin-or-higher can read
CREATE POLICY "Admins can view note comments"
  ON public.production_note_comments FOR SELECT
  TO authenticated
  USING (
    note_id IN (
      SELECT pn.id FROM public.production_notes pn
      JOIN public.profiles p ON p.factory_id = pn.factory_id
      JOIN public.user_roles ur ON ur.user_id = p.id
      WHERE p.id = auth.uid() AND ur.role IN ('admin', 'owner', 'superadmin')
    )
  );

-- Comments: admin-or-higher can insert
CREATE POLICY "Admins can add note comments"
  ON public.production_note_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    note_id IN (
      SELECT pn.id FROM public.production_notes pn
      JOIN public.profiles p ON p.factory_id = pn.factory_id
      JOIN public.user_roles ur ON ur.user_id = p.id
      WHERE p.id = auth.uid() AND ur.role IN ('admin', 'owner', 'superadmin')
    )
  );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_production_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER production_notes_updated_at
  BEFORE UPDATE ON public.production_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_production_notes_updated_at();
