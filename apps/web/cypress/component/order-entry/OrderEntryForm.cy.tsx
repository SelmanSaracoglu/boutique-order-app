import {
  MemoryRouter,
  Route,
  Routes,
} from 'react-router-dom';

import { AuthenticatedTestProvider } from '../../support/AuthenticatedTestProvider';

import { OrderEntryForm } from '../../../src/features/order-entry/OrderEntryForm';

function mountOrderEntryForm() {
  cy.mount(
    <AuthenticatedTestProvider>
      <MemoryRouter initialEntries={['/orders/new']}>
        <Routes>
          <Route
            path="/orders/new"
            element={<OrderEntryForm />}
          />
          <Route
            path="/"
            element={<h1>Orders Dashboard</h1>}
          />
        </Routes>
      </MemoryRouter>,
    </AuthenticatedTestProvider>
  );
}

function fillValidInstagramOrder() {
  cy.get('select[name="orderSource"]').select(
    'instagram',
  );

  cy.get(
    'input[name="customerIdentifier"]',
  ).type('@ayseyilmaz');

  cy.get('input[name="customerName"]').type(
    'Ayşe Yılmaz',
  );

  cy.get(
    'input[name="items[0].supplierAlias"]',
  ).type('A');

  cy.get(
    'input[name="items[0].description"]',
  ).type('Yaka çiçekli elbise');

  cy.get(
    'input[name="items[0].size"]',
  ).type('40');

  cy.get(
    'input[name="items[0].color"]',
  ).type('Black');

  cy.get(
    'input[name="items[0].quantity"]',
  )
    .clear()
    .type('1');

  cy.get(
    'input[name="items[0].unitPrice"]',
  ).type('49.90');
}

