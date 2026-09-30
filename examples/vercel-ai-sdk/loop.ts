/**
 * Vercel AI SDK — the agent loop around `sendEmail`.
 *
 * The model here is scripted. `generateText` still runs the SDK's own loop:
 * it checks the tool call against `inputSchema`, calls `execute`, and puts
 * the result in front of the next step. Nothing is billed and no provider is
 * called. The second call is a different message, so a key whose budget is
 * one comes back as `agent_budget_exceeded`.
 *
 * The key in `AGENTISEND_API_KEY` is the agent's, minted as `sending_access`
 * with a budget. `MAIL_FROM` is an address on a domain you have verified.
 */
import { generateText, stepCountIs, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { AgentiSend, AgentiSendError } from 'agentisend';
import { z } from 'zod';

const agentisend = new AgentiSend();

function mailFrom(): string {
  const from = process.env.MAIL_FROM;
  if (!from) throw new Error('Set MAIL_FROM to an address on a domain you have verified.');
  return from;
}

export type SendEmailResult = { sent: true; id: string } | { sent: false; code: string; fix: string };

export const sendEmail = tool({
  description:
    'Send one email to a person who asked for it. Returns the message id, or a refusal ' +
    'with a code and a fix. When the fix says a person decides, stop and report it.',
  inputSchema: z.object({
    to: z.string(),
    subject: z.string().min(1).max(200),
    text: z.string().min(1),
    purpose: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
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

const UPDATE = {
  to: 'vercel-loop@example.com',
  subject: 'Ticket 4182 — we are looking into it',
  text: 'Someone from support will reply within the hour.',
  purpose: 'ticket-4182-update',
};

const CLOSED = {
  to: 'vercel-loop@example.com',
  subject: 'Ticket 4182 — closed',
  text: 'The ticket is closed.',
  purpose: 'ticket-4182-closed',
};

const usage = {
  inputTokens: { total: 8, noCache: 8, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 8, text: 8, reasoning: 0 },
};

function toolCall(id: string, input: object) {
  return {
    content: [{ type: 'tool-call' as const, toolCallId: id, toolName: 'sendEmail', input: JSON.stringify(input) }],
    finishReason: { unified: 'tool-calls' as const, raw: 'tool-calls' },
    usage,
    warnings: [],
  };
}

let step = 0;

/** A model that asks for the update, then the close, then stops. */
const model = new MockLanguageModelV4({
  doGenerate: async () => {
    const n = step++;
    if (n === 0) return toolCall('call_update', UPDATE);
    if (n === 1) return toolCall('call_closed', CLOSED);
    return {
      content: [{ type: 'text' as const, text: 'Stopped after the refusal.' }],
      finishReason: { unified: 'stop' as const, raw: 'stop' },
      usage,
      warnings: [],
    };
  },
});

/** What each tool call handed back to the model, in order. */
export async function run(): Promise<SendEmailResult[]> {
  const result = await generateText({
    model,
    tools: { sendEmail },
    stopWhen: stepCountIs(4),
    prompt: 'Tell vercel-loop@example.com that ticket 4182 is being looked into, then that it is closed.',
  });
  const outputs: SendEmailResult[] = [];
  for (const one of result.steps) {
    for (const call of one.toolResults) {
      outputs.push(call.output as SendEmailResult);
    }
  }
  return outputs;
}
