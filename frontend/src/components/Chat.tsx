"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import type {
  AuthResponse,
  ChatHistoryResponse,
  ChatLanguage,
  ChatResponse,
  StartConversationResponse,
  TaskView,
  User,
} from "@/lib/types";
import MessageBubble, { type ChatMessage } from "@/components/MessageBubble";

type LanguageMode = ChatLanguage | "auto";

const suggestions: Record<ChatLanguage, string[]> = {
  en: [
    "Create a task for Rahul to send the report by tomorrow 5pm",
    "Show my pending tasks",
    "Show overdue tasks",
    "Complete task #1",
  ],
  hi: [
    "राहुल को कल शाम 5 बजे रिपोर्ट भेजने का काम बनाओ",
    "मेरे बाकी काम दिखाओ",
    "मेरे देरी वाले काम दिखाओ",
    "काम नंबर 1 पूरा करो",
  ],
  hinglish: [
    "Kal 5 baje Rahul ko report bhejne ka task banao",
    "Mere pending tasks dikhao",
    "Show overdue tasks",
    "Task #1 complete kar do",
  ],
};

const welcomeMessages: Record<ChatLanguage, (name: string) => string> = {
  en: (name) =>
    `Hi ${name}! I’m your task assistant. What would you like to work on?`,
  hi: (name) =>
    `नमस्ते ${name}! मैं आपका task assistant हूँ। आज कौन सा काम करना है?`,
  hinglish: (name) =>
    `Namaste ${name}! Main aapka task assistant hoon. Aaj kya karna hai?`,
};

const thinkingMessages: Record<ChatLanguage, [string, string, string]> = {
  en: [
    "Understanding your message…",
    "Checking task details…",
    "Preparing your reply…",
  ],
  hi: [
    "आपका संदेश समझ रहा हूँ…",
    "काम की जानकारी देख रहा हूँ…",
    "जवाब तैयार कर रहा हूँ…",
  ],
  hinglish: [
    "Aapka message samajh raha hoon…",
    "Task details check kar raha hoon…",
    "Reply taiyaar kar raha hoon…",
  ],
};

const languageNames: Record<LanguageMode, string> = {
  auto: "Auto",
  en: "English",
  hi: "हिन्दी",
  hinglish: "Hinglish",
};

const greetingLabels: Record<ChatLanguage, string> = {
  en: "Hi",
  hi: "नमस्ते",
  hinglish: "Namaste",
};

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function isLanguageMode(value: string): value is LanguageMode {
  return value === "auto" || value === "en" || value === "hi" || value === "hinglish";
}

