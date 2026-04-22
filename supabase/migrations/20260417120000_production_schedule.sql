-- Production Schedule table
-- Links work orders to lines with scheduled start/end dates for Gantt-style planning.

CREATE TABLE IF NOT EXISTS public.production_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES public.factory_accounts(id) ON DELETE CASCADE,
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  line_id UUID NOT NULL REFERENCES public.lines(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'delayed')),

  -- Planning fields
  target_qty INTEGER,              -- planned qty for this schedule block (may be partial if PO split across lines)
  daily_target INTEGER,            -- target pieces per day on this line
  priority INTEGER DEFAULT 0,      -- display order when multiple POs on same line (lower = higher priority)
  colour TEXT,                      -- optional custom colour for the block (hex code)

  -- Metadata
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_production_schedule_factory ON public.production_schedule(factory_id);
CREATE INDEX IF NOT EXISTS idx_production_schedule_line ON public.production_schedule(line_id);
CREATE INDEX IF NOT EXISTS idx_production_schedule_wo ON public.production_schedule(work_order_id);
CREATE INDEX IF NOT EXISTS idx_production_schedule_dates ON public.production_schedule(start_date, end_date);

-- RLS
ALTER TABLE public.production_schedule ENABLE ROW LEVEL SECURITY;

-- Users can view schedules in their factory
CREATE POLICY "Users can view schedules in their factory"
  ON public.production_schedule FOR SELECT TO authenticated
  USING (factory_id = (SELECT factory_id FROM profiles WHERE id = auth.uid()));

-- Admins can insert schedules
CREATE POLICY "Admins can insert schedules"
  ON public.production_schedule FOR INSERT TO authenticated
  WITH CHECK (
    factory_id = (SELECT factory_id FROM profiles WHERE id = auth.uid())
    AND is_admin_or_higher(auth.uid())
  );

-- Admins can update schedules
CREATE POLICY "Admins can update schedules"
  ON public.production_schedule FOR UPDATE TO authenticated
  USING (
    factory_id = (SELECT factory_id FROM profiles WHERE id = auth.uid())
    AND is_admin_or_higher(auth.uid())
  );

-- Admins can delete schedules
CREATE POLICY "Admins can delete schedules"
  ON public.production_schedule FOR DELETE TO authenticated
  USING (
    factory_id = (SELECT factory_id FROM profiles WHERE id = auth.uid())
    AND is_admin_or_higher(auth.uid())
  );

-- Auto-update updated_at
CREATE OR REPLACE TRIGGER update_production_schedule_updated_at
  BEFORE UPDATE ON public.production_schedule
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
