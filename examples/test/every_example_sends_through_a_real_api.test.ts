import { spawn, spawnSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { existsSync, mkdirSync } from 'node:fs';
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
import { ToolInputParsingException } from '@langchain/core/tools';
import { AgentiSend, type Email } from '@agentisend/sdk-node';
import { createApp, toWebHandler } from 'h3';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { ActionFunctionArgs } from 'react-router';
// Type-only, so the modules still load after the server is up, with the agent's key in the environment.
import type { sendEmail as vercelSendEmail } from '../vercel-ai-sdk/send-email-tool.js';
import type { sendEmail as langchainSendEmail } from '../langchain/send-email-tool.js';

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
 * The bad-address path of every framework below: the handler answers it
 * itself, so the count of accepted messages does not move.
 */
async function acceptedCount(): Promise<number> {
  return (await owner.emails.list({ limit: 100 })).data.length;
}

describe('Fastify', () => {
  it('POST /send returns the message id', async () => {
    const { app: fastify } = await import('../fastify/server.js');
    const response = await fastify.inject({
      method: 'POST',
      url: '/send',
      payload: { email: 'fastify@example.com', invoiceId: 'INV-1042' },
    });
    expect(response.statusCode, response.body).toBe(200);
    const { id } = response.json<{ id: string }>();
    const email = await acceptedFor('fastify@example.com');
    expect(email.id).toBe(id);
    expect(email.subject).toBe('Invoice INV-1042');
  });

  it('a malformed address is refused by the route schema before the API is called', async () => {
    const { app: fastify } = await import('../fastify/server.js');
    const before = await acceptedCount();
    const response = await fastify.inject({
      method: 'POST',
      url: '/send',
      payload: { email: 'not-an-address', invoiceId: 'INV-1043' },
    });
    expect(response.statusCode).toBe(400);
    expect(await acceptedCount()).toBe(before);
  });
});

describe('Astro API route', () => {
  function post(email: string): Request {
    const form = new FormData();
    form.set('email', email);
    return new Request('http://localhost/api/waitlist', { method: 'POST', body: form });
  }

  it('POST confirms the sign-up and returns the message id', async () => {
    const { POST, prerender } = await import('../astro/waitlist.js');
    expect(prerender).toBe(false);
    const response = await POST({ request: post('astro@example.com') });
    expect(response.status).toBe(200);
    const { id } = (await response.json()) as { id: string };
    const email = await acceptedFor('astro@example.com');
    expect(email.id).toBe(id);
    expect(email.subject).toBe('You are on the waitlist');
  });

  it('a malformed address is refused before the API is called', async () => {
    const { POST } = await import('../astro/waitlist.js');
    const before = await acceptedCount();
    const response = await POST({ request: post('astro at example.com') });
    expect(response.status).toBe(400);
    expect(await acceptedCount()).toBe(before);
  });
});

describe('Nuxt server route', () => {
  // The route is mounted on a bare h3 app, which is what Nitro does with
  // everything under server/, and driven through h3's own web adapter.
  async function send(body: unknown): Promise<Response> {
    const { default: handler } = await import('../nuxt/send.post.js');
    const web = toWebHandler(createApp().use('/api/send', handler));
    return web(
      new Request('http://localhost/api/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  }

  it('POST /api/send confirms the booking and returns the message id', async () => {
    const response = await send({ email: 'nuxt@example.com', bookingId: 'BK-2291' });
    expect(response.status).toBe(200);
    const { id } = (await response.json()) as { id: string };
    const email = await acceptedFor('nuxt@example.com');
    expect(email.id).toBe(id);
    expect(email.subject).toBe('Your booking is confirmed');
  });

  it('a malformed address is refused before the API is called', async () => {
    const before = await acceptedCount();
    const response = await send({ email: 'nuxt@', bookingId: 'BK-2292' });
    expect(response.status).toBe(400);
    expect(await acceptedCount()).toBe(before);
  });
});

describe('React Router action', () => {
  /** What the framework passes an action; this one reads only `request`. */
  function args(email: string): ActionFunctionArgs {
    const form = new FormData();
    form.set('email', email);
    const request = new Request('http://localhost/report', { method: 'POST', body: form });
    return {
      request,
      url: new URL(request.url),
      pattern: '/report',
      params: {},
      context: {} as ActionFunctionArgs['context'],
    };
  }

  it('the action emails the link and returns the message id', async () => {
    const { action } = await import('../react-router/report.js');
    const result = await action(args('react-router@example.com'));
    expect(result.init?.status ?? 200).toBe(200);
    const email = await acceptedFor('react-router@example.com');
    expect(result.data).toEqual({ id: email.id });
    expect(email.subject).toBe('Your copy of the report');
  });

  it('a malformed address is refused before the API is called', async () => {
    const { action } = await import('../react-router/report.js');
    const before = await acceptedCount();
    const result = await action(args('react-router.example.com'));
    expect(result.init?.status).toBe(400);
    expect(await acceptedCount()).toBe(before);
  });
});

describe('NestJS', () => {
  let nest: INestApplication;
  let origin: string;

  beforeAll(async () => {
    const { AppModule } = await import('../nestjs/app.module.js');
    nest = await NestFactory.create(AppModule, { logger: false });
    await nest.listen(0, '127.0.0.1');
    origin = `http://127.0.0.1:${(nest.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await nest.close();
  });

  function confirm(body: unknown): Promise<Response> {
    return fetch(`${origin}/orders/confirmation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('POST /orders/confirmation returns the message id, and a retry replays it', async () => {
    const response = await confirm({ email: 'nestjs@example.com', orderId: 'A-1042' });
    expect(response.status).toBe(200);
    const { id } = (await response.json()) as { id: string };
    const email = await acceptedFor('nestjs@example.com');
    expect(email.id).toBe(id);
    expect(email.subject).toBe('Order A-1042 confirmed');
    // Same order: the idempotency key replays the first send.
    expect(await (await confirm({ email: 'nestjs@example.com', orderId: 'A-1042' })).json()).toEqual({ id });
  });

  it('a malformed address is refused before the API is called', async () => {
    const before = await acceptedCount();
    const response = await confirm({ email: 'nestjs@example', orderId: 'A-1043' });
    expect(response.status).toBe(400);
    expect(await acceptedCount()).toBe(before);
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
      expect(String(refusal.fix)).toMatch(/Agents → Approvals/);
      expect((await owner.emails.get(String(lines[0]!.id))).to).toContain('customer-py@example.com');
    });
  },
);

/**
 * The Python web frameworks: FastAPI, Flask and Django. Each `app.py` is the
 * file the guide inlines; the `run.py` beside it drives the app through that
 * framework's own test client and prints one JSON line per request, so what
 * runs is the framework's real routing, parsing and response code.
 *
 * The frameworks are pinned in examples/requirements.txt. When the python3 on
 * PATH already has those versions (CI installs them), it is used as is;
 * otherwise they are installed once into a virtualenv under node_modules/.cache
 * and reused. A failed install fails this block: python3 is there, so a skip
 * would hide a broken requirements file.
 */
const REQUIREMENTS = new URL('../requirements.txt', import.meta.url).pathname;
const VENV = new URL('../../node_modules/.cache/agentisend-python-examples', import.meta.url).pathname;
const VENV_PYTHON = `${VENV}/${process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'}`;
const SDK_PYTHON = new URL('../../packages/sdk-python', import.meta.url).pathname;

/** Exits 0 only when every pinned requirement is installed at its pinned version. */
const HAS_REQUIREMENTS = `
import sys, importlib.metadata as meta
for line in open(sys.argv[1]):
    line = line.split("#")[0].strip()
    if not line:
        continue
    name, _, version = line.partition("==")
    try:
        installed = meta.version(name)
    except meta.PackageNotFoundError:
        sys.exit(1)
    if installed != version:
        sys.exit(1)
`;

function hasRequirements(interpreter: string): boolean {
  return spawnSync(interpreter, ['-c', HAS_REQUIREMENTS, REQUIREMENTS]).status === 0;
}

function mustRun(command: string, args: string[]): void {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 540_000 });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed: ${String(result.error ?? '')}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    );
  }
}

/** A python3 that has the pinned frameworks, installing them into the cached venv if needed. */
function frameworkPython(): string {
  if (hasRequirements('python3')) return 'python3';
  if (existsSync(VENV_PYTHON) && hasRequirements(VENV_PYTHON)) return VENV_PYTHON;
  mkdirSync(VENV, { recursive: true });
  mustRun('python3', ['-m', 'venv', '--clear', VENV]);
  mustRun(VENV_PYTHON, ['-m', 'pip', 'install', '--quiet', '--disable-pip-version-check', '-r', REQUIREMENTS]);
  if (!hasRequirements(VENV_PYTHON)) {
    throw new Error(`pip reported success but ${VENV} lacks a version pinned in examples/requirements.txt`);
  }
  return VENV_PYTHON;
}

const PYTHON_FRAMEWORKS = [
  {
    name: 'FastAPI',
    dir: 'fastapi',
    to: 'fastapi@example.com',
    // FastAPI's refused request is the same address with a different name.
    refusedTo: 'fastapi@example.com',
    subject: 'Welcome',
  },
  {
    name: 'Flask',
    dir: 'flask',
    to: 'flask@example.com',
    refusedTo: 'flask-other@example.com',
    subject: 'Receipt for order 1042',
  },
  {
    name: 'Django',
    dir: 'django',
    to: 'django@example.com',
    refusedTo: 'django-other@example.com',
    subject: 'Order 2042 has shipped',
  },
] as const;

describe.skipIf(python.error !== undefined || python.status !== 0)('Python web frameworks', () => {
  let interpreter: string;

  beforeAll(() => {
    interpreter = frameworkPython();
  }, 600_000);

  it.each(PYTHON_FRAMEWORKS)(
    '$name: POST /send sends once, replays a retry, validates the address, and returns code and fix on a refusal',
    async ({ dir, to, refusedTo, subject }) => {
      const script = new URL(`../${dir}/run.py`, import.meta.url).pathname;
      // Asynchronous for the same reason as above: the API runs in this process.
      const proc = await new Promise<{ status: number | null; stdout: string; stderr: string }>((done) => {
        const child = spawn(interpreter, [script], {
          cwd: new URL(`../${dir}/`, import.meta.url).pathname,
          // No __pycache__ left in examples/: the directory is published as is.
          env: { ...process.env, PYTHONPATH: SDK_PYTHON, PYTHONDONTWRITEBYTECODE: '1' },
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
        child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
        child.on('close', (status) => done({ status, stdout, stderr }));
      });
      expect(proc.status, proc.stderr).toBe(0);
      const steps = Object.fromEntries(
        proc.stdout
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line) as Record<string, unknown>)
          .map((line) => [String(line.step), line]),
      );

      // Accepted, and the id the route returned is the message the API holds.
      expect(steps.send?.status).toBe(200);
      const email = await acceptedFor(to);
      expect(steps.send?.id).toBe(email.id);
      expect(email.subject).toBe(subject);
      expect(email.from).toContain(FROM);

      // The same request again replays the first send.
      expect(steps.retry).toEqual(steps.send ? { ...steps.send, step: 'retry' } : undefined);

      // A malformed address never reaches the API.
      expect(steps.invalid?.status).toBe(400);
      expect(String(steps.invalid?.error)).toMatch(/one address/);

      // The refusal arrives as the API's own code and fix, with its status.
      const mismatch = ERROR_CATALOG.idempotency_payload_mismatch;
      expect(steps.refused).toEqual({
        step: 'refused',
        status: mismatch.status,
        code: mismatch.code,
        fix: mismatch.fix,
      });
      const all = (await owner.emails.list({ limit: 100 })).data;
      expect(all.filter((e) => e.to.includes(to))).toHaveLength(1);
      expect(all.filter((e) => e.to.includes(refusedTo))).toHaveLength(to === refusedTo ? 1 : 0);
    },
  );
});

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

/**
 * The two agent-framework tools are the agent's half of ai-agent-with-budget:
 * each holds a key scoped to sending with a budget on it, and each is imported
 * with that key in the environment, exactly as the agent's process is
 * deployed — the owner's key never reaches the module. The budget is one, so
 * the third distinct send is the refusal the tool exists to hand back.
 */
async function agentKeyWithBudget(name: string, budget: number): Promise<string> {
  const key = await owner.apiKeys.create({ name, permission: 'sending_access' });
  await owner.limits.update(key.id, { budget_per_period: budget, period: 'daily' });
  return key.token;
}

async function importAsAgent<T>(agentToken: string, load: () => Promise<T>): Promise<T> {
  process.env.AGENTISEND_API_KEY = agentToken;
  try {
    return await load();
  } finally {
    process.env.AGENTISEND_API_KEY = token;
  }
}

const TICKET_UPDATE = {
  subject: 'Ticket 4182 — we are looking into it',
  text: 'Someone from support will reply within the hour.',
  purpose: 'ticket-4182-update',
};

describe('A Vercel AI SDK tool', () => {
  let sendEmail: typeof vercelSendEmail;
  // What the SDK passes alongside the model's arguments; nothing here reads it.
  const call = { toolCallId: 'call_1', messages: [], context: {} };
  const message = { to: 'vercel-agent@example.com', ...TICKET_UPDATE };

  beforeAll(async () => {
    const agentToken = await agentKeyWithBudget('vercel-ai-sdk-agent', 1);
    ({ sendEmail } = await importAsAgent(agentToken, () => import('../vercel-ai-sdk/send-email-tool.js')));
  });

  it('execute sends through the agent key, and the same call again replays the first send', async () => {
    const first = await sendEmail.execute(message, call);
    const email = await acceptedFor(message.to);
    expect(first).toEqual({ sent: true, id: email.id });
    expect(email.subject).toBe(TICKET_UPDATE.subject);
    // Same purpose, same recipient: the idempotency key replays the first
    // response, so a model retrying a timeout cannot mail the person twice.
    expect(await sendEmail.execute(message, call)).toEqual(first);
  });

  it('a refusal reaches the model as code and fix, not as an exception', async () => {
    // The budget of one is spent by the send above; a different message is refused.
    const result = await sendEmail.execute(
      { ...message, subject: 'Ticket 4182 — closed', purpose: 'ticket-4182-closed' },
      call,
    );
    expect(result).toEqual({
      sent: false,
      code: 'agent_budget_exceeded',
      fix: ERROR_CATALOG.agent_budget_exceeded.fix,
    });
    // The fix the model reads names who can raise the ceiling: a person, not the key.
    expect(ERROR_CATALOG.agent_budget_exceeded.fix).toMatch(/person/);
    const accepted = (await owner.emails.list({ limit: 100 })).data.filter((e) => e.to.includes(message.to));
    expect(accepted).toHaveLength(1);
  });
});

describe('A LangChain.js tool', () => {
  let sendEmail: typeof langchainSendEmail;
  const message = { to: 'langchain-agent@example.com', ...TICKET_UPDATE };

  beforeAll(async () => {
    const agentToken = await agentKeyWithBudget('langchain-agent', 1);
    ({ sendEmail } = await importAsAgent(agentToken, () => import('../langchain/send-email-tool.js')));
  });

  it('invoke sends through the agent key, and the same call again replays the first send', async () => {
    const first = await sendEmail.invoke(message);
    const email = await acceptedFor(message.to);
    expect(first).toEqual({ sent: true, id: email.id });
    expect(email.subject).toBe(TICKET_UPDATE.subject);
    expect(await sendEmail.invoke(message)).toEqual(first);
  });

  it('a refusal reaches the model as code and fix, not as an exception', async () => {
    const result = await sendEmail.invoke({
      ...message,
      subject: 'Ticket 4182 — closed',
      purpose: 'ticket-4182-closed',
    });
    expect(result).toEqual({
      sent: false,
      code: 'agent_budget_exceeded',
      fix: ERROR_CATALOG.agent_budget_exceeded.fix,
    });
    const accepted = (await owner.emails.list({ limit: 100 })).data.filter((e) => e.to.includes(message.to));
    expect(accepted).toHaveLength(1);
  });

  it('a call with no recipient is refused by the schema before the API is reached', async () => {
    const before = (await owner.emails.list({ limit: 100 })).data.length;
    const { to: _to, ...withoutRecipient } = message;
    await expect(sendEmail.invoke(withoutRecipient as never)).rejects.toBeInstanceOf(
      ToolInputParsingException,
    );
    expect((await owner.emails.list({ limit: 100 })).data.length).toBe(before);
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
