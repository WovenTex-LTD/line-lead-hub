import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  FileDown, ArrowLeft, Loader2, CheckCircle2, Package, Truck, MapPin, User, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useDispatchRequest } from "@/hooks/useDispatchRequests";
import { isNative } from "@/lib/capacitor";

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-4 py-2.5 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-right">{value || "—"}</span>
    </div>
  );
}

export default function GatePassView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: request, isLoading } = useDispatchRequest(id);

  function handleDownload() {
    if (!request?.gate_pass_pdf_url) return;
    window.open(request.gate_pass_pdf_url, "_blank");
  }

  if (isLoading) {
    return (
      <div className="py-3 md:py-4 lg:py-6 space-y-5">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="py-3 md:py-4 lg:py-6 text-center text-muted-foreground">
        Gate pass not found.
      </div>
    );
  }

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-5 md:space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Gate Pass</h1>
            <p className="text-sm font-mono text-muted-foreground">{request.reference_number}</p>
          </div>
        </div>
        {request.gate_pass_pdf_url && (
          <Button
            onClick={handleDownload}
            className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
          >
            <FileDown className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        )}
      </div>

      {/* Status banner */}
      <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 border bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span className="text-sm font-medium">
          Approved on {request.reviewed_at ? format(new Date(request.reviewed_at), "MMM d, yyyy 'at' h:mm a") : "—"}
          {request.reviewer?.full_name && ` by ${request.reviewer.full_name}`}
        </span>
      </div>

      {/* Shipment Details */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide flex items-center gap-2">
            <Package className="h-4 w-4" />
            Shipment Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <InfoRow label="Reference No." value={<span className="font-mono">{request.reference_number}</span>} />
          <InfoRow label="Date" value={format(new Date(request.submitted_at), "MMM d, yyyy h:mm a")} />
          <InfoRow label="PO Number" value={request.work_order?.po_number} />
          <InfoRow label="Style" value={request.style_name} />
          <InfoRow label="Buyer" value={request.buyer_name} />
          <InfoRow label="Dispatch Qty" value={`${request.dispatch_quantity.toLocaleString()} pcs`} />
          <InfoRow label="Carton Count" value={request.carton_count ? `${request.carton_count} ctns` : null} />
          <InfoRow label="Destination" value={request.destination} />
        </CardContent>
      </Card>

      {/* Vehicle Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide flex items-center gap-2">
            <Truck className="h-4 w-4" />
            Vehicle Info
          </CardTitle>
        </CardHeader>
        <CardContent>
          <InfoRow label="Truck No." value={request.truck_number} />
          <InfoRow label="Driver" value={request.driver_name} />
          <InfoRow label="Driver NID" value={request.driver_nid} />
        </CardContent>
      </Card>

      {/* Remarks */}
      {request.remarks && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Remarks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{request.remarks}</p>
          </CardContent>
        </Card>
      )}

      {/* PDF preview (web only) */}
      {request.gate_pass_pdf_url && !isNative && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide">Document Preview</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-hidden rounded-b-xl">
            <iframe
              src={request.gate_pass_pdf_url}
              className="w-full h-[600px] border-0"
              title="Gate Pass PDF"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
