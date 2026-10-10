# Chat-Based Task Manager

NestJS 10 API for managing shared tasks through REST endpoints and a deterministic, multilingual chat assistant. Data is stored in PostgreSQL with Prisma 5.22.

## Prerequisites

- Node.js 20 or newer and npm
- PostgreSQL 16, or a Supabase project
- The frontend in `../frontend` for the full browser experience

## Database and environment

Create a Supabase project, then open **Project Settings → Database → Connection string**. Copy the pooled connection string (port `6543`) to `DATABASE_URL`, and the direct connection string (port `5432`) to `DIRECT_URL`. Keep the `?pgbouncer=true` query parameter on the pooled URL. Do not commit `.env`.

```powershell
Copy-Item .env.example .env
```

Set these values in `backend/.env`:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Supabase pooler URL, port 6543, `?pgbouncer=true` |
| `DIRECT_URL` | Supabase direct PostgreSQL URL, port 5432 |
| `JWT_SECRET` | Random secret of at least 16 characters; required at startup |
| `FRONTEND_URL` | Allowed browser origin; defaults to `http://localhost:3000` |
| `PORT` | HTTP port; defaults to `4000` |
| `TZ` | Chat date/time timezone; defaults to `Asia/Kolkata` |
| `GEMINI_API_KEY` | Optional server-side Gemini key for Hindi, English, and Hinglish normalization |
| `GEMINI_MODEL` | Optional Gemini model; defaults to `gemini-3.8-flash` |
| `GEMINI_FALLBACK_MODEL` | Optional model retried when the primary returns 404 or 429; defaults to `gemini-3.1-flash-lite` |

For local PostgreSQL, start the optional database with `docker compose up -d` and use:

```dotenv
DATABASE_URL="postgresql://taskmanager:taskmanager@localhost:5432/taskmanager?schema=public"
DIRECT_URL="postgresql://taskmanager:taskmanager@localhost:5432/taskmanager?schema=public"
```

## Install, seed, and run

```powershell
npm install
npm run setup
npm run start:dev
```

`setup` generates the Prisma client, applies the schema with `prisma db push`, and seeds the three demo users and four sample tasks. `npm run seed` can be run again; sample tasks are upserted by assigned creator and title. The backend listens on `http://localhost:4000`.

Configure and run the frontend separately:

```powershell
Set-Location ..\frontend
Copy-Item .env.local.example .env.local
npm install
npm run dev
```

Change `NEXT_PUBLIC_API_URL` in `frontend/.env.local` if the API is hosted elsewhere.

## API

All protected routes use the `access_token` HttpOnly cookie set by login/register. Auth responses contain a safe user object, never the token or password hash.

| Method | Path | Authentication | Body / query | Success response |
|---|---|---|---|---|
| POST | `/auth/register` | No | `{ "name": "Alice", "email": "alice@example.com", "password": "Test@1234" }` | `{ "user": { "id": 1, "name": "Alice", "email": "alice@example.com" } }` |
| POST | `/auth/login` | No | `{ "email": "alice@example.com", "password": "Test@1234" }` | `{ "user": { "id": 1, "name": "Alice", "email": "alice@example.com" } }` |
| POST | `/auth/logout` | No | — | `{ "ok": true }` |
| GET | `/auth/me` | Yes | — | `{ "user": { "id": 1, "name": "Alice", "email": "alice@example.com" } }` |
| GET | `/chat/history` | Yes | Optional `conversationId` query | `{ "conversationId": "...", "conversations": [{ "id": "...", "title": "...", "createdAt": "...", "updatedAt": "..." }], "messages": [{ "id": 1, "role": "user", "text": "...", "language": "en", "tasks": [], "createdAt": "..." }] }` |
| POST | `/chat/conversations` | Yes | — | `{ "conversationId": "..." }` |
| DELETE | `/chat/history` | Yes | — | `{ "ok": true }` |
| GET | `/users` | Yes | — | `[{ "id": 2, "name": "Rahul", "email": "rahul@example.com" }]` |
| GET | `/tasks` | Yes | `q`, `status`, `scope` | `TaskView[]`, due date ascending |
| GET | `/tasks/:id` | Yes | — | `TaskView` |
| POST | `/tasks` | Yes | `{ "title": "Send report", "description": "Weekly update", "dueAt": "2026-10-10T11:30:00.000Z", "assignedToId": 2 }` | `TaskView` |
| PATCH | `/tasks/:id` | Yes | Any of `title`, `description`, `dueAt`, `assignedToId`, `status` | `TaskView` |
| POST | `/chat` | Yes | `{ "message": "Show my pending tasks", "language": "en", "conversationId": "..." }` (`language` and `conversationId` are optional) | `{ "reply": "...", "tasks": TaskView[], "language": "en", "quickReplies": [{ "label": "Tomorrow", "value": "tomorrow" }] }` (`quickReplies` is optional) |

