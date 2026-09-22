import { spawn, spawnSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  FakeResolver,
  InProcessSendQueue,
  buildApp,
  makeSendJobHandler,
  configureKeyCrypto,
  mintApiKey,
  registerRoutes,
} from '@agentisend/api';
import { accounts, apiKeys, ERROR_CATALOG } from '@agentisend/core';
import { LIVE_TEST_PLAN, createTestDb, type TestDb } from '@agentisend/core/testing';
import { FakeTransport } from '@agentisend/transport';
import type { FastifyInstance } from 'fastify';
import { AgentiSend, type Email } from '@agentisend/sdk-node';

/**
 * Every example in `examples/` is executed here against a real API — real
 * routes, real gates, real send worker, fake transport.
 *
 * An integration example that is never run is an integration example that is
 * wrong within a month, and these are the files we ask other projects to link
 * from their own docs. So the send path of each one runs once. Framework
 * handlers are called directly with a stub request rather than booted, except
 * where the framework boots in milliseconds (Hono's `app.request`, Express on
 * an ephemeral port), in which case the real thing is cheaper than a stub.
 *
 * The examples read `AGENTISEND_API_KEY` and `AGENTISEND_BASE_URL` at module
 * load exactly as a user's deployment does, so they are imported dynamically
 * after the server is up — no test-only injection seam exists in them.
 */

const PEPPER = 'test-pepper-not-a-secret-0123456789abcdef';
const FROM = 'notifications@yourdomain.com';
const HOOK_SECRET = `whsec_${Buffer.from('supabase-send-email-hook-secret').toString('base64')}`;

let app: FastifyInstance;
let testDb: TestDb;
let transport: FakeTransport;
let queue: InProcessSendQueue;
let baseUrl: string;
let token: string;
let owner: AgentiSend;

beforeAll(async () => {
  testDb = await createTestDb();
  // On a live plan, as a reader who copies these files is: an account without
  // one sends simulation mail only, and every example here does a real send.
  const [account] = await testDb.db
    .insert(accounts)
    .values({ name: 'examples', ...LIVE_TEST_PLAN })
    .returning({ id: accounts.id });

  configureKeyCrypto(PEPPER);
  const minted = mintApiKey();
  await testDb.db.insert(apiKeys).values({
    accountId: account!.id,
    name: 'examples',
    permission: 'full_access',
    tokenHash: minted.tokenHash,
    tokenPrefix: minted.tokenPrefix,
  });
  token = minted.token;

  transport = new FakeTransport();
  queue = new InProcessSendQueue({
    handler: makeSendJobHandler({ db: testDb.db, transport, allowUnverifiedDomain: true }),
  });
  app = buildApp({ logLevel: 'silent', db: testDb.db, transport });
  registerRoutes(app, {
    db: testDb.db,
    queue,
    resolver: new FakeResolver(),
    allowUnverifiedDomain: true,
    keyPepper: PEPPER,
  });

  await app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = app.server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;

  process.env.AGENTISEND_API_KEY = token;
  process.env.AGENTISEND_BASE_URL = baseUrl;
  process.env.MAIL_FROM = FROM;
  process.env.SEND_EMAIL_HOOK_SECRET = HOOK_SECRET;

  owner = new AgentiSend(token, { baseUrl });
});

afterAll(async () => {
  await queue.close();
  await app.close();
  await testDb.pglite.close();
});

/**
 * The message the API actually accepted for this recipient. Keyed on the
 * address rather than the subject, because two examples legitimately send the
 * same subject line and a test that matched on it would pass on the wrong row.
 */
async function acceptedFor(recipient: string): Promise<Email> {
  const page = await owner.emails.list({ limit: 100 });
  const hit = page.data.find((email) => email.to.includes(recipient));
  expect(hit, `no message was accepted for ${recipient}`).toBeDefined();
  return hit!;
}

describe('Next.js App Router', () => {
  it('the route handler sends and returns the message id', async () => {
    const { POST } = await import('../next-app-router/route.js');
    const response = await POST(
      new Request('http://localhost/api/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'nextjs@example.com', name: 'Ada' }),
      }),
    );

    expect(response.status).toBe(200);
    const { id } = (await response.json()) as { id: string };
    expect((await owner.emails.get(id)).subject).toBe('Welcome');
  });

  it('a missing address is refused before the API is called', async () => {
    const { POST } = await import('../next-app-router/route.js');
    const response = await POST(
      new Request('http://localhost/api/send', { method: 'POST', body: '{}' }),
    );
    expect(response.status).toBe(400);
  });

  it('the Server Action sends and returns the message id', async () => {
    const { inviteTeammate } = await import('../next-app-router/actions.js');
    const form = new FormData();
    form.set('email', 'invited@example.com');
    const result = await inviteTeammate(form);
    expect(result.error).toBeUndefined();
    expect((await owner.emails.get(result.id!)).subject).toBe('You have been invited');
  });
});

