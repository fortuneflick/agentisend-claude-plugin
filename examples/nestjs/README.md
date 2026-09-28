# NestJS

A controller and a service: `POST /orders/confirmation` refuses a malformed address before the API
is called, sends one order confirmation per order however many times the request is retried, and
answers a refusal with the same status and its `code` and `fix`.

## Environment

| Variable | Required | What it is |
|---|---|---|
| `AGENTISEND_API_KEY` | yes | A key with `sending_access`. |
| `MAIL_FROM` | yes | The From address, on a domain you have verified. |
| `AGENTISEND_BASE_URL` | no | Defaults to `https://api.agentisend.com`. |

## Wire it up

Add `EmailService` and `EmailController` to a module of your own, or import `AppModule`. Nest's
decorators need `experimentalDecorators` in `tsconfig.json`, as every Nest project already has.

```ts main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const app = await NestFactory.create(AppModule);
await app.listen(3000);
```

```bash
pnpm add @nestjs/common @nestjs/core @nestjs/platform-express reflect-metadata rxjs agentisend
curl -X POST localhost:3000/orders/confirmation -H 'content-type: application/json' \
  -d '{"email":"you@example.com","orderId":"A-1042"}'
```
