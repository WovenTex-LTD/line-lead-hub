import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  CheckSquare, Truck, Package, User, MapPin, FileText,
  Loader2, AlertTriangle, CheckCircle2, XCircle, PenLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useDispatchRequest, useDispatchMutations } from "@/hooks/useDispatchRequests";
import { useUserSignature } from "@/hooks/useUserSignature";
import { useDispatchPOData } from "@/hooks/useDispatchPOData";
import { useAuth } from "@/contexts/AuthContext";
import { generateGatePassPDF } from "@/lib/report-pdf";
import { supabase } from "@/integrations/supabase/client";

function InfoGrid({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
      {items.map(({ label, value }) => (
        <div key={label}>
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</div>
          <div className="text-sm font-medium mt-0.5">{value || "—"}</div>
        </div>
      ))}
    </div>
  );
}

export default function DispatchReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, factory } = useAuth();
  const { data: request, isLoading } = useDispatchRequest(id);
  const { approveDispatch, rejectDispatch } = useDispatchMutations();
  const { signature } = useUserSignature(profile?.id);
  const { getDispatchableQty, workOrders } = useDispatchPOData();

  const [approving, setApproving] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [noSigOpen, setNoSigOpen] = useState(false);

  // Production cross-reference for selected PO
  const woData = workOrders.find((w) => request?.work_order_id && w.id === request.work_order_id);
  const remaining = woData ? woData.remaining_qty : null;
  const totalDispatched = woData ? woData.total_dispatched : 0;
  const overQty =
    remaining !== null && request && request.dispatch_quantity > remaining;

  async function handleApprove() {
    if (!signature?.signature_url) {
      setNoSigOpen(true);
      return;
    }
    if (!request || !profile || !factory) return;

    setApproving(true);
    try {
      // Generate PDF client-side — pass the signature URL directly
      const pdfBytes = await generateGatePassPDF({
        request,
        approverName: profile.full_name || "Admin",
        signatureUrl: signature.signature_url,
        factoryName: factory.name || "Factory",
        woData: woData
          ? { order_qty: woData.order_qty, total_dispatched: woData.total_dispatched }
          : null,
      });

      // Upload to gate-passes bucket
      const pdfPath = `${request.factory_id}/${request.reference_number}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("gate-passes")
        .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });

      if (uploadError) throw new Error(`PDF upload failed: ${uploadError.message}`);

      const { data: urlData } = supabase.storage
        .from("gate-passes")
        .getPublicUrl(pdfPath);

      await approveDispatch.mutateAsync({ id: request.id, gatePdfUrl: urlData.publicUrl });

      toast.success("Dispatch approved.", { description: `Gate pass generated for ${request.reference_number}` });
      navigate("/dispatch/approvals");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Approval failed.";
      toast.error(msg);
    } finally {
      setApproving(false);
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) {
      toast.error("A rejection reason is required.");
      return;
    }
    if (!request) return;

    setRejecting(true);
    try {
      await rejectDispatch.mutateAsync({ id: request.id, reason: rejectReason.trim() });
      toast.success("Dispatch rejected.");
      navigate("/dispatch/approvals");
    } catch {
      toast.error("Failed to reject request.");
    } finally {
      setRejecting(false);
      setRejectOpen(false);
    }
  }

  if (isLoading) {
    return (
      <div className="py-3 md:py-4 lg:py-6 space-y-5">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="py-3 md:py-4 lg:py-6 text-center text-muted-foreground">
        Dispatch request not found.
      </div>
    );
  }

  const isPending = request.status === "pending";

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-5 md:space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
          <CheckSquare className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Review Dispatch</h1>
          <p className="text-sm font-mono text-muted-foreground">{request.reference_number}</p>
        </div>
      </div>

      {/* Already reviewed notice */}
      {!isPending && (
        <div className={`flex items-center gap-2.5 rounded-xl px-4 py-3 border ${
          request.status === "approved"
            ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400"
            : "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400"
        }`}>
          {request.status === "approved" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0" />
          )}
          <span className="text-sm font-medium capitalize">
            This request was {request.status}
            {request.reviewed_at && ` on ${format(new Date(request.reviewed_at), "MMM d, yyyy 'at' h:mm a")}`}
          </span>
        </div>
      )}

      {/* Shipment Details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide flex items-center gap-2">
            <Package className="h-4 w-4" />
            Shipment Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <InfoGrid items={[
            { label: "Reference", value: <span className="font-mono">{request.reference_number}</span> },
            { label: "Date", value: format(new Date(request.submitted_at), "MMM d, yyyy h:mm a") },
            { label: "PO Number", value: request.work_order?.po_number },
            { label: "Style", value: request.style_name },
            { label: "Buyer", value: request.buyer_name },
            { label: "Dispatch Qty", value: `${request.dispatch_quantity.toLocaleString()} pcs` },
            { label: "Carton Count", value: request.carton_count ? `${request.carton_count} ctns` : null },
            { label: "Destination", value: request.destination },
            { label: "Truck No.", value: request.truck_number },
            { label: "Driver", value: request.driver_name },
            { label: "Driver NID", value: request.driver_nid },
            { label: "Submitted By", value: request.submitter?.full_name },
          ]} />
          {request.remarks && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Remarks</div>
              <p className="text-sm">{request.remarks}</p>
            </div>
          )}
          {request.photo_url && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">Photo</div>
              <img
                src={request.photo_url}
                alt="Dispatch photo"
                className="rounded-lg w-full max-h-64 object-cover"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Production Cross-Reference */}
      {woData && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Production Cross-Reference
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InfoGrid items={[
              { label: "Order Qty", value: woData.order_qty != null ? `${woData.order_qty.toLocaleString()} pcs` : "—" },
              { label: "Previously Dispatched", value: `${totalDispatched.toLocaleString()} pcs` },
              {
                label: "This Dispatch",
                value: <span className={overQty ? "text-amber-600 font-semibold" : ""}>
                  {request.dispatch_quantity.toLocaleString()} pcs
                </span>
              },
              {
                label: "Remaining After This",
                value: remaining != null ? (
                  <span className={(remaining - request.dispatch_quantity) < 0 ? "text-red-600" : ""}>
                    {(remaining - request.dispatch_quantity).toLocaleString()} pcs
                  </span>
                ) : "—"
              },
            ]} />
            {overQty && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2.5">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  This dispatch exceeds the remaining quantity for this PO.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Approve / Reject buttons */}
      {isPending && (
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            className="h-12 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-400"
            onClick={() => setRejectOpen(true)}
          >
            <XCircle className="h-4 w-4 mr-2" />
            Reject
          </Button>
          <Button
            className="h-12 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={handleApprove}
            disabled={approving}
          >
            {approving ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Approving...</>
            ) : (
              <><CheckCircle2 className="h-4 w-4 mr-2" />Approve</>
            )}
          </Button>
        </div>
      )}

      {/* Rejection dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Dispatch Request</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting <span className="font-mono font-semibold">{request.reference_number}</span>.
              The gate officer will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label>Rejection Reason <span className="text-destructive">*</span></Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain why this dispatch is being rejected..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejecting || !rejectReason.trim()}
            >
              {rejecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* No signature dialog */}
      <Dialog open={noSigOpen} onOpenChange={setNoSigOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Signature Required</DialogTitle>
            <DialogDescription>
              You need to register your approval signature before you can approve dispatch requests.
              Your signature is embedded in the gate pass PDF.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoSigOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                setNoSigOpen(false);
                navigate("/preferences");
              }}
            >
              <PenLine className="h-4 w-4 mr-2" />
              Register Signature
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
