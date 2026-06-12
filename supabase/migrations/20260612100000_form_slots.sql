-- Form slots: each default production form is a "slot"; Lina-created forms can be
-- variants of a slot (slot_key) and one version per slot can be made the active one
-- workers see. No row in form_slot_overrides (or a NULL active_template_id) means the
-- DEFAULT production form is active — so existing behaviour is unchanged until an
-- admin explicitly activates a variant.
-- Safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS): applied via the dashboard
-- (the repo has migration-tracking drift).

-- Which default slot a custom form is a variant of (NULL = standalone form).
ALTER TABLE public.custom_form_templates ADD COLUMN IF NOT EXISTS slot_key TEXT;
CREATE INDEX IF NOT EXISTS idx_custom_form_templates_slot
  ON public.custom_form_templates(factory_id, slot_key) WHERE slot_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.form_slot_overrides (
  factory_id         UUID NOT NULL REFERENCES public.factory_accounts(id) ON DELETE CASCADE,
  slot_key           TEXT NOT NULL,
  active_template_id UUID REFERENCES public.custom_form_templates(id) ON DELETE CASCADE,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (factory_id, slot_key)
);

DROP TRIGGER IF EXISTS trg_form_slot_overrides_updated ON public.form_slot_overrides;
CREATE TRIGGER trg_form_slot_overrides_updated BEFORE UPDATE ON public.form_slot_overrides
  FOR EACH ROW EXECUTE FUNCTION public.custom_forms_set_updated_at();

ALTER TABLE public.form_slot_overrides ENABLE ROW LEVEL SECURITY;

-- Any factory member reads (workers need it to know which version is active);
-- admin/owner (or superadmin) manage.
DROP POLICY IF EXISTS "form_slot_overrides_select" ON public.form_slot_overrides;
CREATE POLICY "form_slot_overrides_select" ON public.form_slot_overrides
  FOR SELECT TO authenticated
  USING (factory_id = public.get_user_factory_id(auth.uid()) OR public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "form_slot_overrides_insert" ON public.form_slot_overrides;
CREATE POLICY "form_slot_overrides_insert" ON public.form_slot_overrides
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_higher(auth.uid())
             AND (factory_id = public.get_user_factory_id(auth.uid()) OR public.is_superadmin(auth.uid())));

DROP POLICY IF EXISTS "form_slot_overrides_update" ON public.form_slot_overrides;
CREATE POLICY "form_slot_overrides_update" ON public.form_slot_overrides
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_higher(auth.uid())
         AND (factory_id = public.get_user_factory_id(auth.uid()) OR public.is_superadmin(auth.uid())))
  WITH CHECK (public.is_admin_or_higher(auth.uid())
             AND (factory_id = public.get_user_factory_id(auth.uid()) OR public.is_superadmin(auth.uid())));

DROP POLICY IF EXISTS "form_slot_overrides_delete" ON public.form_slot_overrides;
CREATE POLICY "form_slot_overrides_delete" ON public.form_slot_overrides
  FOR DELETE TO authenticated
  USING (public.is_admin_or_higher(auth.uid())
         AND (factory_id = public.get_user_factory_id(auth.uid()) OR public.is_superadmin(auth.uid())));
