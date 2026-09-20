---
name: agentisend
description: AgentiSend is a transactional email API. Check what you may spend, preflight a send for free, and ask a person when a send is risky. Use when sending transactional or product email, when a send was refused and you need the fix, or when setting up a sending domain.
---

# Sending email as an agent

You are sending real mail to real people. Three things make that safe, and all
three are one call each.

## Before anything else: what may you spend?

```
agentisend doctor
```

Answers, in order: is there a key, does the API answer, is this key paused, is
there budget left, is any domain verified, what is the account's standing.
Every failing check names what to do about it. If `doctor` reports a paused key
or no verified domain, **stop and tell the person** — those are decisions
someone made, and no amount of retrying changes them.

Over MCP the same answer is one tool call: `whoami`. It returns the scopes you
hold, the tools those scopes reach, the budget remaining and when the period
resets, whether a kill switch is on, and `can_send_now` as the summary.

## Test the send before you make it

```
agentisend emails send --from "Acme <hello@acme.com>" --to person@example.com \
  --subject "Your receipt" --text-file - --idempotency-key order-4417
```

Before that, run the same payload through the free check. Over MCP that is
`preflight_email`; over REST it is `POST /emails/preflight`. It runs **every
gate a real send runs** — validation, domain verification, suppression, budget,
loop detection, trust standing, content scanning — sends nothing, and costs
nothing. A preflight that comes back `ok: false` carries the same `code`,
`message` and `fix` the real send would have; fix what `fix` names and preflight
again rather than sending to find out.

Always pass `--idempotency-key` (or `idempotency_key` on an MCP tool) when a
retry is possible. Retrying with the same key returns the first result instead
of sending twice — it is the difference between a network blip and a customer
receiving the same receipt four times.

## When a send is risky, ask a person

Large recipient lists, unusual hours, anything irreversible, anything a person
told you to check first: do not send and do not silently refuse. Ask.

Over MCP: `request_approval` with the payload and a reason. Nothing is sent and
no budget is spent; a person approves or rejects it, and `list_agent_actions`
tells you what they decided and why. **No tool approves one, including for you.**
An approval you can grant yourself is not an approval.

## When you are refused

Read the error's `code` and `retryable`, never the prose.

- `rate_ceiling_exceeded` / `rate_limit_exceeded` — the only class where
  waiting works. Wait `retry_after_seconds` and repeat the same call.
- `agent_budget_exceeded` — the period's allowance is spent. Waiting does not
  cure it: a person raises the number, or the period rolls over. Do not retry
  in a loop hoping it clears.
- `kill_switch_active` — a person stopped this key. Tell them. Only they can
  resume it.
- `approval_required` — the loop guard held this send. It is in the approvals
  inbox; `list_agent_actions` shows its state.
- `trust_paused` — the account's delivery outcomes moved it down the ladder.
  `GET /trust/standing` explains each reason.
- `suppressed_recipient` — that address asked not to be contacted, or it hard
  bounced. Do not remove the suppression to get around it.
- `domain_not_verified` — publish the DNS records, then verify the domain.

Everything else: read `fix`. It names the endpoint or the person.

## After the fact: what happened to that message?

```
agentisend emails explain <message-id>
```

Returns the verdict, the evidence behind it, whether retrying can work, and the
remediation as **callable steps** — each action carries the method, path and
body to send. Follow those; do not invent an endpoint.

## What you cannot do here

- Lift your own kill switch, or approve your own held send.
- Read the contents of a message you were stopped from sending — you see
  shapes: recipient counts, whether there is a body.
- Send unsolicited mail to people who did not ask for it. There is no feature
  for it, at any tier, and asking for one is out of scope.

## Reference

- `references/commands.md` — every CLI command with its options.
- `references/errors.md` — the refusal codes, what each means, what to do.
- Over MCP the same reference is readable as `agentisend://errors`,
  `agentisend://limits` and `agentisend://guardrails`.
