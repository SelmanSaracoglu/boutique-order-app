import { loginAs } from '../support/e2eAuth';

describe('Order lifecycle', () => {
  it('persists a created order through completion and refresh', () => {
    const uniqueIdentifier = `@e2e-${Date.now()}`;
    let initialOpenOrderCount = 0;
    let initialCompletedOrderCount = 0;

    cy.intercept(
      'PATCH',
      '**/api/orders/*/status',
    ).as('updateStatus');

    loginAs('ORDER_OPERATOR');

    cy.contains('.summary-card', 'Open Orders')
      .find('strong')
      .invoke('text')
      .then((count) => {
        initialOpenOrderCount = Number(count);
      });

    cy.contains('.summary-card', 'Completed Orders')
      .find('strong')
      .invoke('text')
      .then((count) => {
        initialCompletedOrderCount = Number(count);
      });

    cy.contains('a', 'New Order').click();

    cy.location('pathname').should(
      'eq',
      '/orders/new',
    );

    cy.get('select[name="orderSource"]').select(
      'instagram',
    );

    cy.get(
      'input[name="customerIdentifier"]',
    ).type(uniqueIdentifier);

    cy.get(
      'input[name="customerName"]',
    ).type('E2E Customer');

    cy.get(
      'textarea[name="operationalNote"]',
    ).type('Created by the full-stack E2E journey.');

    cy.get(
      'input[name="items[0].supplierAlias"]',
    ).type('e2e-supplier');

    cy.get(
      'input[name="items[0].description"]',
    ).type('E2E Black Dress');

    cy.get(
      'input[name="items[0].size"]',
    ).type('M');

    cy.get(
      'input[name="items[0].color"]',
    ).type('Black');

    cy.get(
      'input[name="items[0].quantity"]',
    )
      .clear()
      .type('2');

    cy.get(
      'input[name="items[0].unitPrice"]',
    ).type('42.50');

    cy.contains(
      'button',
      'Create order',
    ).click();

    cy.location('pathname').should('eq', '/');

    cy.then(() => {
      cy.contains('.summary-card', 'Open Orders')
        .find('strong')
        .should(
          'have.text',
          String(initialOpenOrderCount + 1),
        );
    });

    cy.contains(
      '[data-testid="order-row"]',
      uniqueIdentifier,
    )
      .should('exist')
      .within(() => {
        cy.contains('E2E Customer').should('exist');
        cy.contains('€85.00').should('exist');
        cy.contains('New').should('exist');
        cy.contains('a', 'View').click();
      });

    cy.location('pathname').should(
      'match',
      /^\/orders\/\d+$/,
    );

    cy.get('[data-testid="order-detail-dialog"]')
      .should('be.visible')
      .within(() => {
        cy.contains('E2E Customer').should('exist');
        cy.contains(uniqueIdentifier).should('exist');
        cy.contains('E2E Black Dress').should('exist');
        cy.contains('strong', 'New').should('exist');

        cy.contains(
          'button',
          'Start processing',
        ).click();
      });

    cy.wait('@updateStatus')
      .its('request.body')
      .should('deep.equal', {
        status: 'IN_PROGRESS',
      });

    cy.get(
      '[data-testid="order-detail-dialog"]',
    ).within(() => {
      cy.contains('strong', 'In progress').should(
        'exist',
      );

      cy.contains('button', 'Complete order').should(
        'be.visible',
      );
    });

    cy.contains(
      '[data-testid="order-row"]',
      uniqueIdentifier,
    ).should('contain.text', 'In progress');

    cy.get(
      '[data-testid="order-detail-dialog"]',
    ).within(() => {
      cy.contains('button', 'Complete order').click();
    });

    cy.wait('@updateStatus')
      .its('request.body')
      .should('deep.equal', {
        status: 'COMPLETED',
      });

    cy.get(
      '[data-testid="order-detail-dialog"]',
    ).within(() => {
      cy.contains('strong', 'Completed').should(
        'exist',
      );

      cy.contains('button', 'Complete order').should(
        'not.exist',
      );

      cy.contains('button', 'Cancel order').should(
        'not.exist',
      );

      cy.contains('button', 'Close').click();
    });

    cy.location('pathname').should('eq', '/');

    cy.then(() => {
      cy.contains('.summary-card', 'Open Orders')
        .find('strong')
        .should(
          'have.text',
          String(initialOpenOrderCount),
        );

      cy.contains(
        '.summary-card',
        'Completed Orders',
      )
        .find('strong')
        .should(
          'have.text',
          String(initialCompletedOrderCount + 1),
        );
    });

    cy.contains(
      '[data-testid="order-row"]',
      uniqueIdentifier,
    ).should('not.exist');

    cy.contains('button', 'Completed').click();

    cy.contains(
      '[data-testid="order-row"]',
      uniqueIdentifier,
    )
      .should('be.visible')
      .and('contain.text', 'Completed')
      .within(() => {
        cy.contains('a', 'View').click();
      });

    cy.get(
      '[data-testid="order-detail-dialog"]',
    ).within(() => {
      cy.contains('strong', 'Completed').should(
        'exist',
      );

      cy.get(
        '[aria-label="Order lifecycle actions"]',
      ).should('not.exist');
    });

    cy.reload();

    cy.get('[data-testid="order-detail-dialog"]')
      .should('be.visible')
      .within(() => {
        cy.contains(uniqueIdentifier).should('exist');

        cy.contains('strong', 'Completed').should(
          'exist',
        );

        cy.get(
          '[aria-label="Order lifecycle actions"]',
        ).should('not.exist');

        cy.contains('button', 'Close').click();
      });

    cy.location('pathname').should('eq', '/');

    cy.intercept(
      'POST',
      '**/api/auth/logout',
    ).as('logout');

    cy.contains('button', 'Sign out').click();

    cy.wait('@logout')
      .its('response.statusCode')
      .should('eq', 204);

    cy.contains(
      'button',
      'Sign in',
    ).should('be.visible');

    cy.contains('Orders content').should(
      'not.exist',
    );

    cy.request({
      method: 'GET',
      url: '/api/auth/session',
      failOnStatusCode: false,
    })
      .its('status')
      .should('eq', 401);
  });
});