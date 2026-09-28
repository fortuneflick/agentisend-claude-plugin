# Examples

Copy-pasteable integrations, one directory each. Every one of them is executed against a real API
server on every run of `pnpm test:examples` — routes, gates and send worker are real, the transport
is the in-memory fake. An example that stops working fails the build.

| Directory | What it shows |
|---|---|
| [next-app-router](next-app-router/) | A Next.js route handler and a Server Action, both sending with an idempotency key. |
| [supabase-auth-hook](supabase-auth-hook/) | Supabase's Send Email Hook: verify the signature, build the link, send it. |
| [better-auth](better-auth/) | The `sendVerificationEmail` and `sendResetPassword` callbacks. |
| [authjs-email-provider](authjs-email-provider/) | Auth.js `sendVerificationRequest` over HTTPS instead of SMTP. |
| [hono](hono/) | One `POST /send` route, the same on Workers, Deno, Bun and Node. |
| [sveltekit-form-action](sveltekit-form-action/) | A contact form whose action runs on the server and works without JavaScript. |
| [express](express/) | A `POST /send` route on an app you can mount anywhere. |
| [ai-agent-with-budget](ai-agent-with-budget/) | A scoped key, a daily ceiling, and the loop guard refusing the fourth identical send. |
| [python-agent-with-budget](python-agent-with-budget/) | The same agent in Python with nothing installed: three requests with the standard library. |
| [vercel-ai-sdk](vercel-ai-sdk/) | A `sendEmail` tool for the AI SDK: the agent's own budgeted key, one idempotency key per purpose, and a refusal returned to the model as `code` and `fix`. |
| [langchain](langchain/) | The same tool for LangChain.js, built with `tool()` from `@langchain/core/tools`. |

## What they have in common

- `AGENTISEND_API_KEY` and `MAIL_FROM` are the only variables every example needs.
  `AGENTISEND_BASE_URL` is optional and defaults to `https://api.agentisend.com`.
- Every account starts on the Free plan, with no card. A real send needs a verified domain: before
  that, `POST /emails` delivers only from the onboarding address to the account's own sign-in
  addresses, and any recipient at `simulator.agentisend.com` is accepted, costs nothing and reaches
  nobody — so you can wire an example up first. When the plan's inclusion is spent a send is refused
  with `plan_limit_reached`; on Free the daily cap answers `daily_limit_reached`. Every example is
  also a guide at `agentisend.com/docs/guides/<name>`, with the same file inlined.
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
