# Chat-Based Task Manager

A NestJS API for managing shared tasks through REST endpoints or a multilingual chat assistant. It uses PostgreSQL with Prisma and supports English, Hindi, and Hinglish.

## Get started

Requirements: Node.js 20+, npm, and PostgreSQL 16 or a Supabase project.


1. Install dependencies and prepare the database:

  ```bash
  npm install
  npm run setup
  ```

2. Start the API:

  ```bash
  npm run start:dev
  ```

The API runs at `http://localhost:4000`. `npm run setup` generates Prisma and seeds demo data. Set `FRONTEND_URL` if your frontend uses a different origin. `GEMINI_API_KEY` is optional; without it, chat uses the built-in deterministic parser.

## What it does

- Register and log in; authentication uses an HttpOnly cookie.
- Create, list, and update tasks, with permissions based on task creator and assignee.
- Use chat to create, find, and update tasks in English, Hindi, or Hinglish. Chat supports follow-up questions and saved conversations.
- Assign tasks to other users and manage status, due dates, and descriptions.

Protected API routes include `/auth/me`, `/users`, `/tasks`, and `/chat`. Sign in through `/auth/login` or `/auth/register` first. See the controller routes and DTOs in `src/` for request and response details.

## Frontend

Run the frontend separately from `../frontend`:

```bash
cd ../frontend
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_URL` there if the API is not at its default address.

## Tests

```bash
npm test
npm run build
```

End-to-end permission tests use a test database only; apply the Prisma schema before running `npm run test:e2e`.

## Demo accounts

| Email | Password |
|---|---|
| `alice@example.com` | `Test@1234` |
| `rahul@example.com` | `Test@1234` |
| `priya@example.com` | `Test@1234` |

