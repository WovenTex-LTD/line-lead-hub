import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface ResolveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolve: (summary: string, actionTaken: string) => void;
  loading?: boolean;
}

export function ResolveDialog({ open, onOpenChange, onResolve, loading }: ResolveDialogProps) {
  const [summary, setSummary] = useState('');
  const [actionTaken, setActionTaken] = useState('');

  const handleResolve = () => {
    if (!summary.trim()) return;
    onResolve(summary.trim(), actionTaken.trim());
    setSummary('');
    setActionTaken('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Resolve Note</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="resolution-summary">Resolution Summary *</Label>
            <Textarea
              id="resolution-summary"
              placeholder="What resolved this issue?"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="action-taken">Action Taken (optional)</Label>
            <Textarea
              id="action-taken"
              placeholder="What action was taken?"
              value={actionTaken}
              onChange={(e) => setActionTaken(e.target.value)}
              rows={2}
              className="mt-1.5"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleResolve} disabled={!summary.trim() || loading}>
            {loading ? 'Resolving...' : 'Mark Resolved'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
