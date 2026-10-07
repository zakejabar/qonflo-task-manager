import { Router } from "express";
import type { TaskService } from "../domain/taskService";
import { ValidationError } from "../domain/errors";

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError(`Invalid task id: ${raw}`);
  }
  return id;
}

export function createTaskRouter(service: TaskService) {
  const router = Router();

  router.get("/", (req, res) => {
    const archived = req.query.archived === "true";
    res.json(archived ? service.listArchived() : service.listActive());
  });

  router.post("/", (req, res) => {
    const task = service.createTask(req.body?.title, req.body?.actor);
    res.status(201).json(task);
  });

  router.put("/:id/status", (req, res) => {
    const task = service.changeStatus(parseId(req.params.id), req.body?.status, req.body?.actor);
    res.json(task);
  });

  router.delete("/:id", (req, res) => {
    const task = service.deleteTask(parseId(req.params.id), req.body?.actor);
    res.json(task);
  });

  router.get("/:id/audit-logs", (req, res) => {
    res.json(service.getAuditLogs(parseId(req.params.id)));
  });

  return router;
}