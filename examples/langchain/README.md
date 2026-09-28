# LangChain.js

A `send_email` tool built with `tool()` from `@langchain/core/tools`. It sends one email through
the agent's own key with an idempotency key derived from the purpose and the recipient, and returns
either the message id or the refusal's `code` and `fix` — never an exception the model cannot read.

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
import { createAgent } from 'langchain';
import { sendEmail } from './send-email-tool';

const agent = createAgent({ model, tools: [sendEmail] });
await agent.invoke({
  messages: [{ role: 'user', content: 'Tell customer@example.com that ticket 4182 is being looked into.' }],
});
```

LangChain checks the model's arguments against `schema` before the function runs, and serialises
what it returns into the tool message the model reads next. The test in
[../test](../test/every_example_sends_through_a_real_api.test.ts) calls `invoke` directly with the
arguments a model would produce: one send, the same call again replaying it, a third distinct send
refused with `agent_budget_exceeded` once the key's budget of one is spent, and a call with no
recipient refused by the schema before the API is reached.

```bash
pnpm add @langchain/core zod agentisend
```
