import express from "express";
import { openDb } from "./db";

const db = openDb();
console.log("Database siap");

const app = express();
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Backend jalan di http://localhost:${PORT}`);
});