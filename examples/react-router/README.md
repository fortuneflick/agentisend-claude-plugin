# React Router

The `action` of a React Router route (framework mode, the successor to Remix) that emails a
download link to the person who asked for it and returns the message id. It refuses a malformed
address before the API is called, and a `<Form method="post">` posts to it with or without
JavaScript.

## Environment

| Variable | Required | What it is |
|---|---|---|
| `AGENTISEND_API_KEY` | yes | A key with `sending_access`. |
| `MAIL_FROM` | yes | The From address, on a domain you have verified. |
| `AGENTISEND_BASE_URL` | no | Defaults to `https://api.agentisend.com`. |

## Wire it up

Put the `action` in `app/routes/report.tsx` beside the route's component. In a project with
generated route types, `Route.ActionArgs` from `./+types/report` works the same as
`ActionFunctionArgs`. On Remix v2, import `ActionFunctionArgs` and `json` from `@remix-run/node`
and return `json(…)` where this returns `data(…)`.

```tsx
import { Form, useActionData } from 'react-router';

export default function Report() {
  const result = useActionData<typeof action>();
  return (
    <Form method="post">
      <input type="email" name="email" required />
      <button type="submit">Email me the report</button>
      {result && 'id' in result ? <p>Sent. Check your inbox.</p> : null}
    </Form>
  );
}
```

```bash
pnpm add agentisend
```
