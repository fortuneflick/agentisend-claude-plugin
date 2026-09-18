/**
 * Better Auth — the two callbacks that decide how your auth mail leaves the
 * building: `emailVerification.sendVerificationEmail` and
 * `emailAndPassword.sendResetPassword`.
 *
 * Better Auth calls them with the user and a ready-made URL; everything else is
 * yours. They are exported separately here so they can be spread into
 * `betterAuth({ ... })` and tested on their own.
 */
import { AgentiSend } from '@agentisend/sdk-node';

const agentisend = new AgentiSend();

function mailFrom(): string {
  const from = process.env.MAIL_FROM;
  if (!from) throw new Error('Set MAIL_FROM to an address on a domain you have verified.');
  return from;
}

/** The shape Better Auth passes these callbacks. */
export interface AuthEmailArgs {
  user: { id: string; email: string; name?: string };
  url: string;
  token: string;
}

export async function sendVerificationEmail({ user, url, token }: AuthEmailArgs): Promise<void> {
  await agentisend.emails.send(
    {
      from: mailFrom(),
      to: user.email,
      subject: 'Confirm your email',
      html: `<p>Hello ${user.name ?? 'there'},</p><p><a href="${url}">Confirm your email</a></p>`,
    },
    // The token is the thing being confirmed, so it is the natural key: a
    // retry after a network timeout replays instead of sending twice.
    { idempotencyKey: `verify-email/${token}` },
  );
}

export async function sendResetPassword({ user, url, token }: AuthEmailArgs): Promise<void> {
  await agentisend.emails.send(
    {
      from: mailFrom(),
      to: user.email,
      subject: 'Reset your password',
      html: `<p><a href="${url}">Choose a new password</a></p><p>This link expires in one hour.</p>`,
    },
    { idempotencyKey: `reset-password/${token}` },
  );
}

/**
 * Drop straight into your `auth.ts`:
 *
 * ```ts
 * import { betterAuth } from 'better-auth';
 * import { sendResetPassword, sendVerificationEmail } from './agentisend-email';
 *
 * export const auth = betterAuth({
 *   emailAndPassword: { enabled: true, sendResetPassword },
 *   emailVerification: { sendVerificationEmail, sendOnSignUp: true },
 * });
 * ```
 */
export const agentisendEmail = { sendVerificationEmail, sendResetPassword };
