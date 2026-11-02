/**
 * AWS Lambda — the handler behind an API Gateway proxy event.
 *
 * The runtime calls `handler` with the event. The JSON body is a string.
 * AGENTISEND_API_KEY and MAIL_FROM are function environment variables.
 * AGENTISEND_BASE_URL is optional and defaults to the public API.
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

interface ProxyEvent {
  body?: string | null;
}

interface ProxyResult {
  statusCode: number;
  headers: { 'content-type': string };
  body: string;
}

function reply(statusCode: number, payload: unknown): ProxyResult {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

export async function handler(event: ProxyEvent): Promise<ProxyResult> {
  let email = '';
  let note = '';
  try {
    const parsed = JSON.parse(event.body ?? '') as { email?: string; note?: string };
    email = String(parsed.email ?? '').trim();
    note = String(parsed.note ?? '');
  } catch {
    return reply(400, { error: 'email must be one address, like you@example.com' });
  }
  if (!ADDRESS.test(email)) {
    return reply(400, { error: 'email must be one address, like you@example.com' });
  }

  try {
    const { id } = await agentisend.emails.send(
      {
        from: mailFrom(),
        to: email,
        subject: 'Your report is ready',
        text: `Report note: ${note}`,
      },
      // The recipient, not the clock: a retried invocation replays this send.
      { idempotencyKey: `report/${email}` },
    );
    return reply(200, { id });
  } catch (err) {
    if (err instanceof AgentiSendError) {
      return reply(err.status, { code: err.code, fix: err.fix });
    }
    return reply(500, { error: 'send failed' });
  }
}
