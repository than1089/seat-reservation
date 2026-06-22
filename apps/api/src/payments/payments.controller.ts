import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { PaymentsService } from './payments.service';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { Public } from '../auth/public.decorator';

class CreatePaymentDto {
  @IsUUID()
  seatId!: string;
}

class WebhookPaymentDto {
  @IsUUID()
  paymentId!: string;

  @IsOptional()
  @IsBoolean()
  success?: boolean;
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  createPayment(
    @Body() body: CreatePaymentDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.paymentsService.createPayment(
      req.userId!,
      body.seatId,
      idempotencyKey,
    );
  }

  @Get(':id')
  getPayment(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.paymentsService.getPayment(id, req.userId!);
  }

  @Post(':id/confirm')
  confirmPayment(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.paymentsService.confirmPayment(id, req.userId!);
  }
}

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Public()
  @Post('payments')
  handlePaymentWebhook(
    @Body() body: WebhookPaymentDto,
    @Headers('x-webhook-secret') secret: string,
  ) {
    return this.paymentsService.handleWebhook(
      body.paymentId,
      secret,
      body.success ?? true,
    );
  }
}
