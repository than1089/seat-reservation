import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  clerkUserId?: string;
  userEmail?: string;
  userId?: string;
}
