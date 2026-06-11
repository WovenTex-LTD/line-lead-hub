import { cn } from "@/lib/utils";

/**
 * Lina's mascot glyph — a friendly face whose "tuft" is a needle-and-thread
 * curl ending in an amber knot (a nod to the garment floor). Monochrome via
 * currentColor, so it sits cleanly white-on-blue inside her squircle; the amber
 * thread-knot is the one fixed accent. Crisp from 16px up.
 */
export function LinaGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      {/* needle-and-thread curl */}
      <path
        d="M15.8 11.4 C 15.8 7.6 19.8 6.4 20.9 9.4"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      {/* amber thread knot */}
      <circle cx="21.4" cy="9.9" r="1.7" fill="#F59E0B" />
      {/* eyes */}
      <circle cx="12.7" cy="16.8" r="1.85" fill="currentColor" />
      <circle cx="19.3" cy="16.8" r="1.85" fill="currentColor" />
      {/* smile */}
      <path
        d="M11.9 20.8 Q16 24.2 20.1 20.8"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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
