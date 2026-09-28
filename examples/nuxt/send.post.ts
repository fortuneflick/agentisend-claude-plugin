/**
 * Nuxt — `server/api/send.post.ts`, a Nitro server route that confirms a
 * booking.
 *
 * Everything under `server/` runs on the server only, so the API key never
 * reaches the browser. Nuxt auto-imports `defineEventHandler`, `readBody` and
 * `setResponseStatus`; they are imported from `h3` here so the file also runs
 * outside Nuxt, which is how it is tested.
 */
import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { AgentiSend, AgentiSendError } from 'agentisend';

const agentisend = new AgentiSend();

function mailFrom(): string {
  const from = process.env.MAIL_FROM;
  if (!from) throw new Error('Set MAIL_FROM to an address on a domain you have verified.');
  return from;
}

/** Enough to refuse an obvious typo here; the API checks the address properly. */
const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default defineEventHandler(async (event) => {
  const { email, bookingId } = (await readBody<{ email?: string; bookingId?: string }>(event)) ?? {};
  if (!email || !ADDRESS.test(email) || !bookingId) {
    setResponseStatus(event, 400);
    return { error: 'email and bookingId are required' };
  }

  try {
    const { id } = await agentisend.emails.send(
      {
        from: mailFrom(),
        to: email,
        subject: 'Your booking is confirmed',
        text: `Booking ${bookingId} is confirmed. The details are in your account.`,
      },
      // One booking, one confirmation, however many times the request is retried.
      { idempotencyKey: `booking-confirmed/${bookingId}` },
    );
    return { id };
  } catch (err) {
    if (err instanceof AgentiSendError) {
      setResponseStatus(event, err.status);
      return { code: err.code, fix: err.fix };
    }
    throw err;
  }
});
