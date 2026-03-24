import { useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { POSubmissionsTab } from "./POSubmissionsTab";
import { POPipelineTab } from "./POPipelineTab";
import { POQualityTab } from "./POQualityTab";
import type { POControlRoomData, PODetailData } from "./types";

interface Props {
  po: POControlRoomData;
  detailData: PODetailData | null;
  loading: boolean;
}

const TABS = [
  { id: "submissions", label: "Submissions" },
  { id: "pipeline", label: "Pipeline" },
  { id: "quality", label: "Quality" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function POExpandedPanel({ po, detailData, loading }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("submissions");

  if (loading || !detailData) {
    return (
      <div className="flex items-center justify-center py-14">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="px-5 py-5 md:px-8">
      {/* Underline tabs */}
      <div className="flex gap-6 border-b border-border/60 mb-5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "pb-2.5 text-sm font-medium transition-colors relative",
              activeTab === tab.id
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground/70"
            )}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-foreground rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "submissions" && (
        <POSubmissionsTab submissions={detailData.submissions} />
      )}
      {activeTab === "pipeline" && (
        <POPipelineTab stages={detailData.pipeline} />
      )}
      {activeTab === "quality" && (
        <POQualityTab quality={detailData.quality} orderQty={po.order_qty} />
      )}
    </div>
  );
}
