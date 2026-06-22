import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient, type Payment, type Seat } from '../api/client';

function useCountdown(expiresAt: string | null | undefined) {
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    if (!expiresAt) return;

    const tick = () => {
      setRemainingMs(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  const label = useMemo(() => {
    const totalSeconds = Math.ceil(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, [remainingMs]);

  return { remainingMs, label };
}

function formatUsd(amountCents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amountCents / 100);
}

export function CheckoutPage() {
  const { seatId = '' } = useParams();
  const { request } = useApiClient();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [paymentId, setPaymentId] = useState<string | null>(null);

  const seatsQuery = useQuery({
    queryKey: ['seats'],
    queryFn: () => request<Seat[]>('/seats'),
    refetchInterval: 5000,
  });

  const seat = seatsQuery.data?.find((s) => s.id === seatId);
  const isResolvingSeat =
    seatsQuery.isPending || (seatsQuery.isFetching && !seat);
  const { remainingMs, label } = useCountdown(seat?.holdExpiresAt);

  const createPayment = useMutation({
    mutationFn: () =>
      request<Payment>('/payments', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ seatId }),
      }),
    onSuccess: (payment) => setPaymentId(payment.id),
  });

  const confirmPayment = useMutation({
    mutationFn: (id: string) =>
      request<Payment>(`/payments/${id}/confirm`, { method: 'POST' }),
    onSuccess: async (payment) => {
      await queryClient.invalidateQueries({ queryKey: ['reservations'] });

      if (payment.reservationId) {
        navigate(`/confirmation/${payment.reservationId}`);
        return;
      }

      const polled = await pollPayment(payment.id);
      if (polled.reservationId) {
        navigate(`/confirmation/${polled.reservationId}`);
      }
    },
  });

  async function pollPayment(id: string): Promise<Payment> {
    for (let i = 0; i < 10; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const payment = await request<Payment>(`/payments/${id}`);
      if (payment.status !== 'PENDING') {
        return payment;
      }
    }
    throw new Error('Payment confirmation timed out');
  }

  const releaseHold = useMutation({
    mutationFn: () =>
      request(`/seats/${seatId}/hold`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seats'] });
      navigate('/seats');
    },
  });

  useEffect(() => {
    if (remainingMs === 0 && seat?.isHeldByCurrentUser) {
      queryClient.invalidateQueries({ queryKey: ['seats'] });
    }
  }, [remainingMs, seat?.isHeldByCurrentUser, queryClient]);

  if (isResolvingSeat) {
    return <p>Loading checkout...</p>;
  }

  if (seatsQuery.error) {
    return (
      <section className="page">
        <p className="error">{(seatsQuery.error as Error).message}</p>
        <Link to="/seats">Back to seats</Link>
      </section>
    );
  }

  if (!seat) {
    return (
      <section className="page">
        <p className="error">Seat not found.</p>
        <Link to="/seats">Back to seats</Link>
      </section>
    );
  }

  if (!seat.isHeldByCurrentUser && seatsQuery.isFetching) {
    return <p>Loading checkout...</p>;
  }

  if (!seat.isHeldByCurrentUser) {
    return (
      <section className="page">
        <p className="error">You no longer hold this seat.</p>
        <Link to="/seats">Pick another seat</Link>
      </section>
    );
  }

  return (
    <section className="page checkout">
      <div className="page-header">
        <h1>Checkout — Seat {seat.number}</h1>
        <p>Complete payment before your hold expires.</p>
      </div>

      <div className="checkout-card">
        <div className="checkout-row">
          <span>Seat</span>
          <strong>#{seat.number}</strong>
        </div>
        <div className="checkout-row">
          <span>Price</span>
          <strong>{formatUsd(seat.amountCents)}</strong>
        </div>
        <div className="checkout-row">
          <span>Hold expires in</span>
          <strong className={remainingMs < 60000 ? 'warn' : ''}>{label}</strong>
        </div>

        {!paymentId ? (
          <button
            className="btn primary wide"
            disabled={createPayment.isPending || remainingMs === 0}
            onClick={() => createPayment.mutate()}
          >
            {createPayment.isPending ? 'Creating payment...' : 'Proceed to payment'}
          </button>
        ) : (
          <button
            className="btn primary wide"
            disabled={confirmPayment.isPending || remainingMs === 0}
            onClick={() => confirmPayment.mutate(paymentId)}
          >
            {confirmPayment.isPending
              ? 'Processing...'
              : `Pay ${formatUsd(seat.amountCents)} (mock)`}
          </button>
        )}

        {(createPayment.error || confirmPayment.error) && (
          <p className="error">
            {((createPayment.error ?? confirmPayment.error) as Error).message}
          </p>
        )}

        <button
          className="btn ghost wide"
          disabled={releaseHold.isPending}
          onClick={() => releaseHold.mutate()}
        >
          Cancel and release seat
        </button>
      </div>
    </section>
  );
}
