-- Custom dropdown lists: admin-created dropdown categories
-- Each list has a unique key per factory and stores options in custom_dropdown_options

CREATE TABLE IF NOT EXISTS public.custom_dropdown_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES public.factory_accounts(id) ON DELETE CASCADE,
  key TEXT NOT NULL,                    -- machine-readable key e.g. "defect_type"
  name TEXT NOT NULL,                   -- display name e.g. "Defect Type"
  description TEXT,                     -- optional description shown in admin UI
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(factory_id, key)
);

CREATE TABLE IF NOT EXISTS public.custom_dropdown_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES public.custom_dropdown_lists(id) ON DELETE CASCADE,
  factory_id UUID NOT NULL REFERENCES public.factory_accounts(id) ON DELETE CASCADE,
  label TEXT NOT NULL,                  -- display text
  value TEXT,                           -- optional code/value (defaults to label if null)
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_custom_dropdown_lists_factory ON public.custom_dropdown_lists(factory_id);
CREATE INDEX IF NOT EXISTS idx_custom_dropdown_options_list ON public.custom_dropdown_options(list_id);
CREATE INDEX IF NOT EXISTS idx_custom_dropdown_options_factory ON public.custom_dropdown_options(factory_id);

-- RLS
ALTER TABLE public.custom_dropdown_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_dropdown_options ENABLE ROW LEVEL SECURITY;

-- Lists: all authenticated users can read their factory's lists
CREATE POLICY "Users can view their factory dropdown lists"
  ON public.custom_dropdown_lists FOR SELECT
  TO authenticated
  USING (factory_id IN (
    SELECT factory_id FROM public.profiles WHERE id = auth.uid()
  ));

-- Lists: admin/owner can manage
CREATE POLICY "Admins can manage dropdown lists"
  ON public.custom_dropdown_lists FOR ALL
  TO authenticated
  USING (factory_id IN (
    SELECT factory_id FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'owner')
  ))
  WITH CHECK (factory_id IN (
    SELECT factory_id FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'owner')
  ));

-- Options: all authenticated users can read their factory's options
CREATE POLICY "Users can view their factory dropdown options"
  ON public.custom_dropdown_options FOR SELECT
  TO authenticated
  USING (factory_id IN (
    SELECT factory_id FROM public.profiles WHERE id = auth.uid()
  ));

-- Options: admin/owner can manage
CREATE POLICY "Admins can manage dropdown options"
  ON public.custom_dropdown_options FOR ALL
  TO authenticated
  USING (factory_id IN (
    SELECT factory_id FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'owner')
  ))
  WITH CHECK (factory_id IN (
    SELECT factory_id FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'owner')
  ));
