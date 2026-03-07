
-- Drop the problematic foreign key constraints referencing auth.users
-- production_notes: find and drop the FK on created_by
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT constraint_name INTO fk_name
  FROM information_schema.table_constraints
  WHERE table_schema = 'public'
    AND table_name = 'production_notes'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%created_by%';
  
  IF fk_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.production_notes DROP CONSTRAINT ' || fk_name;
  END IF;

  SELECT constraint_name INTO fk_name
  FROM information_schema.table_constraints
  WHERE table_schema = 'public'
    AND table_name = 'production_note_comments'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%created_by%';
  
  IF fk_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.production_note_comments DROP CONSTRAINT ' || fk_name;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
