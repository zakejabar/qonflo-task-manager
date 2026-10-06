import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.join(here, "../../data.db");

export function openDb(file: string = DEFAULT_DB_PATH) {
  const db = new Database(file);
  db.pragma("foreign_keys = ON");

  const schema = readFileSync(path.join(here, "schema.sql"), "utf8");
  db.exec(schema);

  return db;
}

export type Db = ReturnType<typeof openDb>;