/**
 * Remix — the `action` of `app/routes/receipt.tsx`.
 *
 * Remix 2 hands the action a Web `Request`. This file uses that and returns
 * `Response.json`, which is what `json()` from `@remix-run/node` returns.
 * The package is not imported here: the executed function is the action body,
 * and a Remix route types the argument as `ActionFunctionArgs`.
 *
 * The key stays on the server. `AGENTISEND_API_KEY`, `MAIL_FROM`, and
 * optionally `AGENTISEND_BASE_URL`.
 */
import { AgentiSend, AgentiSendError } from 'agentisend';

const agentisend = new AgentiSend();

function mailFrom(): string {
  const from = process.env.MAIL_FROM;
  if (!from) throw new Error('Set MAIL_FROM to an address on a domain you have verified.');
  return from;
}

/** Enough to refuse an obvious typo here; the API checks the address properly. */
const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function action({ request }: { request: Request }): Promise<Response> {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  const note = String(form.get('note') ?? '');
  if (!ADDRESS.test(email)) {
    return Response.json({ error: 'email must be one address, like you@example.com' }, { status: 400 });
  }

  try {
    const { id } = await agentisend.emails.send(
      {
        from: mailFrom(),
        to: email,
        subject: 'Your receipt',
        text: `Receipt note: ${note}`,
      },
      // The same person, the same receipt: a second submit replays the first.
      { idempotencyKey: `receipt/${email}` },
    );
    return Response.json({ id });
  } catch (err) {
    if (err instanceof AgentiSendError) {
      return Response.json({ code: err.code, fix: err.fix }, { status: err.status });
    }
    throw err;
  }
}
