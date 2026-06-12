-- Standalone custom forms (separate from production forms + QC).
-- Lina (or, later, a builder UI) defines templates; users fill them; submissions are stored.
-- Written to be safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS) since it is applied
-- directly via the dashboard (the repo has migration-tracking drift).

CREATE TABLE IF NOT EXISTS public.custom_form_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id  UUID NOT NULL REFERENCES public.factory_accounts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  version     INT  NOT NULL DEFAULT 1,
  target_role TEXT,            -- the single role/department this form belongs to (cutting, sewing, ...)
  allowed_fill_roles TEXT[] NOT NULL DEFAULT '{}',  -- reserved; catalogue visibility is driven by target_role
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_custom_form_templates_factory ON public.custom_form_templates(factory_id, status);

CREATE TABLE IF NOT EXISTS public.custom_form_fields (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID NOT NULL REFERENCES public.custom_form_templates(id) ON DELETE CASCADE,
  section_label TEXT,
  section_order INT  NOT NULL DEFAULT 0,
  key           TEXT NOT NULL,
  label         TEXT NOT NULL,
  field_type    TEXT NOT NULL CHECK (field_type IN ('text','number','date','dropdown','textarea','checkbox')),
  is_required   BOOLEAN NOT NULL DEFAULT false,
  options       JSONB,            -- dropdown: [{ "value": "...", "label": "..." }]
  placeholder   TEXT,
  help_text     TEXT,
  sort_order    INT  NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, key)
);
CREATE INDEX IF NOT EXISTS idx_custom_form_fields_template ON public.custom_form_fields(template_id, section_order, sort_order);

CREATE TABLE IF NOT EXISTS public.custom_form_submissions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id      UUID NOT NULL REFERENCES public.custom_form_templates(id) ON DELETE CASCADE,
  template_version INT  NOT NULL,
  factory_id       UUID NOT NULL REFERENCES public.factory_accounts(id) ON DELETE CASCADE,
  submitted_by     UUID,
  status           TEXT NOT NULL DEFAULT 'submitted',
  values           JSONB NOT NULL DEFAULT '{}'::jsonb,
  fields_snapshot  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_custom_form_submissions_template ON public.custom_form_submissions(template_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_custom_form_submissions_factory ON public.custom_form_submissions(factory_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.custom_forms_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_custom_form_templates_updated ON public.custom_form_templates;
CREATE TRIGGER trg_custom_form_templates_updated BEFORE UPDATE ON public.custom_form_templates
  FOR EACH ROW EXECUTE FUNCTION public.custom_forms_set_updated_at();
DROP TRIGGER IF EXISTS trg_custom_form_submissions_updated ON public.custom_form_submissions;
CREATE TRIGGER trg_custom_form_submissions_updated BEFORE UPDATE ON public.custom_form_submissions
  FOR EACH ROW EXECUTE FUNCTION public.custom_forms_set_updated_at();

ALTER TABLE public.custom_form_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_form_fields       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_form_submissions  ENABLE ROW LEVEL SECURITY;

-- Templates: any factory member reads (or superadmin); admin/owner (or superadmin) manage. No delete (archive only).
DROP POLICY IF EXISTS "custom_form_templates_select" ON public.custom_form_templates;
CREATE POLICY "custom_form_templates_select" ON public.custom_form_templates
  FOR SELECT TO authenticated
  USING (factory_id = public.get_user_factory_id(auth.uid()) OR public.is_superadmin(auth.uid()));
DROP POLICY IF EXISTS "custom_form_templates_insert" ON public.custom_form_templates;
CREATE POLICY "custom_form_templates_insert" ON public.custom_form_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_higher(auth.uid())
             AND (factory_id = public.get_user_factory_id(auth.uid()) OR public.is_superadmin(auth.uid())));
DROP POLICY IF EXISTS "custom_form_templates_update" ON public.custom_form_templates;
CREATE POLICY "custom_form_templates_update" ON public.custom_form_templates
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_higher(auth.uid())
         AND (factory_id = public.get_user_factory_id(auth.uid()) OR public.is_superadmin(auth.uid())))
  WITH CHECK (public.is_admin_or_higher(auth.uid())
             AND (factory_id = public.get_user_factory_id(auth.uid()) OR public.is_superadmin(auth.uid())));

