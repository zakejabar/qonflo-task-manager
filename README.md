# Mini Task Manager

A small task manager where every status change is tracked in an audit log that can't be edited or deleted. Built as a take-home for Qonflo.

The interesting part here isn't the CRUD. It's making the change history trustworthy. Statuses can only move along the allowed flow, repeating the same change doesn't create duplicate history, and the audit log always stays in sync with the task.

## Running it

You'll need Node.js 20 or newer.

```bash
npm install
```

Then start the backend and frontend in two terminals:

```bash
npm run dev -w backend    # http://localhost:3000
npm run dev -w frontend   # http://localhost:5173
```

Open http://localhost:5173. The SQLite database (`backend/data.db`) is created automatically the first time the backend starts.

Tests and type checks:

```bash
npm test -w backend
npm run typecheck -w backend
npx tsc --noEmit -p frontend/tsconfig.app.json
```

To reset the data, stop the backend first, then delete `backend/data.db`. Don't delete it while the backend is running. SQLite notices the file is gone and refuses all writes, which I found out the hard way.

## How it's structured

```
shared/            Statuses, transition map, actor list, types, validators (used by FE and BE)
backend/src/
  db/              SQL schema, connection, repositories (SQL only, no business rules)
  domain/          Service (business rules) and domain errors
  routes/          Express routes (turn HTTP requests into service calls)
  app.ts           Wires the app together and maps domain errors to HTTP codes
  index.ts         Opens the database and starts the server
backend/tests/     API tests with Vitest + supertest, fresh in-memory DB per test
frontend/src/
  api.ts           The only place the frontend talks to the backend
  App.tsx          The UI
```

A request flows Route → Service → Repository → SQLite.

