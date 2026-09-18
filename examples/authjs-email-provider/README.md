# Auth.js (NextAuth) email provider

A `sendVerificationRequest` that delivers the Auth.js magic link over HTTPS through AgentiSend, so
sign-in works on hosts that block outbound SMTP. A send that fails throws with the error code and
the fix, which makes Auth.js report the sign-in as failed instead of telling the user to check an
inbox nothing was sent to.

## Environment

| Variable | Required | What it is |
|---|---|---|
| `AGENTISEND_API_KEY` | yes | A key with `sending_access`. |
| `MAIL_FROM` | yes | Used when the provider config has no `from`. |
| `AGENTISEND_BASE_URL` | no | Defaults to `https://api.agentisend.com`. |

## Wire it up

```ts
import NextAuth from 'next-auth';
import Nodemailer from 'next-auth/providers/nodemailer';
import { sendVerificationRequest } from './agentisend-email';

export const { handlers, auth } = NextAuth({
  providers: [
    Nodemailer({ server: '', from: process.env.MAIL_FROM, sendVerificationRequest }),
  ],
});
```
