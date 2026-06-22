import { NavLink, Outlet, Link } from 'react-router-dom';
import { UserButton } from '@clerk/clerk-react';

export function Layout() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/seats" className="brand">
          SeatReserve
        </Link>
        <nav className="app-nav">
          <NavLink to="/seats" className="nav-link">
            Seats
          </NavLink>
          <NavLink to="/reservations" className="nav-link">
            My reservations
          </NavLink>
        </nav>
        <UserButton afterSignOutUrl="/sign-in" />
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
