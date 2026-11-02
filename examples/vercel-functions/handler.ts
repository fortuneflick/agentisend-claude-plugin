/**
 * Vercel Functions — the POST the platform calls once per request.
 *
 * Save this file as `api/send.ts`. Vercel invokes the exported function with
 * a Web Request. AGENTISEND_API_KEY and MAIL_FROM are project environment
 * variables. AGENTISEND_BASE_URL is optional and defaults to the public API.
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

export async function POST(request: Request): Promise<Response> {
  let email = '';
  let note = '';
  try {
    const parsed = (await request.json()) as { email?: string; note?: string };
    email = String(parsed.email ?? '').trim();
    note = String(parsed.note ?? '');
  } catch {
    return Response.json({ error: 'email must be one address, like you@example.com' }, { status: 400 });
  }
  if (!ADDRESS.test(email)) {
    return Response.json({ error: 'email must be one address, like you@example.com' }, { status: 400 });
  }

  try {
    const { id } = await agentisend.emails.send(
      {
        from: mailFrom(),
        to: email,
        subject: 'Your preview is ready',
        text: `Preview note: ${note}`,
      },
      // The recipient, not the clock: a retried invocation replays this send.
      { idempotencyKey: `preview/${email}` },
    );
    return Response.json({ id });
  } catch (err) {
    if (err instanceof AgentiSendError) {
      return Response.json({ code: err.code, fix: err.fix }, { status: err.status });
    }
    return Response.json({ error: 'send failed' }, { status: 500 });
  }
}
