/**
 * Claude Agent SDK: one send_email tool inside the Anthropic SDK's tool loop.
 *
 * `beta.messages.toolRunner` is the loop a run uses: it checks the model's
 * arguments, calls the tool, and puts the tool result in front of the next
 * turn. The model here is scripted. `fetch` returns the two tool calls a
 * model would make, then a stop. Nothing is billed and no provider is called.
 * The second call is a different message, so a key whose budget is one comes
 * back as `agent_budget_exceeded`.
 *
 * The key in `AGENTISEND_API_KEY` is the agent's, minted as `sending_access`
 * with a budget. `MAIL_FROM` is an address on a domain you have verified.
 * `AGENTISEND_BASE_URL` is optional.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { AgentiSend, AgentiSendError } from 'agentisend';
import { z } from 'zod';

const agentisend = new AgentiSend();

function mailFrom(): string {
  const from = process.env.MAIL_FROM;
  if (!from) throw new Error('Set MAIL_FROM to an address on a domain you have verified.');
  return from;
}

export type SendEmailResult = { sent: true; id: string } | { sent: false; code: string; fix: string };

const TO = 'claude-agent@example.com';

const UPDATE = {
  to: TO,
  subject: 'Ticket 4182: we are looking into it',
  text: 'Someone from support will reply within the hour.',
  purpose: 'ticket-4182-update',
};

const CLOSED = {
  to: TO,
  subject: 'Ticket 4182: closed',
  text: 'The ticket is closed.',
  purpose: 'ticket-4182-closed',
};

const CALLS = [UPDATE, CLOSED] as const;

export const sendEmail = betaZodTool({
  name: 'send_email',
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
  run: async ({ to, subject, text, purpose }): Promise<string> => {
    let result: SendEmailResult;
    try {
      const { id } = await agentisend.emails.send(
        { from: mailFrom(), to, subject, text },
        { idempotencyKey: `${purpose}/${to}` },
      );
      result = { sent: true, id };
    } catch (err) {
      if (err instanceof AgentiSendError) result = { sent: false, code: err.code, fix: err.fix };
      else throw err;
    }
    outputs.push(result);
    return JSON.stringify(result);
  },
});

/** What each tool call handed back, in order. `run` clears this. */
const outputs: SendEmailResult[] = [];

function assistant(content: unknown[], stopReason: 'tool_use' | 'end_turn'): Response {
  return new Response(
    JSON.stringify({
      id: `msg_${stopReason}_${content.length}`,
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-4-5',
      content,
      stop_reason: stopReason,
      stop_sequence: null,
      stop_details: null,
      container: null,
      context_management: null,
      diagnostics: null,
      usage: {
        input_tokens: 12,
        output_tokens: 12,
        cache_creation: null,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
        fallback_credit: null,
        inference_geo: null,
        iterations: null,
        output_tokens_details: null,
        server_tool_use: null,
        service_tier: null,
        speed: null,
      },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

/**
 * Two tool calls, then a stop. A request that is not the messages call is
 * refused here so the example cannot reach a hosted model by accident.
 */
function scriptedFetch(): typeof fetch {
  let turn = 0;
  return async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes('/v1/messages')) throw new Error(`This example does not call ${url}`);
    const n = turn++;
    const call = CALLS[n];
    if (call) {
      return assistant(
        [{ type: 'tool_use', id: `toolu_${call.purpose}`, name: 'send_email', input: call }],
        'tool_use',
      );
    }
    return assistant([{ type: 'text', text: 'Stopped after the refusal.' }], 'end_turn');
  };
}

/** The SDK loop: two sends, then the refusal the model would read next. */
export async function run(): Promise<SendEmailResult[]> {
  outputs.length = 0;
  const client = new Anthropic({
    apiKey: 'not-used',
    maxRetries: 0,
    fetch: scriptedFetch(),
  });
  const runner = client.beta.messages.toolRunner({
    model: 'claude-sonnet-4-5',
    max_tokens: 256,
    max_iterations: 4,
    tools: [sendEmail],
    messages: [
      {
        role: 'user',
        content: 'Tell claude-agent@example.com that ticket 4182 is being looked into, then that it is closed.',
      },
    ],
  });
  await runner.runUntilDone();
  return [...outputs];
}
