# Vercel AI SDK

A `sendEmail` tool for the AI SDK. Its `execute` sends one email through the agent's own key with
an idempotency key derived from the purpose and the recipient, and returns either the message id
or the refusal's `code` and `fix` — never an exception the model cannot read.

## Environment

| Variable | Required | What it is |
|---|---|---|
| `AGENTISEND_API_KEY` | yes | The agent's key, with `sending_access` and a budget on it. Not your own. |
| `MAIL_FROM` | yes | The From address, on a domain you have verified. |
| `AGENTISEND_BASE_URL` | no | Defaults to `https://api.agentisend.com`. |

## The key the agent holds

Mint it with `POST /api-keys` as `sending_access`, put a ceiling on it with
`PATCH /limits/keys/:id`, and hand only that key to the process running the model. Those calls are
executed in [ai-agent-with-budget](../ai-agent-with-budget/). When the agent reaches its ceiling the
tool returns `agent_budget_exceeded`, whose `fix` says to wait for the period to reset and that
raising the budget is a person's decision. `POST /limits/kill-all` stops every key at once.

## Wire it to a model

```ts
import { generateText, stepCountIs } from 'ai';
import { sendEmail } from './send-email-tool';

const { text } = await generateText({
  model, // any provider the AI SDK supports
  tools: { sendEmail },
  stopWhen: stepCountIs(3),
  prompt: 'Tell customer@example.com that ticket 4182 is being looked into.',
});
```

The SDK checks the model's arguments against `inputSchema` before `execute` runs, and puts what
`execute` returns in front of the model as the tool result. The test in
[../test](../test/every_example_sends_through_a_real_api.test.ts) calls `execute` directly with the
arguments a model would produce: one send, the same call again replaying it, and a third distinct
send refused with `agent_budget_exceeded` once the key's budget of one is spent.

```bash
pnpm add ai zod agentisend
```
