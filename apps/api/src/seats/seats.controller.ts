import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { SeatsService } from './seats.service';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { Public } from '../auth/public.decorator';

@Controller('seats')
export class SeatsController {
  constructor(private readonly seatsService: SeatsService) {}

  @Public()
  @Get()
  listSeats(@Req() req: AuthenticatedRequest) {
    return this.seatsService.listSeats(req.userId);
  }

  @Post(':id/hold')
  holdSeat(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.seatsService.holdSeat(id, req.userId!);
  }

  @Delete(':id/hold')
  releaseHold(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.seatsService.releaseHold(id, req.userId!);
  }
}
