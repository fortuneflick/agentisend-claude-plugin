# Nuxt

A Nitro server route that confirms a booking and returns the message id. It refuses a malformed
address before the API is called, and it sends once per booking however many times the request is
retried.

## Environment

| Variable | Required | What it is |
|---|---|---|
| `AGENTISEND_API_KEY` | yes | A key with `sending_access`. |
| `MAIL_FROM` | yes | The From address, on a domain you have verified. |
| `AGENTISEND_BASE_URL` | no | Defaults to `https://api.agentisend.com`. |

## Wire it up

Copy `send.post.ts` to `server/api/send.post.ts`. The `.post` suffix makes Nitro answer only
`POST /api/send`. The `h3` import can stay, or be dropped in favour of Nuxt's auto-imports.

```bash
pnpm add agentisend
curl -X POST localhost:3000/api/send -H 'content-type: application/json' \
  -d '{"email":"you@example.com","bookingId":"BK-2291"}'
```
