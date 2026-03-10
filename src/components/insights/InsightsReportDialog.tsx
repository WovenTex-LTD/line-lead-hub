import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface InsightsReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InsightsReportDialog({ open, onOpenChange }: InsightsReportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Insights Report</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Insights report generation coming soon.</p>
      </DialogContent>
    </Dialog>
  );
}
