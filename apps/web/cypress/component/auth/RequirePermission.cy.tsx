import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';

import type { UserRole } from '../../../src/features/auth/auth.types';
import { RequirePermission } from '../../../src/features/auth/RequirePermission';
import { AuthenticatedTestProvider } from '../../support/AuthenticatedTestProvider';

function LocationProbe() {
  const location = useLocation();

  return (
    <span data-testid="location">
      {location.pathname}
    </span>
  );
}

function mountProtectedOrderEntry(
  role: UserRole,
) {
  cy.mount(
    <AuthenticatedTestProvider role={role}>
      <MemoryRouter
        initialEntries={['/orders/new']}
      >
        <Routes>
          <Route
            path="/"
            element={<h1>Orders Dashboard</h1>}
          />

          <Route
            path="/orders/new"
            element={
              <RequirePermission permission="ORDER_CREATE">
                <h1>New Order Form</h1>
              </RequirePermission>
            }
          />
        </Routes>

        <LocationProbe />
      </MemoryRouter>
    </AuthenticatedTestProvider>,
  );
}

describe('RequirePermission', () => {
  const allowedRoles: readonly UserRole[] = [
    'ADMIN',
    'ORDER_OPERATOR',
  ];

  for (const role of allowedRoles) {
    it(`allows ${role} to open the protected route`, () => {
      mountProtectedOrderEntry(role);

      cy.contains('New Order Form').should(
        'be.visible',
      );

      cy.get('[data-testid="location"]').should(
        'have.text',
        '/orders/new',
      );
    });
  }

  const deniedRoles: readonly UserRole[] = [
    'PAYMENT_OPERATOR',
    'FULFILLMENT_OPERATOR',
  ];

  for (const role of deniedRoles) {
    it(`redirects ${role} away from the protected route`, () => {
      mountProtectedOrderEntry(role);

      cy.contains('Orders Dashboard').should(
        'be.visible',
      );

      cy.contains('New Order Form').should(
        'not.exist',
      );

      cy.get('[data-testid="location"]').should(
        'have.text',
        '/',
      );
    });
  }
});