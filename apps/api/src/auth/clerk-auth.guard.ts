import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { verifyToken, createClerkClient } from '@clerk/backend';
import { IS_PUBLIC_KEY } from './public.decorator';
import { AuthService } from './auth.service';
import type { User } from '../generated/prisma/client';
import { AuthenticatedRequest } from './auth.types';

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    // Check if the route is public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      if (isPublic) {
        return true;
      }
      throw new UnauthorizedException('Missing or invalid authorization token');
    }

    const token = authHeader.slice(7);
    const user = await this.resolveUser(token);

    if (!user) {
      if (isPublic) {
        return true;
      }
      throw new UnauthorizedException('Invalid or expired token');
    }

    request.clerkUserId = user.clerkUserId;
    request.userEmail = user.email;
    request.userId = user.id;
    return true;
  }

  private async resolveUser(token: string): Promise<User | null> {
    // If in E2E test mode, use test tokens and skip Clerk verification
    if (
      this.configService.get<string>('E2E_TEST_MODE') === 'true' &&
      token.startsWith('test:')
    ) {
      const [, clerkUserId, email] = token.split(':');
      if (!clerkUserId || !email) {
        return null;
      }
      return this.authService.upsertUser(clerkUserId, email);
    }

    const secretKey = this.configService.getOrThrow<string>('CLERK_SECRET_KEY');

    try {
      const payload = await verifyToken(token, { secretKey });
      const clerkUserId = payload.sub;

      if (!clerkUserId) {
        return null;
      }

      let userEmail =
        (payload.email as string | undefined) ??
        (payload.primary_email_address as string | undefined);

      if (!userEmail) {
        const clerk = createClerkClient({ secretKey });
        const clerkUser = await clerk.users.getUser(clerkUserId);
        userEmail =
          clerkUser.emailAddresses.find(
            (e) => e.id === clerkUser.primaryEmailAddressId,
          )?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;
      }

      if (!userEmail) {
        return null;
      }

      return this.authService.upsertUser(clerkUserId, userEmail);
    } catch {
      return null;
    }
  }
}
