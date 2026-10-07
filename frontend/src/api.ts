import type { Actor, AuditLog, Task, TaskStatus } from "../../shared";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.error?.code ?? "UnknownError",
      body?.error?.message ?? `Request failed with status ${res.status}`
    );
  }

  return body as T;
}

export const api = {
  listTasks: (archived = false) =>
    request<Task[]>(`/tasks${archived ? "?archived=true" : ""}`),

  createTask: (title: string, actor: Actor) =>
    request<Task>("/tasks", {           // path: alamat saja
      method: "POST",                   // method: jenis request
      body: JSON.stringify({ title, actor }),
    }),

  changeStatus: (id: number, status: TaskStatus, actor: Actor) =>
    request<Task>(`/tasks/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status, actor }),
    }),

  deleteTask: (id: number, actor: Actor) =>
    request<Task>(`/tasks/${id}`, {
      method: "DELETE",
      body: JSON.stringify({ actor }),
    }),

  getAuditLogs: (id: number) => request<AuditLog[]>(`/tasks/${id}/audit-logs`),
};