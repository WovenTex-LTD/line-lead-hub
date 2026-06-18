import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Mic, Square, Trash2, Loader2, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

/**
 * Reusable voice-notes attachment for any record with a notes field. Records via
 * the browser MediaRecorder, uploads to the private `voice-notes` bucket, lists
 * and plays existing notes. Anyone in the factory can play; creator/admin delete.
 *
 * Two modes:
 *  - With a real `recordId`: recordings upload immediately (e.g. QC items, edits,
 *    submission views).
 *  - `deferred` + no `recordId`: the form hasn't been saved yet. Recordings are
 *    held IN MEMORY (nothing uploaded) and only persisted when the parent calls
 *    `commit(savedId)` after a successful submit. If the form is never submitted,
 *    the clips are discarded on unmount — they never touch the database/storage.
 */
export interface VoiceNotesHandle {
  hasPending: () => boolean;
  /** Upload any in-memory recordings against the now-saved record id. */
  commit: (recordId: string) => Promise<void>;
}

interface VoiceNote {
  id: string;
  storage_path: string;
  duration_ms: number | null;
  created_by: string | null;
  created_at: string;
  url?: string;
}

interface Pending {
  id: string;
  blob: Blob;
  url: string;
  durationMs: number;
}

const fmt = (ms: number | null) => {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export const VoiceNotes = forwardRef<VoiceNotesHandle, {
  recordType: string;
  recordId: string | null | undefined;
  className?: string;
  /** When false, only existing recordings show (no record button). */
  showRecorder?: boolean;
  /** Allow recording before the record is saved (held in memory until commit). */
  deferred?: boolean;
  /** Optional label rendered above the notes — hidden when there's nothing to show. */
  heading?: string;
}>(function VoiceNotes({ recordType, recordId, className, showRecorder = true, deferred = false, heading }, ref) {
  const { profile, user, isAdminOrHigher } = useAuth();
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingRef = useRef<Pending[]>([]);
  pendingRef.current = pending;

  const load = useCallback(async () => {
    if (!recordId) { setNotes([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("voice_notes")
      .select("id, storage_path, duration_ms, created_by, created_at")
      .eq("record_type", recordType)
      .eq("record_id", recordId)
      .order("created_at", { ascending: true });
    const rows = (data as VoiceNote[]) || [];
    if (rows.length) {
      const { data: signed } = await supabase.storage
        .from("voice-notes")
        .createSignedUrls(rows.map((r) => r.storage_path), 3600);
      const byPath = new Map((signed || []).map((s) => [s.path, s.signedUrl]));
      rows.forEach((r) => { r.url = byPath.get(r.storage_path) || undefined; });
    }
    setNotes(rows);
    setLoading(false);
  }, [recordType, recordId]);

  useEffect(() => { load(); }, [load]);

  // Upload one blob against a (saved) record id and insert its row.
  const persist = useCallback(async (recId: string, blob: Blob, durationMs: number) => {
    if (!profile?.factory_id || !user?.id) throw new Error("Not signed in");
    const ext = blob.type.includes("mp4") ? "mp4" : "webm";
    const path = `${profile.factory_id}/${recordType}/${recId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("voice-notes")
      .upload(path, blob, { contentType: blob.type, upsert: false });
    if (upErr) throw upErr;
    const { error: insErr } = await (supabase as any).from("voice_notes").insert({
      factory_id: profile.factory_id,
      record_type: recordType,
      record_id: recId,
      storage_path: path,
      duration_ms: durationMs,
      file_size_bytes: blob.size,
      created_by: user.id,
    });
    if (insErr) throw insErr;
  }, [profile?.factory_id, user?.id, recordType]);

  // Imperative API for the parent form to commit in-memory recordings on submit.
  useImperativeHandle(ref, () => ({
    hasPending: () => pendingRef.current.length > 0,
    commit: async (recId: string) => {
      const items = pendingRef.current;
      for (const p of items) await persist(recId, p.blob, p.durationMs);
      items.forEach((p) => URL.revokeObjectURL(p.url));
      setPending([]);
    },
  }), [persist]);

  // Clean up an in-flight recording + discard any unsaved pending blobs on unmount.
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    recRef.current?.stream?.getTracks().forEach((t) => t.stop());
    pendingRef.current.forEach((p) => URL.revokeObjectURL(p.url));
  }, []);

  async function startRec() {
    if (!recordId && !deferred) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const durationMs = Date.now() - startedAtRef.current;
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        if (recordId) {
          // Saved record — upload now.
          setBusy(true);
          try {
            await persist(recordId, blob, durationMs);
            toast.success("Voice note saved");
            await load();
          } catch (e: any) {
            toast.error(e?.message || "Could not save voice note");
          } finally {
            setBusy(false);
          }
        } else {
          // Not saved yet — hold in memory until the form is submitted.
          setPending((p) => [...p, { id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob), durationMs }]);
        }
      };
      mr.start();
      recRef.current = mr;
      startedAtRef.current = Date.now();
      setElapsed(0);
      setRecording(true);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch {
      toast.error("Couldn't access the microphone. Check browser permissions.");
    }
  }

  function stopRec() {
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
    recRef.current?.stop();
  }

  async function del(note: VoiceNote) {
    setBusy(true);
    try {
      const { error } = await (supabase as any).from("voice_notes").delete().eq("id", note.id);
      if (error) throw error;
      await supabase.storage.from("voice-notes").remove([note.storage_path]);
      setNotes((n) => n.filter((x) => x.id !== note.id));
    } catch (e: any) {
      toast.error(e?.message || "Could not delete");
    } finally {
      setBusy(false);
    }
  }

  function removePending(id: string) {
    setPending((p) => {
      const hit = p.find((x) => x.id === id);
      if (hit) URL.revokeObjectURL(hit.url);
      return p.filter((x) => x.id !== id);
    });
  }

  const canRecord = !!recordId || deferred;

  // Nothing to show on the read-only side when there's nothing recorded.
  if (!recordId && !deferred) {
    return showRecorder ? (
      <p className={cn("text-[11px] text-muted-foreground italic", className)}>
        Save this entry first to attach voice notes.
      </p>
    ) : null;
  }
  if (!showRecorder && !loading && notes.length === 0 && pending.length === 0) return null;

  return (
    <div className={cn("space-y-2.5", className)}>
      {heading && (
        <p className="text-xs font-semibold text-foreground uppercase tracking-wide">{heading}</p>
      )}
      {showRecorder && canRecord && (recording ? (
        <button
          type="button"
          onClick={stopRec}
          className="inline-flex items-center gap-2 rounded-lg bg-red-500 hover:bg-red-600 text-white px-3 py-2 text-sm font-medium shadow-sm"
        >
          <Square className="h-3.5 w-3.5 fill-current" />
          Stop · {fmt(elapsed * 1000)}
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-white/70 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={startRec}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg border border-blue-300/60 text-blue-700 dark:text-blue-300 hover:bg-blue-500/10 px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
          {busy ? "Saving…" : "Record voice note"}
        </button>
      ))}

      {/* Pending (unsaved) recordings — held in memory until the form is submitted. */}
      {pending.map((p) => (
        <div key={p.id} className="flex items-center gap-2 rounded-lg border border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/20 p-2">
          <Volume2 className="h-3.5 w-3.5 text-amber-600 shrink-0" />
          <audio controls src={p.url} className="h-8 min-w-0 flex-1" />
          <span className="text-[10px] text-amber-700 dark:text-amber-400 tabular-nums shrink-0">
            {fmt(p.durationMs)} · unsaved
          </span>
          <button type="button" onClick={() => removePending(p.id)} className="text-muted-foreground hover:text-red-600 shrink-0" title="Discard">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {/* Saved recordings */}
      {loading ? (
        showRecorder ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null
      ) : notes.length === 0 ? (
        showRecorder && pending.length === 0 ? <p className="text-[11px] text-muted-foreground">No voice notes yet.</p> : null
      ) : (
        <div className="space-y-2">
          {notes.map((n) => (
            <div key={n.id} className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 p-2">
              <Volume2 className="h-3.5 w-3.5 text-blue-600 shrink-0" />
              <audio controls src={n.url} className="h-8 min-w-0 flex-1" />
              <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                {fmt(n.duration_ms)}
                {n.created_by === user?.id ? " · you" : ""}
              </span>
              {(n.created_by === user?.id || isAdminOrHigher()) && (
                <button
                  type="button"
                  onClick={() => del(n)}
                  disabled={busy}
                  className="text-muted-foreground hover:text-red-600 shrink-0 disabled:opacity-50"
                  title="Delete voice note"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
