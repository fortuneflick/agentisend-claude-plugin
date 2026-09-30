/**
 * The three verifiers on the webhooks guide accept a delivery signed the way
 * the API signs one, and reject a changed body and a stale timestamp.
 */
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  SIGNATURE_TOLERANCE_SECONDS,
  generateWebhookHeaders,
  signWebhookPayload,
} from 'agentisend/webhook-signing';
import { acceptDelivery } from '../webhook-verify-node/verify.js';

const SECRET = 'whsec_docs_example';
const BODY = JSON.stringify({
  id: '5f0c8f0e-3d1a-4d3f-9a1e-2b7c1a0f5e42',
  type: 'email.delivered',
  occurred_at: '2026-09-29T12:00:00.000Z',
  account_id: '8b1e8f0e-3d1a-4d3f-9a1e-2b7c1a0f5e42',
  data: { email_id: '3d2a8f0e-3d1a-4d3f-9a1e-2b7c1a0f5e42' },
});

function signed(body: string, timestamp: number, replay = false) {
  const signature = signWebhookPayload(SECRET, timestamp, body);
  const headers = generateWebhookHeaders('evt_docs', 'email.delivered', timestamp, signature, replay);
  return { signature, headers };
}

function run(command: string, args: string[], env: Record<string, string>): string {
  const proc = spawnSync(command, args, {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  expect(proc.error, proc.error?.message).toBeUndefined();
  expect(proc.status, proc.stderr).toBe(0);
  return proc.stdout.trim();
}

describe('webhook verification examples verify a real delivery', () => {
  const now = 1_758_000_000;
  const fresh = signed(BODY, now);

  it('the signature header is t=…,v1=… over timestamp.body, with the five delivery headers', () => {
    expect(fresh.signature).toMatch(new RegExp(`^t=${now},v1=[0-9a-f]+$`));
    expect(fresh.headers['x-agentisend-signature']).toBe(fresh.signature);
    expect(fresh.headers['x-agentisend-event-id']).toBe('evt_docs');
    expect(fresh.headers['x-agentisend-event-type']).toBe('email.delivered');
    expect(fresh.headers['x-agentisend-timestamp']).toBe(String(now));
    expect(fresh.headers['x-agentisend-replay']).toBeUndefined();
    expect(signed(BODY, now, true).headers['x-agentisend-replay']).toBe('true');
    expect(SIGNATURE_TOLERANCE_SECONDS).toBe(5 * 60);
  });

  it('Node, Python and Go accept the delivery and reject a changed body and a stale timestamp', () => {
    const envFor = (body: string, timestamp: number) => ({
      WEBHOOK_SECRET: SECRET,
      WEBHOOK_SIGNATURE: signWebhookPayload(SECRET, timestamp, body),
      WEBHOOK_BODY: body,
      WEBHOOK_NOW_SECONDS: String(now),
    });

    expect(
      acceptDelivery({
        secret: SECRET,
        signature: fresh.signature,
        rawBody: BODY,
        nowSeconds: now,
      }),
    ).toBe(true);
    expect(
      acceptDelivery({
        secret: SECRET,
        signature: fresh.signature,
        rawBody: BODY + ' ',
        nowSeconds: now,
      }),
    ).toBe(false);
    expect(
      acceptDelivery({
        secret: SECRET,
        signature: signWebhookPayload(SECRET, now - SIGNATURE_TOLERANCE_SECONDS - 1, BODY),
        rawBody: BODY,
        nowSeconds: now,
      }),
    ).toBe(false);

    const python = new URL('../webhook-verify-python/verify.py', import.meta.url).pathname;
    const goFile = new URL('../webhook-verify-go/verify.go', import.meta.url).pathname;
    for (const [command, args] of [
      ['python3', [python]],
      ['go', ['run', goFile]],
    ] as const) {
      const freshEnv = envFor(BODY, now);
      expect(run(command, [...args], freshEnv), command).toBe('ok');
      expect(run(command, [...args], { ...freshEnv, WEBHOOK_BODY: `${BODY} ` }), command).toBe('rejected');
      expect(
        run(command, [...args], envFor(BODY, now - SIGNATURE_TOLERANCE_SECONDS - 1)),
        command,
      ).toBe('rejected');
    }
  });
});
