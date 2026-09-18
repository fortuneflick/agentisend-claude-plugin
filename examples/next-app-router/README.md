# Next.js App Router

A route handler at `app/api/send/route.ts` that sends a transactional email and returns the message
id, plus the same send as a Server Action in `app/actions.ts` for forms that post directly to the
server. Both keep the API key on the server and pass an `Idempotency-Key` derived from the
recipient, so a retried request replays the first send instead of mailing someone twice.

## Environment

| Variable | Required | What it is |
|---|---|---|
| `AGENTISEND_API_KEY` | yes | A key with `sending_access`. Create one in the console or with `POST /api-keys`. |
| `MAIL_FROM` | yes | The From address, on a domain you have verified. |
| `AGENTISEND_BASE_URL` | no | Defaults to `https://api.agentisend.com`. |

## Run it

```bash
pnpm add @agentisend/sdk-node
# copy route.ts to app/api/send/route.ts and actions.ts to app/actions.ts
curl -X POST localhost:3000/api/send -H 'content-type: application/json' -d '{"email":"you@example.com","name":"Ada"}'
```
