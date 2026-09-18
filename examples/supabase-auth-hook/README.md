# Supabase Send Email Hook

Supabase posts every sign-up, magic-link, invite and password-recovery email to an HTTPS endpoint
you host; this handler verifies the Standard Webhooks signature, builds the verify link from
`token_hash`, and sends it through AgentiSend. The idempotency key is the token hash, so the hook
retry Supabase fires on a timeout replays the first send instead of mailing the user twice.

## Environment

| Variable | Required | What it is |
|---|---|---|
| `AGENTISEND_API_KEY` | yes | A key with `sending_access`. |
| `MAIL_FROM` | yes | The From address, on a domain you have verified. |
| `SEND_EMAIL_HOOK_SECRET` | yes | The secret Supabase shows when you enable the hook (`v1,whsec_...`). |
| `AGENTISEND_BASE_URL` | no | Defaults to `https://api.agentisend.com`. |

## Wire it up

1. Host `handler.ts` at a public URL — a Next.js route handler, a Supabase Edge Function, or any
   fetch-compatible runtime.
2. In the Supabase dashboard: Authentication → Hooks → Send Email Hook → HTTPS, paste the URL.
3. Copy the generated secret into `SEND_EMAIL_HOOK_SECRET`.

Sign up a test user. The message id is in your AgentiSend logs, and `GET /emails/:id/explain` says
what happened to it.
