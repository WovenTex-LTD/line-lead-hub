import { useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, PenLine, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useUserSignature } from "@/hooks/useUserSignature";

interface SignatureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SignatureModal({ open, onOpenChange }: SignatureModalProps) {
  const { saveSignature } = useUserSignature();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"draw" | "upload">("draw");

  // ── Canvas drawing helpers ──────────────────────────────────────────────
  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasStrokes(true);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    e.preventDefault();
    const { x, y } = getPos(e, canvas);
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  function stopDraw() {
    setIsDrawing(false);
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  }

  // ── File upload ─────────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    const reader = new FileReader();
    reader.onload = () => setUploadPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  // ── Save ────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    try {
      if (tab === "draw") {
        const canvas = canvasRef.current;
        if (!canvas || !hasStrokes) {
          toast.error("Please draw your signature first.");
          return;
        }
        const dataUrl = canvas.toDataURL("image/png");
        await saveSignature.mutateAsync(dataUrl);
      } else {
        if (!uploadFile) {
          toast.error("Please upload a signature image.");
          return;
        }
        await saveSignature.mutateAsync(uploadFile);
      }
      toast.success("Signature registered successfully.");
      onOpenChange(false);
    } catch (err: unknown) {
      console.error("Signature save error:", err);
      const msg = err instanceof Error
        ? err.message
        : (err as any)?.message || "Failed to save signature.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  function handleClose(open: boolean) {
    if (!open) {
      clearCanvas();
      setUploadFile(null);
      setUploadPreview(null);
      setTab("draw");
    }
    onOpenChange(open);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Register Approval Signature</DialogTitle>
          <DialogDescription>
            Your signature will be embedded in approved gate pass PDFs.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="w-full">
            <TabsTrigger value="draw" className="flex-1">
              <PenLine className="h-4 w-4 mr-2" />
              Draw
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex-1">
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </TabsTrigger>
          </TabsList>

          {/* ── Draw tab ─────────────────────────────────────────────── */}
          <TabsContent value="draw" className="mt-4 space-y-2">
            <div className="rounded-lg overflow-hidden border-2 border-dashed border-border bg-white">
              <canvas
                ref={canvasRef}
                width={480}
                height={180}
                className="w-full cursor-crosshair touch-none block"
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={stopDraw}
                onMouseLeave={stopDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={stopDraw}
              />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Sign with mouse or finger</p>
              <Button variant="ghost" size="sm" onClick={clearCanvas} className="h-7 text-xs">
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Clear
              </Button>
            </div>
          </TabsContent>

          {/* ── Upload tab ───────────────────────────────────────────── */}
          <TabsContent value="upload" className="mt-4 space-y-2">
            {uploadPreview ? (
              <div className="space-y-2">
                <div className="rounded-lg border border-border bg-white p-4">
                  <img
                    src={uploadPreview}
                    alt="Signature preview"
                    className="w-full max-h-36 object-contain"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => { setUploadPreview(null); setUploadFile(null); }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Remove
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-border rounded-lg py-8 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
              >
                <Upload className="h-8 w-8" />
                <span className="text-sm font-medium">Click to upload signature</span>
                <span className="text-xs">PNG recommended (transparent background)</span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Signature
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
