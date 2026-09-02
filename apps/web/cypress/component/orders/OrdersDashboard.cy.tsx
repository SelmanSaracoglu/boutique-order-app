import {
  MemoryRouter,
  Route,
  Routes,
} from 'react-router-dom';

import { OrdersRouteLayout } from '../../../src/features/orders/OrdersRouteLayout';
import { AuthenticatedTestProvider } from '../../support/AuthenticatedTestProvider';

import type { UserRole } from '../../../src/features/auth/auth.types';

const orders = [
  {
    id: 104,
    customerIdentifier: '@cancelledcustomer',
    customerName: 'Cancelled Customer',
    createdAt: '2026-08-23T09:00:00.000Z',
    status: 'CANCELLED',
    total: 25,
  },
  {
    id: 103,
    customerIdentifier: '@completedcustomer',
    customerName: 'Completed Customer',
    createdAt: '2026-08-22T12:00:00.000Z',
    status: 'COMPLETED',
    total: 79.9,
  },
  {
    id: 102,
    customerIdentifier: '+49 170 1234567',
    createdAt: '2026-08-23T08:30:00.000Z',
    status: 'IN_PROGRESS',
    total: 39.8,
  },
  {
    id: 101,
    customerIdentifier: '@newcustomer',
    customerName: 'New Customer',
    createdAt: '2026-08-23T08:00:00.000Z',
    status: 'NEW',
    total: 49.9,
  },
];

function mountDashboard(
  role: UserRole = 'ADMIN',
) {
  cy.mount(
    <AuthenticatedTestProvider role={role}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={<OrdersRouteLayout />}
          />
          <Route
            path="/orders/new"
            element={<h1>New Order Route</h1>}
          />
        </Routes>
      </MemoryRouter>
    </AuthenticatedTestProvider>
  );
}