describe('OrderEntryForm', () => {
  it('shows validation errors for missing required information', () => {
    mountOrderEntryForm();

    cy.contains(
      'button',
      'Create order',
    ).click();

    cy.contains(
      'Please review the highlighted fields before creating the order.',
    ).should('be.visible');

    cy.contains(
      'Order source is required.',
    ).should('be.visible');

    cy.contains(
      'Customer identifier is required.',
    ).should('be.visible');

    cy.contains(
      'Supplier alias is required.',
    ).should('be.visible');

    cy.contains(
      'Item description is required.',
    ).should('be.visible');

    cy.contains(
      'Unit price is required.',
    ).should('be.visible');
  });

  it('rejects invalid quantity and unit price for the correct item', () => {
    mountOrderEntryForm();

    cy.get(
      'select[name="orderSource"]',
    ).select('instagram');

    cy.get(
      'input[name="customerIdentifier"]',
    ).type('@ayseyilmaz');

    cy.get(
      'input[name="items[0].supplierAlias"]',
    ).type('A');

    cy.get(
      'input[name="items[0].description"]',
    ).type('Dress');

    cy.get(
      'input[name="items[0].quantity"]',
    )
      .clear()
      .type('0');

    cy.get(
      'input[name="items[0].unitPrice"]',
    ).type('0');

    cy.contains(
      'button',
      'Create order',
    ).click();

    cy.contains(
      'Quantity must be at least 1.',
    ).should('be.visible');

    cy.contains(
      'Unit price must be greater than 0.',
    ).should('be.visible');
  });

  it('adds and removes order items', () => {
    mountOrderEntryForm();

    cy.contains(
      'button',
      'Add item',
    ).click();

    cy.get(
      'input[name="items[1].description"]',
    ).should('exist');

    cy.contains(
      'button',
      'Remove item',
    )
      .last()
      .click();

    cy.get(
      'input[name="items[1].description"]',
    ).should('not.exist');

    cy.get(
      'input[name="items[0].description"]',
    ).should('exist');
  });

  it('persists a valid order once and navigates to the dashboard', () => {
    let requestCount = 0;

    cy.intercept(
      'POST',
      '**/api/orders',
      (request) => {
        requestCount += 1;

        request.reply({
          statusCode: 201,
          delay: 300,
          body: {
            id: 101,
            orderSource: 'instagram',
            customerIdentifier:
              '@ayseyilmaz',
            customerName: 'Ayşe Yılmaz',
            status: 'NEW',
            createdAt:
              '2026-08-23T10:00:00.000Z',
            items: [
              {
                id: 201,
                position: 1,
                supplierAlias: 'A',
                description:
                  'Yaka çiçekli elbise',
                size: '40',
                color: 'Black',
                quantity: 1,
                unitPrice: 49.9,
              },
            ],
          },
        });
      },
    ).as('createOrder');

    mountOrderEntryForm();
    fillValidInstagramOrder();

    cy.get('form').then(($form) => {
      const form =
        $form[0] as HTMLFormElement;

      form.requestSubmit();
      form.requestSubmit();
    });

    cy.contains(
      'button',
      'Creating order...',
    ).should('be.disabled');

    cy.wait('@createOrder').then(
      ({ request }) => {
        expect(request.headers).to.have.property(
          'x-csrf-token',
          'test-csrf-token',
        );
        expect(request.body).to.deep.equal({
          orderSource: 'instagram',
          customerIdentifier:
            '@ayseyilmaz',
          customerName: 'Ayşe Yılmaz',
          items: [
            {
              supplierAlias: 'A',
              description:
                'Yaka çiçekli elbise',
              size: '40',
              color: 'Black',
              quantity: 1,
              unitPrice: 49.9,
            },
          ],
        });

        expect(request.body).not.to.have.property(
          'id',
        );

        expect(request.body).not.to.have.property(
          'status',
        );

        expect(request.body).not.to.have.property(
          'createdAt',
        );
      },
    );

    cy.then(() => {
      expect(requestCount).to.equal(1);
    });

    cy.contains(
      'Orders Dashboard',
    ).should('be.visible');
  });

  it('preserves entered data and shows a controlled error when persistence fails', () => {
    cy.intercept(
      'POST',
      '**/api/orders',
      {
        statusCode: 500,
        body: {
          code: 'INTERNAL_ERROR',
        },
      },
    ).as('createOrder');

    mountOrderEntryForm();
    fillValidInstagramOrder();

    cy.contains(
      'button',
      'Create order',
    ).click();

    cy.wait('@createOrder');

    cy.contains(
      'The order could not be created. Please try again.',
    ).should('be.visible');

    cy.contains(
      'button',
      'Create order',
    ).should('not.be.disabled');

    cy.get(
      'input[name="customerIdentifier"]',
    ).should(
      'have.value',
      '@ayseyilmaz',
    );

    cy.get(
      'input[name="items[0].description"]',
    ).should(
      'have.value',
      'Yaka çiçekli elbise',
    );

    cy.contains(
      'Orders Dashboard',
    ).should('not.exist');
  });

  it('persists an order without optional customer or item information', () => {
    cy.intercept(
      'POST',
      '**/api/orders',
      {
        statusCode: 201,
        body: {
          id: 102,
          orderSource: 'whatsapp',
          customerIdentifier:
            '+49 170 1234567',
          status: 'NEW',
          createdAt:
            '2026-08-23T10:00:00.000Z',
          items: [
            {
              id: 202,
              position: 1,
              supplierAlias: 'C',
              description: 'Printed scarf',
              quantity: 1,
              unitPrice: 19.9,
            },
          ],
        },
      },
    ).as('createOrder');

    mountOrderEntryForm();

    cy.get(
      'select[name="orderSource"]',
    ).select('whatsapp');

    cy.get(
      'input[name="customerIdentifier"]',
    ).type('+49 170 1234567');

    cy.get(
      'input[name="items[0].supplierAlias"]',
    ).type('C');

    cy.get(
      'input[name="items[0].description"]',
    ).type('Printed scarf');

    cy.get(
      'input[name="items[0].unitPrice"]',
    ).type('19.90');

    cy.contains(
      'button',
      'Create order',
    ).click();

    cy.wait('@createOrder').then(
      ({ request }) => {
        expect(request.body).to.deep.equal({
          orderSource: 'whatsapp',
          customerIdentifier:
            '+49 170 1234567',
          items: [
            {
              supplierAlias: 'C',
              description: 'Printed scarf',
              quantity: 1,
              unitPrice: 19.9,
            },
          ],
        });
      },
    );

    cy.contains(
      'Orders Dashboard',
    ).should('be.visible');
  });
});