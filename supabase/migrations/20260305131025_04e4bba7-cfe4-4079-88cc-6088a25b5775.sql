
-- Custom dropdown lists
CREATE TABLE IF NOT EXISTS public.custom_dropdown_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES public.factory_accounts(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(factory_id, key)
);

CREATE TABLE IF NOT EXISTS public.custom_dropdown_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES public.custom_dropdown_lists(id) ON DELETE CASCADE,
  factory_id UUID NOT NULL REFERENCES public.factory_accounts(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  value TEXT,
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

-- Lists: read
CREATE POLICY "Users can view their factory dropdown lists"
ON public.custom_dropdown_lists FOR SELECT TO authenticated
USING (factory_id = public.get_user_factory_id(auth.uid()));

-- Lists: insert
CREATE POLICY "Admins can insert dropdown lists"
ON public.custom_dropdown_lists FOR INSERT TO authenticated
WITH CHECK (factory_id = public.get_user_factory_id(auth.uid()) AND public.is_admin_or_higher(auth.uid()));

-- Lists: update
CREATE POLICY "Admins can update dropdown lists"
ON public.custom_dropdown_lists FOR UPDATE TO authenticated
USING (factory_id = public.get_user_factory_id(auth.uid()) AND public.is_admin_or_higher(auth.uid()));

-- Lists: delete
CREATE POLICY "Admins can delete dropdown lists"
ON public.custom_dropdown_lists FOR DELETE TO authenticated
USING (factory_id = public.get_user_factory_id(auth.uid()) AND public.is_admin_or_higher(auth.uid()));

-- Options: read
CREATE POLICY "Users can view their factory dropdown options"
ON public.custom_dropdown_options FOR SELECT TO authenticated
USING (factory_id = public.get_user_factory_id(auth.uid()));

-- Options: insert
CREATE POLICY "Admins can insert dropdown options"
ON public.custom_dropdown_options FOR INSERT TO authenticated
WITH CHECK (factory_id = public.get_user_factory_id(auth.uid()) AND public.is_admin_or_higher(auth.uid()));

-- Options: update
CREATE POLICY "Admins can update dropdown options"
ON public.custom_dropdown_options FOR UPDATE TO authenticated
USING (factory_id = public.get_user_factory_id(auth.uid()) AND public.is_admin_or_higher(auth.uid()));

-- Options: delete
CREATE POLICY "Admins can delete dropdown options"
ON public.custom_dropdown_options FOR DELETE TO authenticated
USING (factory_id = public.get_user_factory_id(auth.uid()) AND public.is_admin_or_higher(auth.uid()));
