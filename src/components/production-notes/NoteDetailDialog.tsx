import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import type { ProductionNote, NoteComment, NoteStatus } from '@/hooks/useProductionNotes';
import { useProductionNotes } from '@/hooks/useProductionNotes';
import { TAG_CONFIG, STATUS_CONFIG, IMPACT_CONFIG } from './note-constants';
import { toast } from 'sonner';
import { Clock, User, MessageSquare, Send, Eye, Trash2, CheckCircle2 } from 'lucide-react';

interface NoteDetailDialogProps {
  note: ProductionNote | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NoteDetailDialog({ note, open, onOpenChange }: NoteDetailDialogProps) {
  const { updateStatus, deleteNote, fetchComments, addComment } = useProductionNotes();
  const [comments, setComments] = useState<NoteComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);

  useEffect(() => {
    if (note && open) {
      setLoadingComments(true);
      fetchComments(note.id)
        .then(setComments)
        .catch(() => {})
        .finally(() => setLoadingComments(false));
    } else {
      setComments([]);
    }
  }, [note?.id, open]);

  if (!note) return null;

  const tag = TAG_CONFIG[note.tag];
  const status = STATUS_CONFIG[note.status];
  const impact = note.impact ? IMPACT_CONFIG[note.impact] : null;

  const anchor = note.lines
    ? (note.lines.name || note.lines.line_id)
    : note.department
    ? note.department.charAt(0).toUpperCase() + note.department.slice(1)
    : null;

  const handleStatusChange = async (newStatus: NoteStatus) => {
    try {
      await updateStatus.mutateAsync({ noteId: note.id, status: newStatus });
      toast.success('Status updated');
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteNote.mutateAsync(note.id);
      toast.success('Note deleted');
      onOpenChange(false);
    } catch {
      toast.error('Failed to delete note');
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    try {
      const comment = await addComment.mutateAsync({ noteId: note.id, body: newComment.trim() });
      setComments(prev => [...prev, comment]);
      setNewComment('');
    } catch {
      toast.error('Failed to add comment');
    }
  };

  const createdAt = new Date(note.created_at);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto p-0">
        {/* Header with tag color accent */}
        <div className={`px-5 pt-5 pb-4 ${tag.bg} border-b border-border/30`}>
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl bg-background/80 backdrop-blur-sm flex items-center justify-center shrink-0 shadow-sm ${tag.text}`}>
                {tag.icon}
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-base leading-snug pr-6">{note.title}</DialogTitle>
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold ${tag.bg} ${tag.text} ring-1 ring-inset ring-current/10`}>
                    {tag.label}
                  </span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold ring-1 ${status.bg} ${status.text} ${status.ring}`}>
                    {status.label}
                  </span>
                  {impact && (
                    <span className="flex items-center gap-1 text-[10px] font-medium">
                      <span className={`w-1.5 h-1.5 rounded-full ${impact.bg}`} />
                      <span className={impact.color}>{impact.label} impact</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* Meta */}
        <div className="px-5 pt-3 pb-0">
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            {anchor && (
              <span className="inline-flex items-center gap-1.5">
                <span className="font-semibold text-foreground">Line/Dept</span>
                <span className="bg-muted/60 rounded px-1.5 py-0.5 font-medium">{anchor}</span>
              </span>
            )}
            {note.work_orders?.po_number && (
              <span className="inline-flex items-center gap-1.5">
                <span className="font-semibold text-foreground">PO</span>
                <span className="bg-muted/60 rounded px-1.5 py-0.5 font-medium">
                  {note.work_orders.po_number}
                  {note.work_orders.style && ` / ${note.work_orders.style}`}
                </span>
              </span>
            )}
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {note.author_name || 'Admin'}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {createdAt.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-3">
          <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">{note.body}</div>
        </div>

        {/* Actions */}
        <div className="px-5 pb-3">
          <div className="flex gap-2">
            {note.status === 'open' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleStatusChange('monitoring')}
                disabled={updateStatus.isPending}
                className="h-8 text-xs rounded-lg gap-1.5"
              >
                <Eye className="h-3.5 w-3.5" />
                Monitor
              </Button>
            )}
            {note.status !== 'resolved' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleStatusChange('resolved')}
                disabled={updateStatus.isPending}
                className="h-8 text-xs rounded-lg gap-1.5 text-green-600 hover:text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/30"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Resolve
              </Button>
            )}
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteNote.isPending}
              className="h-8 text-xs rounded-lg gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deleteNote.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>

        <Separator className="opacity-50" />

        {/* Comments */}
        <div className="px-5 py-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-3">
            <MessageSquare className="h-3.5 w-3.5" />
            Comments {comments.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-primary/10 text-primary text-[10px] font-bold px-1">
                {comments.length}
              </span>
            )}
          </h4>

          {loadingComments ? (
            <div className="space-y-2">
              {[1, 2].map(i => <div key={i} className="h-12 rounded-lg bg-muted/40 animate-pulse" />)}
            </div>
          ) : comments.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 italic mb-3">No comments yet</p>
          ) : (
            <div className="space-y-2 mb-3">
              {comments.map(c => (
                <div key={c.id} className="rounded-lg bg-muted/40 px-3 py-2.5 border border-border/30">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-foreground">{c.author_name || 'Admin'}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/80 leading-relaxed">{c.body}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 items-end">
            <Textarea
              placeholder="Add a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={1}
              className="min-h-[36px] text-sm bg-muted/30 border-border/50 focus:bg-background transition-colors resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAddComment();
                }
              }}
            />
            <Button
              size="sm"
              onClick={handleAddComment}
              disabled={!newComment.trim() || addComment.isPending}
              className="shrink-0 h-9 w-9 p-0 rounded-lg"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
