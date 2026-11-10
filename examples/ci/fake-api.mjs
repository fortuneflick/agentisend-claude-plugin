/**
 * The API the public examples repo runs against.
 *
 * TRANSPORT=fake in this repo means the in-memory transport: nothing is
 * delivered. This server is that, reduced to the calls the examples make.
 * A repeated Idempotency-Key replays. The same key with a different body is
 * idempotency_payload_mismatch. The fourth identical send on one key is
 * approval_required, which is the loop the budgeted-agent examples wait for.
 */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const MISMATCH = {
  code: 'idempotency_payload_mismatch',
  message: 'Same Idempotency-Key was used with a different payload.',
  fix: 'Reuse the exact same body for retries, or send a new Idempotency-Key for a new request.',
  docs_url: 'https://agentisend.com/what-does-idempotency-payload-mismatch-mean',
};

const APPROVAL = {
  code: 'approval_required',
  message: 'This send is held for a person to approve.',
  fix: 'Open Agents → Approvals and decide the held send.',
  docs_url: 'https://agentisend.com/docs/guides/approvals',
};

function error(status, payload) {
  return { status, body: { error: payload } };
}

export function createFakeApi() {
  /** @type {Map<string, { hash: string, status: number, body: unknown }>} */
  const idempotency = new Map();
  /** @type {Map<string, number>} */
  const identical = new Map();
  /** @type {Map<string, { id: string, to: string[] }>} */
  const emails = new Map();
  let accepted = 0;

  function send(token, idempotencyKey, payload) {
    const hash = JSON.stringify(payload);
    if (idempotencyKey) {
      const prior = idempotency.get(`${token}\0${idempotencyKey}`);
      if (prior) {
        if (prior.hash !== hash) return error(409, MISMATCH);
        return { status: prior.status, body: prior.body };
      }
    }
    const signature = `${token}\0${hash}`;
    const count = (identical.get(signature) ?? 0) + 1;
    identical.set(signature, count);
    if (count >= 4) return error(403, APPROVAL);
    const id = randomUUID();
    const to = payload.to;
    const recipients = Array.isArray(to) ? to.map(String) : [String(to ?? '')];
    emails.set(id, { id, to: recipients });
    accepted += 1;
    const response = { status: 201, body: { id } };
    if (idempotencyKey) idempotency.set(`${token}\0${idempotencyKey}`, { hash, ...response });
    return response;
  }

  function handle(method, path, token, idempotencyKey, payload) {
    if (!token) {
      return error(401, {
        code: 'missing_api_key',
        message: 'This call needs an API key.',
        fix: 'Send Authorization: Bearer with a key from POST /api-keys.',
        docs_url: 'https://agentisend.com/docs/errors#missing_api_key',
      });
    }
    if (method === 'POST' && path === '/emails') return send(token, idempotencyKey, payload);
    if (method === 'POST' && path === '/api-keys') {
      return { status: 201, body: { id: randomUUID(), token: `as_agent_${randomUUID()}` } };
    }
    const limit = /^\/limits\/keys\/([^/]+)$/.exec(path);
    if (method === 'PATCH' && limit) {
      return {
        status: 200,
        body: {
          api_key_id: limit[1],
          budget_per_period: payload.budget_per_period ?? null,
          period: payload.period ?? '30d',
          consumed_in_period: 0,
          period_started_at: new Date(0).toISOString(),
          rate_ceiling_per_minute: payload.rate_ceiling_per_minute ?? null,
          consumed_in_window: 0,
          rate_window_started_at: new Date(0).toISOString(),
          paused: false,
          paused_at: null,
          paused_reason: null,
          updated_at: new Date(0).toISOString(),
        },
      };
    }
    const one = /^\/emails\/([^/]+)$/.exec(path);
    if (method === 'GET' && one) {
      const email = emails.get(one[1]);
      if (!email) {
        return error(404, {
          code: 'not_found',
          message: 'No email with that id.',
          fix: 'Use the id POST /emails returned.',
          docs_url: 'https://agentisend.com/docs/errors#not_found',
        });
      }
      return { status: 200, body: { id: email.id, to: email.to, status: 'queued' } };
    }
    return error(404, {
      code: 'not_found',
      message: `No ${method} ${path} on the fake.`,
      fix: 'This fake implements POST /emails, POST /api-keys, PATCH /limits/keys/{id} and GET /emails/{id}.',
      docs_url: 'https://agentisend.com/docs',
    });
  }

  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      let payload = {};
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw) {
        try {
          payload = JSON.parse(raw);
        } catch {
          payload = {};
        }
      }
      const header = req.headers.authorization ?? '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : '';
      const key = req.headers['idempotency-key'];
      const idempotencyKey = Array.isArray(key) ? key[0] : key;
      const result = handle(req.method ?? 'GET', url.pathname, token, idempotencyKey, payload);
      res.writeHead(result.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result.body));
    });
  });

  return {
    server,
    accepted: () => accepted,
    listen() {
      return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const address = server.address();
          if (!address || typeof address === 'string') throw new Error('fake api did not bind');
          resolve(`http://127.0.0.1:${address.port}`);
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
