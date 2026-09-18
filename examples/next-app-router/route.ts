/**
 * app/api/send/route.ts — a Next.js App Router route handler.
 *
 * Runs on the server only, so the API key never reaches the browser. The
 * handler returns the message id, which is what you store against the user
 * row: every later question ("did it arrive?", "why was it held?") is answered
 * by GET /emails/:id and GET /emails/:id/explain with that id.
 */
import { AgentiSend, AgentiSendError } from '@agentisend/sdk-node';

const agentisend = new AgentiSend();

/** The verified sender. Failing here beats failing at the API with a 422. */
function mailFrom(): string {
  const from = process.env.MAIL_FROM;
  if (!from) throw new Error('Set MAIL_FROM to an address on a domain you have verified.');
  return from;
}

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const { email, name } = (await request.json()) as { email?: string; name?: string };
  if (!email) {
    return Response.json({ error: 'email is required' }, { status: 400 });
  }

  try {
    const { id } = await agentisend.emails.send(
      {
        from: mailFrom(),
        to: email,
        subject: 'Welcome',
        html: `<p>Hello ${name ?? 'there'} — your account is ready.</p>`,
      },
      // Derived from the user, not from the moment: a retried request after a
      // timeout replays the first send instead of mailing them twice.
      { idempotencyKey: `welcome/${email}` },
    );
    return Response.json({ id });
  } catch (err) {
    if (err instanceof AgentiSendError) {
      // Every 4xx carries `fix` — what to do, and which endpoint does it.
      return Response.json({ code: err.code, fix: err.fix }, { status: err.status });
    }
    throw err;
  }
}
