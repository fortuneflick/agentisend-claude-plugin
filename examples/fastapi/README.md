# Send email from FastAPI

One `POST /send` route that sends a welcome email with an idempotency key derived from the
address, checks the address before calling the API, and answers a refusal with its `code` and
`fix`. `run.py` drives it through FastAPI's `TestClient`; the examples suite runs that against a
local AgentiSend server.

## Environment

| Variable | Required | What it is |
|---|---|---|
| `AGENTISEND_API_KEY` | yes | A key with `sending_access`. |
| `MAIL_FROM` | yes | The From address, on a domain you have verified. |
| `AGENTISEND_BASE_URL` | no | Defaults to `https://api.agentisend.com`. |

## Run it

```bash
pip install fastapi uvicorn
pip install ../../packages/sdk-python   # the agentisend package, standard library only
uvicorn app:app
```

```bash
curl -X POST localhost:8000/send \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","name":"Ada"}'
```

`python3 run.py` runs the four requests the suite checks: a send, the same send replayed, a
malformed address refused before the API is called, and a changed body under the same idempotency
key refused by the API with `idempotency_payload_mismatch`.
