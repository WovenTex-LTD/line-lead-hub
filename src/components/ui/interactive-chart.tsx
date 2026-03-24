import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from "react";
import { AreaChart, ResponsiveContainer } from "recharts";
import { RotateCcw, GripVertical, GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

const X_AXIS_HEIGHT = 40;
const MIN_VISIBLE_POINTS = 3;

const RANGE_PRESETS = [
  { label: "7D", days: 7 },
  { label: "14D", days: 14 },
  { label: "30D", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "12M", days: 365 },
] as const;

interface InteractiveChartProps {
  /** Full dataset */
  data: any[];
  /** AreaChart children */
  children: ReactNode;
  /** Chart height in px */
  height?: number;
  /** Currently active fetch period in days (drives preset highlighting) */
  activePeriod?: number;
  /** Called when a preset is clicked — should update the page-level period */
  onPeriodChange?: (days: number) => void;
  /** Current Y-axis domain [min, max] */
  yDomain?: [number, number];
  /** Called with new [min, max] when the Y-axis is dragged */
  onYDomainChange?: (domain: [number, number]) => void;
  /** Resets Y-axis to auto domain */
  onYReset?: () => void;
  /** Whether the Y domain has been manually adjusted */
  isYCustom?: boolean;
  /** Width (px) of the Y-axis grab zone */
  yAxisWidth?: number;
  /** Message shown when data is empty */
  emptyMessage?: string;
  className?: string;
}

export function InteractiveChart({
  data,
  children,
  height = 300,
  activePeriod,
  onPeriodChange,
  yDomain,
  onYDomainChange,
  onYReset,
  isYCustom = false,
  yAxisWidth = 55,
  emptyMessage = "No data available for this period",
  className,
}: InteractiveChartProps) {
  // ─── X-axis range (indices into the data array) ────────────────
  const [xStart, setXStart] = useState(0);
  const [xEnd, setXEnd] = useState(Math.max(0, data.length - 1));

  useEffect(() => {
    setXStart(0);
    setXEnd(Math.max(0, data.length - 1));
  }, [data.length]);

  const safeStart = Math.min(xStart, Math.max(0, data.length - 1));
  const safeEnd = Math.min(xEnd, Math.max(0, data.length - 1));

  const visibleData = useMemo(
    () => data.slice(safeStart, safeEnd + 1),
    [data, safeStart, safeEnd]
  );

  // Which preset chip is active: match by page-level period,
  // but show "Custom" if the user has manually panned the X-axis.
  const isRangeCustom =
    safeStart !== 0 || safeEnd !== Math.max(0, data.length - 1);

  const activePreset = useMemo(() => {
    if (isRangeCustom) return "Custom";
    const match = RANGE_PRESETS.find((p) => p.days === activePeriod);
    return match?.label ?? null;
  }, [activePeriod, isRangeCustom]);

  const showReset = isRangeCustom || isYCustom;

  // ─── Presets (change page-level period) ────────────────────────
  const applyPreset = useCallback(
    (preset: (typeof RANGE_PRESETS)[number]) => {
      // Reset any manual X-axis panning
      setXStart(0);
      setXEnd(Math.max(0, data.length - 1));
      // Ask the page to fetch the right period
      onPeriodChange?.(preset.days);
    },
    [data.length, onPeriodChange]
  );

  const handleReset = useCallback(() => {
    setXStart(0);
    setXEnd(Math.max(0, data.length - 1));
    onYReset?.();
  }, [data.length, onYReset]);

  // ─── Drag state ────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    axis: "x" | "y";
    startX: number;
    startY: number;
    startXRange: [number, number];
    startYDomain: [number, number];
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [cursorZone, setCursorZone] = useState<"x" | "y" | null>(null);

  const getZone = useCallback(
    (clientX: number, clientY: number): "x" | "y" | null => {
      if (!containerRef.current) return null;
      const rect = containerRef.current.getBoundingClientRect();
      const relX = clientX - rect.left;
      const relY = clientY - rect.top;
      if (relX <= yAxisWidth) return "y";
      if (relY >= rect.height - X_AXIS_HEIGHT) return "x";
      return null;
    },
    [yAxisWidth]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "touch") return;
      const zone = getZone(e.clientX, e.clientY);
      if (!zone) return;
      if (zone === "y" && (!yDomain || !onYDomainChange)) return;

      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragState.current = {
        axis: zone,
        startX: e.clientX,
        startY: e.clientY,
        startXRange: [safeStart, safeEnd],
        startYDomain: yDomain ? [...yDomain] : [0, 0],
      };
      setIsDragging(true);
    },
    [getZone, yDomain, onYDomainChange, safeStart, safeEnd]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) {
        setCursorZone(
          e.pointerType === "touch" ? null : getZone(e.clientX, e.clientY)
        );
        return;
      }
      if (!dragState.current) return;
      e.preventDefault();
      const ds = dragState.current;

      if (ds.axis === "y" && onYDomainChange) {
        const dy = e.clientY - ds.startY;
        const domainRange = ds.startYDomain[1] - ds.startYDomain[0];
        const shift = (dy / height) * domainRange;
        const newMin = Math.max(0, ds.startYDomain[0] + shift);
        const newMax = ds.startYDomain[1] + shift;
        if (newMax > newMin && isFinite(newMin) && isFinite(newMax)) {
          onYDomainChange([Math.round(newMin), Math.round(newMax)]);
        }
      }

      if (ds.axis === "x") {
        const dx = e.clientX - ds.startX;
        const chartWidth =
          (containerRef.current?.getBoundingClientRect().width ?? 500) -
          yAxisWidth -
          10;
        const visibleCount = ds.startXRange[1] - ds.startXRange[0] + 1;
        const shift = Math.round((dx / chartWidth) * visibleCount);

        let newStart = ds.startXRange[0] - shift;
        let newEnd = ds.startXRange[1] - shift;

        if (newStart < 0) {
          newEnd -= newStart;
          newStart = 0;
        }
        if (newEnd >= data.length) {
          newStart -= newEnd - data.length + 1;
          newEnd = data.length - 1;
        }
        newStart = Math.max(0, newStart);
        newEnd = Math.min(data.length - 1, newEnd);

        if (newEnd > newStart) {
          setXStart(newStart);
          setXEnd(newEnd);
        }
      }
    },
    [isDragging, getZone, height, yAxisWidth, onYDomainChange, data.length]
  );

  const handlePointerUp = useCallback(() => {
    dragState.current = null;
    setIsDragging(false);
  }, []);

  // ─── Scroll-wheel zoom on axes ────────────────────────────────
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      const zone = getZone(e.clientX, e.clientY);
      if (!zone) return;
      e.preventDefault();

      if (zone === "y" && yDomain && onYDomainChange) {
        const range = yDomain[1] - yDomain[0];
        const factor = e.deltaY > 0 ? 1.15 : 0.87;
        const newRange = Math.max(100, range * factor);
        const center = (yDomain[0] + yDomain[1]) / 2;
        const newMin = Math.max(0, Math.round(center - newRange / 2));
        const newMax = Math.round(center + newRange / 2);
        onYDomainChange([newMin, newMax]);
      }

      if (zone === "x") {
        const visibleCount = safeEnd - safeStart + 1;
        const factor = e.deltaY > 0 ? 1.3 : 0.7;
        let newCount = Math.round(visibleCount * factor);
        newCount = Math.max(
          MIN_VISIBLE_POINTS,
          Math.min(data.length, newCount)
        );
        const center = (safeStart + safeEnd) / 2;
        let newStart = Math.round(center - newCount / 2);
        let newEnd = newStart + newCount - 1;

        if (newStart < 0) {
          newEnd -= newStart;
          newStart = 0;
        }
        if (newEnd >= data.length) {
          newStart -= newEnd - data.length + 1;
          newEnd = data.length - 1;
        }
        newStart = Math.max(0, newStart);
        newEnd = Math.min(data.length - 1, newEnd);

        if (newEnd > newStart) {
          setXStart(newStart);
          setXEnd(newEnd);
        }
      }
    },
    [getZone, yDomain, onYDomainChange, safeStart, safeEnd, data.length]
  );

  // ─── Render ────────────────────────────────────────────────────

  if (data.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center text-muted-foreground rounded-lg border border-dashed",
          className
        )}
        style={{ height }}
      >
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      {/* Preset chips + Reset */}
      <div className="flex items-center gap-1 justify-end mb-1.5">
        {RANGE_PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => applyPreset(preset)}
            className={cn(
              "px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors duration-150",
              activePreset === preset.label
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {preset.label}
          </button>
        ))}
        {showReset && (
          <button
            onClick={handleReset}
            className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors duration-150"
            title="Reset to default view"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        )}
      </div>

      {/* Chart with draggable axes */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        className={cn(
          "relative select-none",
          cursorZone === "y" && !isDragging && "cursor-ns-resize",
          cursorZone === "x" && !isDragging && "cursor-ew-resize",
          isDragging && "cursor-grabbing"
        )}
      >
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart
            data={visibleData}
            margin={{ top: 5, right: 5, bottom: 5, left: 0 }}
          >
            {children}
          </AreaChart>
        </ResponsiveContainer>

        {/* Y-axis hover highlight */}
        <div
          className={cn(
            "absolute top-0 left-0 pointer-events-none flex items-center justify-center transition-opacity duration-200",
            cursorZone === "y" ||
              (isDragging && dragState.current?.axis === "y")
              ? "opacity-100"
              : "opacity-0"
          )}
          style={{ width: yAxisWidth, height: height - X_AXIS_HEIGHT }}
        >
          <div className="absolute inset-0 bg-primary/[0.07] rounded-r-md border-r-2 border-primary/20" />
          <GripVertical className="h-5 w-5 text-primary/40 relative z-[1]" />
        </div>

        {/* X-axis hover highlight */}
        <div
          className={cn(
            "absolute bottom-0 pointer-events-none flex items-center justify-center transition-opacity duration-200",
            cursorZone === "x" ||
              (isDragging && dragState.current?.axis === "x")
              ? "opacity-100"
              : "opacity-0"
          )}
          style={{ left: yAxisWidth, right: 0, height: X_AXIS_HEIGHT }}
        >
          <div className="absolute inset-0 bg-primary/[0.07] rounded-t-md border-t-2 border-primary/20" />
          <GripHorizontal className="h-5 w-5 text-primary/40 relative z-[1]" />
        </div>
      </div>
    </div>
  );
}
