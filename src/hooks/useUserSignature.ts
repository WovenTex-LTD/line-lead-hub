import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { UserSignature } from '@/types/dispatch';

// ─────────────────────────────────────────────────────────────────────────────
// Hook: useUserSignature
// Manages the admin's registered approval signature
// ─────────────────────────────────────────────────────────────────────────────
export function useUserSignature(userId?: string) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const targetUserId = userId || profile?.id;
  const factoryId = profile?.factory_id;

  const query = useQuery({
    queryKey: ['user-signature', targetUserId],
    queryFn: async () => {
      if (!targetUserId) return null;

      const { data, error } = await supabase
        .from('user_signatures')
        .select('*')
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (error) throw error;
      return data as UserSignature | null;
    },
    enabled: !!targetUserId,
    staleTime: 60_000,
  });

  // ── Save (create or replace) signature ─────────────────────────────────
  const saveSignature = useMutation({
    mutationFn: async (source: File | string) => {
      if (!profile?.id || !factoryId) throw new Error('Not authenticated');

      let blob: Blob;

      if (typeof source === 'string') {
        // dataUrl from canvas drawing — convert to blob
        const res = await fetch(source);
        blob = await res.blob();
      } else {
        blob = source;
      }

      const path = `${profile.id}.png`;

      // Upload (overwrite if exists)
      const { error: uploadError } = await supabase.storage
        .from('signatures')
        .upload(path, blob, {
          contentType: 'image/png',
          upsert: true,
        });

      if (uploadError) throw new Error(`Signature upload failed: ${uploadError.message}`);

      const { data: urlData } = supabase.storage
        .from('signatures')
        .getPublicUrl(path);

      const signatureUrl = urlData.publicUrl;

      // Upsert the record
      const { data, error } = await supabase
        .from('user_signatures')
        .upsert(
          {
            user_id: profile.id,
            factory_id: factoryId,
            signature_url: signatureUrl,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )
        .select()
        .single();

      if (error) throw error;
      return data as UserSignature;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-signature', profile?.id] });
    },
  });

  // ── Delete signature ─────────────────────────────────────────────────────
  const deleteSignature = useMutation({
    mutationFn: async () => {
      if (!profile?.id) throw new Error('Not authenticated');

      // Remove from storage
      await supabase.storage
        .from('signatures')
        .remove([`${profile.id}.png`]);

      // Delete DB record
      const { error } = await supabase
        .from('user_signatures')
        .delete()
        .eq('user_id', profile.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-signature', profile?.id] });
    },
  });

  return {
    signature: query.data ?? null,
    loading: query.isLoading,
    error: query.error?.message ?? null,
    saveSignature,
    deleteSignature,
  };
}
