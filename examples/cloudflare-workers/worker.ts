/**
 * Cloudflare Workers — a module worker that sends one publish notice.
 *
 * The key, the From address and the base URL are bindings on `env`. They are
 * passed into the constructor on purpose: omitted, the SDK reads `process`,
 * and a Worker has no `process` object unless the nodejs compatibility flag
 * is on. AGENTISEND_BASE_URL is optional.
 */
import { AgentiSend, AgentiSendError } from 'agentisend';

export interface WorkerEnv {
  AGENTISEND_API_KEY: string;
  MAIL_FROM: string;
  AGENTISEND_BASE_URL?: string;
}

/** Enough to refuse an obvious typo here; the API checks the address properly. */
const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    let email = '';
    let note = '';
    try {
      const parsed = (await request.json()) as { email?: string; note?: string };
      email = String(parsed.email ?? '').trim();
      note = String(parsed.note ?? '');
    } catch {
      return Response.json({ error: 'email must be one address, like you@example.com' }, { status: 400 });
    }
    if (!ADDRESS.test(email)) {
      return Response.json({ error: 'email must be one address, like you@example.com' }, { status: 400 });
    }
    if (!env.MAIL_FROM) throw new Error('Set MAIL_FROM to an address on a domain you have verified.');

    const agentisend = new AgentiSend(env.AGENTISEND_API_KEY, {
      baseUrl: env.AGENTISEND_BASE_URL ?? 'https://api.agentisend.com',
      userAgent: 'agentisend-worker',
    });

    try {
      const { id } = await agentisend.emails.send(
        {
          from: env.MAIL_FROM,
          to: email,
          subject: 'Your worker published',
          text: `Publish note: ${note}`,
        },
        // The recipient, not the clock: a retried fetch replays this send.
        { idempotencyKey: `publish/${email}` },
      );
      return Response.json({ id });
    } catch (err) {
      if (err instanceof AgentiSendError) {
        return Response.json({ code: err.code, fix: err.fix }, { status: err.status });
      }
      return Response.json({ error: 'send failed' }, { status: 500 });
    }
  },
};
