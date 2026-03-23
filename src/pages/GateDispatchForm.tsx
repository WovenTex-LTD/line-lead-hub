import { useState, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useDispatchRequest } from "@/hooks/useDispatchRequests";
import { toast } from "sonner";
import {
  Truck, AlertTriangle, Loader2, Camera, X, Package,
  User, MapPin, FileText, ChevronDown, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useDispatchMutations } from "@/hooks/useDispatchRequests";
import { Skeleton } from "@/components/ui/skeleton";
import { useDispatchPOData } from "@/hooks/useDispatchPOData";
import type { DispatchFormData } from "@/types/dispatch";

const EMPTY_FORM: DispatchFormData = {
  work_order_id: null,
  style_name: "",
  buyer_name: "",
  dispatch_quantity: "",
  carton_count: "",
  truck_number: "",
  driver_name: "",
  driver_nid: "",
  destination: "",
  remarks: "",
  photo_file: null,
};

export default function GateDispatchForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEditMode = !!id;
  const { profile } = useAuth();
  const { submitDispatch, editDispatch } = useDispatchMutations();
  const { workOrders, loading: woLoading, getDispatchableQty } = useDispatchPOData();
  const { data: existingRequest, isLoading: loadingExisting } = useDispatchRequest(id);

  const [form, setForm] = useState<DispatchFormData>(EMPTY_FORM);
  const [poOpen, setPoOpen] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Populate form when editing an existing request
  useEffect(() => {
    if (isEditMode && existingRequest) {
      setForm({
        work_order_id: existingRequest.work_order_id,
        style_name: existingRequest.style_name || "",
        buyer_name: existingRequest.buyer_name || "",
        dispatch_quantity: existingRequest.dispatch_quantity,
        carton_count: existingRequest.carton_count ?? "",
        truck_number: existingRequest.truck_number,
        driver_name: existingRequest.driver_name,
        driver_nid: existingRequest.driver_nid || "",
        destination: existingRequest.destination,
        remarks: existingRequest.remarks || "",
        photo_file: null,
      });
      if (existingRequest.photo_url) setPhotoPreview(existingRequest.photo_url);
    }
  }, [isEditMode, existingRequest]);

  // Soft warning: quantity exceeds remaining
  const dispatchableQty = form.work_order_id ? getDispatchableQty(form.work_order_id) : null;
  const qty = form.dispatch_quantity !== "" ? Number(form.dispatch_quantity) : 0;
  const overQtyWarning =
    dispatchableQty !== null && qty > 0 && qty > dispatchableQty;

  function handlePOSelect(wo: { id: string; po_number: string; style: string | null; buyer: string | null }) {
    setForm((f) => ({
      ...f,
      work_order_id: wo.id,
      style_name: wo.style || "",
      buyer_name: wo.buyer || "",
    }));
    setPoOpen(false);
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    setForm((f) => ({ ...f, photo_file: file }));
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function removePhoto() {
    setForm((f) => ({ ...f, photo_file: null }));
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function set(field: keyof DispatchFormData, value: unknown) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.truck_number.trim()) return toast.error("Truck number is required.");
    if (!form.driver_name.trim()) return toast.error("Driver name is required.");
    if (!form.destination.trim()) return toast.error("Destination is required.");
    if (!form.dispatch_quantity || Number(form.dispatch_quantity) <= 0)
      return toast.error("Dispatch quantity must be greater than 0.");

    try {
      if (isEditMode && id) {
        await editDispatch.mutateAsync({ id, formData: form, newPhotoFile: form.photo_file });
        toast.success("Dispatch request updated.");
      } else {
        await submitDispatch.mutateAsync({ formData: form, photoFile: form.photo_file });
        toast.success("Dispatch request submitted.", { description: "Waiting for admin approval." });
      }
      navigate("/dispatch/history");
    } catch (err: unknown) {
      console.error("Dispatch submit error:", err);
      const msg = err instanceof Error
        ? err.message
        : (err as any)?.message || JSON.stringify(err) || "Failed to submit dispatch.";
      toast.error(msg);
    }
  }

  const selectedWO = workOrders.find((w) => w.id === form.work_order_id);

  if (isEditMode && loadingExisting) {
    return (
      <div className="py-3 md:py-4 lg:py-6 space-y-4 max-w-2xl mx-auto">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-36 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-5 md:space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
          <Truck className="h-5 w-5 text-orange-600 dark:text-orange-400" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">{isEditMode ? "Edit Dispatch" : "New Dispatch"}</h1>
          <p className="text-sm text-muted-foreground">
            {isEditMode ? "Update your pending dispatch request" : "Submit a gate dispatch request for approval"}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Shipment Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground uppercase tracking-wide flex items-center gap-2">
              <Package className="h-4 w-4" />
              Shipment Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* PO Selector */}
            <div className="space-y-1.5">
              <Label>Work Order / PO</Label>
              <Popover open={poOpen} onOpenChange={setPoOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal h-10"
                  >
                    {selectedWO
                      ? `${selectedWO.po_number}${selectedWO.style ? ` — ${selectedWO.style}` : ""}`
                      : woLoading ? "Loading..." : "Select work order..."}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search PO or style..." />
                    <CommandList>
                      <CommandEmpty>No work orders found.</CommandEmpty>
                      <CommandGroup>
                        {workOrders.map((wo) => (
                          <CommandItem
                            key={wo.id}
                            value={`${wo.po_number} ${wo.style || ""} ${wo.buyer || ""}`}
                            onSelect={() => handlePOSelect(wo)}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                form.work_order_id === wo.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div>
                              <div className="font-medium">{wo.po_number}</div>
                              {(wo.style || wo.buyer) && (
                                <div className="text-xs text-muted-foreground">
                                  {[wo.style, wo.buyer].filter(Boolean).join(" · ")}
                                </div>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Style + Buyer (auto-filled, editable) */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Style</Label>
                <Input
                  value={form.style_name}
                  onChange={(e) => set("style_name", e.target.value)}
                  placeholder="Style name"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Buyer</Label>
                <Input
                  value={form.buyer_name}
                  onChange={(e) => set("buyer_name", e.target.value)}
                  placeholder="Buyer name"
                />
              </div>
            </div>

            {/* Dispatch Qty */}
            <div className="space-y-1.5">
              <Label>
                Dispatch Quantity <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                min={1}
                value={form.dispatch_quantity}
                onChange={(e) =>
                  set("dispatch_quantity", e.target.value === "" ? "" : Number(e.target.value))
                }
                placeholder="Enter quantity (pcs)"
              />
              {/* Remaining info */}
              {form.work_order_id && dispatchableQty !== null && (
                <p className="text-xs text-muted-foreground">
                  Remaining dispatchable: <span className="font-medium">{dispatchableQty.toLocaleString()} pcs</span>
                </p>
              )}
              {/* Soft warning */}
              {overQtyWarning && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2.5 mt-1">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    This exceeds the remaining dispatchable quantity ({dispatchableQty?.toLocaleString()} pcs). You may still submit.
                  </p>
                </div>
              )}
            </div>

            {/* Carton Count */}
            <div className="space-y-1.5">
              <Label>Carton Count <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Input
                type="number"
                min={1}
                value={form.carton_count}
                onChange={(e) =>
                  set("carton_count", e.target.value === "" ? "" : Number(e.target.value))
                }
                placeholder="Number of cartons"
              />
            </div>
          </CardContent>
        </Card>

        {/* Vehicle Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground uppercase tracking-wide flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Vehicle Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>
                Truck / Vehicle Number <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.truck_number}
                onChange={(e) => set("truck_number", e.target.value)}
                placeholder="e.g. Dhaka Metro A 12-3456"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>
                  Driver Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.driver_name}
                  onChange={(e) => set("driver_name", e.target.value)}
                  placeholder="Full name"
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Driver NID <span className="text-xs text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  value={form.driver_nid}
                  onChange={(e) => set("driver_nid", e.target.value)}
                  placeholder="National ID number"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground uppercase tracking-wide flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>
                Destination <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.destination}
                onChange={(e) => set("destination", e.target.value)}
                placeholder="e.g. Chittagong Port, Buyer Warehouse"
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                Remarks <span className="text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                value={form.remarks}
                onChange={(e) => set("remarks", e.target.value)}
                placeholder="Any additional notes..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Photo Attachment */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground uppercase tracking-wide flex items-center gap-2">
              <Camera className="h-4 w-4" />
              Photo <span className="text-xs font-normal text-muted-foreground normal-case">(optional)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {photoPreview ? (
              <div className="relative w-full">
                <img
                  src={photoPreview}
                  alt="Dispatch photo"
                  className="rounded-lg w-full max-h-64 object-cover"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="absolute top-2 right-2 h-7 w-7"
                  onClick={removePhoto}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-border rounded-lg py-8 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
              >
                <Camera className="h-8 w-8" />
                <span className="text-sm font-medium">Tap to attach photo</span>
                <span className="text-xs">JPG, PNG up to 10MB</span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChange}
            />
          </CardContent>
        </Card>

        {/* Submit */}
        <Button
          type="submit"
          className="w-full h-11 bg-orange-600 hover:bg-orange-700 text-white"
          disabled={submitDispatch.isPending || editDispatch.isPending}
        >
          {(submitDispatch.isPending || editDispatch.isPending) ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{isEditMode ? "Saving..." : "Submitting..."}</>
          ) : (
            <><Truck className="h-4 w-4 mr-2" />{isEditMode ? "Save Changes" : "Submit Dispatch Request"}</>
          )}
        </Button>
      </form>
    </div>
  );
}
