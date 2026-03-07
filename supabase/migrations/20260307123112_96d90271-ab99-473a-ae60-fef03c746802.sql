
-- Production Notes table
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
  created_by UUID NOT NULL,
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

-- Production Note Comments table
CREATE TABLE IF NOT EXISTS public.production_note_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES public.production_notes(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_production_notes_factory_date ON public.production_notes(factory_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_production_notes_factory_status ON public.production_notes(factory_id, status);
CREATE INDEX IF NOT EXISTS idx_production_notes_factory_line ON public.production_notes(factory_id, line_id) WHERE line_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_production_notes_factory_wo ON public.production_notes(factory_id, work_order_id) WHERE work_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_production_note_comments_note ON public.production_note_comments(note_id, created_at);

-- RLS
ALTER TABLE public.production_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_note_comments ENABLE ROW LEVEL SECURITY;

-- Notes RLS policies using existing helper functions
CREATE POLICY "Admins can view factory production notes"
  ON public.production_notes FOR SELECT TO authenticated
  USING (is_admin_or_higher(auth.uid()) AND (factory_id = get_user_factory_id(auth.uid()) OR is_superadmin(auth.uid())));

CREATE POLICY "Admins can create production notes"
  ON public.production_notes FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_higher(auth.uid()) AND (factory_id = get_user_factory_id(auth.uid()) OR is_superadmin(auth.uid())));

CREATE POLICY "Admins can update production notes"
  ON public.production_notes FOR UPDATE TO authenticated
  USING (is_admin_or_higher(auth.uid()) AND (factory_id = get_user_factory_id(auth.uid()) OR is_superadmin(auth.uid())));

CREATE POLICY "Admins can delete production notes"
  ON public.production_notes FOR DELETE TO authenticated
  USING (is_admin_or_higher(auth.uid()) AND (factory_id = get_user_factory_id(auth.uid()) OR is_superadmin(auth.uid())));

-- Comments RLS policies
CREATE POLICY "Admins can view note comments"
  ON public.production_note_comments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.production_notes pn
    WHERE pn.id = production_note_comments.note_id
    AND is_admin_or_higher(auth.uid())
    AND (pn.factory_id = get_user_factory_id(auth.uid()) OR is_superadmin(auth.uid()))
  ));

CREATE POLICY "Admins can add note comments"
  ON public.production_note_comments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.production_notes pn
    WHERE pn.id = production_note_comments.note_id
    AND is_admin_or_higher(auth.uid())
    AND (pn.factory_id = get_user_factory_id(auth.uid()) OR is_superadmin(auth.uid()))
  ));

-- Updated_at trigger
CREATE TRIGGER production_notes_updated_at
  BEFORE UPDATE ON public.production_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Grant API access
GRANT ALL ON public.production_notes TO authenticated;
GRANT ALL ON public.production_note_comments TO authenticated;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
