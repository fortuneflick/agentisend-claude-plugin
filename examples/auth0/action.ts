/**
 * Auth0 — the custom email provider Action.
 *
 * Auth0 calls `onExecuteCustomEmailProvider` on the `custom-email-provider`
 * trigger. `event.notification` carries from, to, subject, html, text and
 * message_type. `event.secrets` holds the values you add in the Action
 * editor. `api.notification.retry` asks Auth0 to try again;
 * `api.notification.drop` asks it to stop. This file posts JSON to
 * POST /emails with fetch, which is the call Auth0's own sample makes.
 *
 * A server error asks for a retry, matching Auth0's sample. Any other
 * refusal asks Auth0 to drop the notification. The suite passes secrets on
 * the event and falls back to the process environment.
 */

export interface Auth0Notification {
  from?: string;
  to?: string;
  subject?: string;
  html?: string;
  text?: string;
  message_type?: string;
}

export interface Auth0EmailEvent {
  notification?: Auth0Notification;
  secrets?: Record<string, string | undefined>;
}

export interface Auth0EmailApi {
  notification: {
    drop: (reason: string) => void;
    retry: (reason: string) => void;
  };
}

/** Enough to refuse an obvious typo here; the API checks the address properly. */
const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function secret(event: Auth0EmailEvent, name: string): string {
  const fromEvent = event.secrets?.[name];
  if (fromEvent) return fromEvent;
  const fromProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[
    name
  ];
  return fromProcess ?? '';
}

function baseUrl(event: Auth0EmailEvent): string {
  return (secret(event, 'AGENTISEND_BASE_URL') || 'https://api.agentisend.com').replace(/\/+$/, '');
}

export async function onExecuteCustomEmailProvider(event: Auth0EmailEvent, api: Auth0EmailApi): Promise<void> {
  const note = event.notification ?? {};
  const to = String(note.to ?? '').trim();
  const from = String(note.from ?? '').trim();
  const subject = String(note.subject ?? '');
  const html = typeof note.html === 'string' && note.html.length > 0 ? note.html : undefined;
  const text = typeof note.text === 'string' && note.text.length > 0 ? note.text : undefined;
  if (!ADDRESS.test(to) || !ADDRESS.test(from) || (!html && !text)) {
    api.notification.drop('email must be one address, like you@example.com');
    return;
  }

  const messageType = note.message_type && note.message_type.length > 0 ? note.message_type : 'notification';
  const payload: Record<string, string> = { from, to, subject };
  if (html) payload.html = html;
  if (text) payload.text = text;

  try {
    const response = await fetch(`${baseUrl(event)}/emails`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret(event, 'AGENTISEND_API_KEY')}`,
        'content-type': 'application/json',
        accept: 'application/json',
        // The message type and the recipient: a retry of the same notification replays.
        'idempotency-key': `auth0/${messageType}/${to}`,
      },
      body: JSON.stringify(payload),
    });
    if (response.ok) return;

    const parsed = (await response.json()) as { error?: { code?: string; fix?: string } };
    const reason = `${parsed.error?.code ?? 'refused'}: ${parsed.error?.fix ?? ''}`.slice(0, 1024);
    // Auth0's sample retries a server error and stops on anything else.
    if (response.status >= 500) api.notification.retry(reason);
    else api.notification.drop(reason);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'send failed';
    api.notification.drop(message.slice(0, 1024));
  }
}
