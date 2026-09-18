# SvelteKit form action

A contact form whose action runs on the server: the API key never reaches the browser and the form
still works with JavaScript switched off. The visitor's address goes in `reply_to` rather than
`from`, so the mail is sent by your verified domain and replying still reaches them.

## Environment

| Variable | Required | What it is |
|---|---|---|
| `AGENTISEND_API_KEY` | yes | A key with `sending_access`. |
| `MAIL_FROM` | yes | Your verified address. It is both the sender and the inbox that receives the form. |
| `AGENTISEND_BASE_URL` | no | Defaults to `https://api.agentisend.com`. |

## Wire it up

Copy `page.server.ts` to `src/routes/contact/+page.server.ts` and swap the structural signature for
the generated one:

```ts
import type { Actions } from './$types';
export const actions = { default: async ({ request }) => { /* … */ } } satisfies Actions;
```

`src/routes/contact/+page.svelte` needs only a `<form method="POST">` with `email` and `message`
fields.