-- Fields: readable if the parent template is in the user's factory (or superadmin); admin/owner (or superadmin) manage.
DROP POLICY IF EXISTS "custom_form_fields_select" ON public.custom_form_fields;
CREATE POLICY "custom_form_fields_select" ON public.custom_form_fields
  FOR SELECT TO authenticated
  USING (public.is_superadmin(auth.uid())
         OR EXISTS (SELECT 1 FROM public.custom_form_templates t
                    WHERE t.id = template_id AND t.factory_id = public.get_user_factory_id(auth.uid())));
DROP POLICY IF EXISTS "custom_form_fields_insert" ON public.custom_form_fields;
CREATE POLICY "custom_form_fields_insert" ON public.custom_form_fields
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_higher(auth.uid())
             AND (public.is_superadmin(auth.uid())
                  OR EXISTS (SELECT 1 FROM public.custom_form_templates t
                             WHERE t.id = template_id AND t.factory_id = public.get_user_factory_id(auth.uid()))));
DROP POLICY IF EXISTS "custom_form_fields_update" ON public.custom_form_fields;
CREATE POLICY "custom_form_fields_update" ON public.custom_form_fields
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_higher(auth.uid())
         AND (public.is_superadmin(auth.uid())
              OR EXISTS (SELECT 1 FROM public.custom_form_templates t
                         WHERE t.id = template_id AND t.factory_id = public.get_user_factory_id(auth.uid()))))
  WITH CHECK (public.is_admin_or_higher(auth.uid())
             AND (public.is_superadmin(auth.uid())
                  OR EXISTS (SELECT 1 FROM public.custom_form_templates t
                             WHERE t.id = template_id AND t.factory_id = public.get_user_factory_id(auth.uid()))));
-- Fields may be deleted by an admin when re-editing a form (delete + reinsert; the unique
-- (template_id, key) constraint rules out soft-replace). Past submissions keep a fields_snapshot.
DROP POLICY IF EXISTS "custom_form_fields_delete" ON public.custom_form_fields;
CREATE POLICY "custom_form_fields_delete" ON public.custom_form_fields
  FOR DELETE TO authenticated
  USING (public.is_admin_or_higher(auth.uid())
         AND (public.is_superadmin(auth.uid())
              OR EXISTS (SELECT 1 FROM public.custom_form_templates t
                         WHERE t.id = template_id AND t.factory_id = public.get_user_factory_id(auth.uid()))));

-- Submissions: insert as yourself, within your factory, for a template in your factory; read own or admin; admin update/delete.
DROP POLICY IF EXISTS "custom_form_submissions_insert" ON public.custom_form_submissions;
CREATE POLICY "custom_form_submissions_insert" ON public.custom_form_submissions
  FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid()
             AND (public.is_superadmin(auth.uid())
                  OR (factory_id = public.get_user_factory_id(auth.uid())
                      AND EXISTS (SELECT 1 FROM public.custom_form_templates t
                                  WHERE t.id = template_id AND t.factory_id = public.get_user_factory_id(auth.uid())))));
DROP POLICY IF EXISTS "custom_form_submissions_select" ON public.custom_form_submissions;
CREATE POLICY "custom_form_submissions_select" ON public.custom_form_submissions
  FOR SELECT TO authenticated
  USING (public.is_superadmin(auth.uid())
         OR (factory_id = public.get_user_factory_id(auth.uid())
             AND (submitted_by = auth.uid() OR public.is_admin_or_higher(auth.uid()))));
DROP POLICY IF EXISTS "custom_form_submissions_modify" ON public.custom_form_submissions;
CREATE POLICY "custom_form_submissions_modify" ON public.custom_form_submissions
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_higher(auth.uid())
         AND (factory_id = public.get_user_factory_id(auth.uid()) OR public.is_superadmin(auth.uid())))
  WITH CHECK (public.is_admin_or_higher(auth.uid())
             AND (factory_id = public.get_user_factory_id(auth.uid()) OR public.is_superadmin(auth.uid())));
DROP POLICY IF EXISTS "custom_form_submissions_delete" ON public.custom_form_submissions;
CREATE POLICY "custom_form_submissions_delete" ON public.custom_form_submissions
  FOR DELETE TO authenticated
  USING (public.is_admin_or_higher(auth.uid())
         AND (factory_id = public.get_user_factory_id(auth.uid()) OR public.is_superadmin(auth.uid())));
