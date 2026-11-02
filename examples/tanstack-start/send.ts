/**
 * TanStack Start — the function a server function handler calls.
 *
 * The documented registration is:
 *
 *   import { createServerFn } from '@tanstack/react-start'
 *   export const sendReceipt = createServerFn({ method: 'POST' }).handler(handler)
 *
 * `handler` receives `{ data }`. This file is that function. The suite calls
 * it on Node and does not load `@tanstack/react-start`.
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

export async function handler(args: {
  data: { email?: string; note?: string };
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const email = String(args.data.email ?? '').trim();
  const note = String(args.data.note ?? '');
  if (!ADDRESS.test(email)) {
    return { status: 400, body: { error: 'email must be one address, like you@example.com' } };
  }

  try {
    const { id } = await agentisend.emails.send(
      {
        from: mailFrom(),
        to: email,
        subject: 'Your form was received',
        text: `Form note: ${note}`,
      },
      // The person who submitted the form, not the clock: a retried call replays.
      { idempotencyKey: `form/${email}` },
    );
    return { status: 200, body: { id } };
  } catch (err) {
    if (err instanceof AgentiSendError) {
      return { status: err.status, body: { code: err.code, fix: err.fix } };
    }
    return { status: 500, body: { error: 'send failed' } };
  }
}
