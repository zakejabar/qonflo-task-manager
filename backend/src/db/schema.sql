CREATE TABLE IF NOT EXISTS tasks (
  id         INTEGER PRIMARY KEY,
  title      TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('to_do', 'pending', 'in_progress', 'done')),
  createdAt  TEXT NOT NULL,
  updatedAt  TEXT NOT NULL,
  deletedAt  TEXT
);

CREATE TABLE IF NOT EXISTS auditLogs (
  id          INTEGER PRIMARY KEY,
  taskId      INTEGER NOT NULL REFERENCES tasks(id),
  taskTitle   TEXT NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('created', 'status_changed', 'deleted')),
  actor       TEXT NOT NULL,
  fromStatus  TEXT CHECK (fromStatus IN ('to_do', 'pending', 'in_progress', 'done')),
  toStatus    TEXT CHECK (toStatus IN ('to_do', 'pending', 'in_progress', 'done')),
  createdAt   TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS auditLogs_no_update
BEFORE UPDATE ON auditLogs
BEGIN
  SELECT RAISE(ABORT, 'audit logs are immutable');
END;

CREATE TRIGGER IF NOT EXISTS auditLogs_no_delete
BEFORE DELETE ON auditLogs
BEGIN
  SELECT RAISE(ABORT, 'audit logs are immutable');
END;