/**
 * RedwoodJS — a service function. Redwood's GraphQL resolvers are services,
 * and a service is a function that receives `{ input }`.
 *
 * There is no Redwood package for this API. The function posts through the
 * Node SDK. The suite calls it on Node and does not boot Redwood.
 *
 * AGENTISEND_API_KEY, MAIL_FROM, and optionally AGENTISEND_BASE_URL.
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

export async function sendReceipt(args: {
  input: { email?: string; note?: string };
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const email = String(args.input.email ?? '').trim();
  const note = String(args.input.note ?? '');
  if (!ADDRESS.test(email)) {
    return { status: 400, body: { error: 'email must be one address, like you@example.com' } };
  }

  try {
    const { id } = await agentisend.emails.send(
      {
        from: mailFrom(),
        to: email,
        subject: 'We received your note',
        text: `Note: ${note}`,
      },
      // The person the mutation names, not the moment it ran.
      { idempotencyKey: `redwood/${email}` },
    );
    return { status: 200, body: { id } };
  } catch (err) {
    if (err instanceof AgentiSendError) {
      return { status: err.status, body: { code: err.code, fix: err.fix } };
    }
    return { status: 500, body: { error: 'send failed' } };
  }
}
