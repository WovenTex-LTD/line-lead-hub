import { useState } from "react";
import {
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
  FileText,
  Loader2,
  AlertTriangle,
  MessageCircleQuestion,
  PenLine,
  ArrowUpRight,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ChatMessage as ChatMessageType, ChatCitation, PendingAction } from "@/hooks/useChat";
import { ActionConfirmCard } from "./ActionConfirmCard";

interface ChatMessageProps {
  message: ChatMessageType;
  onFeedback?: (messageId: string, feedback: "thumbs_up" | "thumbs_down") => void;
  onViewSource?: (chunkId: string) => Promise<any>;
  onSendSuggestion?: (question: string) => void;
  language: "en" | "bn" | "zh";
  onRunAction?: (action: PendingAction) => Promise<{ ok: boolean; summary?: string; error?: string }>;
}

// Friendly labels for the "what Lina checked" chip under each answer.
const TOOL_LABELS: Record<string, string> = {
  get_production_data: "production data",
  get_blockers: "blockers",
  get_work_orders: "work orders",
  get_lines: "line performance",
  get_financials: "financials",
  compare_periods: "trends",
  find_anomalies: "anomalies",
  search_knowledge: "knowledge base",
};

// ---------------------------------------------------------------------------
// Inline markdown: `code`, **bold**, *italic*, [Source: Title]
// ---------------------------------------------------------------------------
function formatInline(text: string, lineKey: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(`([^`]+)`)|(\*\*(.+?)\*\*)|(\*([^*]+?)\*)|(\[([^\]]+)\]\((https?:[^)]+)\))|(\[Source:\s*([^\]]+)\])/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      parts.push(
        <code key={`${lineKey}-c${idx}`} className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">
          {match[2]}
        </code>
      );
    } else if (match[3]) {
      parts.push(
        <strong key={`${lineKey}-b${idx}`} className="font-semibold">{match[4]}</strong>
      );
    } else if (match[5]) {
      parts.push(
        <em key={`${lineKey}-i${idx}`}>{match[6]}</em>
      );
    } else if (match[7]) {
      // Markdown link [text](url) — e.g. a report download link
      parts.push(
        <a
          key={`${lineKey}-l${idx}`}
          href={match[9]}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2 hover:text-primary/80"
        >
          <Download className="h-3.5 w-3.5 shrink-0" />
          {match[8]}
        </a>
      );
    } else if (match[10]) {
      parts.push(
        <span key={`${lineKey}-s${idx}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-xs font-medium">
          <FileText className="h-3 w-3" />{match[11]}
        </span>
      );
    }

    lastIndex = match.index + match[0].length;
    idx++;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : [text];
}

