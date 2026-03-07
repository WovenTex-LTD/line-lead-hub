import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useProductionNotes, type ProductionNote } from '@/hooks/useProductionNotes';
import { NoteRow } from './NoteRow';
import { NoteFormDialog } from './NoteFormDialog';
import { NoteDetailDialog } from './NoteDetailDialog';
import { ClipboardList, Plus, FileText } from 'lucide-react';

export function NotesPanel() {
  const { notes, openCountToday, loading } = useProductionNotes();
  const [formOpen, setFormOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<ProductionNote | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const handleNoteClick = (note: ProductionNote) => {
    setSelectedNote(note);
    setDetailOpen(true);
  };

  return (
    <>
      <Card className="overflow-hidden border-border/50 shadow-sm">
        <CardHeader className={`flex flex-row items-center justify-between gap-2 space-y-0 ${notes.length > 0 || loading ? '' : 'py-3'}`}>
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <ClipboardList className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
            Production Notes
            {notes.length > 0 && (
              <span className="text-xs font-medium bg-muted text-muted-foreground rounded-full px-2.5 py-0.5">
                {notes.length}
              </span>
            )}
            {openCountToday > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-full px-2.5 py-0.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
                </span>
                {openCountToday} open
              </span>
            )}
          </CardTitle>
          <Button
            size="sm"
            onClick={() => setFormOpen(true)}
            className="h-8 text-xs gap-1.5 rounded-lg shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Note
          </Button>
        </CardHeader>

        {(loading || notes.length > 0) && (
          <CardContent className="pt-0">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-0.5 scrollbar-thin">
                {notes.map(note => (
                  <NoteRow key={note.id} note={note} onClick={handleNoteClick} />
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <NoteFormDialog open={formOpen} onOpenChange={setFormOpen} />
      <NoteDetailDialog note={selectedNote} open={detailOpen} onOpenChange={setDetailOpen} />
    </>
  );
}
