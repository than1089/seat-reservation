import { Module } from '@nestjs/common';
import { PaymentsController, WebhooksController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { SeatsModule } from '../seats/seats.module';

@Module({
  imports: [SeatsModule],
  controllers: [PaymentsController, WebhooksController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
