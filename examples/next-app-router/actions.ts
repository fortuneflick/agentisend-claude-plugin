/**
 * app/actions.ts — the same send as a Server Action, for a form that posts
 * straight to the server with no route handler in between.
 *
 * `'use server'` belongs at the top of the real file; it is a comment here so
 * that this directory typechecks without the Next.js compiler.
 */
// 'use server';
import { AgentiSend, AgentiSendError } from 'agentisend';

const agentisend = new AgentiSend();

function mailFrom(): string {
  const from = process.env.MAIL_FROM;
  if (!from) throw new Error('Set MAIL_FROM to an address on a domain you have verified.');
  return from;
}

export interface InviteResult {
  id?: string;
  error?: { code: string; fix: string };
}

export async function inviteTeammate(formData: FormData): Promise<InviteResult> {
  const email = String(formData.get('email') ?? '');
  if (!email) return { error: { code: 'validation_error', fix: 'Fill in the email field.' } };

  try {
    const { id } = await agentisend.emails.send(
      {
        from: mailFrom(),
        to: email,
        subject: 'You have been invited',
        text: 'Open the console to accept the invitation.',
      },
      { idempotencyKey: `invite/${email}` },
    );
    return { id };
  } catch (err) {
    if (err instanceof AgentiSendError) return { error: { code: err.code, fix: err.fix } };
    throw err;
  }
}
