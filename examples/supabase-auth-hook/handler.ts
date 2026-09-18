/**
 * Supabase "Send Email Hook" — you own the auth email instead of Supabase's
 * built-in SMTP.
 *
 * Supabase POSTs the sign-up / magic-link / recovery payload to an HTTPS
 * endpoint you host, signed with Standard Webhooks headers. This handler
 * verifies that signature, renders the link, and sends it through AgentiSend.
 * It is a plain `Request` -> `Response` function, so it drops into a Next.js
 * route handler, a Supabase Edge Function, Hono, or anything else that speaks
 * fetch.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AgentiSend, AgentiSendError } from '@agentisend/sdk-node';

const agentisend = new AgentiSend();

function mailFrom(): string {
  const from = process.env.MAIL_FROM;
  if (!from) throw new Error('Set MAIL_FROM to an address on a domain you have verified.');
  return from;
}

/** The payload Supabase sends. Only the fields this handler reads are typed. */
export interface SendEmailHookPayload {
  user: { id: string; email: string };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: 'signup' | 'recovery' | 'invite' | 'magiclink' | 'email_change';
    site_url: string;
  };
}

const SUBJECTS: Record<SendEmailHookPayload['email_data']['email_action_type'], string> = {
  signup: 'Confirm your email',
  recovery: 'Reset your password',
  invite: 'You have been invited',
  magiclink: 'Your sign-in link',
  email_change: 'Confirm your new email',
};

/**
 * Standard Webhooks verification, as Supabase signs it: the signed content is
 * `id.timestamp.body`, HMAC-SHA256 under the base64 secret, and the header
 * carries one or more space-separated `v1,<signature>` pairs.
 */
export function verifySignature(
  secret: string,
  headers: { id: string; timestamp: string; signature: string },
  body: string,
): boolean {
  const key = Buffer.from(secret.replace(/^v1,whsec_|^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key)
    .update(`${headers.id}.${headers.timestamp}.${body}`)
    .digest('base64');
  return headers.signature.split(' ').some((candidate) => {
    const value = candidate.startsWith('v1,') ? candidate.slice(3) : candidate;
    const a = Buffer.from(value);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.SEND_EMAIL_HOOK_SECRET;
  if (!secret) throw new Error('Set SEND_EMAIL_HOOK_SECRET to the secret Supabase generated.');

  const body = await request.text();
  const ok = verifySignature(secret, {
    id: request.headers.get('webhook-id') ?? '',
    timestamp: request.headers.get('webhook-timestamp') ?? '',
    signature: request.headers.get('webhook-signature') ?? '',
  }, body);
  if (!ok) {
    return Response.json({ error: { http_code: 401, message: 'Bad signature' } }, { status: 401 });
  }

  const { user, email_data } = JSON.parse(body) as SendEmailHookPayload;
  const link =
    `${email_data.site_url}/auth/v1/verify` +
    `?token=${email_data.token_hash}` +
    `&type=${email_data.email_action_type}` +
    `&redirect_to=${encodeURIComponent(email_data.redirect_to)}`;

  try {
    await agentisend.emails.send(
      {
        from: mailFrom(),
        to: user.email,
        subject: SUBJECTS[email_data.email_action_type],
        html: `<p><a href="${link}">Continue</a></p><p>Or enter this code: ${email_data.token}</p>`,
      },
      // One token, one email. Supabase retries the hook on a timeout; this key
      // makes the retry replay rather than send a second copy.
      { idempotencyKey: `supabase-auth/${email_data.token_hash}` },
    );
  } catch (err) {
    if (err instanceof AgentiSendError) {
      // Supabase surfaces this message to the end user's sign-up attempt, so
      // hand back the fix rather than a stack trace.
      return Response.json(
        { error: { http_code: err.status, message: err.fix } },
        { status: err.status },
      );
    }
    throw err;
  }

  return Response.json({});
}
