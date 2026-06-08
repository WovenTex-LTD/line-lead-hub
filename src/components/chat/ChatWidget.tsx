import { useState, useEffect } from "react";
import { MessageCircle, X, Minimize2, Maximize2, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatPanel } from "./ChatPanel";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showPulse, setShowPulse] = useState(true);
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

  // Stop the pulse ring after a few seconds
  useEffect(() => {
    const timer = setTimeout(() => setShowPulse(false), 6000);
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
            "fixed z-50 bg-background border flex flex-col",
            isFullscreen
              ? "inset-0"
              : "bottom-20 right-4 w-[400px] h-[600px] max-h-[80vh] rounded-xl shadow-2xl overflow-hidden",
            "animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-300"
          )}
        >
          {/* Gradient header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-primary to-primary/85 text-white">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-white/15 backdrop-blur-sm">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <span className="font-semibold text-sm leading-none">
                  Lina
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] text-white/70">Online</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {!isMobile && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white hover:bg-white/20"
                  onClick={() => setIsFullscreen(!isFullscreen)}
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:bg-white/20"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Chat Content */}
          <ChatPanel />
        </div>
      )}

      {/* Floating Action Button */}
      {!isOpen && (
        <div className="fixed bottom-4 right-4 z-50">
          {showPulse && (
            <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping [animation-duration:2s]" />
          )}
          <Button
            onClick={() => setIsOpen(true)}
            aria-label="Open Lina, the production assistant"
            className="relative h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 active:scale-95"
            size="icon"
          >
            <MessageCircle className="h-6 w-6" />
          </Button>
        </div>
      )}
    </>
  );
}
