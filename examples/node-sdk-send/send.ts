/**
 * Send one email with the `agentisend` package.
 *
 * `agentisend` and `@agentisend/sdk-node` are the same client. This file is
 * the one the SDKs guide prints, and the examples suite runs it against a
 * real API with the fake transport.
 */
import { AgentiSend } from 'agentisend';

export async function sendHello(to: string): Promise<string> {
  const from = process.env.MAIL_FROM;
  if (!from) throw new Error('Set MAIL_FROM to an address on a domain you have verified.');
  const client = new AgentiSend(process.env.AGENTISEND_API_KEY, {
    baseUrl: process.env.AGENTISEND_BASE_URL,
  });
  const { id } = await client.emails.send(
    {
      from,
      to,
      subject: 'Hello from the Node SDK',
      text: 'Sent with the agentisend package.',
    },
    { idempotencyKey: `sdk-node/${to}` },
  );
  return id;
}
