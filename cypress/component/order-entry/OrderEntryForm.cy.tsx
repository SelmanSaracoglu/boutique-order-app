import { OrderEntryForm } from '../../../src/features/order-entry/OrderEntryForm';

describe('OrderEntryForm', () => {
  it('shows validation errors when required information is missing', () => {
    cy.mount(<OrderEntryForm />);

    cy.contains('button', 'Create order').click();

    cy.contains('Customer reference is required.').should('be.visible');
    cy.contains('Channel is required.').should('be.visible');
    cy.contains('Item description is required.').should('be.visible');
  });

  it('rejects an invalid quantity', () => {
    cy.mount(<OrderEntryForm />);

    cy.get('input[name="customerReference"]').type('@selinboutique');
    cy.get('select[name="channel"]').select('instagram');
    cy.get('input[name="itemDescription"]').type(
      'Black linen dress, size 40',
    );

    cy.get('input[name="quantity"]').clear().type('0');

    cy.contains('button', 'Create order').click();

    cy.contains('Quantity must be at least 1.').should('be.visible');
    cy.contains('Order ready').should('not.exist');
  });

  it('accepts a valid Instagram order entry', () => {
    cy.mount(<OrderEntryForm />);

    cy.get('input[name="customerReference"]').type('@selinboutique');
    cy.get('select[name="channel"]').select('instagram');
    cy.get('input[name="itemDescription"]').type(
      'Black linen dress, size 40',
    );

    cy.get('input[name="quantity"]').clear().type('2');

    cy.contains('button', 'Create order').click();

    cy.contains('Order ready').should('be.visible');
    cy.contains('Black linen dress, size 40 × 2').should('be.visible');
    cy.contains('@selinboutique via instagram').should('be.visible');
  });

  it('accepts WhatsApp as an order channel', () => {
    cy.mount(<OrderEntryForm />);

    cy.get('input[name="customerReference"]').type('+49 170 1234567');
    cy.get('select[name="channel"]').select('whatsapp');
    cy.get('input[name="itemDescription"]').type('Beige coat');

    cy.contains('button', 'Create order').click();

    cy.contains('Order ready').should('be.visible');
    cy.contains('+49 170 1234567 via whatsapp').should('be.visible');
  });
});