# An agent with a budget and a loop guard

A Node script that mints a key scoped to sending only, puts a daily ceiling of 50 emails on it,
hands that key to an agent, and then lets the agent loop. After three near-identical sends to the
same recipient inside the hour the API refuses the fourth, holds it for a human to approve, and
returns `approval_required` with the held action's id and a `fix` that says who decides it and
where — so the mail is never delivered and the agent is told what to do next.

## Environment

| Variable | Required | What it is |
|---|---|---|
| `AGENTISEND_API_KEY` | yes | Your own key, with `full_access`. It mints the agent key; the agent never sees it. |
| `MAIL_FROM` | yes | The From address, on a domain you have verified. |
| `AGENTISEND_BASE_URL` | no | Defaults to `https://api.agentisend.com`. |

## Run it

```bash
node --experimental-strip-types agent.ts
```

Output:

```
agent key       8f0c…
daily budget    50 emails
first send      3a6b…
sends allowed   3
refused with    approval_required (HTTP 403)
message         Blocked: this agent has sent 3 near-identical emails to customer@example.com within 60 minutes, …
fix             Do not send it again: a person approves or rejects it in the console under Agents → Approvals, and approving sends it — the message then appears in GET /emails. action_id in this error names the held send; the key that asked cannot approve itself, and a retry waits on the same approval.
```

The held send is in the approval queue under the `action_id` the refusal carries: `GET /agent-actions`
lists it for your own key, a person signed in to the console approves (it sends) or rejects it
(it never sends), and the agent's retries wait on that one action instead of adding more. If the
agent had instead run past its ceiling, the refusal would be `agent_budget_exceeded` with a `fix`
that says to wait for the period to reset (`GET /limits/keys/:id` says when) and that raising the
budget is a person's decision. `POST /limits/keys/:id/kill` stops the key immediately, from anywhere.
