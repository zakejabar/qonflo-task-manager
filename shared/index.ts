export const TASK_STATUSES = ["to_do", "pending", "in_progress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const NEXT_STATUS: Record<TaskStatus, TaskStatus | null> = {
    to_do: "pending",
    pending: "in_progress",
    in_progress: "done",
    done: null,
};

export const ACTORS = ["John", "Jane", "Mike", "Tom"] as const;
export type Actor = (typeof ACTORS)[number];

export const AUDIT_ACTIONS = ["created", "status_changed", "deleted"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type Task = {
    id: number;
    title: string;
    status: TaskStatus;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
};

export type AuditLog = {
    id: number;
    taskId: number;
    taskTitle: string;
    action: AuditAction;
    actor: string;
    fromStatus: TaskStatus | null;
    toStatus: TaskStatus | null;
    createdAt: string;
};