/**
 * Supabase Edge Functions — an HTTP function, not the Send Email Hook.
 *
 * Save this file as `supabase/functions/send/index.ts` and serve it with
 * `Deno.serve(handle)`, which is how the secrets guide reads `Deno.env.get`.
 * The function posts JSON to POST /emails. It also runs on Node, which is
 * how the suite executes it: `process.env` is used when `Deno.env` is absent.
 *
 * AGENTISEND_API_KEY, MAIL_FROM, and optionally AGENTISEND_BASE_URL.
 */

function env(name: string): string | undefined {
  const fromProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[
    name
  ];
  const deno = (globalThis as { Deno?: { env: { get(key: string): string | undefined } } }).Deno;
  return fromProcess ?? deno?.env.get(name);
}

function mailFrom(): string {
  const from = env('MAIL_FROM');
  if (!from) throw new Error('Set MAIL_FROM to an address on a domain you have verified.');
  return from;
}

function baseUrl(): string {
  return (env('AGENTISEND_BASE_URL') ?? 'https://api.agentisend.com').replace(/\/+$/, '');
}

/** Enough to refuse an obvious typo here; the API checks the address properly. */
const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function handle(request: Request): Promise<Response> {
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

  const response = await fetch(`${baseUrl()}/emails`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env('AGENTISEND_API_KEY') ?? ''}`,
      'content-type': 'application/json',
      accept: 'application/json',
      // The recipient, not the moment: a retry of the same note replays.
      'idempotency-key': `invite/${email}`,
    },
    body: JSON.stringify({
      from: mailFrom(),
      to: email,
      subject: 'You are invited',
      text: `Invite note: ${note}`,
    }),
  });
  const parsed = (await response.json()) as { id?: string; error?: { code?: string; fix?: string } };
  if (!response.ok) {
    return Response.json(
      { code: parsed.error?.code, fix: parsed.error?.fix },
      { status: response.status },
    );
  }
  return Response.json({ id: parsed.id });
}
