import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { type Reservation, useApiClient } from '../api/client';

export function ConfirmationPage() {
  const { reservationId = '' } = useParams();
  const { request } = useApiClient();

  const reservationsQuery = useQuery({
    queryKey: ['reservations'],
    queryFn: () => request<Reservation[]>('/reservations/me'),
  });

  const reservation = reservationsQuery.data?.find((r) => r.id === reservationId);

  const isResolving =
    reservationsQuery.isPending ||
    (reservationsQuery.isFetching && !reservation);

  if (isResolving) {
    return <p>Loading confirmation...</p>;
  }

  if (!reservation) {
    return (
      <section className="page">
        <p className="error">Reservation not found.</p>
        <Link to="/seats">Back to seats</Link>
      </section>
    );
  }

  return (
    <section className="page confirmation">
      <div className="success-icon">✓</div>
      <h1>Reservation confirmed</h1>
      <p>
        Seat <strong>#{reservation.seat.number}</strong> is reserved for you.
      </p>
      <p className="muted">
        Reserved at {new Date(reservation.reservedAt).toLocaleString()}
      </p>
      <div className="confirmation-actions">
        <Link to="/reservations" className="btn secondary">
          My reservations
        </Link>
        <Link to="/seats" className="btn primary">
          View all seats
        </Link>
      </div>
    </section>
  );
}
