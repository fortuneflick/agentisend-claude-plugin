# Send one email, in Python

The quickstart's Python block: one `POST /emails` with the standard library, an idempotency key
named after the send, and a refusal printed as its `code` and `fix`.

## Environment

| Variable | Required | What it is |
|---|---|---|
| `AGENTISEND_API_KEY` | yes | A key with permission to send. |
| `MAIL_FROM` | yes | The From address, on a domain you have verified. |
| `AGENTISEND_BASE_URL` | no | Defaults to `https://api.agentisend.com`. |

## Run it

```bash
python3 send.py
```

It prints the message id. Run it twice and it prints the same id: the second request replays the
first instead of sending again.
