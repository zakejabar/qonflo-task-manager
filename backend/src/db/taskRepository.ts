import type { Db } from "./index";
import type { Task, TaskStatus } from "../../../shared";

export function createTaskRepository(db: Db) {
  return {
    findById(id: number): Task | undefined {
      return db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task | undefined;
    },

    insert(title: string, status: TaskStatus, now: string): number {
      const result = db
        .prepare("INSERT INTO tasks (title, status, createdAt, updatedAt) VALUES (?, ?, ?, ?)")
        .run(title, status, now, now);
      return Number(result.lastInsertRowid);
    },

    listActive(): Task[] {
      return db
        .prepare("SELECT * FROM tasks WHERE deletedAt IS NULL ORDER BY id")
        .all() as Task[];
    },

    listArchived(): Task[] {
      return db
        .prepare("SELECT * FROM tasks WHERE deletedAt IS NOT NULL ORDER BY id")
        .all() as Task[];
    },

    updateStatusIf(id: number, fromStatus: TaskStatus, toStatus: TaskStatus, now: string): boolean {
      const result = db
        .prepare(
          "UPDATE tasks SET status = ?, updatedAt = ? WHERE id = ? AND status = ? AND deletedAt IS NULL"
        )
        .run(toStatus, now, id, fromStatus);
      return result.changes === 1;
    },

    archive(id: number, now: string): boolean {
      const result = db
        .prepare("UPDATE tasks SET deletedAt = ?, updatedAt = ? WHERE id = ? AND deletedAt IS NULL")
        .run(now, now, id);
      return result.changes === 1;
    },
  };
}

export type TaskRepository = ReturnType<typeof createTaskRepository>;