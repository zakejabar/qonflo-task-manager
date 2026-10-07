import type { Db } from "../db";
import { createTaskRepository } from "../db/taskRepository";
import { createAuditLogRepository } from "../db/auditLogRepository";
import { NEXT_STATUS, isActor, isTaskStatus } from "../../../shared";
import type { Actor, Task, AuditLog } from "../../../shared";
import {
  ValidationError,
  NotFoundError,
  InvalidTransitionError,
  TaskArchivedError,
  ConcurrentUpdateError,
} from "./errors";

export function createTaskService(db: Db) {
  const tasks = createTaskRepository(db);
  const logs = createAuditLogRepository(db);

  function requireActor(actor: unknown): Actor {
    if (!isActor(actor)) {
      throw new ValidationError(`Unknown actor: ${String(actor)}`);
    }
    return actor;
  }

  return {
    createTask(title: unknown, actor: unknown): Task {
      if (typeof title !== "string" || title.trim() === "") {
        throw new ValidationError("Title is required");
      }
      const validActor = requireActor(actor);
      const cleanTitle = title.trim();

      const run = db.transaction(() => {
        const now = new Date().toISOString();
        const id = tasks.insert(cleanTitle, "to_do", now);
        logs.append({
          taskId: id,
          taskTitle: cleanTitle,
          action: "created",
          actor: validActor,
          fromStatus: null,
          toStatus: "to_do",
          createdAt: now,
        });
        return tasks.findById(id)!;
      });

      return run();
    },

    changeStatus(id: number, target: unknown, actor: unknown): Task {
      const validActor = requireActor(actor);
      if (!isTaskStatus(target)) {
        throw new ValidationError(`Unknown status: ${String(target)}`);
      }

      const run = db.transaction(() => {
        const task = tasks.findById(id);
        if (!task) throw new NotFoundError(`Task ${id} not found`);
        if (task.deletedAt !== null) throw new TaskArchivedError(`Task ${id} is archived`);

        // Idempotent: already at target, no change and no log
        if (task.status === target) return task;

        if (NEXT_STATUS[task.status] !== target) {
          throw new InvalidTransitionError(`Cannot move task from ${task.status} to ${target}`);
        }

        const now = new Date().toISOString();
        const updated = tasks.updateStatusIf(id, task.status, target, now);
        if (!updated) {
          throw new ConcurrentUpdateError(`Task ${id} was modified by someone else`);
        }

        logs.append({
          taskId: id,
          taskTitle: task.title,
          action: "status_changed",
          actor: validActor,
          fromStatus: task.status,
          toStatus: target,
          createdAt: now,
        });

        return tasks.findById(id)!;
      });

      return run();
    },

    deleteTask(id: number, actor: unknown): Task {
      const validActor = requireActor(actor);

      const run = db.transaction(() => {
        const task = tasks.findById(id);
        if (!task) throw new NotFoundError(`Task ${id} not found`);

        // Idempotent: already archived, no change and no log
        if (task.deletedAt !== null) return task;

        const now = new Date().toISOString();
        const archived = tasks.archive(id, now);
        // Someone else archived it in between: goal already reached, so treat as idempotent
        if (!archived) return tasks.findById(id)!;

        logs.append({
          taskId: id,
          taskTitle: task.title,
          action: "deleted",
          actor: validActor,
          fromStatus: task.status,
          toStatus: null,
          createdAt: now,
        });

        return tasks.findById(id)!;
      });

      return run();
    },

    listActive(): Task[] {
      return tasks.listActive();
    },

    listArchived(): Task[] {
      return tasks.listArchived();
    },

    getAuditLogs(id: number): AuditLog[] {
      const task = tasks.findById(id);
      if (!task) throw new NotFoundError(`Task ${id} not found`);
      return logs.listByTask(id);
    },
  };
}

export type TaskService = ReturnType<typeof createTaskService>;