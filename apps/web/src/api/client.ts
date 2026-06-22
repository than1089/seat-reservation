import { useAuth } from '@clerk/clerk-react';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function useApiClient() {
  const { getToken, signOut } = useAuth();

  async function request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const token = await getToken();
    const headers = new Headers(options.headers);

    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      await signOut();
      window.location.href = '/sign-in';
      throw new ApiError('Unauthorized', 401);
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        message?: string | string[];
      };
      const message = Array.isArray(body.message)
        ? body.message.join(', ')
        : body.message ?? response.statusText;
      throw new ApiError(message, response.status);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  return { request };
}

export type SeatStatus = 'AVAILABLE' | 'HELD' | 'RESERVED';

export interface Seat {
  id: string;
  number: number;
  amountCents: number;
  status: SeatStatus;
  isHeldByCurrentUser: boolean;
  holdExpiresAt: string | null;
}

export interface Payment {
  id: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  seatId: string;
  amountCents: number;
  reservationId: string | null;
  seatNumber?: number | null;
}

export interface Reservation {
  id: string;
  seatId: string;
  reservedAt: string;
  seat: { number: number };
}
