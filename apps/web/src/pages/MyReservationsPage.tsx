import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { type Reservation, useApiClient } from '../api/client';

export function MyReservationsPage() {
  const { request } = useApiClient();

  const reservationsQuery = useQuery({
    queryKey: ['reservations'],
    queryFn: () => request<Reservation[]>('/reservations/me'),
  });

  if (reservationsQuery.isLoading) {
    return <p>Loading reservations...</p>;
  }

  if (reservationsQuery.error) {
    return (
      <section className="page">
        <p className="error">{(reservationsQuery.error as Error).message}</p>
        <Link to="/seats">Back to seats</Link>
      </section>
    );
  }

  const reservations = reservationsQuery.data ?? [];

  return (
    <section className="page">
      <div className="page-header">
        <h1>My reservations</h1>
        <p>Seats you have successfully reserved.</p>
      </div>

      {reservations.length === 0 ? (
        <div className="empty-state">
          <p className="muted">You don&apos;t have any reservations yet.</p>
          <Link to="/seats" className="btn primary">
            Browse seats
          </Link>
        </div>
      ) : (
        <ul className="reservation-list">
          {reservations.map((reservation) => (
            <li key={reservation.id} className="reservation-item">
              <div>
                <strong>Seat #{reservation.seat.number}</strong>
                <p className="muted">
                  Reserved at{' '}
                  {new Date(reservation.reservedAt).toLocaleString()}
                </p>
              </div>
              <Link
                to={`/confirmation/${reservation.id}`}
                className="btn secondary"
              >
                View confirmation
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
