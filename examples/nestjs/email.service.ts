/**
 * NestJS — the provider that holds the AgentiSend client and sends the
 * order confirmation.
 */
import { Injectable } from '@nestjs/common';
import { AgentiSend } from 'agentisend';

@Injectable()
export class EmailService {
  /** One client for the process; it reads AGENTISEND_API_KEY and AGENTISEND_BASE_URL. */
  private readonly agentisend = new AgentiSend();

  private mailFrom(): string {
    const from = process.env.MAIL_FROM;
    if (!from) throw new Error('Set MAIL_FROM to an address on a domain you have verified.');
    return from;
  }

  async sendOrderConfirmation(email: string, orderId: string): Promise<string> {
    const { id } = await this.agentisend.emails.send(
      {
        from: this.mailFrom(),
        to: email,
        subject: `Order ${orderId} confirmed`,
        text: `Thanks for your order. Order ${orderId} is confirmed and the receipt is in your account.`,
      },
      // One order, one confirmation: a retried request replays the first send.
      { idempotencyKey: `order-confirmed/${orderId}` },
    );
    return id;
  }
}
