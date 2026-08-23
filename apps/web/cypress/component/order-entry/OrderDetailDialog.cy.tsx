import {
  MemoryRouter,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';

import { OrderDetailDialog } from '../../../src/features/orders/OrderDetailDialog';
import { OrdersDashboard } from '../../../src/features/orders/OrdersDashboard';

const orderSummaries = [
  {
    id: 101,
    customerIdentifier: '@newcustomer',
    customerName: 'New Customer',
    createdAt: '2026-08-23T08:00:00.000Z',
    status: 'NEW',
    total: 85,
  },
];

const orderDetail = {
  id: 101,
  orderSource: 'instagram',
  customerIdentifier: '@newcustomer',
  customerName: 'New Customer',
  operationalNote: 'Call before shipping.',
  status: 'NEW',
  createdAt: '2026-08-23T08:00:00.000Z',
  total: 85,
  items: [
    {
      id: 1,
      position: 1,
      supplierAlias: 'supplier-a',
      description: 'Black Dress',
      size: 'M',
      color: 'Black',
      quantity: 2,
      unitPrice: 42.5,
    },
  ],
};

function LocationProbe() {
  const location = useLocation();

  return (
    <span data-testid="location">
      {location.pathname}
    </span>
  );
}

function TestOrdersLayout() {
  return (
    <>
      <OrdersDashboard />
      <Outlet />
      <LocationProbe />
    </>
  );
}

function mountOrdersRoute(
  initialEntry:
    | string
    | {
        pathname: string;
        state?: {
          fromDashboard?: boolean;
        };
      } = '/',
) {
  cy.mount(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/"
          element={<TestOrdersLayout />}
        >
          <Route
            path="orders/:orderId"
            element={<OrderDetailDialog />}
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('OrderDetailDialog', () => {
  beforeEach(() => {
    cy.intercept('GET', '**/api/orders', {
      statusCode: 200,
      body: orderSummaries,
    }).as('listOrders');
  });

  it('opens persisted order detail from the Dashboard while keeping the Dashboard rendered', () => {
    cy.intercept(
      'GET',
      '**/api/orders/101',
      {
        statusCode: 200,
        body: orderDetail,
      },
    ).as('getOrder');

    mountOrdersRoute();

    cy.wait('@listOrders');

    cy.contains('.order-row', '#101')
      .contains('View')
      .click();

    cy.get('[data-testid="location"]').should(
      'have.text',
      '/orders/101',
    );

    cy.wait('@getOrder');

    cy.get('dialog').should('be.visible');

    cy.contains('h1', 'Orders').should(
      'exist',
    );

    cy.get('dialog').within(() => {
    cy.contains('h2', 'Order #101').should(
      'exist',
    );
    cy.contains('New Customer').should(
    'exist',
    );

    cy.contains('@newcustomer').should(
        'exist',
    );

    cy.contains('Instagram').should(
        'exist',
    );

    cy.contains('Call before shipping.').should(
        'exist',
    );

    cy.contains('Black Dress').should(
        'exist',
    );

    cy.contains('supplier-a').should(
        'exist',
    );

    cy.contains('Black').should(
        'exist',
    );
    })
});

  it('handles missing optional fields without rendering empty labels', () => {
    cy.intercept(
      'GET',
      '**/api/orders/101',
      {
        statusCode: 200,
        body: {
          ...orderDetail,
          customerName: undefined,
          operationalNote: undefined,
          items: [
            {
              id: 1,
              position: 1,
              supplierAlias: 'supplier-a',
              description: 'Basic Dress',
              quantity: 1,
              unitPrice: 30,
            },
          ],
          total: 30,
        },
      },
    ).as('getOrder');

    mountOrdersRoute('/orders/101');

    cy.wait('@getOrder');

    cy.contains('Basic Dress').should(
      'be.visible',
    );

    cy.contains('Name').should('not.exist');

    cy.contains('Operational note').should(
      'not.exist',
    );

    cy.contains('Size').should('not.exist');
    cy.contains('Color').should('not.exist');
  });

  it('shows a loading state while detail is being retrieved', () => {
    cy.intercept(
      'GET',
      '**/api/orders/101',
      {
        statusCode: 200,
        delay: 300,
        body: orderDetail,
      },
    ).as('getOrder');

    mountOrdersRoute('/orders/101');

    cy.contains('Loading order...').should(
      'be.visible',
    );

    cy.wait('@getOrder');

    cy.contains('Order #101').should(
      'be.visible',
    );
  });

  it('shows a dedicated not-found state for a missing order', () => {
    cy.intercept(
      'GET',
      '**/api/orders/999',
      {
        statusCode: 404,
        body: {
          error: {
            code: 'ORDER_NOT_FOUND',
            message: 'Order was not found.',
          },
        },
      },
    ).as('getOrder');

    mountOrdersRoute('/orders/999');

    cy.wait('@getOrder');

    cy.contains('Order not found').should(
      'be.visible',
    );

    cy.contains(
      'Order could not be loaded.',
    ).should('not.exist');
  });

  it('shows a controlled error and retries the detail request', () => {
    let requestCount = 0;

    cy.intercept(
      'GET',
      '**/api/orders/101',
      (request) => {
        requestCount += 1;

        if (requestCount === 1) {
          request.reply({
            statusCode: 500,
            body: {
              error: {
                code: 'INTERNAL_ERROR',
              },
            },
          });

          return;
        }

        request.reply({
          statusCode: 200,
          delay: 300,
          body: orderDetail,
        });
      },
    ).as('getOrder');

    mountOrdersRoute('/orders/101');

    cy.wait('@getOrder');

    cy.contains(
      'Order could not be loaded.',
    ).should('be.visible');

    cy.contains(
      'button',
      'Try again',
    ).click();

    cy.contains('Loading order...').should(
      'be.visible',
    );

    cy.wait('@getOrder');

    cy.contains('Order #101').should(
      'be.visible',
    );

    cy.contains(
      'Order could not be loaded.',
    ).should('not.exist');
  });

  it('closes back to the Dashboard when opened from the Dashboard', () => {
    cy.intercept(
      'GET',
      '**/api/orders/101',
      {
        statusCode: 200,
        body: orderDetail,
      },
    ).as('getOrder');

    mountOrdersRoute();

    cy.wait('@listOrders');

    cy.contains('.order-row', '#101')
      .contains('View')
      .click();

    cy.wait('@getOrder');

    cy.contains('button', 'Close').click();

    cy.get('[data-testid="location"]').should(
      'have.text',
      '/',
    );

    cy.get('dialog').should('not.exist');

    cy.contains('h1', 'Orders').should(
      'be.visible',
    );
  });

  it('closes safely to the Dashboard with Escape', () => {
    cy.intercept(
      'GET',
      '**/api/orders/101',
      {
        statusCode: 200,
        body: orderDetail,
      },
    ).as('getOrder');

    mountOrdersRoute('/orders/101');

    cy.wait('@getOrder');

    cy.get('dialog').trigger('cancel');

    cy.get('[data-testid="location"]').should(
      'have.text',
      '/',
    );

    cy.get('dialog').should('not.exist');
  });

  it('supports a direct detail route', () => {
    cy.intercept(
      'GET',
      '**/api/orders/101',
      {
        statusCode: 200,
        body: orderDetail,
      },
    ).as('getOrder');

    mountOrdersRoute('/orders/101');

    cy.wait('@getOrder');

    cy.get('[data-testid="location"]').should(
      'have.text',
      '/orders/101',
    );

    cy.contains('h1', 'Orders').should(
      'exist',
    );

    cy.contains('h2', 'Order #101').should(
      'be.visible',
    );
  });

  it('handles an invalid route ID without requesting detail from the API', () => {
    cy.intercept(
      'GET',
      '**/api/orders/not-a-number',
    ).as('invalidDetailRequest');

    mountOrdersRoute(
      '/orders/not-a-number',
    );

    cy.contains('Invalid order ID').should(
      'be.visible',
    );

    cy.get('@invalidDetailRequest.all').should(
      'have.length',
      0,
    );
  });

  it('opens as a modal dialog with meaningful initial focus', () => {
    cy.intercept(
      'GET',
      '**/api/orders/101',
      {
        statusCode: 200,
        body: orderDetail,
      },
    ).as('getOrder');

    mountOrdersRoute('/orders/101');

    cy.get('dialog').should(
    'have.attr',
    'open',
    );

    cy.get('dialog').should(
    'have.attr',
    'aria-labelledby',
    'order-detail-title',
    );

    cy.focused().should(
      'contain.text',
      'Close',
    );

    cy.wait('@getOrder');
  });
});