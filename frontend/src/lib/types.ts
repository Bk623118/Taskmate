export type Status = "PENDING" | "IN_PROGRESS" | "COMPLETED";
export type ChatLanguage = "en" | "hi" | "hinglish";

export interface User {
  id: number;
  name: string;
  email: string;
}

export interface TaskView {
  id: number;
  title: string;
  description: string;
  dueAt: string;
  status: Status;
  assignedTo: User;
  assignedBy: User;
  createdAt: string;
  updatedAt: string;
  permissions: {
    canEditAll: boolean;
    canUpdateStatus: boolean;
  };
}

export interface AuthResponse {
  user: User;
}

export interface ChatResponse {
  reply: string;
  tasks: TaskView[];
  language: ChatLanguage;
  quickReplies?: { label: string; value: string }[];
}

export interface ChatHistoryResponse {
  conversationId: string | null;
  conversations: {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
  }[];
  messages: {
    id: number;
    role: "user" | "assistant";
    text: string;
    language: ChatLanguage;
    tasks: TaskView[];
    createdAt: string;
    quickReplies?: { label: string; value: string }[];
  }[];
}

export interface StartConversationResponse {
  conversationId: string;
}
