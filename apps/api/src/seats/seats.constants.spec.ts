import { isHoldExpired } from './seats.constants';

describe('isHoldExpired', () => {
  it('returns true when holdExpiresAt is null', () => {
    expect(isHoldExpired(null)).toBe(true);
  });

  it('returns true when hold is in the past', () => {
    const past = new Date(Date.now() - 1000);
    expect(isHoldExpired(past)).toBe(true);
  });

  it('returns false when hold is in the future', () => {
    const future = new Date(Date.now() + 60_000);
    expect(isHoldExpired(future)).toBe(false);
  });
});
