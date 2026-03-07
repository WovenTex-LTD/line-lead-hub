import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getTodayInTimezone } from '@/lib/date-utils';

export type NoteTag = 'output' | 'delay' | 'quality' | 'material' | 'machine' | 'staffing' | 'buyer_change' | 'other';
export type NoteStatus = 'open' | 'monitoring' | 'resolved';
export type NoteImpact = 'low' | 'medium' | 'high';
export type NoteDepartment = 'cutting' | 'sewing' | 'finishing' | 'qc' | 'storage';

export interface ProductionNote {
  id: string;
  factory_id: string;
  title: string;
  body: string;
  line_id: string | null;
  department: NoteDepartment | null;
  work_order_id: string | null;
  tag: NoteTag;
  impact: NoteImpact | null;
  status: NoteStatus;
  resolution_summary: string | null;
  action_taken: string | null;
  resolved_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  lines?: { line_id: string; name: string | null } | null;
  work_orders?: { po_number: string | null; buyer: string | null; style: string | null } | null;
  // Resolved client-side
  author_name?: string;
  comment_count?: number;
}

export interface NoteComment {
  id: string;
  note_id: string;
  body: string;
  created_by: string;
  created_at: string;
  author_name?: string;
}

export interface CreateNoteInput {
  title: string;
  body: string;
  line_id?: string | null;
  department?: NoteDepartment | null;
  work_order_id?: string | null;
  tag: NoteTag;
  impact?: NoteImpact | null;
  status?: NoteStatus;
}

const NOTE_SELECT = `
  *,
  lines(line_id, name),
  work_orders(po_number, buyer, style),
  production_note_comments(count)
`;

export function useProductionNotes() {
  const { profile, factory } = useAuth();
  const factoryId = profile?.factory_id;
  const timezone = factory?.timezone || 'Asia/Dhaka';
  const queryClient = useQueryClient();

  const todayQuery = useQuery({
    queryKey: ['production-notes', 'today', factoryId],
    queryFn: async () => {
      if (!factoryId) return [];
      const today = getTodayInTimezone(timezone);
      const startOfDay = `${today}T00:00:00`;
      const endOfDay = `${today}T23:59:59`;

      const { data, error } = await supabase
        .from('production_notes')
        .select(NOTE_SELECT)
        .eq('factory_id', factoryId)
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const notes = (data || []).map((row: any) => {
        const { production_note_comments, ...rest } = row;
        return {
          ...rest,
          comment_count: production_note_comments?.[0]?.count ?? 0,
        };
      }) as ProductionNote[];

      // Resolve author names from profiles
      const authorIds = [...new Set(notes.map(n => n.created_by))];
      if (authorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', authorIds);
        const profileMap = new Map((profiles || []).map(p => [p.id, p.full_name]));
        for (const note of notes) {
          const name = profileMap.get(note.created_by);
          if (name) note.author_name = name;
        }
      }

      return notes;
    },
    enabled: !!factoryId,
    staleTime: 30_000,
  });

  const openCountToday = (todayQuery.data || []).filter(n => n.status === 'open').length;

  const createNote = useMutation({
    mutationFn: async (input: CreateNoteInput) => {
      if (!factoryId || !profile?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('production_notes')
        .insert({
          factory_id: factoryId,
          title: input.title,
          body: input.body,
          line_id: input.line_id || null,
          department: input.department || null,
          work_order_id: input.work_order_id || null,
          tag: input.tag,
          impact: input.impact || null,
          status: input.status || 'open',
          created_by: profile.id,
        })
        .select(NOTE_SELECT)
        .single();

      if (error) throw error;
      return data as ProductionNote;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production-notes'] });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ noteId, status }: {
      noteId: string;
      status: NoteStatus;
    }) => {
      const { data, error } = await supabase
        .from('production_notes')
        .update({ status })
        .eq('id', noteId)
        .select(NOTE_SELECT)
        .single();

      if (error) throw error;
      return data as ProductionNote;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production-notes'] });
    },
  });

  const deleteNote = useMutation({
    mutationFn: async (noteId: string) => {
      const { error } = await supabase
        .from('production_notes')
        .delete()
        .eq('id', noteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production-notes'] });
    },
  });

  const fetchComments = async (noteId: string): Promise<NoteComment[]> => {
    const { data, error } = await supabase
      .from('production_note_comments')
      .select('*')
      .eq('note_id', noteId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []) as NoteComment[];
  };

  const addComment = useMutation({
    mutationFn: async ({ noteId, body }: { noteId: string; body: string }) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('production_note_comments')
        .insert({
          note_id: noteId,
          body,
          created_by: profile.id,
        })
        .select('*')
        .single();

      if (error) throw error;
      return data as NoteComment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production-notes'] });
    },
  });

  return {
    notes: todayQuery.data || [],
    openCountToday,
    loading: todayQuery.isLoading,
    error: todayQuery.error?.message ?? null,
    refetch: todayQuery.refetch,
    createNote,
    updateStatus,
    deleteNote,
    fetchComments,
    addComment,
  };
}
