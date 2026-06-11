import { cn } from "@/lib/utils";

/**
 * Lina's identity mark — a deep-blue gradient squircle with the "L" monogram
 * and a live amber accent dot. Used in the launcher, panel header, and on every
 * assistant message so the agent has one consistent, branded presence.
 */
const SIZES = {
  sm: { box: "h-8 w-8 rounded-[9px] text-sm", dot: "h-2 w-2 -right-0.5 -top-0.5", ring: "ring-1" },
  md: { box: "h-9 w-9 rounded-[10px] text-base", dot: "h-2.5 w-2.5 -right-0.5 -top-0.5", ring: "ring-1" },
  lg: { box: "h-16 w-16 rounded-[18px] text-3xl", dot: "h-3.5 w-3.5 -right-1 -top-1", ring: "ring-2" },
} as const;

interface LinaMarkProps {
  size?: keyof typeof SIZES;
  /** Show the live amber status dot (default true). */
  live?: boolean;
  /** Add a soft brand glow behind the mark. */
  glow?: boolean;
  className?: string;
}

export function LinaMark({ size = "md", live = true, glow = false, className }: LinaMarkProps) {
  const s = SIZES[size];
  return (
    <div className={cn("relative shrink-0", className)}>
      <div
        className={cn(
          "grid place-items-center bg-gradient-to-br from-primary via-primary to-primary/65 font-semibold tracking-tight text-primary-foreground select-none",
          s.box,
          s.ring,
          "ring-white/15",
          glow ? "shadow-glow" : "shadow-premium-sm"
        )}
        aria-hidden="true"
      >
        L
      </div>
      {live && (
        <span className="absolute" style={{ right: 0, top: 0 }}>
          <span className={cn("absolute block rounded-full bg-accent ring-2 ring-card animate-pulse-subtle", s.dot)} />
        </span>
      )}
    </div>
  );
}
