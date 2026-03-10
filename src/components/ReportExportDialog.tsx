import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ReportExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children?: React.ReactNode;
}

export function ReportExportDialog({ open, onOpenChange, title = "Export Report", children }: ReportExportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children || <p className="text-sm text-muted-foreground">Export functionality coming soon.</p>}
      </DialogContent>
    </Dialog>
  );
}
