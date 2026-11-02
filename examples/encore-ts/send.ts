/**
 * Encore for TypeScript — the function `api()` wraps.
 *
 * The documented endpoint is:
 *
 *   import { api } from 'encore.dev/api'
 *   export const send = api(
 *     { expose: true, method: 'POST', path: '/send' },
 *     async (params: Params): Promise<Reply> => send(params),
 *   )
 *
 * There is no Encore package for this API. The function posts through the
 * Node SDK. The suite calls `send` on Node and does not load `encore.dev`.
 *
 * AGENTISEND_API_KEY, MAIL_FROM, and optionally AGENTISEND_BASE_URL.
 * Encore's own secret helper is `secret()` from `encore.dev/config`; this
 * file reads the variables the suite sets, which is what that helper returns
 * once you have set them.
 */
import { AgentiSend, AgentiSendError } from 'agentisend';

const agentisend = new AgentiSend();

function mailFrom(): string {
  const from = process.env.MAIL_FROM;
  if (!from) throw new Error('Set MAIL_FROM to an address on a domain you have verified.');
  return from;
}

/** Enough to refuse an obvious typo here; the API checks the address properly. */
const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function send(params: {
  email?: string;
  note?: string;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const email = String(params.email ?? '').trim();
  const note = String(params.note ?? '');
  if (!ADDRESS.test(email)) {
    return { status: 400, body: { error: 'email must be one address, like you@example.com' } };
  }

  try {
    const { id } = await agentisend.emails.send(
      {
        from: mailFrom(),
        to: email,
        subject: 'Your workspace is ready',
        text: `Workspace note: ${note}`,
      },
      { idempotencyKey: `encore/${email}` },
    );
    return { status: 200, body: { id } };
  } catch (err) {
    if (err instanceof AgentiSendError) {
      return { status: err.status, body: { code: err.code, fix: err.fix } };
    }
    return { status: 500, body: { error: 'send failed' } };
  }
}
