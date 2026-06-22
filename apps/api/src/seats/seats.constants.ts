export const HOLD_DURATION_MS = 10 * 60 * 1000;

export interface LockedSeatRow {
  id: string;
  number: number;
  status: string;
  holdExpiresAt: Date | null;
  heldByUserId: string | null;
  version: number;
}

export function isHoldExpired(holdExpiresAt: Date | null): boolean {
  if (!holdExpiresAt) return true;
  return holdExpiresAt.getTime() <= Date.now();
}
