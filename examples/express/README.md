# Express

A `POST /send` route that sends a transactional email and returns the message id. The app is
exported without calling `listen`, so it can be mounted into a larger server or started from your
own entry point.

## Environment

| Variable | Required | What it is |
|---|---|---|
| `AGENTISEND_API_KEY` | yes | A key with `sending_access`. |
| `MAIL_FROM` | yes | The From address, on a domain you have verified. |
| `AGENTISEND_BASE_URL` | no | Defaults to `https://api.agentisend.com`. |

## Run it

```bash
pnpm add express @agentisend/sdk-node
node --experimental-strip-types -e "import('./server.ts').then(m => m.app.listen(3000))"
curl -X POST localhost:3000/send -H 'content-type: application/json' -d '{"email":"you@example.com"}'
```