export default function Chat() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] =
    useState<ChatHistoryResponse["conversations"]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [thinkingStage, setThinkingStage] = useState(0);
  const [languageMode, setLanguageMode] = useState<LanguageMode>("auto");
  const [activeLanguage, setActiveLanguage] =
    useState<ChatLanguage>("hinglish");
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const languageModeRef = useRef<LanguageMode>("auto");
  const messageListRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const redirectToLogin = useCallback(() => {
    router.replace("/login");
  }, [router]);

  const checkSession = useCallback(async () => {
    setAuthError("");
    try {
      const result = await apiRequest<AuthResponse>("/auth/me");
      let history = await apiRequest<ChatHistoryResponse>("/chat/history");
      if (!history.conversationId) {
        const created = await apiRequest<StartConversationResponse>(
          "/chat/conversations",
          { method: "POST" },
        );
        history = await apiRequest<ChatHistoryResponse>(
          `/chat/history?conversationId=${encodeURIComponent(created.conversationId)}`,
        );
      }
      setUser(result.user);
      setConversationId(history.conversationId);
      setConversations(history.conversations);
      const browserLanguage: ChatLanguage = navigator.language
        .toLowerCase()
        .startsWith("hi")
        ? "hi"
        : "en";
      const lastAssistantMessage = [...history.messages]
        .reverse()
        .find((message) => message.role === "assistant");
      const greetingLanguage =
        lastAssistantMessage?.language ??
        (languageModeRef.current === "auto"
        ? browserLanguage
        : languageModeRef.current);
      setActiveLanguage(greetingLanguage);
      setMessages(
        history.messages.length
          ? history.messages.map((message) => ({
              id: String(message.id),
              role: message.role,
              text: message.text,
              tasks: message.tasks,
              quickReplies: message.quickReplies,
            }))
          : [
              {
                id: "welcome",
                role: "assistant",
                text: welcomeMessages[greetingLanguage](
                  result.user.name.split(" ")[0] ?? "",
                ),
              },
            ],
      );
      setShowSuggestions(history.messages.length === 0);
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 401) {
        redirectToLogin();
        return;
      }
      setAuthError(
        error instanceof Error
          ? error.message
          : "We couldn’t load your account. Please try again.",
      );
    }
  }, [redirectToLogin]);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  useEffect(() => {
    const list = messageListRef.current;
    if (list) {
      list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    }
  }, [messages, sending]);

  useEffect(() => {
    if (!sending || thinkingStage >= 2) return;
    const timer = window.setTimeout(
      () => setThinkingStage((stage) => Math.min(stage + 1, 2)),
      thinkingStage === 0 ? 1400 : 2200,
    );
    return () => window.clearTimeout(timer);
  }, [sending, thinkingStage]);

  const replaceTask = useCallback((messageId: string, updatedTask: TaskView) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? {
              ...message,
              tasks: message.tasks?.map((task) =>
                task.id === updatedTask.id ? updatedTask : task,
              ),
            }
          : message,
      ),
    );
  }, []);

  const sendMessage = useCallback(
    async (text: string, retryMessageId?: string) => {
      const messageText = text.trim();
      if (!messageText || sending || !user) {
        return;
      }

      setSending(true);
      setThinkingStage(0);
      setShowSuggestions(false);
      setDraft("");
      if (inputRef.current) {
        inputRef.current.style.height = "40px";
        inputRef.current.style.overflowY = "hidden";
      }
      if (retryMessageId) {
        setMessages((current) =>
          current.filter((message) => message.id !== retryMessageId),
        );
      } else {
        setMessages((current) => [
          ...current,
          { id: makeId(), role: "user", text: messageText },
        ]);
      }

      try {
        const result = await apiRequest<ChatResponse>("/chat", {
          method: "POST",
          body: JSON.stringify({
            message: messageText,
            ...(conversationId ? { conversationId } : {}),
            ...(languageMode !== "auto" ? { language: languageMode } : {}),
          }),
        });
        setActiveLanguage(result.language);
        setConversations((current) =>
          current.map((conversation) =>
            conversation.id === conversationId &&
            conversation.title === "New chat"
              ? { ...conversation, title: messageText.slice(0, 100) }
              : conversation,
          ),
        );
        setMessages((current) => [
          ...current,
          {
            id: makeId(),
            role: "assistant",
            text: result.reply,
            tasks: result.tasks,
            quickReplies: result.quickReplies,
          },
        ]);
      } catch (error) {
        if (error instanceof ApiError && error.statusCode === 401) {
          redirectToLogin();
          return;
        }
        setMessages((current) => [
          ...current,
          {
            id: makeId(),
            role: "error",
            text:
              error instanceof Error
                ? error.message
                : "Your message could not be sent. Please try again.",
            retryText: messageText,
          },
        ]);
      } finally {
        setSending(false);
        inputRef.current?.focus();
      }
    },
    [conversationId, languageMode, redirectToLogin, sending, user],
  );

  async function loadConversation(id: string): Promise<boolean> {
    setHistoryBusy(true);
    setHistoryError("");
    try {
      const history = await apiRequest<ChatHistoryResponse>(
        `/chat/history?conversationId=${encodeURIComponent(id)}`,
      );
      setConversationId(history.conversationId);
      setConversations(history.conversations);
      setMessages(
        history.messages.map((message) => ({
          id: String(message.id),
          role: message.role,
          text: message.text,
          tasks: message.tasks,
          quickReplies: message.quickReplies,
        })),
      );
      setShowSuggestions(history.messages.length === 0);
      const lastAssistant = [...history.messages]
        .reverse()
        .find((message) => message.role === "assistant");
      if (lastAssistant) setActiveLanguage(lastAssistant.language);
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 401) {
        redirectToLogin();
        return false;
      }
      setHistoryError(
        error instanceof Error ? error.message : "Unable to open this chat.",
      );
      return false;
    } finally {
      setHistoryBusy(false);
    }
    return true;
  }

  async function startNewChat() {
    setHistoryBusy(true);
    setHistoryError("");
    try {
      const created = await apiRequest<StartConversationResponse>(
        "/chat/conversations",
        { method: "POST" },
      );
      const loaded = await loadConversation(created.conversationId);
      if (!loaded) return;
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          text: welcomeMessages[activeLanguage](user?.name.split(" ")[0] ?? ""),
        },
      ]);
      setShowSuggestions(true);
      setDraft("");
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 401) {
        redirectToLogin();
        return;
      }
      setHistoryError(
        error instanceof Error ? error.message : "Unable to start a new chat.",
      );
    } finally {
      setHistoryBusy(false);
    }
  }

  async function clearHistory() {
    if (
      !window.confirm(
        "Delete all saved conversations? Your tasks will not be deleted.",
      )
    ) {
      return;
    }
    setHistoryBusy(true);
    setHistoryError("");
    try {
      await apiRequest<{ ok: true }>("/chat/history", { method: "DELETE" });
      setConversationId(null);
      setConversations([]);
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          text: welcomeMessages[activeLanguage](user?.name.split(" ")[0] ?? ""),
        },
      ]);
      const created = await apiRequest<StartConversationResponse>(
        "/chat/conversations",
        { method: "POST" },
      );
      const loaded = await loadConversation(created.conversationId);
      if (!loaded) return;
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          text: welcomeMessages[activeLanguage](user?.name.split(" ")[0] ?? ""),
        },
      ]);
      setShowSuggestions(true);
      setDraft("");
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 401) {
        redirectToLogin();
        return;
      }
      setHistoryError(
        error instanceof Error ? error.message : "Unable to clear chat history.",
      );
    } finally {
      setHistoryBusy(false);
    }
  }

  function changeLanguageMode(mode: LanguageMode) {
    languageModeRef.current = mode;
    setLanguageMode(mode);
    const language = mode === "auto" ? activeLanguage : mode;
    setActiveLanguage(language);
    setMessages((current) =>
      current.map((message, index) =>
        index === 0 && message.id === "welcome"
          ? {
              ...message,
              text: welcomeMessages[language](user?.name.split(" ")[0] ?? ""),
            }
          : message,
      ),
    );
  }

  async function logout() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      await apiRequest<{ ok: true }>("/auth/logout", { method: "POST" });
      router.replace("/login");
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 401) {
        redirectToLogin();
        return;
      }
      setLogoutError(
        error instanceof Error ? error.message : "Unable to log out. Try again.",
      );
    } finally {
      setLoggingOut(false);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(draft);
  }

  function handleDraftChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const textarea = event.currentTarget;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 144 ? "auto" : "hidden";
    setDraft(textarea.value);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void sendMessage(draft);
    }
  }

  function updateMessageTask(messageId: string, updatedTask: TaskView) {
    replaceTask(messageId, updatedTask);
  }

  if (!user && !authError) {
    return (
      <main className="loading-screen" aria-live="polite">
        <span className="loading-mark" aria-hidden="true">
          ✦
        </span>
        <p>Loading your workspace…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="loading-screen">
        <div className="connection-card" role="alert">
          <span className="connection-icon" aria-hidden="true">
            !
          </span>
          <h1>We couldn’t connect</h1>
          <p>{authError}</p>
          <button className="button button-primary" onClick={() => void checkSession()} type="button">
            Try again
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="chat-app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ✦
          </span>
          <span className="brand-copy">
            <span>taskmate</span>
            <span className="brand-caption">Your task workspace</span>
          </span>
        </div>
        <div className="header-user">
          {logoutError && <span className="logout-error" role="alert">{logoutError}</span>}
          <label className="visually-hidden" htmlFor="reply-language">
            Reply language
          </label>
          <select
            className="language-select"
            id="reply-language"
            onChange={(event) => {
              const value = event.target.value;
              if (isLanguageMode(value)) changeLanguageMode(value);
            }}
            value={languageMode}
          >
            {(Object.keys(languageNames) as LanguageMode[]).map((language) => (
              <option key={language} value={language}>
                {languageNames[language]}
              </option>
            ))}
          </select>
          <div className="user-profile">
            <span className="user-avatar" aria-hidden="true">{initials(user.name)}</span>
            <span className="user-greeting">
              <span className="user-greeting-label">{greetingLabels[activeLanguage]},</span>
              <strong>{user.name.split(" ")[0]}</strong>
            </span>
          </div>
          <button
            aria-label="Log out"
            className="button button-secondary logout-button"
            disabled={loggingOut}
            onClick={() => void logout()}
            type="button"
          >
            {loggingOut ? "Logging out…" : "Log out"}
          </button>
        </div>
      </header>

      <div className="history-toolbar" aria-label="Conversation history controls">
        <label className="visually-hidden" htmlFor="conversation-history">
          Saved conversations
        </label>
        <select
          className="conversation-select"
          disabled={historyBusy || sending}
          id="conversation-history"
          onChange={(event) => {
            if (event.target.value) void loadConversation(event.target.value);
          }}
          value={conversationId ?? ""}
        >
          {conversations.map((conversation) => (
            <option key={conversation.id} value={conversation.id}>
              {conversation.title} ·{" "}
              {new Date(conversation.updatedAt).toLocaleString(undefined, {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </option>
          ))}
        </select>
        <button
          className="history-button"
          disabled={historyBusy || sending}
          onClick={() => void startNewChat()}
          type="button"
        >
          {historyBusy ? "Please wait…" : "New chat"}
        </button>
        <button
          className="history-button history-clear-button"
          disabled={historyBusy || sending || conversations.length === 0}
          onClick={() => void clearHistory()}
          type="button"
        >
          Clear history
        </button>
        {historyError && <span className="history-error" role="alert">{historyError}</span>}
      </div>

      <section
        aria-label="Chat messages"
        aria-live="polite"
        className="message-list"
        ref={messageListRef}
        role="log"
      >
        <div className="message-list-inner">
          <div className="conversation-label">
            <span className="conversation-status" aria-hidden="true" />
            <span>Task assistant</span>
            <span className="conversation-divider" aria-hidden="true">·</span>
            <span>Ask in English, Hindi or Hinglish</span>
          </div>
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onRetry={(messageId, text) => void sendMessage(text, messageId)}
              onTaskUpdate={updateMessageTask}
              onUnauthorized={redirectToLogin}
              onQuickReply={(value) => void sendMessage(value)}
              quickRepliesDisabled={sending}
            />
          ))}
          {showSuggestions && messages.length > 0 && (
            <div className="suggestion-wrap" aria-label="Suggested messages">
              <span className="suggestion-label">Try asking</span>
              {suggestions[activeLanguage].map((suggestion) => (
                <button
                  className="suggestion-chip"
                  disabled={sending}
                  key={suggestion}
                  onClick={() => void sendMessage(suggestion)}
                  type="button"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
          {sending && (
            <div
              aria-label={thinkingMessages[activeLanguage][thinkingStage]}
              aria-live="polite"
              className="message-row message-assistant"
              role="status"
            >
              <span className="assistant-avatar" aria-hidden="true">✦</span>
              <div className="typing-indicator">
                <span />
                <span />
                <span />
                <p>{thinkingMessages[activeLanguage][thinkingStage]}</p>
              </div>
            </div>
          )}
        </div>
      </section>

      <footer className="composer-area">
        <form className="composer" onSubmit={handleSubmit}>
          <label className="visually-hidden" htmlFor="chat-input">
            Message your task assistant
          </label>
          <textarea
            id="chat-input"
            onChange={handleDraftChange}
            onKeyDown={handleKeyDown}
            placeholder="Message taskmate…"
            ref={inputRef}
            rows={1}
            value={draft}
          />
          <button
            aria-label="Send message"
            className="send-button"
            disabled={sending || !draft.trim()}
            type="submit"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="m21 3-7.2 18-3.6-7.2L3 10.2 21 3Z" />
              <path d="M10.2 13.8 15 9" />
            </svg>
          </button>
        </form>
        <p className="composer-hint">
          <span>Enter to send</span>
          <span className="hint-divider" aria-hidden="true">·</span>
          <span>Shift + Enter for a new line</span>
        </p>
      </footer>
    </main>
  );
}
