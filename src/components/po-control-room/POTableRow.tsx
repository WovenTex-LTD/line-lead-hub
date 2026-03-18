import { ChevronRight, ChevronDown, Calendar } from "lucide-react";
import { TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatShortDate } from "@/lib/date-utils";
import { POQuickActions } from "./POQuickActions";
import type { POControlRoomData } from "./types";

interface Props {
  po: POControlRoomData;
  isExpanded: boolean;
  onToggle: () => void;
  onViewExtras?: (po: POControlRoomData) => void;
  showVelocity?: boolean;
}

export function POTableRow({ po, isExpanded, onToggle, onViewExtras, showVelocity }: Props) {
  const remaining = Math.max(po.order_qty - po.finishedOutput, 0);
  const extras = Math.max(po.finishedOutput - po.order_qty, 0);

  return (
    <TableRow
      className="cursor-pointer hover:bg-muted/50"
      onClick={onToggle}
    >
      {/* Expand chevron */}
      <TableCell className="w-7 pr-0 pl-3">
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </TableCell>

      {/* PO Number */}
      <TableCell className="font-mono font-medium">{po.po_number}</TableCell>

      {/* Buyer / Style */}
      <TableCell>
        <p className="font-medium text-sm">{po.buyer}</p>
        <p className="text-xs text-muted-foreground">{po.style}</p>
      </TableCell>

      {/* Line — show first only, popover for extras */}
      <TableCell className="text-sm">
        {po.line_names.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <div className="flex items-center gap-1.5">
            <span>{po.line_names[0]}</span>
            {po.line_names.length > 1 && (
              <Popover>
                <PopoverTrigger
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted/80 transition-colors"
                >
                  +{po.line_names.length - 1}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2" side="top" align="start">
                  <p className="text-[10px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">All lines</p>
                  <ul className="space-y-1">
                    {po.line_names.map((name) => (
                      <li key={name} className="text-sm">{name}</li>
                    ))}
                  </ul>
                </PopoverContent>
              </Popover>
            )}
          </div>
        )}
      </TableCell>

      {/* PO Qty */}
      <TableCell className="text-right font-mono text-sm">
        {po.order_qty.toLocaleString()}
      </TableCell>

      {/* Sewing output + green bar */}
      <TableCell className="min-w-[80px]">
        <p className="font-mono text-sm font-medium text-right">
          {po.sewingOutput > 0 ? po.sewingOutput.toLocaleString() : <span className="text-muted-foreground">—</span>}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden ring-1 ring-border">
            <div
              className="h-full rounded-full bg-green-500"
              style={{ width: `${po.order_qty > 0 ? Math.min((po.sewingOutput / po.order_qty) * 100, 100) : 0}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground w-7 text-right shrink-0">
            {po.order_qty > 0 ? `${Math.round((po.sewingOutput / po.order_qty) * 100)}%` : "—"}
          </span>
        </div>
      </TableCell>

      {/* Finishing output + purple bar */}
      <TableCell className="min-w-[80px]">
        <p className="font-mono text-sm font-medium text-right">
          {po.finishedOutput > 0 ? po.finishedOutput.toLocaleString() : <span className="text-muted-foreground">—</span>}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden ring-1 ring-border">
            <div
              className="h-full rounded-full bg-purple-500"
              style={{ width: `${po.progressPct}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground w-7 text-right shrink-0">
            {Math.round(po.progressPct)}%
          </span>
        </div>
      </TableCell>

      {/* Remaining */}
      <TableCell className="text-right font-mono text-sm">
        {remaining > 0 ? (
          remaining.toLocaleString()
        ) : extras > 0 ? (
          <button
            onClick={(e) => { e.stopPropagation(); onViewExtras?.(po); }}
            className="inline-flex"
          >
            <Badge variant="warning" className="font-mono text-[10px] cursor-pointer hover:opacity-80 transition-opacity">
              +{extras.toLocaleString()}
            </Badge>
          </button>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* Ex-Factory */}
      <TableCell>
        {po.planned_ex_factory ? (
          <div className="flex items-center gap-1 text-xs">
            <Calendar className="h-3 w-3 text-muted-foreground" />
            {formatShortDate(po.planned_ex_factory)}
          </div>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </TableCell>

      {/* Velocity: Avg/day + Need/day (Running tab only) */}
      {showVelocity && (
        <>
          <TableCell className="text-right font-mono text-sm">
            {po.avgPerDay > 0
              ? Math.round(po.avgPerDay).toLocaleString()
              : <span className="text-muted-foreground">—</span>}
          </TableCell>
          <TableCell className="text-right font-mono text-sm">
            {po.neededPerDay > 0
              ? Math.round(po.neededPerDay).toLocaleString()
              : <span className="text-muted-foreground">—</span>}
          </TableCell>
        </>
      )}

      {/* Actions */}
      <TableCell>
        <POQuickActions
          workOrderId={po.id}
          poNumber={po.po_number}
          onViewExtras={onViewExtras ? () => onViewExtras(po) : undefined}
        />
      </TableCell>
    </TableRow>
  );
}
