"use client";

import { useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import type { Status, TaskView } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";

const statusOptions: { status: Status; label: string }[] = [
  { status: "PENDING", label: "Mark pending" },
  { status: "IN_PROGRESS", label: "Mark in progress" },
  { status: "COMPLETED", label: "Mark completed" },
];

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      });
}

export default function TaskCard({
  task,
  onUpdate,
  onUnauthorized,
}: {
  task: TaskView;
  onUpdate: (task: TaskView) => void;
  onUnauthorized: () => void;
}) {
  const [updatingStatus, setUpdatingStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const isOverdue =
    task.status !== "COMPLETED" && new Date(task.dueAt).getTime() < Date.now();

  async function updateStatus(status: Status) {
    setUpdatingStatus(status);
    setError("");

    try {
      const updatedTask = await apiRequest<TaskView>(`/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      onUpdate(updatedTask);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.statusCode === 401) {
        onUnauthorized();
        return;
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update this task. Please try again.",
      );
    } finally {
      setUpdatingStatus(null);
    }
  }

  return (
    <article className="task-card">
      <div className="task-card-topline">
        <span className="task-id">#{task.id}</span>
        <div className="task-indicators">
          {isOverdue && <span className="overdue-chip">Overdue</span>}
          <StatusBadge status={task.status} />
        </div>
      </div>
      <h3 className="task-title">{task.title}</h3>
      {task.description && (
        <p className="task-description">{task.description}</p>
      )}
      <dl className="task-details">
        <div>
          <dt>Due</dt>
          <dd>{formatDate(task.dueAt)}</dd>
        </div>
        <div>
          <dt>Assigned to</dt>
          <dd>{task.assignedTo.name}</dd>
        </div>
        <div>
          <dt>Assigned by</dt>
          <dd>{task.assignedBy.name}</dd>
        </div>
      </dl>
      <div className="task-timestamps">
        <span>Created {formatDate(task.createdAt)}</span>
        <span>Updated {formatDate(task.updatedAt)}</span>
      </div>
      {task.permissions.canUpdateStatus && (
        <div className="task-actions" aria-label="Update task status">
          {statusOptions
            .filter((option) => option.status !== task.status)
            .map((option) => (
              <button
                className="button button-small button-secondary"
                disabled={updatingStatus !== null}
                key={option.status}
                onClick={() => void updateStatus(option.status)}
                type="button"
              >
                {updatingStatus === option.status ? "Updating…" : option.label}
              </button>
            ))}
        </div>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
