import type { ProductionNote } from '@/hooks/useProductionNotes';
import { TAG_CONFIG, STATUS_CONFIG, IMPACT_CONFIG } from './note-constants';
import { Clock, User, MessageSquare } from 'lucide-react';

interface NoteRowProps {
  note: ProductionNote;
  onClick: (note: ProductionNote) => void;
}

export function NoteRow({ note, onClick }: NoteRowProps) {
  const tag = TAG_CONFIG[note.tag];
  const status = STATUS_CONFIG[note.status];
  const impact = note.impact ? IMPACT_CONFIG[note.impact] : null;

  const anchor = note.lines
    ? (note.lines.name || note.lines.line_id)
    : note.department
    ? note.department.charAt(0).toUpperCase() + note.department.slice(1)
    : note.work_orders?.po_number || null;

  const time = new Date(note.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const commentCount = note.comment_count ?? 0;

  return (
    <div
      onClick={() => onClick(note)}
      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${tag.bg} ${tag.text}`}>
          {tag.icon}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-sm truncate">{note.title}</span>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold ring-1 ${status.bg} ${status.text} ${status.ring}`}>
              {status.label}
            </span>
            {impact && (
              <span className="flex items-center gap-1 text-[10px] font-medium">
                <span className={`w-1.5 h-1.5 rounded-full ${impact.bg}`} />
                <span className={impact.color}>{impact.label}</span>
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate mt-0.5">
            {[anchor, tag.label, note.author_name?.split(' ')[0] || 'Admin'].filter(Boolean).join(' \u2022 ')}
            {' \u2022 '}
            {time}
            {commentCount > 0 && (
              <span className="inline-flex items-center gap-0.5 ml-1.5 text-primary font-medium">
                <MessageSquare className="h-2.5 w-2.5 inline" />
                {commentCount}
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
