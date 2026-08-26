describe('Order lifecycle', () => {
  it('creates a persisted order and opens its route-backed detail', () => {
    const uniqueIdentifier = `@e2e-${Date.now()}`;

    cy.visit('/');

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

    cy.contains(
      '[data-testid="order-row"]',
      uniqueIdentifier,
    )
      .should('exist')
      .within(() => {
        cy.contains('E2E Customer').should(
          'exist',
        );

        cy.contains('€85.00').should('exist');

        cy.contains('a', 'View').click();
      });

    cy.location('pathname').should(
      'match',
      /^\/orders\/\d+$/,
    );

    cy.get('[data-testid="order-detail-dialog"]').should('be.visible');

    cy.get('[data-testid="order-detail-dialog"]').within(() => {
      cy.contains('E2E Customer').should(
        'exist',
      );

      cy.contains(uniqueIdentifier).should(
        'exist',
      );

      cy.contains(
        'Created by the full-stack E2E journey.',
      ).should('exist');

      cy.contains('E2E Black Dress').should(
        'exist',
      );

      cy.contains('e2e-supplier').should(
        'exist',
      );

      cy.contains('Black').should('exist');

      cy.contains('M').should('exist');

      cy.contains('€85.00').should('exist');

      cy.contains('button', 'Close').click();
    });

    cy.location('pathname').should('eq', '/');

    cy.contains('h1', 'Orders').should(
      'be.visible',
    );

    cy.contains(
      '[data-testid="order-row"]',
      uniqueIdentifier,
    ).should('exist');
  });
});