describe('OrdersDashboard', () => {
  it('shows a loading state while persisted orders are being retrieved', () => {
    cy.intercept('GET', '**/api/orders', {
      statusCode: 200,
      delay: 300,
      body: [],
    }).as('listOrders');

    mountDashboard();

    cy.contains('Loading orders...').should(
      'be.visible',
    );

    cy.wait('@listOrders');

    cy.contains('No orders yet').should(
      'be.visible',
    );
  });

  it('renders persisted orders with Open as the default filter', () => {
    cy.intercept('GET', '**/api/orders', {
      statusCode: 200,
      body: orders,
    }).as('listOrders');

    mountDashboard();

    cy.wait('@listOrders');

    cy.contains('button', 'Open').should(
      'have.attr',
      'aria-pressed',
      'true',
    );

    cy.contains('.order-row', '#101').should(
      'be.visible',
    );

    cy.contains('.order-row', '#102').should(
      'be.visible',
    );

    cy.contains('.order-row', '#103').should(
      'not.exist',
    );

    cy.contains('.order-row', '#104').should(
      'not.exist',
    );

    cy.contains(
      '.order-row',
      'New Customer',
    ).should('be.visible');

    cy.contains(
      '.order-row',
      '+49 170 1234567',
    ).should('be.visible');

    cy.contains(
      '.order-row',
      'In progress',
    ).should('be.visible');

    cy.contains('.order-row', 'New').should(
      'be.visible',
    );
  });

  it('shows summary counts from the persisted order collection', () => {
    cy.clock(
      new Date(
        '2026-08-23T12:00:00.000Z',
      ).getTime(),
    );

    cy.intercept('GET', '**/api/orders', {
      statusCode: 200,
      body: orders,
    }).as('listOrders');

    mountDashboard();

    cy.wait('@listOrders');

    cy.contains(
      '.summary-card',
      'Open Orders',
    )
      .find('strong')
      .should('have.text', '2');

    cy.contains(
      '.summary-card',
      'Completed Orders',
    )
      .find('strong')
      .should('have.text', '1');

    cy.contains(
      '.summary-card',
      "Today's Orders",
    )
      .find('strong')
      .should('have.text', '3');

    cy.contains(
      '.summary-card',
      'Total Orders',
    )
      .find('strong')
      .should('have.text', '4');
  });

  it('switches between All and Completed filters without changing order sequence', () => {
    cy.intercept('GET', '**/api/orders', {
      statusCode: 200,
      body: orders,
    }).as('listOrders');

    mountDashboard();

    cy.wait('@listOrders');

    cy.contains('button', 'All').click();

    cy.get('.order-row').should(
      'have.length',
      4,
    );

    cy.get('.order-row')
      .eq(0)
      .should('contain.text', '#104');

    cy.get('.order-row')
      .eq(1)
      .should('contain.text', '#103');

    cy.get('.order-row')
      .eq(2)
      .should('contain.text', '#102');

    cy.get('.order-row')
      .eq(3)
      .should('contain.text', '#101');

    cy.contains(
      'button',
      'Completed',
    ).click();

    cy.get('.order-row').should(
      'have.length',
      1,
    );

    cy.contains('.order-row', '#103').should(
      'be.visible',
    );

    cy.contains('.order-row', '#101').should(
      'not.exist',
    );
  });

  it('shows an intentional empty state and navigates to New Order', () => {
    cy.intercept('GET', '**/api/orders', {
      statusCode: 200,
      body: [],
    }).as('listOrders');

    mountDashboard();

    cy.wait('@listOrders');

    cy.contains('No orders yet').should(
      'be.visible',
    );

    cy.contains(
      'Create the first customer order to get started.',
    ).should('be.visible');

    cy.get('.orders-empty-action').click();

    cy.contains('New Order Route').should(
      'be.visible',
    );
  });

  it('shows a controlled error and successfully retries loading orders', () => {
    let requestCount = 0;

    cy.intercept(
      'GET',
      '**/api/orders',
      (request) => {
        requestCount += 1;

        if (requestCount === 1) {
          request.reply({
            statusCode: 500,
            body: {
              code: 'INTERNAL_ERROR',
            },
          });

          return;
        }

        request.reply({
          statusCode: 200,
          delay: 300,
          body: [orders[3]],
        });
      },
    ).as('listOrders');

    mountDashboard();

    cy.wait('@listOrders');

    cy.contains(
      'Orders could not be loaded.',
    ).should('be.visible');

    cy.contains(
      'button',
      'Try again',
    ).click();

    cy.contains('Loading orders...').should(
      'be.visible',
    );

    cy.wait('@listOrders');

    cy.contains('.order-row', '#101').should(
      'be.visible',
    );

    cy.contains(
      'Orders could not be loaded.',
    ).should('not.exist');
  });

  it('shows a filter-specific empty state when orders exist but none match', () => {
    cy.intercept('GET', '**/api/orders', {
      statusCode: 200,
      body: [orders[0]],
    }).as('listOrders');

    mountDashboard();

    cy.wait('@listOrders');

    cy.contains(
      'No orders in this view',
    ).should('be.visible');

    cy.contains(
      'There are currently no orders matching this filter.',
    ).should('be.visible');

    cy.contains('button', 'All').click();

    cy.contains('.order-row', '#104').should(
      'be.visible',
    );
  });

  const orderCreationRoles: readonly UserRole[] = [
  'ADMIN',
  'ORDER_OPERATOR',
];

for (const role of orderCreationRoles) {
  it(`shows order creation actions for ${role}`, () => {
    cy.intercept('GET', '**/api/orders', {
      statusCode: 200,
      body: [],
    }).as('listOrders');

    mountDashboard(role);

    cy.wait('@listOrders');

    cy.get('a[href="/orders/new"]').should(
      'have.length',
      2,
    );
  });
}

const readOnlyCreationRoles: readonly UserRole[] = [
  'PAYMENT_OPERATOR',
  'FULFILLMENT_OPERATOR',
];

for (const role of readOnlyCreationRoles) {
  it(`hides order creation actions for ${role}`, () => {
    cy.intercept('GET', '**/api/orders', {
      statusCode: 200,
      body: [],
    }).as('listOrders');

    mountDashboard(role);

    cy.wait('@listOrders');

    cy.get('a[href="/orders/new"]').should(
      'not.exist',
    );

    cy.contains(
      'There are currently no customer orders to review.',
    ).should('be.visible');
  });
}
});