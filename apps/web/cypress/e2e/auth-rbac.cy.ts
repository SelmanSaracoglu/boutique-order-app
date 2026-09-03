import type {
  CreateOrderRequest,
  OrderDetail,
  OrderSummary,
  PersistedOrder,
} from '../../src/features/orders/ordersApi';
import { loginAs } from '../support/e2eAuth';

const forbiddenResponse = {
  error: {
    code: 'FORBIDDEN',
    message:
      'You do not have permission to perform this action.',
  },
};

describe('Authenticated order RBAC', () => {
  it('allows PAYMENT_OPERATOR to confirm reported payments while restricting order mutations', () => {
    const uniqueIdentifier =
      `@rbac-e2e-${Date.now()}`;

    const forbiddenIdentifier =
      `@forbidden-e2e-${Date.now()}`;

    const orderInput: CreateOrderRequest = {
      orderSource: 'instagram',
      customerIdentifier: uniqueIdentifier,
      customerName: 'RBAC E2E Customer',
      items: [
        {
          supplierAlias: 'rbac-supplier',
          description: 'RBAC Test Dress',
          quantity: 1,
          unitPrice: 35,
        },
      ],
    };

    loginAs('ORDER_OPERATOR').then(
      (orderOperatorSession) => {
        cy.request<PersistedOrder>({
          method: 'POST',
          url: '/api/orders',
          headers: {
            'x-csrf-token':
              orderOperatorSession.csrfToken,
          },
          body: orderInput,
        }).then(({ body: createdOrder }) => {
          expect(createdOrder.status).to.equal('NEW');

          cy.request({
            method: 'POST',
            url: `/api/orders/${createdOrder.id}/payment-report`,
            headers: {
              'x-csrf-token':
                orderOperatorSession.csrfToken,
            },
            body: {
              paymentMethod: 'BANK_TRANSFER',
            },
          })
            .its('body')
            .should('deep.include', {
              paymentStatus: 'REPORTED',
              paymentMethod: 'BANK_TRANSFER',
            });

          cy.contains(
            'button',
            'Sign out',
          ).click();

          cy.contains(
            'button',
            'Sign in',
          ).should('be.visible');

          loginAs('PAYMENT_OPERATOR').then(
            (paymentSession) => {
              cy.contains(
                'e2e.payment.operator',
              ).should('be.visible');

              cy.contains(
                'Payment operator',
              ).should('be.visible');

              cy.get(
                'a[href="/orders/new"]',
              ).should('not.exist');

              cy.contains(
                '[data-testid="order-row"]',
                uniqueIdentifier,
              )
                .should('be.visible')
                .within(() => {
                  cy.contains(
                    'a',
                    'View',
                  ).click();
                });

              cy.get(
                '[data-testid="order-detail-dialog"]',
              )
                .should('be.visible')
                .within(() => {
                  cy.contains(
                    uniqueIdentifier,
                  ).should('exist');

                  cy.get(
                    '[aria-label="Order lifecycle actions"]',
                  ).should('not.exist');

                  cy.contains(
                    'button',
                    'Confirm payment',
                  ).click();

                  cy.contains(
                    '[aria-label="Payment information"]',
                    'Confirmed',
                  ).should('exist');

                  cy.contains(
                    'button',
                    'Close',
                  ).click();
                });

              cy.location('pathname').should(
                'eq',
                '/',
              );

              cy.visit('/orders/new');

              cy.location('pathname').should(
                'eq',
                '/',
              );

              cy.get(
                'form',
              ).should('not.exist');

              cy.request({
                method: 'POST',
                url: '/api/orders',
                headers: {
                  'x-csrf-token':
                    paymentSession.csrfToken,
                },
                body: {
                  ...orderInput,
                  customerIdentifier:
                    forbiddenIdentifier,
                },
                failOnStatusCode: false,
              }).then((response) => {
                expect(response.status).to.equal(
                  403,
                );

                expect(response.body).to.deep.equal(
                  forbiddenResponse,
                );
              });

              cy.request({
                method: 'PATCH',
                url: `/api/orders/${createdOrder.id}/status`,
                headers: {
                  'x-csrf-token':
                    paymentSession.csrfToken,
                },
                body: {
                  status: 'IN_PROGRESS',
                },
                failOnStatusCode: false,
              }).then((response) => {
                expect(response.status).to.equal(
                  403,
                );

                expect(response.body).to.deep.equal(
                  forbiddenResponse,
                );
              });

              cy.request<OrderDetail>(
                `/api/orders/${createdOrder.id}`,
              ).then(({ body: order }) => {
                expect(order.status).to.equal('NEW');

                expect(order.paymentStatus).to.equal(
                  'CONFIRMED',
                );

                expect(order.paymentMethod).to.equal(
                  'BANK_TRANSFER',
                );
              });

              cy.request<OrderSummary[]>(
                '/api/orders',
              ).then(({ body: orders }) => {
                const customerIdentifiers =
                  orders.map(
                    (order) =>
                      order.customerIdentifier,
                  );

                expect(
                  customerIdentifiers,
                ).not.to.include(
                  forbiddenIdentifier,
                );
              });

              cy.contains(
                'button',
                'Sign out',
              ).click();

              cy.contains(
                'button',
                'Sign in',
              ).should('be.visible');
            },
          );
        });
      },
    );
  });
});