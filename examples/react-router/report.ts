/**
 * React Router (framework mode, formerly Remix) — the `action` of
 * `app/routes/report.tsx`, which emails a download link to the person who
 * asked for it.
 *
 * An action runs on the server, so the API key never reaches the browser, and
 * a `<Form method="post">` posts to it with or without JavaScript. The route's
 * component reads what the action returns with `useActionData()`.
 */
import { data, type ActionFunctionArgs } from 'react-router';
import { AgentiSend, AgentiSendError } from 'agentisend';

const agentisend = new AgentiSend();

function mailFrom(): string {
  const from = process.env.MAIL_FROM;
  if (!from) throw new Error('Set MAIL_FROM to an address on a domain you have verified.');
  return from;
}

/** Enough to refuse an obvious typo here; the API checks the address properly. */
const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  if (!ADDRESS.test(email)) {
    return data({ error: 'Enter an email address.' }, { status: 400 });
  }

  try {
    const { id } = await agentisend.emails.send(
      {
        from: mailFrom(),
        to: email,
        subject: 'Your copy of the report',
        text: 'Download it here: https://app.example.com/reports/2026-state-of-email.pdf',
      },
      // The same person asking twice gets one email.
      { idempotencyKey: `report-download/${email}` },
    );
    return data({ id });
  } catch (err) {
    if (err instanceof AgentiSendError) {
      return data({ code: err.code, fix: err.fix }, { status: err.status });
    }
    throw err;
  }
}
