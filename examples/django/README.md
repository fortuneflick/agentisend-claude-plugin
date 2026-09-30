# Send email from Django

One view that sends a shipping notice from a POST, with an idempotency key derived from the order,
checks the address before calling the API, and answers a refusal with its `code` and `fix`. The
settings are inline through `settings.configure`, so the file runs without a project; in a project,
`send` goes in `views.py` and the path in `urls.py`. `run.py` drives it through Django's test
`Client`; the examples suite runs that against a local AgentiSend server.

## Environment

| Variable | Required | What it is |
|---|---|---|
| `AGENTISEND_API_KEY` | yes | A key with `sending_access`. |
| `MAIL_FROM` | yes | The From address, on a domain you have verified. |
| `AGENTISEND_BASE_URL` | no | Defaults to `https://api.agentisend.com`. |

## Run it

```bash
pip install django
pip install ../../packages/sdk-python   # the agentisend package, standard library only
python3 run.py
```

Four requests, one JSON line each: a send, the same send replayed, a malformed address refused
before the API is called, and the same order's notice to a second address refused by the API with
`idempotency_payload_mismatch`.
