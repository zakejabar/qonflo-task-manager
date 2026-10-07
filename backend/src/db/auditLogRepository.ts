import type { Db } from "./index";
import type { AuditLog } from "../../../shared";

export function createAuditLogRepository(db: Db) {
  return {
    append(log: Omit<AuditLog, "id">): void {
      db.prepare(
        `INSERT INTO auditLogs
          (taskId, taskTitle, action, actor, fromStatus, toStatus, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        log.taskId,
        log.taskTitle,
        log.action,
        log.actor,
        log.fromStatus,
        log.toStatus,
        log.createdAt
      );
    },

    listByTask(taskId: number): AuditLog[] {
      return db
        .prepare("SELECT * FROM auditLogs WHERE taskId = ? ORDER BY createdAt, id")
        .all(taskId) as AuditLog[];
    },
  };
}

export type AuditLogRepository = ReturnType<typeof createAuditLogRepository>;