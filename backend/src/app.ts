import express, { type NextFunction, type Request, type Response } from "express";
import type { Db } from "./db";
import { createTaskService } from "./domain/taskService";
import { createTaskRouter } from "./routes/tasks";
import {
  ValidationError,
  NotFoundError,
  InvalidTransitionError,
  TaskArchivedError,
  ConcurrentUpdateError,
} from "./domain/errors";

type HttpError = { status: number; code: string; message: string };

function toHttpError(err: unknown): HttpError {
  if (err instanceof ValidationError) {
    return { status: 400, code: err.name, message: err.message };
  }
  if (err instanceof NotFoundError) {
    return { status: 404, code: err.name, message: err.message };
  }
  if (
    err instanceof InvalidTransitionError ||
    err instanceof TaskArchivedError ||
    err instanceof ConcurrentUpdateError
  ) {
    return { status: 409, code: err.name, message: err.message };
  }
  if (err instanceof SyntaxError) {
    return { status: 400, code: "InvalidJson", message: "Request body is not valid JSON" };
  }
  return { status: 500, code: "InternalError", message: "Something went wrong" };
}

export function createApp(db: Db) {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/tasks", createTaskRouter(createTaskService(db)));

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "RouteNotFound", message: "Route not found" } });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const httpError = toHttpError(err);
    if (httpError.status === 500) console.error(err);
    res
      .status(httpError.status)
      .json({ error: { code: httpError.code, message: httpError.message } });
  });

  return app;
}