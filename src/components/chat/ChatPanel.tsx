import { useState, useRef, useEffect } from "react";
import { Send, Loader2, RotateCcw, AlertCircle, History, Paperclip, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChat } from "@/hooks/useChat";
import { ChatMessage } from "./ChatMessage";
import { QuickActions } from "./QuickActions";
import { LanguageToggle } from "./LanguageToggle";
import { LinaMark } from "./LinaMark";
import { cn } from "@/lib/utils";

export function ChatPanel() {
  const {
    messages,
    isLoading,
    error,
    language,
    conversationId,
    setLanguage,
    sendMessage,
    submitFeedback,
    clearConversation,
    fetchSource,
    recentConversations,
    loadRecentConversations,
    loadConversation,
    runAction,
  } = useChat();

  const { profile } = useAuth();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const shouldAutoScroll = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachment, setAttachment] = useState<{ path: string; mime: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const handlePickFile = () => fileInputRef.current?.click();
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !profile?.factory_id) return;
    if (file.size > 50 * 1024 * 1024) { toast.error("File is too large (max 50 MB)."); return; }
    setUploading(true);
    const path = `${profile.factory_id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error } = await supabase.storage.from("lina-uploads").upload(path, file, { contentType: file.type, upsert: false });
    setUploading(false);
    if (error) { toast.error("Upload failed: " + error.message); return; }
    setAttachment({ path, mime: file.type, name: file.name });
  };

  // Only auto-scroll when the user sends a message (so their message + loading
  // dots are visible). Do NOT scroll when the bot response arrives.
  useEffect(() => {
    if (scrollRef.current && shouldAutoScroll.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      shouldAutoScroll.current = false;
    }
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!input.trim() && !attachment) || isLoading || uploading) return;
    const message = input.trim() || "Please digitize this form.";
    const att = attachment ? { path: attachment.path, mime: attachment.mime } : undefined;
    setInput("");
    setAttachment(null);
    shouldAutoScroll.current = true;
    await sendMessage(message, att);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleQuickAction = (prompt: string) => {
    shouldAutoScroll.current = true;
    sendMessage(prompt);
  };

  const handleSuggestion = (question: string) => {
    if (!question) {
      inputRef.current?.focus();
      return;
    }
    shouldAutoScroll.current = true;
    sendMessage(question);
  };

  const handleLoadConversation = (id: string) => {
    shouldAutoScroll.current = true;
    loadConversation(id);
  };

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden bg-gradient-to-b from-secondary/40 to-background">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <LinaMark size="lg" glow className="mb-5" />
            <h3 className="text-lg font-semibold tracking-tight text-foreground text-balance">
              {language === "bn" ? "আমি লিনা" : "I'm Lina"}
            </h3>
            <p className="mt-1.5 text-sm text-muted-foreground max-w-[300px] text-pretty leading-relaxed">
              {language === "bn"
                ? "প্রোডাকশন, লাইন পারফরম্যান্স, ব্লকার বা অর্ডার সম্পর্কে জিজ্ঞাসা করুন — আমি লাইভ ডেটা দেখে উত্তর দেব।"
                : "Your production assistant. Ask about output, line performance, blockers, or orders — I'll pull the live data and dig in."}
            </p>
            <div className="mt-7 w-full">
              <QuickActions onSelect={handleQuickAction} language={language} />
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-[680px] space-y-6">
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                onFeedback={submitFeedback}
                onViewSource={fetchSource}
                onSendSuggestion={handleSuggestion}
                language={language}
                onRunAction={runAction}
              />
            ))}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive" className="mx-4 mb-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Composer */}
      <div className="border-t border-border/60 bg-card/80 backdrop-blur px-5 pt-3.5 pb-4 space-y-2.5 [&>*]:mx-auto [&>*]:w-full [&>*]:max-w-[680px]">
        <div className="flex items-center justify-between">
          <LanguageToggle language={language} onToggle={setLanguage} />
          <div className="flex items-center gap-0.5">
            <DropdownMenu onOpenChange={(open) => { if (open) loadRecentConversations(); }}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground hover:text-foreground"
                >
                  <History className="h-3.5 w-3.5 mr-1" />
                  {language === "bn" ? "ইতিহাস" : "History"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {language === "bn" ? "সাম্প্রতিক চ্যাট" : "Recent chats"}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {recentConversations.length === 0 ? (
                  <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                    {language === "bn" ? "কোনো পূর্ববর্তী চ্যাট নেই" : "No previous chats yet"}
                  </div>
                ) : (
                  recentConversations.map((c) => (
                    <DropdownMenuItem
                      key={c.id}
                      onSelect={() => handleLoadConversation(c.id)}
                      className={cn(
                        "flex flex-col items-start gap-0.5 py-2",
                        c.id === conversationId && "bg-primary/5"
                      )}
                    >
                      <span className="w-full truncate text-sm font-medium text-foreground">{c.title}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(c.updatedAt), { addSuffix: true })}
                      </span>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearConversation}
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                {language === "bn" ? "নতুন চ্যাট" : "New chat"}
              </Button>
            )}
          </div>
        </div>

        <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileChange} />
        {attachment && (
          <div className="flex items-center gap-2 rounded-md bg-muted px-2 py-1 text-xs">
            <span className="truncate max-w-[200px]">{attachment.name}</span>
            <button type="button" onClick={() => { if (attachment) supabase.storage.from("lina-uploads").remove([attachment.path]); setAttachment(null); }}><X className="h-3 w-3" /></button>
          </div>
        )}
        <form
          onSubmit={handleSubmit}
          className="group flex items-end gap-2 rounded-2xl border border-border bg-background p-1.5 pl-3 shadow-premium-sm transition-all duration-200 focus-within:border-primary/50 focus-within:shadow-glow"
        >
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={language === "bn" ? "লিনাকে জিজ্ঞাসা করুন..." : "Ask Lina anything…"}
            className="min-h-[40px] max-h-[120px] flex-1 resize-none border-0 bg-transparent px-0 py-2 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/70"
            disabled={isLoading}
            rows={1}
          />
          <Button type="button" variant="ghost" size="icon" onClick={handlePickFile} disabled={uploading} title="Attach a form image or PDF">
            <Paperclip className="h-4 w-4" />
          </Button>
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || uploading || (!input.trim() && !attachment)}
            aria-label="Send message"
            className={cn(
              "h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-primary to-primary/80 transition-all duration-200",
              (input.trim() || attachment) && !isLoading && !uploading
                ? "shadow-glow hover:scale-105 active:scale-95"
                : "opacity-50"
            )}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>

        <p className="text-[10px] leading-tight text-center text-muted-foreground/70">
          {language === "bn"
            ? "লিনা ভুল করতে পারে। গুরুত্বপূর্ণ সিদ্ধান্তের আগে যাচাই করুন।"
            : "Lina is AI-powered and can make mistakes. Verify important figures."}
        </p>
      </div>
    </div>
  );
}
