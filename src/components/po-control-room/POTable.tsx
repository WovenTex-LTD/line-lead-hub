import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
import type { POControlRoomData, PODetailData } from "./types";

interface Props {
  orders: POControlRoomData[];
  loading: boolean;
  expandedId: string | null;
  detailData: PODetailData | null;
  detailLoading: boolean;
  onToggleExpand: (id: string) => void;
  onViewExtras?: (po: POControlRoomData) => void;
  showVelocity?: boolean;
}

export function POTable({
  orders,
  loading,
  expandedId,
  detailData,
  detailLoading,
  onToggleExpand,
  onViewExtras,
  showVelocity,
}: Props) {
  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
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
                {showVelocity && (
                  <>
                    <TableHead className="text-right">Sewing Avg/day</TableHead>
                    <TableHead className="text-right">Sewing Need/day</TableHead>
                  </>
                )}
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((po) => (
                <>
                  <POTableRow
                    key={po.id}
                    po={po}
                    isExpanded={expandedId === po.id}
                    onToggle={() => onToggleExpand(po.id)}
                    onViewExtras={onViewExtras}
                    showVelocity={showVelocity}
                  />
                  {expandedId === po.id && (
                    <TableRow key={`${po.id}-detail`}>
                      <TableCell colSpan={showVelocity ? 13 : 11} className="p-0 bg-muted/30">
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
              {orders.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={showVelocity ? 13 : 11}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No work orders found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