describe('Supabase Send Email Hook', () => {
  function signedRequest(body: string): Request {
    const id = `msg_${randomUUID()}`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const key = Buffer.from(HOOK_SECRET.replace(/^whsec_/, ''), 'base64');
    const signature = createHmac('sha256', key)
      .update(`${id}.${timestamp}.${body}`)
      .digest('base64');
    return new Request('http://localhost/hooks/send-email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'webhook-id': id,
        'webhook-timestamp': timestamp,
        'webhook-signature': `v1,${signature}`,
      },
      body,
    });
  }

  const payload = {
    user: { id: randomUUID(), email: 'signup@example.com' },
    email_data: {
      token: '123456',
      token_hash: 'tokenhash-signup-1',
      redirect_to: 'http://localhost:3000/welcome',
      email_action_type: 'signup',
      site_url: 'http://localhost:54321',
    },
  };

  it('verifies the Standard Webhooks signature and sends the confirmation', async () => {
    const { POST } = await import('../supabase-auth-hook/handler.js');
    const response = await POST(signedRequest(JSON.stringify(payload)));
    expect(response.status).toBe(200);

    const email = await acceptedFor('signup@example.com');
    expect(email.subject).toBe('Confirm your email');
    // The verify link, not the six-digit code, is what the user clicks.
    expect(email.html ?? '').toContain('token=tokenhash-signup-1');
  });

  it('refuses an unsigned request without sending anything', async () => {
    const { POST } = await import('../supabase-auth-hook/handler.js');
    const before = (await owner.emails.list({ limit: 100 })).data.length;
    const response = await POST(
      new Request('http://localhost/hooks/send-email', {
        method: 'POST',
        headers: { 'webhook-id': 'x', 'webhook-timestamp': '1', 'webhook-signature': 'v1,nope' },
        body: JSON.stringify(payload),
      }),
    );
    expect(response.status).toBe(401);
    expect((await owner.emails.list({ limit: 100 })).data.length).toBe(before);
  });
});

describe('Better Auth', () => {
  it('sendVerificationEmail sends the confirmation link', async () => {
    const { sendVerificationEmail } = await import('../better-auth/email.js');
    await sendVerificationEmail({
      user: { id: randomUUID(), email: 'ba-verify@example.com', name: 'Grace' },
      url: 'https://app.example.com/verify?token=ba-1',
      token: 'ba-1',
    });
    const email = await acceptedFor('ba-verify@example.com');
    expect(email.subject).toBe('Confirm your email');
    expect(email.from).toContain(FROM);
  });

  it('sendResetPassword sends the reset link', async () => {
    const { sendResetPassword } = await import('../better-auth/email.js');
    await sendResetPassword({
      user: { id: randomUUID(), email: 'ba-reset@example.com' },
      url: 'https://app.example.com/reset?token=ba-2',
      token: 'ba-2',
    });
    const email = await acceptedFor('ba-reset@example.com');
    expect(email.subject).toBe('Reset your password');
    expect(email.html ?? '').toContain('https://app.example.com/reset?token=ba-2');
  });
});

describe('Auth.js email provider', () => {
  it('sendVerificationRequest sends the magic link', async () => {
    const { sendVerificationRequest } = await import(
      '../authjs-email-provider/send-verification-request.js'
    );
    await sendVerificationRequest({
      identifier: 'authjs@example.com',
      url: 'https://app.example.com/api/auth/callback/nodemailer?token=aj-1',
      provider: { from: FROM },
    });
    const email = await acceptedFor('authjs@example.com');
    expect(email.subject).toBe('Sign in to app.example.com');
    expect(email.text ?? '').toContain('token=aj-1');
  });

  it('a refused send throws with the code and the fix, so sign-in reports failure', async () => {
    const { sendVerificationRequest } = await import(
      '../authjs-email-provider/send-verification-request.js'
    );
    await expect(
      sendVerificationRequest({
        identifier: 'authjs-bad@example.com',
        url: 'https://app.example.com/api/auth/callback/nodemailer?token=aj-2',
        provider: { from: 'not-an-address' },
      }),
    ).rejects.toThrow(/invalid_from_address: /);
  });
});

describe('Hono', () => {
  it('POST /send returns the message id', async () => {
    const { app: hono } = await import('../hono/app.js');
    const response = await hono.request('/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'hono@example.com', subject: 'Your receipt' }),
    });
    expect(response.status).toBe(200);
    const { id } = (await response.json()) as { id: string };
    expect((await owner.emails.get(id)).to).toContain('hono@example.com');
  });
});

