import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Lina's emblem — the robot mark, rendered monochrome via currentColor so it
 * sits cleanly white-on-blue inside her squircle. Crisp from 16px up.
 */
export function LinaGlyph({ className }: { className?: string }) {
  return <Bot className={className} strokeWidth={2} aria-hidden="true" />;
}

/**
 * Lina's identity mark — the mascot glyph in a deep-blue gradient squircle.
 * Used in the launcher, panel header, and on every assistant message so the
 * agent has one consistent, branded presence.
 */
const SIZES = {
  sm: { box: "h-8 w-8 rounded-[9px]", glyph: "h-5 w-5", ring: "ring-1" },
  md: { box: "h-9 w-9 rounded-[10px]", glyph: "h-6 w-6", ring: "ring-1" },
  lg: { box: "h-16 w-16 rounded-[18px]", glyph: "h-10 w-10", ring: "ring-2" },
} as const;

interface LinaMarkProps {
  size?: keyof typeof SIZES;
  /** Accepted for API compatibility; the mascot's amber knot is the accent. */
  live?: boolean;
  /** Add a soft brand glow behind the mark. */
  glow?: boolean;
  className?: string;
}

export function LinaMark({ size = "md", glow = false, className }: LinaMarkProps) {
  const s = SIZES[size];
  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center bg-gradient-to-br from-primary via-primary to-primary/65 text-primary-foreground select-none",
        s.box,
        s.ring,
        "ring-white/15",
        glow ? "shadow-glow" : "shadow-premium-sm",
        className
      )}
      aria-hidden="true"
    >
      <LinaGlyph className={s.glyph} />
    </div>
  );
}
