# Taskmate frontend

A chat-based task manager built with Next.js 14, React 18, TypeScript, and plain CSS.

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.local.example` to `.env.local` and set `NEXT_PUBLIC_API_URL` if the API is not at `http://localhost:4000`.
3. Start the development server with `npm run dev`.
4. Open [http://localhost:3000](http://localhost:3000).

The backend must expose the documented API and set its JWT in an HttpOnly cookie. The frontend sends credentials with every API request and does not store tokens.

Run `npm run lint` and `npm run build` to validate the app.
