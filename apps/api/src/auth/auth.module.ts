import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ClerkAuthGuard } from './clerk-auth.guard';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    ClerkAuthGuard,
    { provide: APP_GUARD, useClass: ClerkAuthGuard },
  ],
  exports: [AuthService, ClerkAuthGuard],
})
export class AuthModule {}
