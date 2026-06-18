import { forwardRef, useState } from "react";
import { MessageSquare, Mic } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { VoiceNotes, type VoiceNotesHandle } from "./VoiceNotes";

/**
 * A notes field with a Notes / Voice note tab toggle. Text box on the Notes tab,
 * recorder on the Voice tab; existing/pending recordings always show below.
 *
 * If `deferred` and there's no `recordId` yet (new, unsaved entry), recordings
 * are held in memory. Forward a ref and call `ref.current.commit(savedId)` after
 * a successful submit to persist them; otherwise they're discarded.
 */
export const NotesWithVoice = forwardRef<VoiceNotesHandle, {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  recordType: string;
  recordId: string | null | undefined;
  deferred?: boolean;
  className?: string;
}>(function NotesWithVoice(
  { label = "Notes", value, onChange, onBlur, placeholder, rows = 2, disabled, recordType, recordId, deferred = false, className },
  ref,
) {
  const [tab, setTab] = useState<"notes" | "voice">("notes");
  const PILL = "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] uppercase tracking-wide font-semibold transition-colors";
  const INACTIVE = "text-muted-foreground hover:text-foreground";
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => setTab("notes")} className={cn(PILL, tab === "notes" ? "bg-muted text-foreground" : INACTIVE)}>
          <MessageSquare className="h-3 w-3" />
          {label}
        </button>
        <button type="button" onClick={() => setTab("voice")} className={cn(PILL, tab === "voice" ? "bg-blue-500/10 text-blue-700 dark:text-blue-300" : INACTIVE)}>
          <Mic className="h-3 w-3" />
          Voice note
        </button>
      </div>

      {tab === "notes" && (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
        />
      )}

      <VoiceNotes ref={ref} recordType={recordType} recordId={recordId} deferred={deferred} showRecorder={tab === "voice"} />
    </div>
  );
});
