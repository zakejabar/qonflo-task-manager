import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ACTORS, NEXT_STATUS } from "../../shared";
import type { Actor, AuditLog, Task, TaskStatus } from "../../shared";
import { api, ApiError } from "./api";

const STATUS_LABEL: Record<TaskStatus, string> = {
  to_do: "To do",
  pending: "Pending",
  in_progress: "In progress",
  done: "Done",
};

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Could not reach the server. Is the backend running?";
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function describeLog(log: AuditLog): string {
  const who = `User "${log.actor}"`;
  const task = `Task "${log.taskTitle}"`;
  switch (log.action) {
    case "created":
      return `${who} created ${task} with status "${log.toStatus}"`;
    case "status_changed":
      return `${who} changed ${task} status from "${log.fromStatus}" to "${log.toStatus}"`;
    case "deleted":
      return `${who} deleted ${task} (last status "${log.fromStatus}")`;
  }
}

export default function App() {
  const [actor, setActor] = useState<Actor>(ACTORS[0]);
  const [title, setTitle] = useState("");
  const [activeTasks, setActiveTasks] = useState<Task[]>([]);
  const [archivedTasks, setArchivedTasks] = useState<Task[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadTasks() {
    try {
      const [active, archived] = await Promise.all([
        api.listTasks(false),
        api.listTasks(true),
      ]);
      setActiveTasks(active);
      setArchivedTasks(archived);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => {
    void loadTasks();
  }, []);

  async function runAction(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      await loadTasks();
      setBusy(false);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    await runAction(async () => {
      await api.createTask(title, actor);
      setTitle("");
    });
  }

  return (
    <main className="container">
      <header className="header">
        <h1>Mini Task Manager</h1>
        <label className="actor">
          Acting as
          <select value={actor} onChange={(e) => setActor(e.target.value as Actor)}>
            {ACTORS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      </header>

      {error && (
        <div className="error" role="alert">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}

      <form className="create" onSubmit={handleCreate}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New task title"
        />
        <button type="submit" disabled={busy || title.trim() === ""}>
          Add task
        </button>
      </form>

      <section>
        <h2>Tasks ({activeTasks.length})</h2>
        {activeTasks.length === 0 ? (
          <p className="empty">No active tasks.</p>
        ) : (
          <ul className="task-list">
            {activeTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                busy={busy}
                onAdvance={(status) => runAction(() => api.changeStatus(task.id, status, actor))}
                onDelete={() => runAction(() => api.deleteTask(task.id, actor))}
              />
            ))}
          </ul>
        )}
      </section>

      <section>
        <button className="link" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? "Hide" : "Show"} archived ({archivedTasks.length})
        </button>
        {showArchived &&
          (archivedTasks.length === 0 ? (
            <p className="empty">No archived tasks.</p>
          ) : (
            <ul className="task-list">
              {archivedTasks.map((task) => (
                <TaskItem key={task.id} task={task} busy={busy} />
              ))}
            </ul>
          ))}
      </section>
    </main>
  );
}

type TaskItemProps = {
  task: Task;
  busy: boolean;
  onAdvance?: (status: TaskStatus) => void;
  onDelete?: () => void;
};

function TaskItem({ task, busy, onAdvance, onDelete }: TaskItemProps) {
  const [showHistory, setShowHistory] = useState(false);
  const next = NEXT_STATUS[task.status];

  return (
    <li className={task.deletedAt ? "task archived" : "task"}>
      <div className="task-row">
        <span className="task-title">{task.title}</span>
        <span className={`badge badge-${task.status}`}>{STATUS_LABEL[task.status]}</span>
        <div className="task-actions">
          {onAdvance && next && (
            <button disabled={busy} onClick={() => onAdvance(next)}>
              Move to {STATUS_LABEL[next]}
            </button>
          )}
          {onDelete && (
            <button className="danger" disabled={busy} onClick={() => onDelete()}>
              Delete
            </button>
          )}
          <button className="link" onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? "Hide history" : "History"}
          </button>
        </div>
      </div>
      {task.deletedAt && <p className="muted">Archived {formatTime(task.deletedAt)}</p>}
      {showHistory && <AuditLogList taskId={task.id} version={task.updatedAt} />}
    </li>
  );
}

function AuditLogList({ taskId, version }: { taskId: number; version: string }) {
  const [logs, setLogs] = useState<AuditLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getAuditLogs(taskId)
      .then((data) => {
        if (!cancelled) setLogs(data);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [taskId, version]);

  if (error) return <p className="error-inline">{error}</p>;
  if (!logs) return <p className="muted">Loading history…</p>;

  return (
    <ol className="history">
      {logs.map((log) => (
        <li key={log.id}>
          <span>{describeLog(log)}</span>
          <time dateTime={log.createdAt}>{formatTime(log.createdAt)}</time>
        </li>
      ))}
    </ol>
  );
}