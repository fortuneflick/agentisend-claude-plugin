/**
 * Give an agent its own key, its own budget, and a guard that stops it.
 *
 * The three calls below are the whole control plane:
 *
 *   POST  /api-keys                — a key scoped to sending, and nothing else
 *   PATCH /limits/keys/:id         — a hard spend ceiling for the period
 *   POST  /emails                  — the agent sends through its own key
 *
 * The last part of the script is the point. An agent stuck in a retry loop
 * sends the same message again and again; after the third near-identical send
 * inside the window the API refuses the fourth, holds it for a human to
 * approve, and returns `approval_required` with a `fix` that names the call
 * that resolves it. Nothing was delivered, and the agent is told what to do
 * rather than left to guess.
 */
import { AgentiSend, AgentiSendError } from '@agentisend/sdk-node';

function mailFrom(): string {
  const from = process.env.MAIL_FROM;
  if (!from) throw new Error('Set MAIL_FROM to an address on a domain you have verified.');
  return from;
}

export interface Refusal {
  code: string;
  message: string;
  fix: string;
  status: number;
  /** How many sends went through before the guard refused one. */
  sendsBeforeRefusal: number;
}

export interface Report {
  apiKeyId: string;
  budgetPerPeriod: number;
  firstMessageId: string;
  refusal: Refusal;
}

export async function run(): Promise<Report> {
  // The key you already hold — full access, kept by you, never given to the agent.
  const owner = new AgentiSend();
  const from = mailFrom();

  // 1. A key the agent holds. `sending_access` cannot read your logs, touch
  //    your domains, or mint further keys.
  const key = await owner.apiKeys.create({
    name: 'support-triage-agent',
    permission: 'sending_access',
  });

  // 2. A ceiling. The agent cannot spend past it, whatever it decides to do.
  const limit = await owner.limits.update(key.id, {
    budget_per_period: 50,
    period: 'daily',
    rate_ceiling_per_minute: 10,
  });

  // 3. The agent, holding only its own key.
  const agent = new AgentiSend(key.token);

  const first = await agent.emails.send({
    from,
    to: 'customer@example.com',
    subject: 'Ticket 4182 — we are looking into it',
    text: 'Someone from support will reply within the hour.',
  });

  // 4. Now the failure mode this exists for: the agent loops. Same recipient,
  //    same body, over and over. The guard refuses before the fourth copy
  //    reaches anyone.
  let sends = 1;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await agent.emails.send({
        from,
        to: 'customer@example.com',
        subject: 'Ticket 4182 — we are looking into it',
        text: 'Someone from support will reply within the hour.',
      });
      sends += 1;
    } catch (err) {
      if (err instanceof AgentiSendError && err.code === 'approval_required') {
        return {
          apiKeyId: key.id,
          budgetPerPeriod: limit.budget_per_period ?? 0,
          firstMessageId: first.id,
          refusal: {
            code: err.code,
            message: err.message,
            fix: err.fix,
            status: err.status,
            sendsBeforeRefusal: sends,
          },
        };
      }
      throw err;
    }
  }

  throw new Error('The loop guard did not refuse a repeated send. Check the key is the agent key.');
}

export function print(report: Report): void {
  console.log(`agent key       ${report.apiKeyId}`);
  console.log(`daily budget    ${report.budgetPerPeriod} emails`);
  console.log(`first send      ${report.firstMessageId}`);
  console.log(`sends allowed   ${report.refusal.sendsBeforeRefusal}`);
  console.log(`refused with    ${report.refusal.code} (HTTP ${report.refusal.status})`);
  console.log(`message         ${report.refusal.message}`);
  console.log(`fix             ${report.refusal.fix}`);
}

if (process.argv[1]?.endsWith('agent.ts') || process.argv[1]?.endsWith('agent.js')) {
  print(await run());
}
