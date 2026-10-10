const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ||
  "http://localhost:4000";

export class ApiError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

function getErrorMessage(message: unknown): string {
  if (typeof message === "string" && message.trim()) {
    return message;
  }

  if (Array.isArray(message)) {
    const messages = message.filter(
      (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
    );
    if (messages.length > 0) {
      return messages.join(" ");
    }
  }

  return "Something went wrong. Please try again.";
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new Error(
      "Unable to connect to the task service. Check that the backend is running and try again.",
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    if (!response.ok) {
      throw new ApiError(
        "The server could not complete your request. Please try again.",
        response.status,
      );
    }
    throw new Error("The server returned an invalid response. Please try again.");
  }

  if (!response.ok) {
    const errorPayload =
      typeof payload === "object" && payload !== null && "message" in payload
        ? payload.message
        : undefined;
    throw new ApiError(getErrorMessage(errorPayload), response.status);
  }

  return payload as T;
}
