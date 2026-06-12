-- Production integration for custom forms that are a version of a production slot.
-- production_mapping maps friendly target keys (output, manpower, hours, ...) to the
-- form's field keys, so on submit the form ALSO writes a real row into the slot's
-- production table (sewing_actuals, etc.) and shows up everywhere the default does.
-- Line and PO are auto-detected from the form's line/PO picker fields.
-- Safe to re-run.

ALTER TABLE public.custom_form_templates ADD COLUMN IF NOT EXISTS production_mapping JSONB;
