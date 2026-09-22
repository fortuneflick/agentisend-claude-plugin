/**
 * Hono — one POST route that sends a transactional email.
 *
 * Hono runs on Workers, Deno, Bun and Node, and the AgentiSend SDK is plain
 * fetch with no Node built-ins, so this file is the same on all of them.
 */
import { Hono } from 'hono';
import { AgentiSend, AgentiSendError } from 'agentisend';

const agentisend = new AgentiSend();

function mailFrom(): string {
  const from = process.env.MAIL_FROM;
  if (!from) throw new Error('Set MAIL_FROM to an address on a domain you have verified.');
  return from;
}

export const app = new Hono();

app.post('/send', async (c) => {
  const { email, subject, body } = await c.req.json<{
    email?: string;
    subject?: string;
    body?: string;
  }>();
  if (!email) return c.json({ error: 'email is required' }, 400);

  try {
    const { id } = await agentisend.emails.send(
      {
        from: mailFrom(),
        to: email,
        subject: subject ?? 'Your receipt',
        text: body ?? 'Thanks — your receipt is attached to your account.',
      },
      { idempotencyKey: `receipt/${email}` },
    );
    return c.json({ id });
  } catch (err) {
    if (err instanceof AgentiSendError) {
      // `fix` names the endpoint that repairs the call, so a client can act on
      // the failure without a human reading prose.
      return c.json({ code: err.code, fix: err.fix }, 502);
    }
    throw err;
  }
});

export default app;
