-- Computed (formula) fields for custom forms.
-- Adds a 'computed' field type and a `formula` expression that references other
-- fields by their key (e.g. total_minutes_produced / total_minutes_attended * 100).
-- The value is calculated live in the form and is read-only. Safe to re-run.

ALTER TABLE public.custom_form_fields ADD COLUMN IF NOT EXISTS formula TEXT;

-- Allow 'computed' in the field_type CHECK constraint (the original was an inline
-- CHECK, auto-named custom_form_fields_field_type_check).
ALTER TABLE public.custom_form_fields DROP CONSTRAINT IF EXISTS custom_form_fields_field_type_check;
ALTER TABLE public.custom_form_fields ADD CONSTRAINT custom_form_fields_field_type_check
  CHECK (field_type IN ('text','number','date','dropdown','textarea','checkbox','computed'));
