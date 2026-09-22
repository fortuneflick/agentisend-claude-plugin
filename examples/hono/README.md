# Hono

A single `POST /send` route that sends a transactional email and returns the message id. The SDK is
plain fetch with no Node built-ins, so the same file runs on Workers, Deno, Bun and Node.

## Environment

| Variable | Required | What it is |
|---|---|---|
| `AGENTISEND_API_KEY` | yes | A key with `sending_access`. |
| `MAIL_FROM` | yes | The From address, on a domain you have verified. |
| `AGENTISEND_BASE_URL` | no | Defaults to `https://api.agentisend.com`. |

On Workers, read the key from the binding instead of `process.env` and pass it to the constructor:
`new AgentiSend(c.env.AGENTISEND_API_KEY)`.

## Run it

```bash
pnpm add hono agentisend
curl -X POST localhost:8787/send -H 'content-type: application/json' -d '{"email":"you@example.com"}'
```
