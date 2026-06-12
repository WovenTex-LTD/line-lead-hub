-- PO selector field for custom forms.
-- Adds a 'po_select' field type: an interactive dropdown populated at fill time
-- with the factory's active purchase orders. The chosen PO number is stored as the
-- field value (a normal user-entered field — can be required). Safe to re-run.

ALTER TABLE public.custom_form_fields DROP CONSTRAINT IF EXISTS custom_form_fields_field_type_check;
ALTER TABLE public.custom_form_fields ADD CONSTRAINT custom_form_fields_field_type_check
  CHECK (field_type IN ('text','number','date','dropdown','textarea','checkbox','computed','auto','po_select'));
