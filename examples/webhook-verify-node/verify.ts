/**
 * Verify one AgentiSend delivery with the same function that signs it.
 *
 * Read the raw body before any JSON parser runs. A parser that re-serialises
 * the body changes bytes, and the signature was computed over the bytes that
 * arrived.
 *
 * The examples suite signs a delivery with this package and runs this file
 * against that header and body.
 */
import { SIGNATURE_HEADER, verifyWebhookSignature } from 'agentisend/webhook-signing';

export function acceptDelivery(input: {
  secret: string;
  signature: string;
  rawBody: string;
  nowSeconds?: number;
}): boolean {
  return verifyWebhookSignature(input.secret, input.signature, input.rawBody, {
    nowSeconds: input.nowSeconds,
  });
}

const signature = process.env.WEBHOOK_SIGNATURE;
const rawBody = process.env.WEBHOOK_BODY;
const secret = process.env.WEBHOOK_SECRET;
const now = process.env.WEBHOOK_NOW_SECONDS;

if (signature && rawBody && secret) {
  const ok = acceptDelivery({
    secret,
    signature,
    rawBody,
    ...(now ? { nowSeconds: Number(now) } : {}),
  });
  process.stdout.write(ok ? 'ok\n' : 'rejected\n');
}

export const HEADER = SIGNATURE_HEADER;
