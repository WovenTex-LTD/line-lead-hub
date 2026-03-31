import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getTodayInTimezone } from '@/lib/date-utils';
import type { DispatchRequest, DispatchStatus, DispatchFormData } from '@/types/dispatch';

// NOTE: FK joins are disabled until FK constraints are confirmed in the DB.
// To re-enable, replace '*' with the full join string and apply the corrected
// migration SQL (join against factory_accounts, not factories).
const DISPATCH_SELECT = '*';

// ─────────────────────────────────────────────────────────────────────────────
// Reference number generation — DSP-YYYYMMDD-NNN
// ─────────────────────────────────────────────────────────────────────────────
async function generateReferenceNumber(factoryId: string, timezone: string): Promise<string> {
  const today = getTodayInTimezone(timezone);

  const { data, error } = await supabase.rpc('increment_dispatch_sequence', {
    p_factory_id: factoryId,
    p_date: today,
  });

  if (error) throw new Error(`Failed to generate reference number: ${error.message}`);

  const seq = String(data).padStart(3, '0');
  const datePart = today.replace(/-/g, '');
  return `DSP-${datePart}-${seq}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook: useMyDispatches — gate officer's own request history
// ─────────────────────────────────────────────────────────────────────────────
export function useMyDispatches() {
  const { profile } = useAuth();
  const factoryId = profile?.factory_id;

  return useQuery({
    queryKey: ['dispatch-requests', 'mine', factoryId],
    queryFn: async () => {
      if (!factoryId || !profile?.id) return [];

      const { data, error } = await supabase
        .from('dispatch_requests')
        .select(DISPATCH_SELECT)
        .eq('factory_id', factoryId)
        .eq('submitted_by', profile.id)
        .order('submitted_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as DispatchRequest[];
    },
    enabled: !!factoryId && !!profile?.id,
    staleTime: 30_000,
    retry: false,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook: usePendingApprovals — admin view of all pending requests
// ─────────────────────────────────────────────────────────────────────────────
export function usePendingApprovals() {
  const { profile } = useAuth();
  const factoryId = profile?.factory_id;

  return useQuery({
    queryKey: ['dispatch-requests', 'pending', factoryId],
    queryFn: async () => {
      if (!factoryId) return [];

      const { data, error } = await supabase
        .from('dispatch_requests')
        .select(DISPATCH_SELECT)
        .eq('factory_id', factoryId)
        .eq('status', 'pending')
        .order('submitted_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as DispatchRequest[];
    },
    enabled: !!factoryId,
    staleTime: 30_000,
    retry: false,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook: useAllDispatches — admin view with optional status filter
// ─────────────────────────────────────────────────────────────────────────────
export function useAllDispatches(statusFilter?: DispatchStatus) {
  const { profile } = useAuth();
  const factoryId = profile?.factory_id;

  return useQuery({
    queryKey: ['dispatch-requests', 'all', factoryId, statusFilter],
    queryFn: async () => {
      if (!factoryId) return [];

      let q = supabase
        .from('dispatch_requests')
        .select(DISPATCH_SELECT)
        .eq('factory_id', factoryId)
        .order('submitted_at', { ascending: false });
      if (statusFilter) q = q.eq('status', statusFilter);

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as DispatchRequest[];
    },
    enabled: !!factoryId,
    staleTime: 30_000,
    retry: false,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook: useDispatchRequest — single request by id
// ─────────────────────────────────────────────────────────────────────────────
export function useDispatchRequest(id: string | undefined) {
  const { profile } = useAuth();
  const factoryId = profile?.factory_id;

  return useQuery({
    queryKey: ['dispatch-requests', 'single', id],
    queryFn: async () => {
      if (!id || !factoryId) return null;

      const { data, error } = await supabase
        .from('dispatch_requests')
        .select(DISPATCH_SELECT)
        .eq('id', id)
        .eq('factory_id', factoryId)
        .single();

      if (error) throw error;
      return data as unknown as DispatchRequest;
    },
    enabled: !!id && !!factoryId,
    staleTime: 30_000,
    retry: false,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook: useDispatchMutations — submit, approve, reject, cancel, edit
// ─────────────────────────────────────────────────────────────────────────────
export function useDispatchMutations() {
  const { profile, factory } = useAuth();
  const queryClient = useQueryClient();
  const factoryId = profile?.factory_id;
  const timezone = factory?.timezone || 'Asia/Dhaka';

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['dispatch-requests'] });
  };

  const submitDispatch = useMutation({
    mutationFn: async ({ formData, photoFile }: { formData: DispatchFormData; photoFile: File | null }) => {
      if (!factoryId || !profile?.id) throw new Error('Not authenticated');

      const referenceNumber = await generateReferenceNumber(factoryId, timezone);

      let photoUrl: string | null = null;
      if (photoFile) {
        const ext = photoFile.name.split('.').pop() || 'jpg';
        const path = `${factoryId}/${referenceNumber}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('dispatch-photos')
          .upload(path, photoFile, { upsert: false });
        if (uploadError) throw new Error(`Photo upload failed: ${uploadError.message}`);
        const { data: urlData } = supabase.storage.from('dispatch-photos').getPublicUrl(path);
        photoUrl = urlData.publicUrl;
      }

      const { data, error } = await supabase
        .from('dispatch_requests')
        .insert({
          factory_id: factoryId,
          reference_number: referenceNumber,
          work_order_id: formData.work_order_id || null,
          style_name: formData.style_name || null,
          buyer_name: formData.buyer_name || null,
          dispatch_quantity: Number(formData.dispatch_quantity),
          carton_count: formData.carton_count !== '' ? Number(formData.carton_count) : null,
          truck_number: formData.truck_number,
          driver_name: formData.driver_name,
          driver_nid: formData.driver_nid || null,
          destination: formData.destination,
          remarks: formData.remarks || null,
          photo_url: photoUrl,
          status: 'pending',
          submitted_by: profile.id,
          submitted_at: new Date().toISOString(),
        })
        .select('*')
        .single();

      if (error) throw error;

      supabase.functions
        .invoke('notify-dispatch-submitted', {
          body: {
            factoryId,
            referenceNumber,
            submittedBy: profile.full_name || 'Gate Officer',
            dispatchQuantity: formData.dispatch_quantity,
            destination: formData.destination,
            dispatchRequestId: (data as any).id,
          },
        })
        .catch((err) => console.error('Failed to send dispatch notification:', err));

      return data as unknown as DispatchRequest;
    },
    onSuccess: invalidate,
  });

  const approveDispatch = useMutation({
    mutationFn: async ({ id, gatePdfUrl }: { id: string; gatePdfUrl: string }) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('dispatch_requests')
        .update({ status: 'approved', reviewed_by: profile.id, reviewed_at: new Date().toISOString(), gate_pass_pdf_url: gatePdfUrl })
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      const request = data as unknown as DispatchRequest;

      supabase.functions
        .invoke('notify-dispatch-approved', {
          body: { factoryId, referenceNumber: request.reference_number, approvedBy: profile.full_name || 'Admin', submittedBy: request.submitted_by, dispatchRequestId: id },
        })
        .catch((err) => console.error('Failed to send approval notification:', err));

      return request;
    },
    onSuccess: invalidate,
  });

  const rejectDispatch = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('dispatch_requests')
        .update({ status: 'rejected', reviewed_by: profile.id, reviewed_at: new Date().toISOString(), rejection_reason: reason })
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      const request = data as unknown as DispatchRequest;

      supabase.functions
        .invoke('notify-dispatch-rejected', {
          body: { factoryId, referenceNumber: request.reference_number, rejectedBy: profile.full_name || 'Admin', reason, submittedBy: request.submitted_by, dispatchRequestId: id },
        })
        .catch((err) => console.error('Failed to send rejection notification:', err));

      return request;
    },
    onSuccess: invalidate,
  });

  const cancelDispatch = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('dispatch_requests')
        .update({ status: 'cancelled' })
        .eq('id', id)
        .eq('submitted_by', profile?.id ?? '')
        .eq('status', 'pending')
        .select('*')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  const editDispatch = useMutation({
    mutationFn: async ({ id, formData, newPhotoFile }: { id: string; formData: Partial<DispatchFormData>; newPhotoFile?: File | null }) => {
      if (!factoryId || !profile?.id) throw new Error('Not authenticated');

      let photoUrl: string | undefined;
      if (newPhotoFile) {
        const { data: existing } = await supabase.from('dispatch_requests').select('reference_number').eq('id', id).single();
        if (existing) {
          const ext = newPhotoFile.name.split('.').pop() || 'jpg';
          const path = `${factoryId}/${existing.reference_number}.${ext}`;
          const { error: uploadError } = await supabase.storage.from('dispatch-photos').upload(path, newPhotoFile, { upsert: true });
          if (uploadError) throw new Error(`Photo upload failed: ${uploadError.message}`);
          const { data: urlData } = supabase.storage.from('dispatch-photos').getPublicUrl(path);
          photoUrl = urlData.publicUrl;
        }
      }

      const updates: Record<string, unknown> = {};
      if (formData.work_order_id !== undefined) updates.work_order_id = formData.work_order_id || null;
      if (formData.style_name !== undefined) updates.style_name = formData.style_name || null;
      if (formData.buyer_name !== undefined) updates.buyer_name = formData.buyer_name || null;
      if (formData.dispatch_quantity !== undefined) updates.dispatch_quantity = Number(formData.dispatch_quantity);
      if (formData.carton_count !== undefined) updates.carton_count = formData.carton_count !== '' ? Number(formData.carton_count) : null;
      if (formData.truck_number !== undefined) updates.truck_number = formData.truck_number;
      if (formData.driver_name !== undefined) updates.driver_name = formData.driver_name;
      if (formData.driver_nid !== undefined) updates.driver_nid = formData.driver_nid || null;
      if (formData.destination !== undefined) updates.destination = formData.destination;
      if (formData.remarks !== undefined) updates.remarks = formData.remarks || null;
      if (photoUrl !== undefined) updates.photo_url = photoUrl;

      const { data, error } = await supabase
        .from('dispatch_requests')
        .update(updates)
        .eq('id', id)
        .eq('submitted_by', profile.id)
        .eq('status', 'pending')
        .select('*')
        .single();

      if (error) throw error;
      return data as unknown as DispatchRequest;
    },
    onSuccess: invalidate,
  });

  return { submitDispatch, approveDispatch, rejectDispatch, cancelDispatch, editDispatch };
}
