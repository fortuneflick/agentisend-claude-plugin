/**
 * Run every example against the fake API. TRANSPORT=fake is set by the
 * workflow; this process is what that name means here.
 *
 * Node examples are transpiled with typescript (decorators included) and
 * invoked. Python, Go, PHP, Ruby, Java, Rust, .NET and Elixir examples are
 * the same commands the monorepo suite runs. A missing compiler fails the
 * run, so CI installs them rather than skipping an example.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { createHmac } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createFakeApi } from './fake-api.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const CLI = [
  { folder: 'go', command: 'go', args: ['run', '.'] },
  { folder: 'go-send', command: 'go', args: ['run', 'send.go'] },
  { folder: 'encore-go', command: 'go', args: ['run', '.'] },
  { folder: 'webhook-verify-go', command: 'go', args: ['run', 'verify.go'], webhook: true },
  { folder: 'php', command: 'php', args: ['send.php'] },
  { folder: 'php-send', command: 'php', args: ['send.php'] },
  { folder: 'laravel', command: 'php', args: ['send.php'] },
  { folder: 'symfony', command: 'php', args: ['send.php'] },
  { folder: 'rails', command: 'ruby', args: ['send.rb'] },
  { folder: 'ruby', command: 'ruby', args: ['send.rb'] },
  { folder: 'sinatra', command: 'ruby', args: ['send.rb'] },
  { folder: 'elixir', command: 'elixir', args: ['send.exs'] },
  { folder: 'phoenix', command: 'elixir', args: ['send.exs'] },
  { folder: 'rust', command: 'cargo', args: ['run', '--quiet'] },
  { folder: 'axum', command: 'cargo', args: ['run', '--quiet'] },
  { folder: 'java', command: 'java', args: ['Send'], prepare: ['javac', 'Send.java'] },
  { folder: 'dotnet', command: 'dotnet', args: ['run', '--verbosity', 'quiet'] },
  { folder: 'python-send', command: 'python3', args: ['send.py'] },
  { folder: 'python-agent-with-budget', command: 'python3', args: ['agent.py'] },
  { folder: 'fastapi', command: 'python3', args: ['run.py'] },
  { folder: 'flask', command: 'python3', args: ['run.py'] },
  { folder: 'django', command: 'python3', args: ['run.py'] },
  { folder: 'langchain-python', command: 'python3', args: ['tool.py'] },
  { folder: 'openai-agents-sdk', command: 'python3', args: ['tool.py'] },
  { folder: 'crewai', command: 'python3', args: ['tool.py'] },
  { folder: 'webhook-verify-python', command: 'python3', args: ['verify.py'], webhook: true },
];

function folders() {
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !['test', 'node_modules', 'ci'].includes(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function signWebhook(secret, body, nowSeconds) {
  const mac = createHmac('sha256', secret).update(`${nowSeconds}.${body}`).digest('hex');
  return `t=${nowSeconds},v1=${mac}`;
}

function webhookEnv() {
  const secret = 'whsec_examples';
  const body = '{"type":"email.delivered"}';
  const now = Math.floor(Date.now() / 1000);
  return {
    WEBHOOK_SECRET: secret,
    WEBHOOK_BODY: body,
    WEBHOOK_SIGNATURE: signWebhook(secret, body, now),
    WEBHOOK_NOW_SECONDS: String(now),
  };
}

function runCommand(command, args, cwd, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...extraEnv, GOPROXY: process.env.GOPROXY ?? 'https://proxy.golang.org,direct' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
    child.on('error', (err) => resolve({ status: 127, stdout, stderr: err.message }));
  });
}

function transpileDir(dir) {
  // Next to the example, so Node resolves agentisend from examples/node_modules.
  const out = mkdtempSync(join(dir, '.ci-'));
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.ts') || name.endsWith('.d.ts')) continue;
    const source = readFileSync(join(dir, name), 'utf8');
    const js = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        experimentalDecorators: true,
        emitDecoratorMetadata: false,
      },
    }).outputText;
    writeFileSync(join(out, name.replace(/\.ts$/, '.js')), js);
  }
  return out;
}

function supabaseHookRequest(email) {
  const secret = `whsec_${Buffer.from('supabase-send-email-hook-secret').toString('base64')}`;
  process.env.SEND_EMAIL_HOOK_SECRET = secret;
  const payload = JSON.stringify({
    user: { id: '1', email },
    email_data: {
      token: 't',
      token_hash: 'h',
      redirect_to: 'https://example.test/done',
      email_action_type: 'signup',
      site_url: 'https://example.test',
    },
  });
  const id = 'msg_examples';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from(secret.replace(/^v1,whsec_|^whsec_/, ''), 'base64');
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${payload}`).digest('base64');
  return new Request('https://example.test/hook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': `v1,${signature}`,
    },
    body: payload,
  });
}

function jsonRequest(url, body) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function formRequest(url, fields) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new Request(url, { method: 'POST', body: form });
}

async function listenAndPost(server, path, body) {
  const httpServer = server.listen(0, '127.0.0.1');
  await new Promise((resolve) => httpServer.once('listening', resolve));
  const address = httpServer.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    await response.text();
  } finally {
    await new Promise((resolve) => httpServer.close(() => resolve()));
  }
}

async function invokeModule(folder, mod) {
  const email = `${folder}@example.com`;
  const body = { email, name: 'Ada', note: 'first', subject: 'Hello', orderId: '1001', bookingId: 'BK-1' };
  if (typeof mod.run === 'function') {
    await mod.run();
    return;
  }
  if (typeof mod.POST === 'function') {
    const request =
      folder === 'astro'
        ? { request: formRequest('https://example.test/waitlist', { email, name: 'Ada' }) }
        : folder === 'supabase-auth-hook'
          ? supabaseHookRequest(email)
          : jsonRequest('https://example.test/api/send', body);
    const response = await mod.POST(request);
    if (response?.text) await response.text();
    return;
  }
  if (typeof mod.onExecuteCustomEmailProvider === 'function') {
    await mod.onExecuteCustomEmailProvider(
      {
        notification: {
          from: process.env.MAIL_FROM,
          to: email,
          subject: 'Confirm',
          text: 'Confirm your email',
          message_type: 'verify',
        },
      },
      { notification: { drop() {}, retry() {} } },
    );
    return;
  }
  if (typeof mod.sendVerificationEmail === 'function') {
    await mod.sendVerificationEmail({
      user: { id: '1', email, name: 'Ada' },
      url: 'https://example.test/verify',
      token: 'tok',
    });
    return;
  }
  if (typeof mod.sendVerificationRequest === 'function') {
    await mod.sendVerificationRequest({
      identifier: email,
      url: 'https://example.test/magic',
      provider: {},
    });
    return;
  }
  if (typeof mod.sendHello === 'function') {
    await mod.sendHello(email);
    return;
  }
  if (typeof mod.sendReceipt === 'function') {
    await mod.sendReceipt({ input: { email, note: 'first' } });
    return;
  }
  if (typeof mod.sendOrderConfirmation === 'function') {
    await mod.sendOrderConfirmation(email, '1001');
    return;
  }
  if (typeof mod.send === 'function' && folder !== 'nuxt') {
    await mod.send({ email, note: 'first' });
    return;
  }
  if (typeof mod.handler === 'function') {
    const arity = mod.handler.length;
    if (arity <= 1 && folder === 'aws-lambda') {
      await mod.handler({ body: JSON.stringify({ email, note: 'first' }) });
      return;
    }
    if (folder === 'tanstack-start') {
      await mod.handler({ data: { email, note: 'first' } });
      return;
    }
    const response = await mod.handler(jsonRequest('https://example.test/send', body));
    if (response instanceof Response) await response.text();
    else if (response && typeof response === 'object' && 'statusCode' in response) return;
    return;
  }
  if (mod.actions?.default) {
    await mod.actions.default({ request: formRequest('https://example.test/contact', { email, message: 'Hello' }) });
    return;
  }
  if (typeof mod.action === 'function') {
    await mod.action({ request: formRequest('https://example.test/report', { email }) });
    return;
  }
  if (typeof mod.inviteTeammate === 'function') {
    const form = new FormData();
    form.set('email', email);
    await mod.inviteTeammate(form);
    return;
  }
  if (folder === 'nuxt' && typeof mod.default === 'function') {
    const { createApp, toWebHandler } = await import('h3');
    const web = toWebHandler(createApp().use('/api/send', mod.default));
    const response = await web(jsonRequest('http://localhost/api/send', { email, bookingId: 'BK-1' }));
    await response.text();
    return;
  }
  if (mod.default && typeof mod.default.fetch === 'function') {
    const response = await mod.default.fetch(jsonRequest('https://example.test/', body), process.env);
    if (response?.text) await response.text();
    return;
  }
  if (mod.app?.inject) {
    await mod.app.ready?.();
    await mod.app.inject({ method: 'POST', url: '/send', payload: { email, invoiceId: '1001' } });
    await mod.app.close?.();
    return;
  }
  if (typeof mod.app?.listen === 'function') {
    await listenAndPost(mod.app, '/send', body);
    return;
  }
  if (typeof mod.app?.request === 'function') {
    const response = await mod.app.request(jsonRequest('http://localhost/send', body));
    if (response?.text) await response.text();
    return;
  }
  if (mod.server?.listen) {
    await listenAndPost(mod.server, '/send', body);
    return;
  }
  if (typeof mod.acceptDelivery === 'function') {
    const secret = 'whsec_examples';
    const rawBody = '{"type":"email.delivered"}';
    const now = Math.floor(Date.now() / 1000);
    const ok = mod.acceptDelivery({
      secret,
      signature: signWebhook(secret, rawBody, now),
      rawBody,
      nowSeconds: now,
    });
    if (!ok) throw new Error('webhook signature was rejected');
    return;
  }
  if (mod.EmailService) {
    const service = new mod.EmailService();
    await service.sendOrderConfirmation(email, '1001');
    return;
  }
  if (typeof mod.handle === 'function') {
    const response = await mod.handle(jsonRequest('https://example.test/send', body));
    if (response instanceof Response) await response.text();
    return;
  }
  if (mod.sendEmail?.execute) {
    await mod.sendEmail.execute({ to: email, subject: 'Hello', text: 'Hello', purpose: 'ticket-4182-update' }, {});
    return;
  }
  if (typeof mod.sendEmail?.invoke === 'function') {
    await mod.sendEmail.invoke({ to: email, subject: 'Hello', text: 'Hello', purpose: 'ticket-4182-update' });
    return;
  }
  throw new Error(`no entrypoint in ${folder}`);
}

const ENTRY_ORDER = [
  'loop.ts',
  'agent.ts',
  'route.ts',
  'actions.ts',
  'server.ts',
  'handler.ts',
  'send.ts',
  'app.ts',
  'email.ts',
  'action.ts',
  'verify.ts',
  'waitlist.ts',
  'report.ts',
  'receipt.ts',
  'page.server.ts',
  'send.post.ts',
  'email.service.ts',
  'send-email-tool.ts',
  'worker.ts',
];

async function runNodeFolder(folder) {
  const dir = join(ROOT, folder);
  const files = readdirSync(dir).filter((name) => name.endsWith('.ts'));
  files.sort((a, b) => {
    const ai = ENTRY_ORDER.indexOf(a);
    const bi = ENTRY_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  const entry = files[0];
  if (!entry) throw new Error(`${folder} has no TypeScript entry`);
  const out = transpileDir(dir);
  try {
    const mod = await import(pathToFileURL(join(out, entry.replace(/\.ts$/, '.js'))).href);
    await invokeModule(folder, mod);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

async function runFolder(folder) {
  const cli = CLI.find((item) => item.folder === folder);
  if (cli) {
    const cwd = join(ROOT, folder);
    const extra = cli.webhook ? webhookEnv() : {};
    if (cli.prepare) {
      const prepared = await runCommand(cli.prepare[0], cli.prepare.slice(1), cwd, extra);
      if (prepared.status !== 0) {
        throw new Error(`${folder} prepare failed\n${prepared.stderr || prepared.stdout}`);
      }
    }
    const result = await runCommand(cli.command, cli.args, cwd, extra);
    if (result.status !== 0) {
      throw new Error(`${folder} ${cli.command} exited ${result.status}\n${result.stderr || result.stdout}`);
    }
    if (cli.webhook && !result.stdout.includes('ok')) {
      throw new Error(`${folder} did not verify\n${result.stdout}${result.stderr}`);
    }
    return;
  }
  await runNodeFolder(folder);
}

const listed = folders();
if (process.argv.includes('--list')) {
  for (const folder of listed) console.log(folder);
  process.exit(0);
}

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1]?.split(',') : null;
const fake = createFakeApi();
const baseUrl = await fake.listen();
process.env.AGENTISEND_BASE_URL = baseUrl;
process.env.AGENTISEND_API_KEY ??= 'as_fake_examples';
process.env.MAIL_FROM ??= 'notifications@example.com';
process.env.TRANSPORT = 'fake';

const targets = only ?? listed;
const failures = [];
for (const folder of targets) {
  if (!listed.includes(folder)) {
    failures.push(`${folder}: not an example folder`);
    continue;
  }
  try {
    await runFolder(folder);
    console.log(`ok ${folder}`);
  } catch (err) {
    failures.push(`${folder}: ${err instanceof Error ? err.message : String(err)}`);
    console.error(`fail ${folder}`);
  }
}
await fake.close();
if (failures.length > 0) {
  console.error(failures.join('\n\n'));
  process.exit(1);
}
console.log(`${targets.length} examples ran against ${baseUrl} (accepted ${fake.accepted()})`);
