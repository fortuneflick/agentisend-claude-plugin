# Examples

Copy-pasteable integrations, one directory each. Every one of them is run by the test suite against
a local AgentiSend server — routes, gates and send worker are real, the transport is the in-memory
fake. An example that stops working fails the tests.

| Directory | What it shows |
|---|---|
| [next-app-router](next-app-router/) | A Next.js route handler and a Server Action, both sending with an idempotency key. |
| [supabase-auth-hook](supabase-auth-hook/) | Supabase's Send Email Hook: verify the signature, build the link, send it. |
| [better-auth](better-auth/) | The `sendVerificationEmail` and `sendResetPassword` callbacks. |
| [authjs-email-provider](authjs-email-provider/) | Auth.js `sendVerificationRequest` over HTTPS instead of SMTP. |
| [hono](hono/) | One `POST /send` route, the same on Workers, Deno, Bun and Node. |
| [sveltekit-form-action](sveltekit-form-action/) | A contact form whose action runs on the server and works without JavaScript. |
| [express](express/) | A `POST /send` route on an app you can mount anywhere. |
| [ai-agent-with-budget](ai-agent-with-budget/) | A scoped key, a ceiling, and the loop guard refusing the fourth identical send. |
| [python-send](python-send/) | One send from Python with the standard library: the quickstart's Python block, byte for byte. |
| [python-agent-with-budget](python-agent-with-budget/) | The same agent in Python with nothing installed: three requests with the standard library. |
| [fastapi](fastapi/) | A FastAPI `POST /send` route: the address checked first, one idempotency key per recipient, a refusal answered as `code` and `fix`. |
| [flask](flask/) | The same route in Flask, sending one receipt per order. |
| [django](django/) | A Django view with its settings inline, sending one shipping notice per order. |
| [vercel-ai-sdk](vercel-ai-sdk/) | A `sendEmail` tool, and a scripted `generateText` loop that stops on `agent_budget_exceeded`. |
| [langchain](langchain/) | The same tool for LangChain.js, built with `tool()` from `@langchain/core/tools`. |
| [fastify](fastify/) | A `POST /send` route whose JSON schema refuses a bad address before the handler runs. |
| [astro](astro/) | An API route that confirms a waitlist sign-up from a plain form post. |
| [nuxt](nuxt/) | A Nitro server route that sends one booking confirmation per booking. |
| [react-router](react-router/) | A React Router (formerly Remix) `action` that emails a download link to the person who asked. |
| [nestjs](nestjs/) | A controller and a service sending one order confirmation per order. |
| [nodejs](nodejs/) | A `node:http` `POST /send` route, no framework, one receipt per address. |
| [go](go/) | `POST /emails` with `net/http`: one invoice, a replay, a bad address, a mismatched retry. |
| [php](php/) | The same four steps with PHP streams. |
| [laravel](laravel/) | A controller method that posts a shipping notice with PHP streams. |
| [rails](rails/) | A controller method that posts a receipt with `Net::HTTP`. |
| [remix](remix/) | A Remix `action` that emails a receipt from a form post. |
| [bun](bun/) | A fetch handler for `Bun.serve`, one receipt per address. |
| [deno](deno/) | A fetch handler for `Deno.serve`, one deploy notice per address. |
| [mastra](mastra/) | A Mastra `createTool`, registered on an `Agent`, run until the budget refusal. |
| [langchain-python](langchain-python/) | A LangChain `@tool` invoked twice; the second call is `agent_budget_exceeded`. |
| [openai-agents-sdk](openai-agents-sdk/) | An OpenAI Agents `function_tool`, invoked through `on_invoke_tool`, same refusal. |
| [crewai](crewai/) | A CrewAI tool, `run` twice, same refusal. |

## What they have in common

- `AGENTISEND_API_KEY` and `MAIL_FROM` are the only variables every example needs.
  `AGENTISEND_BASE_URL` is optional and defaults to `https://api.agentisend.com`.
- Every account starts on Free (1,000 a month, 100 a day, no card); before a domain verifies,
  simulator sends work and real sends answer `domain_not_verified`. A simulator address is any
  recipient at `simulator.agentisend.com`: it is accepted, costs nothing and reaches nobody. When
  the plan's inclusion is spent a send is refused with `plan_limit_reached`; on Free the daily cap
  answers `daily_limit_reached`. Every example is also a guide at
  `agentisend.com/docs/guides/<name>`, with the same file inlined.
- The key is read on the server. None of these examples put it anywhere a browser can reach.
- Every mutating call carries an `Idempotency-Key` derived from the thing being done
  (`welcome/user@example.com`), not from the moment, so a retry after a timeout replays the first
  send instead of mailing someone twice.
- Every failure is caught as `AgentiSendError` and surfaced as `code` plus `fix`. The `fix` names
  the call that repairs the request, which is what lets an integration recover without a human
  reading prose.
- Nothing here sends to a stranger. Each example mails someone who asked for the message, or the
  operator's own address.

## Run the suite

```bash
pnpm test:examples
```

It builds the workspace, boots the API with the fake transport, and runs each example's send path
once. See [test/every_example_sends_through_a_real_api.test.ts](test/every_example_sends_through_a_real_api.test.ts).