// ---------------------------------------------------------------------------
// Block-level markdown: code blocks, headers, bullets, numbered lists, paragraphs
// ---------------------------------------------------------------------------
function formatContent(content: string): React.ReactNode[] {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  const nextNonBlankIsBullet = (from: number, re: RegExp): number => {
    let j = from;
    while (j < lines.length && lines[j].trim() === "") j++;
    return j < lines.length && re.test(lines[j]) ? j : -1;
  };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <pre key={`cb-${key++}`} className="my-2 rounded-lg bg-[hsl(222,47%,11%)] text-[hsl(214,32%,91%)] p-3 overflow-x-auto text-xs font-mono">
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    // Horizontal rule (---, ***, ___) → subtle divider
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      elements.push(<hr key={`hr-${key++}`} className="my-2.5 border-border/60" />);
      i++;
      continue;
    }

    // Headings (#…######) — render compactly for a narrow panel
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const cls =
        level <= 1
          ? "font-bold text-base mt-3 mb-1"
          : "font-semibold text-sm mt-2.5 mb-1";
      elements.push(
        <div key={`h-${key}`} className={cls}>{formatInline(heading[2], `h-${key++}`)}</div>
      );
      i++;
      continue;
    }

    // Markdown table: header row + separator row + body rows
    const isTableRow = (s: string) => /^\s*\|.*\|\s*$/.test(s);
    const isTableSep = (s: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(s) && s.includes("-");
    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const splitRow = (s: string) =>
        s.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
      const headers = splitRow(line);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      elements.push(
        <div key={`tbl-${key++}`} className="my-2 max-w-full overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                {headers.map((h, hi) => (
                  <th key={hi} className="border-b border-border px-2 py-1 text-left font-semibold whitespace-nowrap">{formatInline(h, `th-${key}-${hi}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci} className="border-b border-border/40 px-2 py-1 whitespace-nowrap">{formatInline(c, `td-${key}-${ri}-${ci}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Unordered list — gather consecutive bullets into one tight <ul>,
    // collapsing blank lines between items (loose → tight list)
    const ulRe = /^\s*[-*]\s+/;
    if (ulRe.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s*[-*]\s+(.*)$/);
        if (m) {
          items.push(<li key={`li-${key}`} className="leading-normal">{formatInline(m[1], `li-${key++}`)}</li>);
          i++;
        } else if (lines[i].trim() === "" && nextNonBlankIsBullet(i + 1, ulRe) !== -1) {
          i = nextNonBlankIsBullet(i + 1, ulRe);
        } else {
          break;
        }
      }
      elements.push(<ul key={`ul-${key++}`} className="my-1.5 ml-4 list-disc space-y-1">{items}</ul>);
      continue;
    }

    // Ordered list — same grouping
    const olRe = /^\s*\d+\.\s+/;
    if (olRe.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s*\d+\.\s+(.*)$/);
        if (m) {
          items.push(<li key={`ol-${key}`} className="leading-normal">{formatInline(m[1], `ol-${key++}`)}</li>);
          i++;
        } else if (lines[i].trim() === "" && nextNonBlankIsBullet(i + 1, olRe) !== -1) {
          i = nextNonBlankIsBullet(i + 1, olRe);
        } else {
          break;
        }
      }
      elements.push(<ol key={`ol-${key++}`} className="my-1.5 ml-4 list-decimal space-y-1">{items}</ol>);
      continue;
    }

    // Paragraph — skip blank lines (paragraph margins handle spacing; no <br> spam)
    if (line.trim()) {
      elements.push(<p key={`p-${key}`} className="mb-2 leading-relaxed">{formatInline(line, `p-${key++}`)}</p>);
    }
    i++;
  }

  return elements;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ChatMessage({
  message,
  onFeedback,
  onViewSource,
  onSendSuggestion,
  language,
  onRunAction,
}: ChatMessageProps) {
  const [feedback, setFeedback] = useState<"thumbs_up" | "thumbs_down" | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<any>(null);
  const [loadingSource, setLoadingSource] = useState(false);

  const isUser = message.role === "user";
  const isLoading = message.isLoading;

  const handleFeedback = (type: "thumbs_up" | "thumbs_down") => {
    setFeedback(type);
    onFeedback?.(message.id, type);
  };

  const handleViewSource = async (citation: ChatCitation) => {
    if (!onViewSource) return;
    setLoadingSource(true);
    try {
      const source = await onViewSource(citation.chunkId);
      if (source) setSelectedSource(source);
    } finally {
      setLoadingSource(false);
    }
  };

  return (
    <div className={cn("flex min-w-0 animate-fade-in", isUser ? "justify-end" : "justify-start")}>
      {/* Message body */}
      <div className={cn("flex flex-col max-w-[92%] min-w-0", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-[15px] min-w-0 max-w-full overflow-hidden",
            isUser
              ? "bg-gradient-to-br from-primary to-primary/85 text-primary-foreground rounded-tr-md shadow-premium-sm"
              : "bg-card text-card-foreground ring-1 ring-border/70 rounded-tl-md shadow-premium-sm"
          )}
        >
          {isLoading ? (
            <div className="flex items-center gap-2 py-0.5">
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce [animation-delay:300ms]" />
              </span>
              <span className="text-xs font-medium text-muted-foreground animate-pulse">
                {language === "bn" ? "লিনা বিশ্লেষণ করছে…" : "Lina is analyzing…"}
              </span>
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none min-w-0 [overflow-wrap:anywhere] [font-variant-numeric:tabular-nums]">
              {formatContent(message.content)}
            </div>
          )}
        </div>

        {/* What Lina checked — the agent's tool activity */}
        {!isUser && !isLoading && message.toolsUsed && message.toolsUsed.length > 0 && (() => {
          const labels = Array.from(
            new Set(message.toolsUsed.map((t) => TOOL_LABELS[t.name]).filter(Boolean))
          );
          if (labels.length === 0) return null;
          return (
            <div className="mt-1.5 flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
              <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-primary/10">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              <span className="min-w-0 truncate">
                {language === "bn" ? "দেখেছি: " : "Checked "}
                {labels.join(" · ")}
              </span>
            </div>
          );
        })()}

        {!isUser && message.pendingActions && message.pendingActions.length > 0 && onRunAction && (
          <div className="w-full space-y-2">
            {message.pendingActions.map((a, i) => (
              <ActionConfirmCard key={i} action={a} onRun={onRunAction} />
            ))}
          </div>
        )}

        {/* No evidence warning */}
        {message.noEvidence && !isUser && (
          <div className="flex items-center gap-1 mt-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            <span>
              {language === "bn"
                ? "নির্দিষ্ট তথ্য উৎসে পাওয়া যায়নি"
                : "Specific information not found in sources"}
            </span>
          </div>
        )}

        {/* Citations */}
        {message.citations && message.citations.length > 0 && !isUser && (
          <Collapsible open={sourcesOpen} onOpenChange={setSourcesOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="mt-1.5 h-auto py-1 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <FileText className="h-3 w-3 mr-1" />
                {language === "bn"
                  ? `${message.citations.length}টি উৎস`
                  : `${message.citations.length} source${message.citations.length > 1 ? "s" : ""}`}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              {message.citations.map((citation, index) => (
                <div
                  key={index}
                  className="flex items-start gap-2.5 text-xs p-2.5 bg-card rounded-lg border shadow-sm hover:shadow-md transition-shadow duration-200"
                >
                  <div className="flex items-center justify-center h-7 w-7 rounded-md bg-primary/10 text-primary shrink-0">
                    <FileText className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-foreground">{citation.documentTitle}</p>
                    {citation.sectionHeading && (
                      <p className="text-muted-foreground truncate mt-0.5">{citation.sectionHeading}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant="outline" className="text-[10px] h-5">
                      {citation.documentType}
                    </Badge>
                    {citation.sourceUrl && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => window.open(citation.sourceUrl!, "_blank")}>
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-[10px]" onClick={() => handleViewSource(citation)} disabled={loadingSource}>
                      {loadingSource ? <Loader2 className="h-3 w-3 animate-spin" /> : language === "bn" ? "দেখুন" : "View"}
                    </Button>
                  </div>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Suggested Questions */}
        {message.suggestedQuestions && message.suggestedQuestions.length > 0 && !isUser && !isLoading && (
          <div className="mt-2.5 space-y-1.5 w-full">
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
              <MessageCircleQuestion className="h-3 w-3 shrink-0" />
              {language === "bn" ? "আরও জিজ্ঞাসা করুন" : "You might want to ask"}
            </div>
            <div className="flex flex-col gap-1.5">
              {message.suggestedQuestions.map((question, idx) => (
                <button
                  key={idx}
                  onClick={() => onSendSuggestion?.(question)}
                  className="group flex w-full items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2 text-left text-xs shadow-premium-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-premium-md"
                >
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{question}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
                </button>
              ))}
              <button
                onClick={() => onSendSuggestion?.("")}
                className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors duration-200 hover:border-primary/40 hover:text-foreground"
              >
                <PenLine className="h-3 w-3 shrink-0" />
                {language === "bn" ? "অন্য কিছু" : "Other"}
              </button>
            </div>
          </div>
        )}

        {/* Feedback */}
        {!isUser && !isLoading && (
          <div className="flex items-center gap-1 mt-1.5">
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8 rounded-full", feedback === "thumbs_up" && "text-green-600 bg-green-100 dark:bg-green-900/30")}
              onClick={() => handleFeedback("thumbs_up")}
            >
              <ThumbsUp className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8 rounded-full", feedback === "thumbs_down" && "text-red-600 bg-red-100 dark:bg-red-900/30")}
              onClick={() => handleFeedback("thumbs_down")}
            >
              <ThumbsDown className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {/* Source detail dialog */}
      <Dialog open={!!selectedSource} onOpenChange={() => setSelectedSource(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedSource?.document?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">{selectedSource?.document?.document_type}</Badge>
              {selectedSource?.section_heading && <span>• {selectedSource.section_heading}</span>}
              {selectedSource?.page_number && <span>• Page {selectedSource.page_number}</span>}
            </div>
            <div className="p-4 bg-muted rounded-lg text-sm whitespace-pre-wrap font-mono">
              {selectedSource?.content}
            </div>
            {selectedSource?.document?.source_url && (
              <Button variant="outline" size="sm" onClick={() => window.open(selectedSource.document.source_url, "_blank")}>
                <ExternalLink className="h-4 w-4 mr-2" />
                {language === "bn" ? "মূল উৎস দেখুন" : "View Original Source"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
