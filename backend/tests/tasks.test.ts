import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { openDb, type Db } from "../src/db";
import { createApp } from "../src/app";

let db: Db;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  db = openDb(":memory:");
  app = createApp(db);
});

async function createTask(title = "Prepare invoice", actor = "Jane") {
  const res = await request(app).post("/api/tasks").send({ title, actor });
  return res.body;
}

function changeStatus(id: number, status: string, actor = "Jane") {
  return request(app).put(`/api/tasks/${id}/status`).send({ status, actor });
}

function deleteTask(id: number, actor = "Tom") {
  return request(app).delete(`/api/tasks/${id}`).send({ actor });
}

async function getLogs(id: number) {
  const res = await request(app).get(`/api/tasks/${id}/audit-logs`);
  return res.body;
}

describe("create task", () => {
  it("creates a task in to_do with a created log", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .send({ title: "Prepare invoice", actor: "Jane" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("to_do");

    const logs = await getLogs(res.body.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("created");
    expect(logs[0].actor).toBe("Jane");
  });

  it("rejects an empty title", async () => {
    const res = await request(app).post("/api/tasks").send({ title: "   ", actor: "Jane" });
    expect(res.status).toBe(400);
  });

  it("rejects an unknown actor", async () => {
    const res = await request(app).post("/api/tasks").send({ title: "X", actor: "Hacker" });
    expect(res.status).toBe(400);
  });
});

describe("status transitions", () => {
  it("moves forward one step", async () => {
    const task = await createTask();
    const res = await changeStatus(task.id, "pending");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pending");
  });

  it("moves through the full flow and logs every step in order", async () => {
    const task = await createTask();
    for (const status of ["pending", "in_progress", "done"]) {
      expect((await changeStatus(task.id, status)).status).toBe(200);
    }

    const logs = await getLogs(task.id);
    expect(logs.map((l: { toStatus: string }) => l.toStatus)).toEqual([
      "to_do",
      "pending",
      "in_progress",
      "done",
    ]);
  });

  it("rejects skipping a step", async () => {
    const task = await createTask();
    const res = await changeStatus(task.id, "done");

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("InvalidTransitionError");
    expect(await getLogs(task.id)).toHaveLength(1);
  });

  it("rejects moving backwards", async () => {
    const task = await createTask();
    await changeStatus(task.id, "pending");
    const res = await changeStatus(task.id, "to_do");

    expect(res.status).toBe(409);
    expect(await getLogs(task.id)).toHaveLength(2);
  });

  it("rejects an unknown status value", async () => {
    const task = await createTask();
    const res = await changeStatus(task.id, "finished");

    expect(res.status).toBe(400);
    expect(await getLogs(task.id)).toHaveLength(1);
  });
});

describe("idempotency", () => {
  it("updating to the same status does not create a new log", async () => {
    const task = await createTask();
    const first = await changeStatus(task.id, "pending");
    const second = await changeStatus(task.id, "pending");

    expect(second.status).toBe(200);
    expect(second.body.updatedAt).toBe(first.body.updatedAt);
    expect(await getLogs(task.id)).toHaveLength(2);
  });

  it("deleting twice writes only one deleted log", async () => {
    const task = await createTask();
    await deleteTask(task.id);
    const second = await deleteTask(task.id);

    expect(second.status).toBe(200);
    expect(await getLogs(task.id)).toHaveLength(2);
  });
});

describe("delete (archive)", () => {
  it("archives the task and keeps its history", async () => {
    const task = await createTask();
    await changeStatus(task.id, "pending");
    const res = await deleteTask(task.id, "Tom");

    expect(res.status).toBe(200);
    expect(res.body.deletedAt).not.toBeNull();

    const active = await request(app).get("/api/tasks");
    const archived = await request(app).get("/api/tasks?archived=true");
    expect(active.body).toHaveLength(0);
    expect(archived.body).toHaveLength(1);

    const logs = await getLogs(task.id);
    expect(logs).toHaveLength(3);
    expect(logs[2].action).toBe("deleted");
    expect(logs[2].actor).toBe("Tom");
    expect(logs[2].fromStatus).toBe("pending");
  });

  it("does not allow changing an archived task", async () => {
    const task = await createTask();
    await deleteTask(task.id);
    const res = await changeStatus(task.id, "pending");

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TaskArchivedError");
  });
});

describe("not found and bad input", () => {
  it("returns 404 for a task that does not exist", async () => {
    expect((await changeStatus(999, "pending")).status).toBe(404);
    expect((await deleteTask(999)).status).toBe(404);
    expect((await request(app).get("/api/tasks/999/audit-logs")).status).toBe(404);
  });

  it("returns 400 for an invalid id", async () => {
    const res = await request(app)
      .put("/api/tasks/abc/status")
      .send({ status: "pending", actor: "Jane" });
    expect(res.status).toBe(400);
  });
});

describe("audit log immutability", () => {
  it("the database rejects updating or deleting audit logs", async () => {
    const task = await createTask();

    expect(() => db.prepare("UPDATE auditLogs SET actor = 'Hacker'").run()).toThrow(/immutable/);
    expect(() => db.prepare("DELETE FROM auditLogs").run()).toThrow(/immutable/);
    expect(await getLogs(task.id)).toHaveLength(1);
  });
});