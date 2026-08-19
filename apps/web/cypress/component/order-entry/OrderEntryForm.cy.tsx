import { OrderEntryForm } from '../../../src/features/order-entry/OrderEntryForm';

describe('OrderEntryForm', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
  });

  it('shows validation errors for missing required information', () => {
    cy.mount(<OrderEntryForm />);

    cy.contains('button', 'Create order').click();

    cy.contains(
      'Please review the highlighted fields before creating the order.',
    ).should('be.visible');

    cy.contains('Order source is required.').should('be.visible');
    cy.contains('Customer identifier is required.').should('be.visible');
    cy.contains('Supplier alias is required.').should('be.visible');
    cy.contains('Item description is required.').should('be.visible');
    cy.contains('Unit price is required.').should('be.visible');

    cy.contains('Size is required.').should('not.exist');
    cy.contains('Color is required.').should('not.exist');

    cy.contains('Order saved').should('not.exist');
  });

  it('rejects invalid quantity and unit price for the correct item', () => {
    cy.mount(<OrderEntryForm />);

    cy.get('select[name="orderSource"]').select('instagram');
    cy.get('input[name="customerIdentifier"]').type('@ayseyilmaz');

    cy.get('input[name="items[0].supplierAlias"]').type('A');
    cy.get('input[name="items[0].description"]').type(
      'Yaka çiçekli elbise',
    );
    cy.get('input[name="items[0].quantity"]').clear().type('0');
    cy.get('input[name="items[0].unitPrice"]').type('0');

    cy.contains('button', 'Create order').click();

    cy.contains('Quantity must be at least 1.').should('be.visible');
    cy.contains('Unit price must be greater than 0.').should('be.visible');
    cy.contains('Order saved').should('not.exist');
  });

  it('captures a realistic two-item Instagram boutique order', () => {
    cy.mount(<OrderEntryForm />);

    cy.get('select[name="orderSource"]').select('instagram');
    cy.get('input[name="customerIdentifier"]').type('@ayseyilmaz');
    cy.get('input[name="customerName"]').type('Ayşe Yılmaz');

    cy.get('input[name="items[0].supplierAlias"]').type('A');
    cy.get('input[name="items[0].description"]').type(
      'Yaka çiçekli elbise',
    );
    cy.get('input[name="items[0].size"]').type('40');
    cy.get('input[name="items[0].color"]').type('Black');
    cy.get('input[name="items[0].quantity"]').clear().type('1');
    cy.get('input[name="items[0].unitPrice"]').type('49.90');

    cy.contains('button', 'Add item').click();

    cy.get('input[name="items[1].supplierAlias"]').type('B');
    cy.get('input[name="items[1].description"]').type('Basic shirt');
    cy.get('input[name="items[1].size"]').type('M');
    cy.get('input[name="items[1].color"]').type('White');
    cy.get('input[name="items[1].quantity"]').clear().type('2');
    cy.get('input[name="items[1].unitPrice"]').type('29.90');

    cy.contains('button', 'Create order').click();

    cy.contains('Order ready').should('be.visible');

    cy.contains('Source: Instagram').should('be.visible');
    cy.contains('Customer identifier: @ayseyilmaz').should('be.visible');
    cy.contains('Customer name: Ayşe Yılmaz').should('be.visible');

    cy.contains(
      'A — Yaka çiçekli elbise, 40, Black × 1 — €49.90 each',
    ).should('be.visible');

    cy.contains(
      'B — Basic shirt, M, White × 2 — €29.90 each',
    ).should('be.visible');

    cy.contains('Created:').should('be.visible');

    });

  it('captures a WhatsApp order without optional customer, size or color information', () => {
    cy.mount(<OrderEntryForm />);

    cy.get('select[name="orderSource"]').select('whatsapp');
    cy.get('input[name="customerIdentifier"]').type('+49 170 1234567');

    cy.get('input[name="items[0].supplierAlias"]').type('C');
    cy.get('input[name="items[0].description"]').type('Printed scarf');
    cy.get('input[name="items[0].unitPrice"]').type('19.90');

    cy.contains('button', 'Create order').click();

    cy.contains('Order ready').should('be.visible');
    cy.contains('Source: WhatsApp').should('be.visible');
    cy.contains('Customer identifier: +49 170 1234567').should(
      'be.visible',
    );

    cy.contains('Customer name:').should('not.exist');
    cy.contains('C — Printed scarf × 1 — €19.90 each').should(
      'be.visible',
    );
  }); 

});