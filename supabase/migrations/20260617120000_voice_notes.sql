-- Voice notes: polymorphic audio attachments for any record with a notes field
-- (QC sheet items, sewing/finishing/cutting/storage/dispatch remarks, etc.).
-- Anyone in the factory can read/play; creators or admins can delete.

CREATE TABLE public.voice_notes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id    uuid NOT NULL REFERENCES public.factory_accounts(id) ON DELETE CASCADE,
  record_type   text NOT NULL,          -- e.g. 'qc_daily_sheet_item', 'sewing_actuals'
  record_id     uuid NOT NULL,          -- the row the note is attached to (no FK; polymorphic)
  storage_path  text NOT NULL,          -- path in the 'voice-notes' bucket
  duration_ms   integer,
  file_size_bytes integer,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_voice_notes_record ON public.voice_notes (factory_id, record_type, record_id);

ALTER TABLE public.voice_notes ENABLE ROW LEVEL SECURITY;

-- Anyone in the factory (or a superadmin) can read voice notes.
CREATE POLICY "voice_notes_select" ON public.voice_notes
  FOR SELECT TO authenticated
  USING (factory_id = public.get_user_factory_id(auth.uid()) OR public.is_superadmin(auth.uid()));

-- Authenticated factory members can add a voice note (as themselves).
CREATE POLICY "voice_notes_insert" ON public.voice_notes
  FOR INSERT TO authenticated
  WITH CHECK (factory_id = public.get_user_factory_id(auth.uid()) AND created_by = auth.uid());

-- The creator or an admin/owner can delete a voice note.
CREATE POLICY "voice_notes_delete" ON public.voice_notes
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin_or_higher(auth.uid()));

-- Private storage bucket for the audio files.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('voice-notes', 'voice-notes', false, 52428800,
        ARRAY['audio/webm','audio/mp4','audio/mpeg','audio/ogg','audio/wav'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: scope by the first path segment = the user's factory_id.
CREATE POLICY "voice_notes_obj_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'voice-notes'
         AND (storage.foldername(name))[1] = public.get_user_factory_id(auth.uid())::text);

CREATE POLICY "voice_notes_obj_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'voice-notes'
              AND (storage.foldername(name))[1] = public.get_user_factory_id(auth.uid())::text);

CREATE POLICY "voice_notes_obj_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'voice-notes'
         AND (storage.foldername(name))[1] = public.get_user_factory_id(auth.uid())::text);
