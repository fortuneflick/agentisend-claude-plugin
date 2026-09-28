# Astro

An API route that confirms a waitlist sign-up and returns the message id. It reads a form post, so
a plain `<form method="POST" action="/api/waitlist">` works with JavaScript switched off, and it
refuses a malformed address before the API is called.

## Environment

| Variable | Required | What it is |
|---|---|---|
| `AGENTISEND_API_KEY` | yes | A key with `sending_access`. |
| `MAIL_FROM` | yes | The From address, on a domain you have verified. |
| `AGENTISEND_BASE_URL` | no | Defaults to `https://api.agentisend.com`. |

API routes need an adapter (`@astrojs/node`, `@astrojs/vercel` and the rest) so they run on demand.

## Wire it up

Copy `waitlist.ts` to `src/pages/api/waitlist.ts` and type the handler with Astro's own export:

```ts
import type { APIRoute } from 'astro';
export const POST: APIRoute = async ({ request }) => { /* … */ };
```

```bash
pnpm add agentisend
curl -X POST localhost:4321/api/waitlist -F email=you@example.com
```
