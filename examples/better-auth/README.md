# Better Auth

The `sendVerificationEmail` and `sendResetPassword` callbacks, sending through AgentiSend. Each one
passes an idempotency key built from the auth token, so a retry after a network timeout replays the
first send rather than delivering a second copy of the same link.

## Environment

| Variable | Required | What it is |
|---|---|---|
| `AGENTISEND_API_KEY` | yes | A key with `sending_access`. |
| `MAIL_FROM` | yes | The From address, on a domain you have verified. |
| `AGENTISEND_BASE_URL` | no | Defaults to `https://api.agentisend.com`. |

## Wire it up

```ts
import { betterAuth } from 'better-auth';
import { sendResetPassword, sendVerificationEmail } from './agentisend-email';

export const auth = betterAuth({
  emailAndPassword: { enabled: true, sendResetPassword },
  emailVerification: { sendVerificationEmail, sendOnSignUp: true },
});
```
