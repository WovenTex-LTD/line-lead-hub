-- Dynamic lookup dropdowns for custom forms.
-- Adds a 'dynamic_select' field type whose choices are pulled live from a factory
-- data source (lines, stages, progress, milestones, blocker lists) identified by
-- `source_key`. New options added in Dropdown Settings appear automatically.
-- The chosen option's text is stored as the value. Interactive (can be required).
-- Safe to re-run.

ALTER TABLE public.custom_form_fields ADD COLUMN IF NOT EXISTS source_key TEXT;

ALTER TABLE public.custom_form_fields DROP CONSTRAINT IF EXISTS custom_form_fields_field_type_check;
ALTER TABLE public.custom_form_fields ADD CONSTRAINT custom_form_fields_field_type_check
  CHECK (field_type IN ('text','number','date','dropdown','textarea','checkbox','computed','auto','po_select','dynamic_select'));
