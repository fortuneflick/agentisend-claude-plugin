/**
 * Express — a POST route that sends a transactional email.
 *
 * The app is exported without calling `listen`, so it can be mounted, tested,
 * or started from a separate entry point.
 */
import express, { type Express } from 'express';
import { AgentiSend, AgentiSendError } from 'agentisend';

const agentisend = new AgentiSend();

function mailFrom(): string {
  const from = process.env.MAIL_FROM;
  if (!from) throw new Error('Set MAIL_FROM to an address on a domain you have verified.');
  return from;
}

export const app: Express = express();
app.use(express.json());

app.post('/send', (req, res) => {
  void (async () => {
    const { email, subject } = req.body as { email?: string; subject?: string };
    if (!email) {
      res.status(400).json({ error: 'email is required' });
      return;
    }

    try {
      const { id } = await agentisend.emails.send(
        {
          from: mailFrom(),
          to: email,
          subject: subject ?? 'Your order shipped',
          text: 'Tracking details are in your account.',
        },
        { idempotencyKey: `shipped/${email}` },
      );
      res.json({ id });
    } catch (err) {
      if (err instanceof AgentiSendError) {
        res.status(err.status).json({ code: err.code, fix: err.fix });
        return;
      }
      res.status(500).json({ error: 'send failed' });
    }
  })();
});

export default app;
