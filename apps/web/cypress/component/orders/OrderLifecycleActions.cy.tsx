import { useState } from 'react';

import { OrderLifecycleActions } from '../../../src/features/orders/OrderLifecycleActions';
import type {
  OrderStatus,
  UpdateOrderStatusResponse,
} from '../../../src/features/orders/ordersApi';

type LifecycleHarnessProps = {
  initialStatus: OrderStatus;
  onStatusUpdated?: (
    updatedOrder: UpdateOrderStatusResponse,
  ) => void;
  onReloadRequested?: () => void;
};

function LifecycleHarness({
  initialStatus,
  onStatusUpdated = () => undefined,
  onReloadRequested = () => undefined,
}: LifecycleHarnessProps) {
  const [status, setStatus] =
    useState(initialStatus);

  return (
    <OrderLifecycleActions
      orderId={101}
      status={status}
      onStatusUpdated={(updatedOrder) => {
        setStatus(updatedOrder.status);
        onStatusUpdated(updatedOrder);
      }}
      onReloadRequested={onReloadRequested}
    />
  );
}

describe('OrderLifecycleActions', () => {
  it('starts processing once and exposes the next valid action', () => {
    const onStatusUpdated = cy
      .stub()
      .as('statusUpdated');

    cy.intercept(
      'PATCH',
      '**/api/orders/101/status',
      {
        statusCode: 200,
        delay: 200,
        body: {
          id: 101,
          status: 'IN_PROGRESS',
        },
      },
    ).as('updateStatus');

    cy.mount(
      <LifecycleHarness
        initialStatus="NEW"
        onStatusUpdated={onStatusUpdated}
      />,
    );

    cy.contains('button', 'Start processing').click();

    cy.contains('button', 'Updating...').should(
      'be.disabled',
    );

    cy.wait('@updateStatus')
      .its('request.body')
      .should('deep.equal', {
        status: 'IN_PROGRESS',
      });

    cy.get('@updateStatus.all').should(
      'have.length',
      1,
    );

    cy.get('@statusUpdated').should(
      'have.been.calledOnceWith',
      {
        id: 101,
        status: 'IN_PROGRESS',
      },
    );

    cy.contains('button', 'Complete order').should(
      'be.visible',
    );

    cy.contains(
      'Order status updated to In progress.',
    ).should('be.visible');
  });

  it('completes an order that is already in progress', () => {
    cy.intercept(
      'PATCH',
      '**/api/orders/101/status',
      {
        statusCode: 200,
        body: {
          id: 101,
          status: 'COMPLETED',
        },
      },
    ).as('updateStatus');

    cy.mount(
      <LifecycleHarness initialStatus="IN_PROGRESS" />,
    );

    cy.contains('button', 'Complete order').click();

    cy.wait('@updateStatus')
      .its('request.body')
      .should('deep.equal', {
        status: 'COMPLETED',
      });

    cy.contains(
      'Order status updated to Completed.',
    ).should('be.visible');

    cy.contains('button', 'Complete order').should(
      'not.exist',
    );
  });

  it('does not cancel until confirmation is given', () => {
    cy.intercept(
      'PATCH',
      '**/api/orders/101/status',
      {
        statusCode: 200,
        body: {
          id: 101,
          status: 'CANCELLED',
        },
      },
    ).as('updateStatus');

    cy.mount(
      <LifecycleHarness initialStatus="NEW" />,
    );

    cy.contains('button', 'Cancel order').click();

    cy.contains('Cancel this order?').should(
      'be.visible',
    );

    cy.get('@updateStatus.all').should(
      'have.length',
      0,
    );

    cy.contains('button', 'Keep order').click();

    cy.contains('Cancel this order?').should(
      'not.exist',
    );

    cy.contains('button', 'Start processing').should(
      'be.visible',
    );

    cy.get('@updateStatus.all').should(
      'have.length',
      0,
    );
  });

  it('cancels only after explicit confirmation', () => {
    cy.intercept(
      'PATCH',
      '**/api/orders/101/status',
      {
        statusCode: 200,
        body: {
          id: 101,
          status: 'CANCELLED',
        },
      },
    ).as('updateStatus');

    cy.mount(
      <LifecycleHarness initialStatus="IN_PROGRESS" />,
    );

    cy.contains('button', 'Cancel order').click();

    cy.contains(
      'button',
      'Confirm cancellation',
    ).click();

    cy.wait('@updateStatus')
      .its('request.body')
      .should('deep.equal', {
        status: 'CANCELLED',
      });

    cy.contains(
      'Order status updated to Cancelled.',
    ).should('be.visible');

    cy.contains('button', 'Cancel order').should(
      'not.exist',
    );
  });

  it('keeps the current action available after a controlled failure', () => {
    let requestCount = 0;

    cy.intercept(
      'PATCH',
      '**/api/orders/101/status',
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
          body: {
            id: 101,
            status: 'IN_PROGRESS',
          },
        });
      },
    ).as('updateStatus');

    cy.mount(
      <LifecycleHarness initialStatus="NEW" />,
    );

    cy.contains('button', 'Start processing').click();
    cy.wait('@updateStatus');

    cy.contains(
      'Order status could not be updated. Try again.',
    ).should('be.visible');

    cy.contains('button', 'Start processing')
      .should('be.enabled')
      .click();

    cy.wait('@updateStatus');

    cy.get('@updateStatus.all').should(
        'have.length', 
        2,
    );

    cy.contains(
      'Order status updated to In progress.',
    ).should('be.visible');
  });

  it('requires a reload after a status conflict', () => {
    const onReloadRequested = cy
      .stub()
      .as('reloadRequested');

    cy.intercept(
      'PATCH',
      '**/api/orders/101/status',
      {
        statusCode: 409,
        body: {
          error: {
            code: 'INVALID_STATUS_TRANSITION',
          },
        },
      },
    ).as('updateStatus');

    cy.mount(
      <LifecycleHarness
        initialStatus="NEW"
        onReloadRequested={onReloadRequested}
      />,
    );

    cy.contains('button', 'Start processing').click();
    cy.wait('@updateStatus');

    cy.contains(
      'The order changed before this action was completed.',
    ).should('be.visible');

    cy.contains('button', 'Start processing').should(
      'be.disabled',
    );

    cy.contains('button', 'Reload order').click();

    cy.get('@reloadRequested').should(
      'have.been.calledOnce',
    );
  });

  it('does not expose actions for terminal statuses', () => {
    cy.mount(
      <>
        <LifecycleHarness initialStatus="COMPLETED" />
        <LifecycleHarness initialStatus="CANCELLED" />
      </>,
    );

    cy.get(
      '[aria-label="Order lifecycle actions"]',
    ).should('not.exist');
  });
});