`TaskView` contains `id`, `title`, `description`, ISO `dueAt`, `status`, safe `assignedTo` and `assignedBy` users, ISO `createdAt` and `updatedAt`, and `permissions` with `canEditAll` and `canUpdateStatus`.

Errors use `{ "message": string | string[], "statusCode": number }`. List scope is `assigned_to_me`, `assigned_by_me`, or `all` (default); `q` searches both title and description, and `status` accepts `PENDING`, `IN_PROGRESS`, or `COMPLETED`.

Example calls using a cookie jar:

```bash
curl -i -c cookies.txt -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"Test@1234"}' \
  http://localhost:4000/auth/login

curl -b cookies.txt http://localhost:4000/auth/me

curl -b cookies.txt -H "Content-Type: application/json" \
  -d '{"title":"Send report","description":"Weekly update","dueAt":"2026-10-10T11:30:00.000Z","assignedToId":2}' \
  http://localhost:4000/tasks

curl -b cookies.txt -H "Content-Type: application/json" \
  -d '{"message":"Create a task for Rahul to send the report by tomorrow 5pm"}' \
  http://localhost:4000/chat

curl -b cookies.txt -X PATCH -H "Content-Type: application/json" \
  -d '{"status":"COMPLETED"}' http://localhost:4000/tasks/1
```

## Task permissions

Permission enforcement is centralized in `TasksService`. Chat delegates task creation and updates to this same service; the chatbot has no extra privileges.

| Requester | Read task | Change status | Change title / description / due date / assignee |
|---|---:|---:|---:|
| Creator (`assignedBy`) | Yes | Yes | Yes |
| Assignee only (`assignedTo`) | Yes | Yes | No — 403 |
| Anyone else | No — 403 | No — 403 | No — 403 |

If creator and assignee are the same user, creator permissions apply. Users can only list or retrieve tasks they created or were assigned.

## Chat examples

- English: “Create a task for Rahul to send the report by tomorrow 5pm”, “Show overdue tasks”, “Complete task #3”.
- Hinglish: “Kal shaam 5 baje Rahul ko report bhejne ka task banao”, “Mere pending tasks dikhao”, “Task #1 complete kar do”.
- Hindi: “राहुल को कल शाम 5 बजे रिपोर्ट भेजने का काम बनाओ”, “मेरे बाकी काम दिखाओ”, “काम नंबर 1 पूरा करो”.

The flow asks one follow-up question at a time for missing task title, assignee, date, time, and description. Update follow-ups remember the selected task and field; invalid answers keep the focused question, while a new command or “cancel” exits the flow. In a date follow-up, a bare day such as `17` means the next upcoming 17th day of a month; explicit dates remain supported too. Chat dates use the configured `TZ` (default `Asia/Kolkata`) regardless of the server's local timezone, and create/date-change confirmations show the resolved local date and time. Say “skip” to omit the description or “cancel” to abandon the pending flow. Listing supports all visible tasks, status, assignee, creator, overdue, due date, task id, and title/description keyword filters. Updates target an id, a quoted title, or matching title/description keywords; ambiguous matches are clarified before mutation. Due-date and assignee changes show a task-specific preview and require explicit confirmation; status, title, and description changes are applied directly after the target is resolved.