- **Repositories** only run SQL. The audit log repository only has `append` and `listByTask`. There's no update or delete for logs anywhere in the code.
- **The service** is where the rules live. It validates the actor and status, checks transitions, handles idempotency, and wraps the task change plus the log write in a single transaction. It doesn't know anything about HTTP. It just throws domain errors (`ValidationError`, `NotFoundError`, `InvalidTransitionError`, `TaskArchivedError`, `ConcurrentUpdateError`).
- **app.ts** is the one place those errors get translated into HTTP status codes.
- **shared/** is the single source of truth for statuses, the transition map, and the actor list, so the frontend and backend can't drift apart.

### API

| Method | Path | What it does |
|---|---|---|
| GET | `/api/tasks` | Active tasks. Add `?archived=true` for archived ones |
| POST | `/api/tasks` | Create a task, with `{ title, actor }` as the body |
| PUT | `/api/tasks/:id/status` | Change status, with `{ status, actor }` as the body |
| DELETE | `/api/tasks/:id` | Archive a task, with `{ actor }` as the body |
| GET | `/api/tasks/:id/audit-logs` | A task's history, oldest first |

Every error comes back in the same shape, `{ "error": { "code": "...", "message": "..." } }`.

| Code | When |
|---|---|
| 400 | Bad input (empty title, unknown actor or status, invalid id, broken JSON) |
| 404 | Task doesn't exist |
| 409 | Invalid transition, task is archived, or someone else changed it first |
| 500 | Anything unexpected. Details only go to the server log, never to the client |

The line between 400 and 409 works like this. A 400 is a request that could never be valid (`"finished"` isn't a status at all). A 409 is a request that makes sense on its own but conflicts with the current state of the data (`done` is a real status, you just can't jump there from `to_do`).

### Data

There are two tables.

- `tasks` has `id, title, status, createdAt, updatedAt, deletedAt`
- `auditLogs` has `id, taskId, taskTitle, action, actor, fromStatus, toStatus, createdAt`

Each kind of log entry fills those columns differently.

| action | fromStatus | toStatus |
|---|---|---|
| `created` | empty | `to_do` |
| `status_changed` | old status | new status |
| `deleted` | last status | empty |

## Assumptions

- The "minimum task structure" section in the brief was empty. I picked fields based on what the features actually need, which are `id, title, status, createdAt, updatedAt`, plus `deletedAt` for archiving.
- I read "only follows the order" as a status can only move forward one step. No skipping (`to_do` straight to `done`) and no going back. `done` is final.
- The actor is picked from a dropdown of hardcoded names, with no auth, as the brief allows.
- "Delete task" is implemented as archiving (more on that below).

## Decisions and trade-offs

**Task fields based on need, not on what trackers usually have.** Description, deadline, and assignee are common in real trackers, but nothing in this app uses them, so they're not stored. The actor isn't a task column either. It lives on each log entry, since different people can do different things to the same task.

**Delete means archive (soft delete).** The brief asks for delete, but also says logs can never be deleted under any circumstances. I went with archiving, so the task disappears from the main list but stays in the database, and you can still see it in a read-only archive section along with its full history. I wanted things to stay transparent and traceable. The API and button still say "delete". The cost is that every active-task query has to filter on `deletedAt`, archived tasks can't be changed, and there's no restore.

**Event-level logs that record more than just status changes.** Besides status changes, I also log when a task is created and deleted. The core problem in the brief is "nobody knows who changed what", and that applies just as much to who created or removed a task. I went event-level (what kind of thing happened) instead of field-level (which field changed) because only a couple of things can change in this app.

**A snapshot of the task title on every log entry.** The log captures what things looked like at the time, and it reads fine on its own without joining back to the tasks table. To be honest, with the current design it isn't strictly needed, since titles can't be edited and tasks are never really deleted. But it's one column, and it keeps the log correct if that ever changes.

**SQLite + transactions + triggers.** Compared to in-memory (gone on every restart) or a JSON file (you build every safeguard yourself), SQLite gives me transactions and triggers out of the box. The transaction makes sure the task update and the log write either both happen or neither does. The triggers reject any UPDATE or DELETE on the log table at the database level. The trade-off is writing a bit of SQL, and `better-sqlite3` is a native module that has to compile on install.

**Setting the same status again returns 200 with no new log.** Not logging it is required by the brief. I chose 200 over an error because what the request wanted is already true, so a double-click or a retry shouldn't look like a failure. Deleting twice works the same way.

**Conditional update.** The status only changes if it's still what we read a moment ago (`UPDATE ... WHERE id = ? AND status = ?`). With the current setup a race practically can't happen (see the second question below), but it's a tiny amount of effort and it keeps things safe if this ever moves to a multi-server database.

**Actors are validated in the backend, with no CHECK in the database.** The backend rejects names that aren't on the list, so nobody can sneak a fake name into the log by calling the API directly. I left it out of the database so adding a user doesn't require a schema change. In the `AuditLog` type, `actor` is a plain `string` rather than the `Actor` type, because logs are history, so if a name is ever removed from the list, old entries still have it.

**Timestamps are generated in code, not by the database.** That way the task's `updatedAt` and the log's `createdAt` are exactly the same for a single event.

**No per-event consistency CHECK in the database.** I kept the database-level guards focused on the rule the brief is explicit about (logs can't be changed). Which columns are filled for which event type is handled by the service and covered by tests.

**Setup.** npm workspaces so everything installs and runs from the root. The backend runs through `tsx` with no build step, which is fine for a take-home, but `tsx` doesn't type check, so type checking is a separate command. The frontend uses Vite's `/api` proxy instead of the `cors` library. Less code, but the proxy only exists in development.

**Frontend.** The "Move to" button only ever shows the next valid step (from the transition map in `shared/`), so the UI never offers an illegal transition. After every action, whether it worked or not, the task lists are fetched again so a stale screen catches up right away. Delete has no confirmation dialog, to keep things simple.

## What I'd do with more time

- A way to restore archived tasks, or at least a confirmation before deleting.
- A configurable status flow, including going back (like "reopen"). Real project tools usually allow that, but the brief asked for a one-way flow.
- Runtime validation of what comes back from the database (with a schema validator, for example). Right now the TypeScript types on query results are just a promise that isn't checked when the code runs. Tests are what keep column names and types in line.
- A production setup, meaning a built backend, and either the backend serving the frontend or a reverse proxy instead of the Vite proxy.
- Frontend tests.
- Pagination for tasks and logs.

## Questions from the brief

### How do you make sure the audit log can't be modified?

There are a few layers to it.

1. At the API level, there's no endpoint to edit or delete logs.
2. In the code, the audit log repository only has `append` and `listByTask`. Nothing anywhere updates or deletes a log.
3. In the database, two SQLite triggers reject every UPDATE and DELETE on `auditLogs`. Even buggy code can't change a log.
4. Logs point to tasks with a foreign key and no `ON DELETE CASCADE`, so the database refuses to permanently delete a task that has logs. On top of that, delete in this app is an archive, so task rows are never actually removed.

The task status and its log entry are also written in the same transaction, so you can't end up with a status change and no log, or the other way around. The database layer is covered by a test that goes straight to the database (skipping the API) and checks that the triggers reject the change.

### What's the riskiest part if lots of people use it?

Two people changing the same task's status at almost the same time. If the flow is "read status, check the rules, then write", the second request can read the old status before the first one finishes writing, and both end up logging the same change.

Right now that's covered because Node runs JavaScript on a single thread, `better-sqlite3` is synchronous, and the whole flow runs inside one transaction, so requests can't interleave. As an extra safeguard, the update only goes through `WHERE status = oldStatus`, so if someone else got there first, nothing changes and the service returns 409.

That single-thread guarantee goes away as soon as you run multiple instances against a shared database (Postgres, for example). At that point the conditional update becomes the main safeguard, and transactions need the right isolation level.

There's also a user-side version of this, which is a stale screen. Someone can click a button based on an old status. That's handled by idempotency (repeating the same request counts as success), rejecting illegal transitions, and the frontend refetching after every action.

### If this grows into a big system, what would you refactor first and why?

**The audit log.** Right now it's built around a task's lifecycle and status changes, with `fromStatus` and `toStatus` columns. As soon as other fields become editable (title, assignee, deadline), that's not enough. I'd generalize it into field-level entries (`field`, `oldValue`, `newValue`), like the activity history in project management tools, so adding a new field doesn't mean changing the log table.

After that, **the status flow definition**. The transition map is hardcoded as one straight line. Bigger systems usually need different flows per task type or team, ways to go back, and rules about who can make which transition. That should move out of the code and into configuration.

## How I used AI

I used Claude throughout. The split was roughly that I made the design decisions, and AI wrote repetitive code and reviewed what I wrote.

- For the design, I laid out what i wanted and also what the requirements are, and i tell ai to give me some idea and i choose and decide the design based on my pure opinion and also with consider it with AI idea.
- For setup, some commands and config files came from AI. I ran them and checked everything with the health endpoint.
- For the database, I sketched the table design first. AI pointed out what I got wrong. I fixed the design, then AI wrote the final SQL including the triggers.
- I wrote `shared/` and the repositories myself, following patterns and going through a few rounds of review. The final version of the task repository was cleaned up by AI. One bug I wrote, swapped parameter order in `updateStatusIf`, passed type checking completely.
- For the service, routes, and error handling, some of the code was written by AI, following the rules I'd already decided. Since this is the most important part, I went back through it line by line.
- For tests, I decided the expected results (status codes, log counts, error types) for most of the tests.
- On the frontend, I filled in the paths and methods in `api.ts`. Also i guide AI to write the frontend.

Here's how I checked it all.

- Manual checks in `sqlite3` showed the triggers, CHECK constraints, and foreign key all reject what they should.
- 11 `curl` scenarios against the API, including confirming a task's history had exactly 3 entries after several rejected requests and one idempotent one.
- 15 automated tests.
- Manual testing in the browser, including two tabs to simulate a stale screen, and with the backend turned off.
- Bugs I tracked down myself along the way were `app.ts` sitting in the wrong folder, an old backend process still holding the port, and deleting the database file while the backend was still running.

## Time spent

About 5 hours over 3 sessions splitted in 2 days, including time spent learning things that were new to me, like SQLite triggers and also with im thinking about some tradeoff, like making the table structure, and idempotent system. 