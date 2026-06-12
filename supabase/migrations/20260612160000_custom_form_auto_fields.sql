-- Auto-filled fields for custom forms.
-- Adds an 'auto' field type whose value comes from submission context (the current
-- date/time and the logged-in user / factory) rather than manual entry. The source
-- is a curated key in `auto_source`. Read-only, resolved when the form is filled.
-- Safe to re-run.

ALTER TABLE public.custom_form_fields ADD COLUMN IF NOT EXISTS auto_source TEXT;

ALTER TABLE public.custom_form_fields DROP CONSTRAINT IF EXISTS custom_form_fields_field_type_check;
ALTER TABLE public.custom_form_fields ADD CONSTRAINT custom_form_fields_field_type_check
  CHECK (field_type IN ('text','number','date','dropdown','textarea','checkbox','computed','auto'));
