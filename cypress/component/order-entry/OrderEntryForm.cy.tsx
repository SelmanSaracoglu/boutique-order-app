import { OrderEntryForm } from '../../../src/features/order-entry/OrderEntryForm';

describe('OrderEntryForm', () => {
  it('shows validation errors when required information is missing', () => {
    cy.mount(<OrderEntryForm />);

    cy.contains('button', 'Create order').click();

    cy.contains('Customer reference is required.').should('be.visible');
    cy.contains('Channel is required.').should('be.visible');
    cy.contains('Supplier alias is required.').should('be.visible');
    cy.contains('Item description is required.').should('be.visible');
    cy.contains('Size is required.').should('be.visible');
    cy.contains('Color is required.').should('be.visible');

    cy.contains('Order ready').should('not.exist');
  });

  it('rejects an invalid order item quantity', () => {
    cy.mount(<OrderEntryForm />);

    cy.get('input[name="customerReference"]').type('@selinboutique');
    cy.get('select[name="channel"]').select('instagram');

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

  it('accepts a valid order with one order item', () => {
    cy.mount(<OrderEntryForm />);

    cy.get('input[name="customerReference"]').type('@selinboutique');
    cy.get('select[name="channel"]').select('instagram');

    cy.get('input[name="items[0].supplierAlias"]').type('A');
    cy.get('input[name="items[0].description"]').type(
      'Black linen dress',
    );
    cy.get('input[name="items[0].size"]').type('40');
    cy.get('input[name="items[0].color"]').type('Black');
    cy.get('input[name="items[0].quantity"]').clear().type('2');

    cy.contains('button', 'Create order').click();

    cy.contains('Order ready').should('be.visible');
    cy.contains(
      'A — Black linen dress, 40, Black × 2',
    ).should('be.visible');
    cy.contains('@selinboutique via instagram').should('be.visible');
  });

  it('adds and submits multiple order items', () => {
    cy.mount(<OrderEntryForm />);

    cy.get('input[name="customerReference"]').type('+49 170 1234567');
    cy.get('select[name="channel"]').select('whatsapp');

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

    cy.contains('+49 170 1234567 via whatsapp').should('be.visible');
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
});