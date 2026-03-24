import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useProductionNotes, type NoteTag, type NoteImpact, type NoteDepartment } from '@/hooks/useProductionNotes';
import { TAG_OPTIONS, TAG_CONFIG, IMPACT_OPTIONS, DEPARTMENT_OPTIONS } from './note-constants';
import { toast } from 'sonner';
import { SquarePen, AlertCircle } from 'lucide-react';

interface NoteFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultLine?: string | null;
  defaultDepartment?: NoteDepartment | null;
}

interface LineOption {
  id: string;
  line_id: string;
  name: string | null;
}

interface WorkOrderOption {
  id: string;
  po_number: string;
  buyer: string | null;
  style: string | null;
}

export function NoteFormDialog({ open, onOpenChange, defaultLine, defaultDepartment }: NoteFormDialogProps) {
  const { profile } = useAuth();
  const { createNote } = useProductionNotes();
  const factoryId = profile?.factory_id;

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [lineId, setLineId] = useState<string>('');
  const [department, setDepartment] = useState<string>('');
  const [workOrderId, setWorkOrderId] = useState<string>('');
  const [tag, setTag] = useState<NoteTag>('other');
  const [impact, setImpact] = useState<string>('');

  const [lines, setLines] = useState<LineOption[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrderOption[]>([]);

  useEffect(() => {
    if (!factoryId || !open) return;

    supabase
      .from('lines')
      .select('id, line_id, name')
      .eq('factory_id', factoryId)
      .eq('is_active', true)
      .order('line_id')
      .then(async ({ data }) => {
        const { sortByLineName } = await import("@/lib/sort-lines");
        setLines(sortByLineName(data || [], l => l.name || l.line_id));
      });

    supabase
      .from('work_orders')
      .select('id, po_number, buyer, style')
      .eq('factory_id', factoryId)
      .eq('is_active', true)
      .order('po_number')
      .then(({ data }) => setWorkOrders((data || []) as WorkOrderOption[]));
  }, [factoryId, open]);

  useEffect(() => {
    if (open) {
      setLineId(defaultLine || '');
      setDepartment(defaultDepartment || '');
      setTag('other');
      setImpact('');
      setTitle('');
      setBody('');
      setWorkOrderId('');
    }
  }, [open, defaultLine, defaultDepartment]);

  // Auto-suggest title
  useEffect(() => {
    if (title) return;
    const parts: string[] = [];
    const selectedLine = lines.find(l => l.id === lineId);
    if (selectedLine) parts.push(selectedLine.name || selectedLine.line_id);
    if (department) parts.push(department.charAt(0).toUpperCase() + department.slice(1));
    const tagLabel = TAG_OPTIONS.find(t => t.value === tag)?.label;
    if (tagLabel && tag !== 'other') parts.push(tagLabel.toLowerCase());
    if (parts.length > 0) setTitle(parts.join(' — '));
  }, [lineId, department, tag, lines]);

  const cleanVal = (v: string) => (v && v !== '__none') ? v : null;
  const cleanLineId = cleanVal(lineId);
  const cleanDept = cleanVal(department);
  const cleanWo = cleanVal(workOrderId);
  const cleanImpact = cleanVal(impact);
  const hasAnchor = cleanLineId || cleanDept || cleanWo;

  const handleSubmit = async () => {
    if (!title.trim() || !body.trim() || !hasAnchor) return;

    try {
      await createNote.mutateAsync({
        title: title.trim(),
        body: body.trim(),
        line_id: cleanLineId,
        department: (cleanDept as NoteDepartment) || null,
        work_order_id: cleanWo,
        tag,
        impact: (cleanImpact as NoteImpact) || null,
      });
      toast.success('Production note created');
      onOpenChange(false);
    } catch (err: any) {
      console.error('Failed to create note:', err);
      toast.error(err?.message || 'Failed to create note');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="px-5 pt-5 pb-3">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
                <SquarePen className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-base">Add Production Note</DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Log production context for your team</p>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-5 pb-2 space-y-4">
          {/* Title */}
          <div>
            <Label htmlFor="note-title" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Title</Label>
            <Input
              id="note-title"
              placeholder="e.g., Line 2 output decrease"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1.5 h-10 bg-muted/30 border-border/50 focus:bg-background transition-colors"
            />
          </div>

          {/* Anchor section */}
          <div className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Anchor (at least one required)</p>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <Label className="text-[11px]">Line</Label>
                <Select value={lineId} onValueChange={setLineId}>
                  <SelectTrigger className="mt-1 h-9 text-xs bg-background">
                    <SelectValue placeholder="Select line" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">None</SelectItem>
                    {lines.map(line => (
                      <SelectItem key={line.id} value={line.id}>
                        {line.name || line.line_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px]">Department</Label>
                <Select value={department} onValueChange={setDepartment}>
                  <SelectTrigger className="mt-1 h-9 text-xs bg-background">
                    <SelectValue placeholder="Select dept" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">None</SelectItem>
                    {DEPARTMENT_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-[11px]">PO / Style</Label>
              <Select value={workOrderId} onValueChange={setWorkOrderId}>
                <SelectTrigger className="mt-1 h-9 text-xs bg-background">
                  <SelectValue placeholder="Select PO (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {workOrders.map(wo => (
                    <SelectItem key={wo.id} value={wo.id}>
                      {wo.po_number} — {wo.buyer || ''} {wo.style || ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!hasAnchor && (
              <div className="flex items-center gap-1.5 text-[11px] text-destructive">
                <AlertCircle className="h-3 w-3" />
                Select at least one anchor
              </div>
            )}
          </div>

          {/* Tag + Impact */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</Label>
              <Select value={tag} onValueChange={(v) => setTag(v as NoteTag)}>
                <SelectTrigger className="mt-1.5 h-9 text-xs bg-muted/30 border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TAG_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <span className={`flex items-center gap-2 ${TAG_CONFIG[opt.value].text}`}>
                        {TAG_CONFIG[opt.value].icon}
                        <span className="text-foreground">{opt.label}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Impact</Label>
              <Select value={impact} onValueChange={setImpact}>
                <SelectTrigger className="mt-1.5 h-9 text-xs bg-muted/30 border-border/50">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {IMPACT_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Body */}
          <div>
            <Label htmlFor="note-body" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Note</Label>
            <Textarea
              id="note-body"
              placeholder="Describe the issue, cause, or context..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              className="mt-1.5 bg-muted/30 border-border/50 focus:bg-background transition-colors resize-none"
            />
            <p className="text-[10px] text-muted-foreground/60 mt-1 italic">
              Focus on causes and actions. Avoid naming individuals.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border/50 bg-muted/20 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="h-9">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!title.trim() || !body.trim() || !hasAnchor || createNote.isPending}
            className="h-9 min-w-[100px] shadow-sm"
          >
            {createNote.isPending ? 'Saving...' : 'Save Note'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
