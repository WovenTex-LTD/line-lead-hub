import { useState } from "react";
import {
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
  FileText,
  Loader2,
  AlertTriangle,
  Bot,
  MessageCircleQuestion,
  PenLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import type { ChatMessage as ChatMessageType, ChatCitation } from "@/hooks/useChat";

interface ChatMessageProps {
  message: ChatMessageType;
  onFeedback?: (messageId: string, feedback: "thumbs_up" | "thumbs_down") => void;
  onViewSource?: (chunkId: string) => Promise<any>;
  onSendSuggestion?: (question: string) => void;
  language: "en" | "bn" | "zh";
}

// ---------------------------------------------------------------------------
// Inline markdown: `code`, **bold**, *italic*, [Source: Title]
// ---------------------------------------------------------------------------
function formatInline(text: string, lineKey: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(`([^`]+)`)|(\*\*(.+?)\*\*)|(\*([^*]+?)\*)|(\[Source:\s*([^\]]+)\])/g;

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
      parts.push(
        <span key={`${lineKey}-s${idx}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-xs font-medium">
          <FileText className="h-3 w-3" />{match[8]}
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
          items.push(<li key={`li-${key}`} className="leading-snug">{formatInline(m[1], `li-${key++}`)}</li>);
          i++;
        } else if (lines[i].trim() === "" && nextNonBlankIsBullet(i + 1, ulRe) !== -1) {
          i = nextNonBlankIsBullet(i + 1, ulRe);
        } else {
          break;
        }
      }
      elements.push(<ul key={`ul-${key++}`} className="my-1.5 ml-4 list-disc space-y-0.5">{items}</ul>);
      continue;
    }

    // Ordered list — same grouping
    const olRe = /^\s*\d+\.\s+/;
    if (olRe.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s*\d+\.\s+(.*)$/);
        if (m) {
          items.push(<li key={`ol-${key}`} className="leading-snug">{formatInline(m[1], `ol-${key++}`)}</li>);
          i++;
        } else if (lines[i].trim() === "" && nextNonBlankIsBullet(i + 1, olRe) !== -1) {
          i = nextNonBlankIsBullet(i + 1, olRe);
        } else {
          break;
        }
      }
      elements.push(<ol key={`ol-${key++}`} className="my-1.5 ml-4 list-decimal space-y-0.5">{items}</ol>);
      continue;
    }

    // Paragraph — skip blank lines (paragraph margins handle spacing; no <br> spam)
    if (line.trim()) {
      elements.push(<p key={`p-${key}`} className="mb-1.5 leading-snug">{formatInline(line, `p-${key++}`)}</p>);
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
    <div className={cn("flex gap-3 min-w-0", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar */}
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback
          className={cn(
            "text-xs font-semibold",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-gradient-to-br from-primary to-primary/70 text-primary-foreground"
          )}
        >
          {isUser ? "U" : <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>

      {/* Message body */}
      <div className={cn("flex flex-col max-w-[80%] min-w-0", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm min-w-0 max-w-full overflow-hidden",
            isUser
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-card border shadow-sm",
            isLoading && "min-w-[60px]"
          )}
        >
          {isLoading ? (
            <div className="flex items-center gap-1.5 py-1 px-1">
              <div className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
              <div className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:150ms]" />
              <div className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:300ms]" />
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none min-w-0 [overflow-wrap:anywhere]">
              {formatContent(message.content)}
            </div>
          )}
        </div>

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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-left bg-card border rounded-lg shadow-sm hover:bg-accent hover:shadow-md hover:border-primary/30 transition-all duration-200 cursor-pointer w-full"
                >
                  <span className="break-words text-left">{question}</span>
                </button>
              ))}
              <button
                onClick={() => onSendSuggestion?.("")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-muted/50 border border-dashed rounded-lg hover:bg-accent hover:border-primary/30 transition-all duration-200 cursor-pointer text-muted-foreground w-fit"
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
