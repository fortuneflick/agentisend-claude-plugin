/**
 * NestJS — `POST /orders/confirmation`, which validates the body, calls the
 * service, and turns a refusal into the same status with `code` and `fix`.
 */
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpException,
  Inject,
  Post,
} from '@nestjs/common';
import { AgentiSendError } from 'agentisend';
import { EmailService } from './email.service.js';

/** Enough to refuse an obvious typo here; the API checks the address properly. */
const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Controller('orders')
export class EmailController {
  // `@Inject` names the provider explicitly, so injection also works under
  // compilers that do not emit decorator metadata (esbuild, Vite, Bun).
  constructor(@Inject(EmailService) private readonly email: EmailService) {}

  @Post('confirmation')
  @HttpCode(200)
  async confirm(@Body() body: { email?: string; orderId?: string }): Promise<{ id: string }> {
    const { email, orderId } = body ?? {};
    if (!email || !ADDRESS.test(email) || !orderId) {
      throw new BadRequestException('email and orderId are required');
    }

    try {
      return { id: await this.email.sendOrderConfirmation(email, orderId) };
    } catch (err) {
      if (err instanceof AgentiSendError) {
        throw new HttpException({ code: err.code, fix: err.fix }, err.status);
      }
      throw err;
    }
  }
}
