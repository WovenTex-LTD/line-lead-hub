import { useState, useRef, useEffect } from "react";
import { Send, Loader2, RotateCcw, AlertCircle, Bot, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useChat } from "@/hooks/useChat";
import { ChatMessage } from "./ChatMessage";
import { QuickActions } from "./QuickActions";
import { LanguageToggle } from "./LanguageToggle";
import { cn } from "@/lib/utils";

export function ChatPanel() {
  const {
    messages,
    isLoading,
    error,
    language,
    setLanguage,
    sendMessage,
    submitFeedback,
    clearConversation,
    fetchSource,
  } = useChat();

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const shouldAutoScroll = useRef(false);

  // Only auto-scroll when the user sends a message (so their message + loading
  // dots are visible). Do NOT scroll when the bot response arrives — the user
  // should see the beginning of the response, not be pushed to the bottom.
  useEffect(() => {
    if (scrollRef.current && shouldAutoScroll.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      shouldAutoScroll.current = false;
    }
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const message = input;
    setInput("");
    shouldAutoScroll.current = true;
    await sendMessage(message);
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

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden">
      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden p-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            {/* Bot avatar */}
            <div className="relative mb-5">
              <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-white shadow-lg">
                <Bot className="h-8 w-8" />
              </div>
              <div className="absolute -bottom-1 -right-1 flex items-center justify-center h-6 w-6 rounded-full bg-emerald-500 border-2 border-background">
                <Sparkles className="h-3 w-3 text-white" />
              </div>
            </div>

            <h3 className="text-lg font-semibold text-foreground mb-1">
              {language === "bn"
                ? "আমি লিনা — কীভাবে সাহায্য করতে পারি?"
                : "I'm Lina — how can I help?"}
            </h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-[280px]">
              {language === "bn"
                ? "প্রোডাকশন, লাইন পারফরম্যান্স, ব্লকার বা অর্ডার সম্পর্কে জিজ্ঞাসা করুন"
                : "Ask me about production, line performance, blockers, orders, or how things work"}
            </p>

            <QuickActions onSelect={handleQuickAction} language={language} />
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                onFeedback={submitFeedback}
                onViewSource={fetchSource}
                onSendSuggestion={handleSuggestion}
                language={language}
              />
            ))}
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <Alert variant="destructive" className="mx-4 mb-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Footer */}
      <div className="border-t p-4 space-y-3">
        {/* Language Toggle & Clear */}
        <div className="flex items-center justify-between">
          <LanguageToggle language={language} onToggle={setLanguage} />
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearConversation}
              className="text-xs"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              {language === "bn" ? "নতুন চ্যাট" : "New chat"}
            </Button>
          )}
        </div>

        {/* Input Area */}
        <form onSubmit={handleSubmit} className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                language === "bn"
                  ? "আপনার প্রশ্ন লিখুন..."
                  : "Type your question..."
              }
              className="min-h-[44px] max-h-[120px] resize-none pr-10 rounded-xl focus-visible:ring-primary/30"
              disabled={isLoading}
            />
            {input.length > 0 && (
              <span className="absolute right-3 bottom-2 text-[10px] text-muted-foreground/50 pointer-events-none">
                {input.length}
              </span>
            )}
          </div>
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || !input.trim()}
            className={cn(
              "h-[44px] w-[44px] shrink-0 rounded-xl transition-all duration-200",
              input.trim() && !isLoading && "shadow-md hover:shadow-lg"
            )}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>

        <p className="text-[10px] text-muted-foreground/70 text-center leading-tight">
          {language === "bn"
            ? "লিনা ভুল করতে পারে। গুরুত্বপূর্ণ সিদ্ধান্তের আগে যাচাই করুন।"
            : "Lina is AI-powered and can make mistakes. Verify important figures."}
        </p>
      </div>
    </div>
  );
}
