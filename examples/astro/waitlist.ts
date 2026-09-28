/**
 * Astro — `src/pages/api/waitlist.ts`, an API route that confirms a waitlist
 * sign-up.
 *
 * The route runs on the server, so the API key never reaches the browser.
 * `prerender = false` keeps it on demand when the rest of the site is static.
 *
 * In your own project the handler is typed with Astro's own export:
 * `import type { APIRoute } from 'astro'` and `export const POST: APIRoute = …`.
 * It is written against the one field of the context it reads here, so this
 * directory typechecks without Astro installed.
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

export const prerender = false;

export const POST = async ({ request }: { request: Request }): Promise<Response> => {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  if (!ADDRESS.test(email)) {
    return Response.json({ error: 'Enter an email address.' }, { status: 400 });
  }

  try {
    const { id } = await agentisend.emails.send(
      {
        from: mailFrom(),
        to: email,
        subject: 'You are on the waitlist',
        text: 'Thanks for signing up. We will write once, when your invite is ready.',
      },
      // A second submit of the same form replays the first send.
      { idempotencyKey: `waitlist/${email}` },
    );
    return Response.json({ id });
  } catch (err) {
    if (err instanceof AgentiSendError) {
      return Response.json({ code: err.code, fix: err.fix }, { status: err.status });
    }
    throw err;
  }
};
