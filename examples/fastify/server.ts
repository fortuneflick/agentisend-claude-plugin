/**
 * Fastify — a POST route that sends an invoice notice.
 *
 * The route's JSON schema checks the body before the handler runs, so a
 * request without a well-formed address is answered by Fastify and never
 * reaches the API. The app is exported without calling `listen`, so it can be
 * registered, tested with `app.inject`, or started from your own entry point.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import { AgentiSend, AgentiSendError } from 'agentisend';

const agentisend = new AgentiSend();

function mailFrom(): string {
  const from = process.env.MAIL_FROM;
  if (!from) throw new Error('Set MAIL_FROM to an address on a domain you have verified.');
  return from;
}

interface SendBody {
  email: string;
  invoiceId: string;
}

export const app: FastifyInstance = Fastify();

app.post<{ Body: SendBody }>(
  '/send',
  {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'invoiceId'],
        properties: {
          email: { type: 'string', format: 'email' },
          invoiceId: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,64}$' },
        },
      },
    },
  },
  async (request, reply) => {
    const { email, invoiceId } = request.body;
    try {
      const { id } = await agentisend.emails.send(
        {
          from: mailFrom(),
          to: email,
          subject: `Invoice ${invoiceId}`,
          text: `Invoice ${invoiceId} is ready in your account.`,
        },
        // One invoice, one email: a retried request replays the first send.
        { idempotencyKey: `invoice/${invoiceId}/${email}` },
      );
      return { id };
    } catch (err) {
      if (err instanceof AgentiSendError) {
        // `fix` names the call that repairs the request.
        return reply.code(err.status).send({ code: err.code, fix: err.fix });
      }
      throw err;
    }
  },
);

export default app;
