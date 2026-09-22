# An agent with a budget and a loop guard, in Python

The same three calls as the Node example, from a Python script with no dependencies beyond the
standard library: a key scoped to sending, a daily ceiling on it, and the loop guard refusing the
fourth near-identical send and holding it for a person.

## Environment

| Variable | Required | What it is |
|---|---|---|
| `AGENTISEND_API_KEY` | yes | Your own key, with `full_access`. It mints the agent key; the agent never sees it. |
| `MAIL_FROM` | yes | The From address, on a domain you have verified. |
| `AGENTISEND_BASE_URL` | no | Defaults to `https://api.agentisend.com`. |

## Run it

```bash
python3 agent.py
```

Two JSON lines: the first send with its message id and the budget, then the refusal with
`approval_required`, how many sends went through before it, and the `fix` naming the call that
resolves it.