describe('SvelteKit form action', () => {
  it('the default action sends the form and returns the message id', async () => {
    const { actions } = await import('../sveltekit-form-action/page.server.js');
    const form = new FormData();
    form.set('email', 'visitor@example.com');
    form.set('message', 'Do you support EU data residency?');
    const request = new Request('http://localhost/contact', { method: 'POST', body: form });

    const result = await actions.default({ request });
    expect(result.status).toBe(200);

    const email = await owner.emails.get(result.data.id!);
    // The visitor is the reply-to, never the From: the mail is sent by the
    // verified domain, and replying still reaches them.
    expect(email.reply_to).toContain('visitor@example.com');
    expect(email.from).toContain(FROM);
  });
});

describe('Express', () => {
  let server: Server;
  let origin: string;

  beforeAll(async () => {
    const { app: expressApp } = await import('../express/server.js');
    server = await new Promise<Server>((resolve) => {
      const started = expressApp.listen(0, '127.0.0.1', () => resolve(started));
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('POST /send returns the message id', async () => {
    const response = await fetch(`${origin}/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'express@example.com' }),
    });
    expect(response.status).toBe(200);
    const { id } = (await response.json()) as { id: string };
    expect((await owner.emails.get(id)).subject).toBe('Your order shipped');
  });
});

/**
 * The Python twin of the agent example, run as a user would run it: a child
 * process with the same three environment variables and nothing installed.
 * Skips cleanly when python3 is missing so the JS suite still means something.
 */
const python = spawnSync('python3', ['--version']);
describe.skipIf(python.error !== undefined || python.status !== 0)(
  'An agent with a budget and a loop guard, in Python',
  () => {
    it('mints a scoped key, sets a ceiling, sends, and is refused on the fourth repeat', async () => {
      const script = new URL('../python-agent-with-budget/agent.py', import.meta.url).pathname;
      // Asynchronous on purpose: the API the script talks to runs in this
      // process, and a synchronous spawn would block the event loop it needs.
      const proc = await new Promise<{ status: number | null; stdout: string; stderr: string }>((done) => {
        const child = spawn('python3', [script], { env: process.env });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
        child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
        child.on('close', (status) => done({ status, stdout, stderr }));
      });
      expect(proc.stderr, proc.stderr).toBe('');
      expect(proc.status).toBe(0);
      const lines = proc.stdout.trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(lines[0]?.step).toBe('send');
      const refusal = lines.at(-1)!;
      expect(refusal.step).toBe('refused');
      expect(refusal.code).toBe('approval_required');
      expect(refusal.sends_before_refusal).toBe(3);
      expect(String(refusal.fix)).toMatch(/agent-actions/);
      expect((await owner.emails.get(String(lines[0]!.id))).to).toContain('customer-py@example.com');
    });
  },
);

describe('An agent with a budget and a loop guard', () => {
  it('mints a scoped key, caps it, sends, and is refused when it loops', async () => {
    const { run } = await import('../ai-agent-with-budget/agent.js');
    const report = await run();

    expect(report.budgetPerPeriod).toBe(50);
    expect((await owner.emails.get(report.firstMessageId)).subject).toBe(
      'Ticket 4182 — we are looking into it',
    );

    // The refusal is the product: a held send, a 403, and a fix that names who
    // resolves it. W4.1 (AS#60): that is a person, in the console — the fix
    // used to name the approve endpoint, which the held agent's own key is now
    // refused at, so the error was telling it how to route around the hold.
    expect(report.refusal.code).toBe('approval_required');
    expect(report.refusal.status).toBe(403);
    expect(report.refusal.sendsBeforeRefusal).toBe(3);
    expect(report.refusal.message).toMatch(/near-identical emails to customer@example.com/);
    expect(report.refusal.fix).toBe(ERROR_CATALOG.approval_required.fix);
    expect(report.refusal.fix).toMatch(/person|console/i);

    // The agent's key is scoped to sending and nothing else.
    const key = (await owner.apiKeys.list({ limit: 100 })).data.find(
      (k) => k.id === report.apiKeyId,
    );
    expect(key?.permission).toBe('sending_access');
    expect((await owner.limits.get(report.apiKeyId)).budget_per_period).toBe(50);
  });
});

describe('the whole set', () => {
  it('every accepted message really reached the transport', async () => {
    await queue.drain();
    const sends = transport.getSends();
    expect(sends.length).toBeGreaterThanOrEqual(8);
    // PRD §13 — nothing here mails a stranger. Every recipient is either the
    // caller's own verified address or an address that asked for the message.
    expect(sends.every((send) => send.message.to.length === 1)).toBe(true);
  });
});
