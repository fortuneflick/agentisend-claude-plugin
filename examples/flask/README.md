# Send email from Flask

One `POST /send` route that sends an order receipt with an idempotency key derived from the order,
checks the address before calling the API, and answers a refusal with its `code` and `fix`.
`run.py` drives it through Flask's `test_client()`; the examples suite runs that against a real API
on every build.

## Environment

| Variable | Required | What it is |
|---|---|---|
| `AGENTISEND_API_KEY` | yes | A key with `sending_access`. |
| `MAIL_FROM` | yes | The From address, on a domain you have verified. |
| `AGENTISEND_BASE_URL` | no | Defaults to `https://api.agentisend.com`. |

## Run it

```bash
pip install flask
pip install ../../packages/sdk-python   # the agentisend package, standard library only
flask --app app run
```

```bash
curl -X POST localhost:5000/send \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","order_id":"1042"}'
```

`python3 run.py` runs the four requests the suite checks: a send, the same send replayed, a
malformed address refused before the API is called, and the same order's receipt to a second
address refused by the API with `idempotency_payload_mismatch`.
