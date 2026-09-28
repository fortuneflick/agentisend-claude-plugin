/**
 * NestJS — the module that wires the controller to the service. Nest's
 * decorators need `reflect-metadata` loaded first, so it is the first import.
 */
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { EmailController } from './email.controller.js';
import { EmailService } from './email.service.js';

@Module({
  controllers: [EmailController],
  providers: [EmailService],
})
export class AppModule {}
