/**
 * Node.js — a POST route on `node:http`, with no framework.
 *
 * The server is created and not started, so a test or another file can call
 * `listen`. `AGENTISEND_API_KEY` is the key this process holds. `MAIL_FROM` is
 * an address on a domain you have verified. `AGENTISEND_BASE_URL` is optional
 * and defaults to https://api.agentisend.com.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { AgentiSend, AgentiSendError } from 'agentisend';

const agentisend = new AgentiSend();

function mailFrom(): string {
  const from = process.env.MAIL_FROM;
  if (!from) throw new Error('Set MAIL_FROM to an address on a domain you have verified.');
  return from;
}

/** Enough to refuse an obvious typo here; the API checks the address properly. */
const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST' || req.url !== '/send') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }

  let email = '';
  let note = '';
  try {
    const parsed = JSON.parse(await readBody(req)) as { email?: string; note?: string };
    email = String(parsed.email ?? '').trim();
    note = String(parsed.note ?? '');
  } catch {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'email must be one address, like you@example.com' }));
    return;
  }

  if (!ADDRESS.test(email)) {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'email must be one address, like you@example.com' }));
    return;
  }

  try {
    const { id } = await agentisend.emails.send(
      {
        from: mailFrom(),
        to: email,
        subject: 'Your receipt',
        text: `Receipt note: ${note}`,
      },
      // Derived from the recipient, not from the moment: a retry replays.
      { idempotencyKey: `receipt/${email}` },
    );
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id }));
  } catch (err) {
    if (err instanceof AgentiSendError) {
      res.writeHead(err.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ code: err.code, fix: err.fix }));
      return;
    }
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'send failed' }));
  }
}

/** Exported without `listen`, so it can be mounted or started elsewhere. */
export const server: Server = createServer((req, res) => {
  void handle(req, res);
});

export default server;
