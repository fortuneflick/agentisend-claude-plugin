/**
 * LangChain.js — a `send_email` tool for an agent that holds its own key.
 *
 * The key in `AGENTISEND_API_KEY` here is the agent's, not yours. It was
 * minted with `POST /api-keys` as `sending_access`, given a ceiling with
 * `PATCH /limits/keys/:id`, and `POST /limits/kill-all` stops it along with
 * every other key. Those three calls run in examples/ai-agent-with-budget;
 * this file is the other half, the tool the model calls once the key exists.
 *
 * Two rules make it safe to hand to a model. The idempotency key is derived
 * from the purpose and the recipient, never from the moment, so a model that
 * retries a timed-out call replays the first send instead of mailing someone
 * twice. And a refusal is returned, not thrown: the model reads `code` and
 * `fix` and acts on them — for `agent_budget_exceeded` and `approval_required`
 * that means stopping and saying so, because the fix names a person.
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { AgentiSend, AgentiSendError } from 'agentisend';

/** The agent's own key: `sending_access`, with a budget on it. */
const agentisend = new AgentiSend();

function mailFrom(): string {
  const from = process.env.MAIL_FROM;
  if (!from) throw new Error('Set MAIL_FROM to an address on a domain you have verified.');
  return from;
}

/** What the model gets back: a message id, or a refusal it can act on. */
export type SendEmailResult =
  | { sent: true; id: string }
  | { sent: false; code: string; fix: string };

export const sendEmail = tool(
  async ({ to, subject, text, purpose }): Promise<SendEmailResult> => {
    try {
      const { id } = await agentisend.emails.send(
        { from: mailFrom(), to, subject, text },
        // Derived from the thing being done, not from the moment it was asked
        // for: a retry after a timeout replays the first send.
        { idempotencyKey: `${purpose}/${to}` },
      );
      return { sent: true, id };
    } catch (err) {
      if (err instanceof AgentiSendError) {
        // The API checked the address, the suppression list, the budget and
        // the loop guard, and the refusal names its fix. The model can read
        // that; it cannot read an exception.
        return { sent: false, code: err.code, fix: err.fix };
      }
      throw err;
    }
  },
  {
    name: 'send_email',
    description:
      'Send one email to a person who asked for it. Returns the message id, or a refusal ' +
      'with a code and a fix. When the fix says a person decides, stop and report it: ' +
      'calling again will not change the answer.',
    schema: z.object({
      to: z.string().describe('The recipient, one address.'),
      subject: z.string().min(1).max(200),
      text: z.string().min(1).describe('The plain-text body.'),
      purpose: z
        .string()
        .regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)
        .describe(
          'What this message is, for example "ticket-4182-update". The same purpose to the ' +
            'same recipient sends once, however many times it is called.',
        ),
    }),
  },
);
