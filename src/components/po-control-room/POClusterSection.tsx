import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { POTableRow } from "./POTableRow";
import { POExpandedPanel } from "./POExpandedPanel";
import type { POCluster, POControlRoomData, PODetailData } from "./types";

interface ClusterMeta {
  label: string;
  description: string;
  colorClass: string; // Tailwind bg + text classes for the header band
}

const CLUSTER_META: Record<POCluster, ClusterMeta> = {
  due_soon: {
    label: "Due Soon",
    description: "Ex-factory within 7 days",
    colorClass: "bg-red-600 text-white border-red-700",
  },
  behind_plan: {
    label: "Behind Plan",
    description: "Forecast behind deadline",
    colorClass: "bg-amber-500 text-white border-amber-600",
  },
  missing_updates: {
    label: "Missing Updates",
    description: "No EOD submitted today",
    colorClass: "bg-amber-500 text-white border-amber-600",
  },
  on_track: {
    label: "On Track",
    description: "On schedule",
    colorClass: "bg-green-600 text-white border-green-700",
  },
  no_deadline: {
    label: "No Deadline",
    description: "No deadline set",
    colorClass: "bg-slate-500 text-white border-slate-600",
  },
};

interface Props {
  cluster: POCluster;
  pos: POControlRoomData[];
  expandedId: string | null;
  detailData: PODetailData | null;
  detailLoading: boolean;
  onToggleExpand: (id: string) => void;
  onViewExtras?: (po: POControlRoomData) => void;
}

export function POClusterSection({
  cluster,
  pos,
  expandedId,
  detailData,
  detailLoading,
  onToggleExpand,
  onViewExtras,
}: Props) {
  const meta = CLUSTER_META[cluster];
  // velocity columns + existing = 13 total
  const colSpan = 13;

  return (
    <div className="rounded-lg border overflow-hidden">
      {/* Cluster header band */}
      <div className={`px-4 py-2 border-b flex items-center gap-3 ${meta.colorClass}`}>
        <span className="font-semibold text-sm">{meta.label}</span>
        <span className="text-xs opacity-75">{meta.description}</span>
        <span className="ml-auto text-xs font-medium opacity-75">
          {pos.length} PO{pos.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>PO Number</TableHead>
              <TableHead>Buyer / Style</TableHead>
              <TableHead>Line</TableHead>
              <TableHead className="text-right">PO Qty</TableHead>
              <TableHead className="text-right">Sewing</TableHead>
              <TableHead className="text-right">Finishing</TableHead>
              <TableHead className="text-right">Remaining</TableHead>
              <TableHead>Health</TableHead>
              <TableHead>Ex-Factory</TableHead>
              <TableHead className="text-right">Sewing Avg/day</TableHead>
              <TableHead className="text-right">Sewing Need/day</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pos.map((po) => (
              <>
                <POTableRow
                  key={po.id}
                  po={po}
                  isExpanded={expandedId === po.id}
                  onToggle={() => onToggleExpand(po.id)}
                  onViewExtras={onViewExtras}
                  showVelocity
                />
                {expandedId === po.id && (
                  <TableRow key={`${po.id}-detail`}>
                    <TableCell colSpan={colSpan} className="p-0 bg-muted/30">
                      <POExpandedPanel
                        po={po}
                        detailData={detailData}
                        loading={detailLoading}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
