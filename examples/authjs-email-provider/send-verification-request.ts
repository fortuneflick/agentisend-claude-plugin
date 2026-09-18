/**
 * Auth.js (NextAuth) — a custom `sendVerificationRequest` for the Nodemailer /
 * email provider, so the magic link goes out over the AgentiSend HTTP API
 * instead of an SMTP connection your host may not allow.
 *
 * Auth.js calls this with the address, the signed URL and the provider config.
 * Throwing makes Auth.js report the sign-in as failed, which is what you want:
 * a magic link that was never sent should never look like one that was.
 */
import { AgentiSend, AgentiSendError } from '@agentisend/sdk-node';

const agentisend = new AgentiSend();

function mailFrom(): string {
  const from = process.env.MAIL_FROM;
  if (!from) throw new Error('Set MAIL_FROM to an address on a domain you have verified.');
  return from;
}

/** The parameters Auth.js passes; only the fields used here are typed. */
export interface VerificationRequestParams {
  identifier: string;
  url: string;
  provider: { from?: string };
}

export async function sendVerificationRequest({
  identifier,
  url,
  provider,
}: VerificationRequestParams): Promise<void> {
  const host = new URL(url).host;
  try {
    await agentisend.emails.send(
      {
        from: provider.from ?? mailFrom(),
        to: identifier,
        subject: `Sign in to ${host}`,
        html: `<p><a href="${url}">Sign in to ${host}</a></p><p>If you did not ask for this, ignore it.</p>`,
        text: `Sign in to ${host}\n${url}\n`,
      },
      // The signed URL is unique per request, so it is the key: Auth.js
      // retrying after a timeout replays rather than sending a second link.
      { idempotencyKey: `signin-link/${new URL(url).searchParams.get('token') ?? url}` },
    );
  } catch (err) {
    if (err instanceof AgentiSendError) {
      throw new Error(`${err.code}: ${err.fix}`);
    }
    throw err;
  }
}
