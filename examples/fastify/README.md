# Fastify

A `POST /send` route that sends an invoice notice and returns the message id. The route's JSON
schema refuses a body without a well-formed address before the handler runs, so a bad request never
reaches the API. The app is exported without calling `listen`, so it can be registered into a
larger server, tested with `app.inject`, or started from your own entry point.

## Environment

| Variable | Required | What it is |
|---|---|---|
| `AGENTISEND_API_KEY` | yes | A key with `sending_access`. |
| `MAIL_FROM` | yes | The From address, on a domain you have verified. |
| `AGENTISEND_BASE_URL` | no | Defaults to `https://api.agentisend.com`. |

## Run it

```bash
pnpm add fastify agentisend
node --experimental-strip-types -e "import('./server.ts').then(m => m.app.listen({ port: 3000 }))"
curl -X POST localhost:3000/send -H 'content-type: application/json' \
  -d '{"email":"you@example.com","invoiceId":"INV-1042"}'
```
