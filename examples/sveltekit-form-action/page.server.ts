/**
 * SvelteKit — `src/routes/contact/+page.server.ts`.
 *
 * A form action runs on the server, so the API key stays there and the form
 * works with JavaScript switched off. The action returns a plain object, which
 * SvelteKit hands back to the page as `form`.
 *
 * In your own project the signature comes from the generated types:
 * `import type { Actions } from './$types'` and `export const actions = {…} satisfies Actions`.
 * It is written structurally here so this directory typechecks on its own.
 */
import { AgentiSend, AgentiSendError } from '@agentisend/sdk-node';

const agentisend = new AgentiSend();

function mailFrom(): string {
  const from = process.env.MAIL_FROM;
  if (!from) throw new Error('Set MAIL_FROM to an address on a domain you have verified.');
  return from;
}

export interface ActionResult {
  status: number;
  data: { id?: string; code?: string; fix?: string; error?: string };
}

export const actions = {
  default: async ({ request }: { request: Request }): Promise<ActionResult> => {
    const form = await request.formData();
    const email = String(form.get('email') ?? '');
    const message = String(form.get('message') ?? '');
    if (!email || !message) {
      return { status: 400, data: { error: 'Fill in both fields.' } };
    }

    try {
      const { id } = await agentisend.emails.send({
        from: mailFrom(),
        to: mailFrom(),
        reply_to: email,
        subject: `Contact form from ${email}`,
        text: message,
      });
      return { status: 200, data: { id } };
    } catch (err) {
      if (err instanceof AgentiSendError) {
        return { status: err.status, data: { code: err.code, fix: err.fix } };
      }
      throw err;
    }
  },
};
