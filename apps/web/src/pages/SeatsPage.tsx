import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useApiClient, type Seat } from '../api/client';

function statusLabel(seat: Seat) {
  if (seat.status === 'RESERVED') return 'Reserved';
  if (seat.status === 'HELD' && seat.isHeldByCurrentUser) return 'Your hold';
  if (seat.status === 'HELD') return 'Held';
  return 'Available';
}

function statusClass(seat: Seat) {
  if (seat.status === 'RESERVED') return 'badge reserved';
  if (seat.status === 'HELD' && seat.isHeldByCurrentUser) return 'badge held-mine';
  if (seat.status === 'HELD') return 'badge held';
  return 'badge available';
}

export function SeatsPage() {
  const { request } = useApiClient();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const seatsQuery = useQuery({
    queryKey: ['seats'],
    queryFn: () => request<Seat[]>('/seats'),
    refetchInterval: 5000,
  });

  const holdMutation = useMutation({
    mutationFn: (seatId: string) =>
      request<{ id: string; holdExpiresAt: string }>(`/seats/${seatId}/hold`, {
        method: 'POST',
      }),
    onSuccess: (data, seatId) => {
      queryClient.setQueryData<Seat[]>(['seats'], (seats) =>
        seats?.map((seat) =>
          seat.id === seatId
            ? {
                ...seat,
                status: 'HELD',
                isHeldByCurrentUser: true,
                holdExpiresAt: data.holdExpiresAt,
              }
            : seat,
        ),
      );
      navigate(`/checkout/${seatId}`);
    },
  });

  return (
    <section className="page">
      <div className="page-header">
        <h1>Choose your seat</h1>
        <p>Three seats are available. Holds expire after 10 minutes.</p>
      </div>

      {seatsQuery.isLoading && <p>Loading seats...</p>}
      {seatsQuery.error && (
        <p className="error">{(seatsQuery.error as Error).message}</p>
      )}

      <div className="seat-grid">
        {seatsQuery.data?.map((seat) => {
          const disabled =
            seat.status === 'RESERVED' ||
            (seat.status === 'HELD' && !seat.isHeldByCurrentUser);

          return (
            <article key={seat.id} className={`seat-card ${seat.status.toLowerCase()}`}>
              <div className="seat-number">Seat {seat.number}</div>
              <span className={statusClass(seat)}>{statusLabel(seat)}</span>
              {seat.isHeldByCurrentUser && seat.holdExpiresAt && (
                <Link to={`/checkout/${seat.id}`} className="btn secondary">
                  Continue checkout
                </Link>
              )}
              {!disabled && !seat.isHeldByCurrentUser && (
                <button
                  className="btn primary"
                  disabled={holdMutation.isPending}
                  onClick={() => holdMutation.mutate(seat.id)}
                >
                  {holdMutation.isPending ? 'Holding...' : 'Select seat'}
                </button>
              )}
              {holdMutation.error && holdMutation.variables === seat.id && (
                <p className="error">{(holdMutation.error as Error).message}</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