Follow-up replies include optional quick choices for common assignees, dates, times, skipping the description, and selecting an ambiguous task. The frontend can send a reply-language preference; without one, chat detects the user's language and keeps it consistent through short follow-ups. The latest 100 user/assistant messages for each of the latest 20 conversations are saved per account in the existing chat-state row and restored by the frontend; task cards are reloaded with current visibility and permissions. “New chat” preserves older conversations and resets follow-up context; “Clear history” deletes the user's saved chats but never their tasks. A contextual update can refer to the task cards in the immediately preceding assistant response; if that response contained multiple tasks, the user must choose one before an update is applied. No database schema change is needed for chat history.

## Design and security

- When `GEMINI_API_KEY` is configured, `ChatNormalizer` sends the user's chat message and the pending follow-up slot/language to Google's Gemini API. Gemini only classifies intent and normalizes language; it receives no task list, user records, or credentials. The key stays on the backend and is sent in a request header, never to the browser.
- Chat text is sent to Google when Gemini is enabled. If the key is absent, requests fail/time out, or responses are invalid, the server uses deterministic parsing. Each model attempt is capped at 3.5 seconds. When the primary model returns 404 or 429, it retries once with `GEMINI_FALLBACK_MODEL` before falling back to deterministic parsing. The previous misspelled `Gemni_Api_Key` and `GEMINI_APIKEY` environment variable names remain supported for existing local setups; use `GEMINI_API_KEY` going forward.
- The chat engine (`src/chat/chat.engine.ts` and `date-parser.ts`) remains a deterministic TypeScript parser with no Nest imports, database access, LLM, or NLP dependency. It receives the normalized instruction, follow-up state, users, visible tasks, and current time, then returns a reply/create/update intent. A model-classified intent is checked before any task mutation; every mutation still goes through `TasksService` and its permission checks.
- `ChatService` loads visible context, expires saved follow-up state after 30 minutes, and sends mutations exclusively through `TasksService`. This shares the exact REST permission checks.
- Passwords use bcrypt cost 12. Login returns the same error for an unknown email and a bad password and compares unknown-user passwords against a dummy hash.
- JWTs use HS256, expire after seven days, and are only sent in the HttpOnly `access_token` cookie. Production cookies are Secure, with SameSite=Lax and path `/`. The guard verifies the token and reloads only safe user fields from PostgreSQL.
- Helmet, credentialed origin-restricted CORS, DTO validation with whitelist/forbid-non-whitelisted, and a global 120-requests-per-minute throttle are enabled. Login/register are limited to 10/minute; chat to 30/minute.
- User and task responses select only public user fields. `assignedById` is always taken from the authenticated requester and is rejected if supplied by a client.

## Assumptions and known limitations

- “Kal” means tomorrow, including Hinglish and Hindi. Dates are interpreted in the configured `TZ`; the default is `Asia/Kolkata`.
- Explicit dates support `DD/MM/YYYY`, `DD-MM-YYYY`, ISO dates, and month-name forms including ordinals such as `15th October 2026`.
- An hour without AM/PM uses PM for 1–6, AM for 7–11, and noon for 12. Same-weekday requests target the next week.
- A task is not visible to a user who is neither its creator nor assignee.
- This is deterministic keyword/slot parsing, not a general natural-language model. Unrecognized phrases get examples rather than a guessed action; uncommon spellings or complex relative dates may need rephrasing.
- The demo credentials are for local development only and should not be used in production.

## Tests

```powershell
npm test
npm run build
```

The engine tests run without a database. Permission API e2e tests are in `test/permissions.e2e-spec.ts` and only run against a database whose name includes `test`, to prevent accidental changes to a non-test database:

```powershell
npm run test:e2e
```

The e2e test database must have the Prisma schema applied (`npx prisma db push`).

## Demo accounts

| Email | Name | Password |
|---|---|---|
| `alice@example.com` | Alice Sharma | `Test@1234` |
| `rahul@example.com` | Rahul Verma | `Test@1234` |
| `priya@example.com` | Priya Singh | `Test@1234` |
