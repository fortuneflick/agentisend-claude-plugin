/**
 * Mastra — a `send-email` tool for an agent that holds its own key.
 *
 * The key in `AGENTISEND_API_KEY` is the agent's, minted with `POST /api-keys`
 * as `sending_access` and given a ceiling with `PATCH /limits/keys/:id`.
 * The idempotency key is the purpose and the recipient, so a retry replays
 * the first send. A refusal is returned, not thrown: the model reads `code`
 * and `fix`. For `agent_budget_exceeded` that means stopping, because the fix
 * names a person.
 */
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { AgentiSend, AgentiSendError } from 'agentisend';

const agentisend = new AgentiSend();

function mailFrom(): string {
  const from = process.env.MAIL_FROM;
  if (!from) throw new Error('Set MAIL_FROM to an address on a domain you have verified.');
  return from;
}

export type SendEmailResult = { sent: true; id: string } | { sent: false; code: string; fix: string };

export const sendEmail = createTool({
  id: 'send-email',
  description:
    'Send one email to a person who asked for it. Returns the message id, or a refusal ' +
    'with a code and a fix. When the fix says a person decides, stop and report it: ' +
    'calling again will not change the answer.',
  inputSchema: z.object({
    to: z.string().describe('The recipient, one address.'),
    subject: z.string().min(1).max(200),
    text: z.string().min(1).describe('The plain-text body.'),
    purpose: z
      .string()
      .regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)
      .describe('What this message is. The same purpose to the same recipient sends once.'),
  }),
  execute: async ({ to, subject, text, purpose }): Promise<SendEmailResult> => {
    try {
      const { id } = await agentisend.emails.send(
        { from: mailFrom(), to, subject, text },
        { idempotencyKey: `${purpose}/${to}` },
      );
      return { sent: true, id };
    } catch (err) {
      if (err instanceof AgentiSendError) return { sent: false, code: err.code, fix: err.fix };
      throw err;
    }
  },
});
