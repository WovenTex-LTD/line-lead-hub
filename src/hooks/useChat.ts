import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ChatCitation {
  chunkId: string;
  documentTitle: string;
  documentType: string;
  sectionHeading: string | null;
  pageNumber: number | null;
  sourceUrl: string | null;
  snippet: string;
}

export interface ChatToolUse {
  name: string;
  input: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: ChatCitation[];
  noEvidence?: boolean;
  suggestedQuestions?: string[];
  toolsUsed?: ChatToolUse[];
  timestamp: Date;
  isLoading?: boolean;
}

export interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  conversationId: string | null;
  language: "en" | "bn" | "zh";
  setLanguage: (lang: "en" | "bn" | "zh") => void;
  sendMessage: (content: string) => Promise<void>;
  submitFeedback: (messageId: string, feedback: "thumbs_up" | "thumbs_down", comment?: string) => Promise<void>;
  clearConversation: () => void;
  fetchSource: (chunkId: string) => Promise<any>;
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [language, setLanguage] = useState<"en" | "bn" | "zh">("en");
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load language preference
  useEffect(() => {
    const savedLang = localStorage.getItem("chat-language");
    if (savedLang === "en" || savedLang === "bn" || savedLang === "zh") {
      setLanguage(savedLang);
    }
  }, []);

  // Save language preference
  const handleSetLanguage = useCallback((lang: "en" | "bn" | "zh") => {
    setLanguage(lang);
    localStorage.setItem("chat-language", lang);
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    setError(null);
    setIsLoading(true);

    // Add user message
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date(),
    };

    // Add loading placeholder for assistant
    const loadingMessage: ChatMessage = {
      id: `assistant-loading-${Date.now()}`,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isLoading: true,
    };

    setMessages((prev) => [...prev, userMessage, loadingMessage]);

    try {
      // Get auth token
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        throw new Error("Please sign in to use the chat assistant.");
      }

      // Cancel any pending request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const { data, error: invokeError } = await supabase.functions.invoke("chat", {
        body: {
          message: content,
          conversation_id: conversationId,
          language,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (invokeError) {
        throw new Error(invokeError.message || "Failed to send message");
      }

      // Update conversation ID if new
      if (data.conversation_id && !conversationId) {
        setConversationId(data.conversation_id);
      }

      // Replace loading message with actual response
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.message,
        citations: data.citations,
        noEvidence: data.no_evidence,
        suggestedQuestions: data.suggested_questions,
        toolsUsed: data.tools_used,
        timestamp: new Date(),
      };

      setMessages((prev) =>
        prev.map((msg) => (msg.isLoading ? assistantMessage : msg))
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      setError(errorMessage);

      // Remove loading message
      setMessages((prev) => prev.filter((msg) => !msg.isLoading));
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, language, isLoading]);

  const submitFeedback = useCallback(
    async (messageId: string, feedback: "thumbs_up" | "thumbs_down", comment?: string) => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;

        if (!accessToken) return;

        await supabase.functions.invoke("chat-feedback", {
          body: {
            message_id: messageId,
            feedback,
            comment,
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
      } catch (err) {
        console.error("Failed to submit feedback:", err);
      }
    },
    []
  );

  const fetchSource = useCallback(async (chunkId: string) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        throw new Error("Not authenticated");
      }

      const { data, error } = await supabase.functions.invoke(`get-source/${chunkId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (error) throw error;
      return data;
    } catch (err) {
      console.error("Failed to fetch source:", err);
      return null;
    }
  }, []);

  const clearConversation = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setError(null);
  }, []);

  return {
    messages,
    isLoading,
    error,
    conversationId,
    language,
    setLanguage: handleSetLanguage,
    sendMessage,
    submitFeedback,
    clearConversation,
    fetchSource,
  };
}
