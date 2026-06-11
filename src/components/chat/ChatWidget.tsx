import { useState, useEffect } from "react";
import { X, Minimize2, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatPanel } from "./ChatPanel";
import { LinaGlyph } from "./LinaMark";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const { user, profile } = useAuth();

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Auto fullscreen on mobile
  useEffect(() => {
    if (isMobile && isOpen) setIsFullscreen(true);
  }, [isMobile, isOpen]);

  // Fade the launcher hint + pulse after a few seconds
  useEffect(() => {
    const timer = setTimeout(() => setShowHint(false), 6500);
    return () => clearTimeout(timer);
  }, []);

  if (!user) return null;
  if (!profile?.factory_id) return null;

  return (
    <>
      {/* Chat Panel */}
      {isOpen && (
        <div
          className={cn(
            "fixed z-50 flex flex-col bg-background animate-in fade-in duration-300",
            isFullscreen
              ? "inset-0 zoom-in-95"
              : "top-0 bottom-0 right-0 w-[480px] max-w-[92vw] rounded-l-2xl shadow-premium-xl ring-1 ring-border/70 overflow-hidden slide-in-from-right"
          )}
        >
          {/* Header — deep-blue gradient with Lina's identity */}
          <header className="relative flex items-center justify-between gap-2 px-4 py-3 bg-gradient-to-r from-primary via-primary to-primary/85 text-primary-foreground">
            <div className="flex items-center gap-3 min-w-0">
              {/* Header mark (translucent on the blue header) */}
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-white/15 backdrop-blur-sm ring-1 ring-white/20 text-white">
                <LinaGlyph className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm leading-none tracking-tight">Lina</span>
                  <span className="rounded bg-white/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-white/90">
                    AI
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-white/70">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_6px_1px_rgba(110,231,183,0.7)]" />
                  Production assistant
                </div>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              {!isMobile && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg text-white/80 hover:text-white hover:bg-white/15"
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  aria-label={isFullscreen ? "Exit fullscreen" : "Expand to fullscreen"}
                >
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg text-white/80 hover:text-white hover:bg-white/15"
                onClick={() => setIsOpen(false)}
                aria-label="Close Lina"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </header>

          {/* Chat Content */}
          <ChatPanel />
        </div>
      )}

      {/* Floating launcher */}
      {!isOpen && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3">
          {showHint && (
            <button
              onClick={() => setIsOpen(true)}
              className="hidden sm:flex animate-fade-in items-center gap-2 rounded-full bg-card/90 px-3.5 py-2 text-sm font-medium text-foreground shadow-premium-md ring-1 ring-border/70 backdrop-blur transition-all duration-200 hover:shadow-premium-lg"
            >
              Ask <span className="font-semibold text-primary">Lina</span>
            </button>
          )}
          <button
            onClick={() => setIsOpen(true)}
            aria-label="Open Lina, the production assistant"
            className="group relative grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary via-primary to-primary/70 text-primary-foreground shadow-glow-lg ring-1 ring-white/15 transition-all duration-300 hover:scale-105 hover:-translate-y-0.5 active:scale-95"
          >
            {showHint && (
              <span className="absolute inset-0 rounded-2xl bg-primary/30 animate-ping [animation-duration:2.4s]" />
            )}
            <LinaGlyph className="relative h-8 w-8 text-primary-foreground" />
          </button>
        </div>
      )}
    </>
  );
}
