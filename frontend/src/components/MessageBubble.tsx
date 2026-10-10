"use client";

import type { TaskView } from "@/lib/types";
import TaskCard from "@/components/TaskCard";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
  tasks?: TaskView[];
  quickReplies?: { label: string; value: string }[];
  retryText?: string;
}

export default function MessageBubble({
  message,
  onRetry,
  onTaskUpdate,
  onUnauthorized,
  onQuickReply,
  quickRepliesDisabled,
}: {
  message: ChatMessage;
  onRetry: (messageId: string, text: string) => void;
  onTaskUpdate: (messageId: string, task: TaskView) => void;
  onUnauthorized: () => void;
  onQuickReply: (value: string) => void;
  quickRepliesDisabled: boolean;
}) {
  if (message.role === "user") {
    return (
      <div className="message-row message-user">
        <div className="message-bubble user-bubble">{message.text}</div>
      </div>
    );
  }

  if (message.role === "error") {
    return (
      <div className="message-row message-assistant">
        <span className="assistant-avatar" aria-hidden="true">
          ✦
        </span>
        <div className="message-bubble error-bubble">
          <p>{message.text}</p>
          {message.retryText && (
            <button
              className="retry-button"
              onClick={() => onRetry(message.id, message.retryText ?? "")}
              type="button"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="message-row message-assistant">
      <span className="assistant-avatar" aria-hidden="true">
        ✦
      </span>
      <div className="assistant-content">
        <div className="message-bubble assistant-bubble">
          <p className="message-text">{message.text}</p>
        </div>
        {message.tasks && message.tasks.length > 0 && (
          <div className="task-grid">
            {message.tasks.map((task) => (
              <TaskCard
                key={task.id}
                onUnauthorized={onUnauthorized}
                onUpdate={(updatedTask) => onTaskUpdate(message.id, updatedTask)}
                task={task}
              />
            ))}
          </div>
        )}
        {message.quickReplies && message.quickReplies.length > 0 && (
          <div className="quick-reply-wrap" aria-label="Suggested replies">
            {message.quickReplies.map((option) => (
              <button
                className="suggestion-chip quick-reply-chip"
                disabled={quickRepliesDisabled}
                key={`${option.label}-${option.value}`}
                onClick={() => onQuickReply(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
