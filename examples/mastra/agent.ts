/**
 * Mastra — the agent that holds the send-email tool, and the loop the suite runs.
 *
 * `supportAgent` is a real Mastra `Agent`. The suite does not call a hosted
 * model. `run` calls the tool twice, which is the loop: the first send is
 * accepted, and the second message is refused with `agent_budget_exceeded`
 * when the key's budget is one.
 */
import { Agent } from '@mastra/core/agent';
import { sendEmail, type SendEmailResult } from './send-email-tool.js';

type Model = ConstructorParameters<typeof Agent>[0]['model'];

export function supportAgent(model: Model): Agent {
  return new Agent({
    id: 'support-agent',
    name: 'Support agent',
    instructions:
      'You answer support tickets. Email a customer only about their own ticket, with ' +
      'send-email, one purpose per message. If a send comes back with sent: false, read ' +
      'the fix. When it says a person decides, stop and report the code and the fix.',
    model,
    tools: { sendEmail },
  });
}

const UPDATE = {
  to: 'mastra-agent@example.com',
  subject: 'Ticket 4182 — we are looking into it',
  text: 'Someone from support will reply within the hour.',
  purpose: 'ticket-4182-update',
};

const CLOSED = {
  to: 'mastra-agent@example.com',
  subject: 'Ticket 4182 — closed',
  text: 'The ticket is closed.',
  purpose: 'ticket-4182-closed',
};

export async function run(): Promise<SendEmailResult[]> {
  // Constructing the agent registers the tool. Generating would call a model.
  supportAgent('openai/gpt-4o-mini');
  const outputs: SendEmailResult[] = [];
  for (const input of [UPDATE, CLOSED]) {
    const result = (await sendEmail.execute!(input, {} as never)) as SendEmailResult;
    outputs.push(result);
    if (!result.sent) break;
  }
  return outputs;
}
