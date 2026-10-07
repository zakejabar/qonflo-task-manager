import { openDb } from "./db";
import { createApp } from "./app";

const db = openDb();
const app = createApp(db);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});