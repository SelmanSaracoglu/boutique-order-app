import { OrderEntryForm } from '../../../src/features/order-entry/OrderEntryForm';

function fillRequiredOrderDetails() {
  cy.get('input[name="customerReference"]').type('@selinboutique');
  cy.get('select[name="contactChannel"]').select('instagram');
  cy.get('input[name="contactValue"]').type('@selinboutique');
  cy.get('select[name="orderChannel"]').select('instagram');
  cy.get('input[name="orderDate"]').type('2026-08-15');
}

describe('OrderEntryForm', () => {
  it('shows validation errors when required information is missing', () => {
    cy.mount(<OrderEntryForm />);

    cy.contains('button', 'Create order').click();

    cy.contains('Customer reference is required.').should('be.visible');
    cy.contains('Contact channel is required.').should('be.visible');
    cy.contains('Contact value is required.').should('be.visible');
    cy.contains('Order channel is required.').should('be.visible');
    cy.contains('Order date is required.').should('be.visible');

    cy.contains('Supplier alias is required.').should('be.visible');
    cy.contains('Item description is required.').should('be.visible');
    cy.contains('Size is required.').should('be.visible');
    cy.contains('Color is required.').should('be.visible');

    cy.contains('Order ready').should('not.exist');
  });

  it('rejects an invalid order item quantity', () => {
    cy.mount(<OrderEntryForm />);

    fillRequiredOrderDetails();

    cy.get('input[name="items[0].supplierAlias"]').type('A');
    cy.get('input[name="items[0].description"]').type(
      'Black linen dress',
    );
    cy.get('input[name="items[0].size"]').type('40');
    cy.get('input[name="items[0].color"]').type('Black');
    cy.get('input[name="items[0].quantity"]').clear().type('0');

    cy.contains('button', 'Create order').click();

    cy.contains('Quantity must be at least 1.').should('be.visible');
    cy.contains('Order ready').should('not.exist');
  });

  it('accepts a valid order with customer and order details', () => {
    cy.mount(<OrderEntryForm />);

    fillRequiredOrderDetails();

    cy.get('input[name="items[0].supplierAlias"]').type('A');
    cy.get('input[name="items[0].description"]').type(
      'Black linen dress',
    );
    cy.get('input[name="items[0].size"]').type('40');
    cy.get('input[name="items[0].color"]').type('Black');
    cy.get('input[name="items[0].quantity"]').clear().type('2');

    cy.get('textarea[name="operationalNote"]').type(
      'Call before shipping',
    );

    cy.contains('button', 'Create order').click();

    cy.contains('Order ready').should('be.visible');
    cy.contains('Customer: @selinboutique').should('be.visible');
    cy.contains(
      'Contact: @selinboutique via instagram',
    ).should('be.visible');
    cy.contains('Order channel: instagram').should('be.visible');
    cy.contains('Order date: 2026-08-15').should('be.visible');
    cy.contains('Note: Call before shipping').should('be.visible');

    cy.contains(
      'A — Black linen dress, 40, Black × 2',
    ).should('be.visible');
  });

  it('adds and submits multiple order items', () => {
    cy.mount(<OrderEntryForm />);

    fillRequiredOrderDetails();

    cy.get('input[name="items[0].supplierAlias"]').type('A');
    cy.get('input[name="items[0].description"]').type(
      'Black linen dress',
    );
    cy.get('input[name="items[0].size"]').type('40');
    cy.get('input[name="items[0].color"]').type('Black');
    cy.get('input[name="items[0].quantity"]').clear().type('2');

    cy.contains('button', 'Add item').click();

    cy.contains('Item 2').should('be.visible');

    cy.get('input[name="items[1].supplierAlias"]').type('B');
    cy.get('input[name="items[1].description"]').type('Cream scarf');
    cy.get('input[name="items[1].size"]').type('One size');
    cy.get('input[name="items[1].color"]').type('Cream');

    cy.contains('button', 'Create order').click();

    cy.contains('Order ready').should('be.visible');

    cy.contains(
      'A — Black linen dress, 40, Black × 2',
    ).should('be.visible');

    cy.contains(
      'B — Cream scarf, One size, Cream × 1',
    ).should('be.visible');

    cy.contains('Customer: @selinboutique').should('be.visible');
  });

  it('allows an added order item to be removed while keeping one item', () => {
    cy.mount(<OrderEntryForm />);

    cy.contains('button', 'Remove item').should('not.exist');

    cy.contains('button', 'Add item').click();

    cy.contains('Item 2').should('be.visible');

    cy.get('button')
      .filter(':contains("Remove item")')
      .should('have.length', 2);

    cy.get('button')
      .filter(':contains("Remove item")')
      .last()
      .click();

    cy.contains('Item 2').should('not.exist');
    cy.contains('Item 1').should('be.visible');
    cy.contains('button', 'Remove item').should('not.exist');
  });

  it('allows the operational note to be omitted', () => {
    cy.mount(<OrderEntryForm />);

    fillRequiredOrderDetails();

    cy.get('input[name="items[0].supplierAlias"]').type('A');
    cy.get('input[name="items[0].description"]').type(
      'Black linen dress',
    );
    cy.get('input[name="items[0].size"]').type('40');
    cy.get('input[name="items[0].color"]').type('Black');

    cy.contains('button', 'Create order').click();

    cy.contains('Order ready').should('be.visible');
    cy.contains(/^Note:/).should('not.exist');
  });
});