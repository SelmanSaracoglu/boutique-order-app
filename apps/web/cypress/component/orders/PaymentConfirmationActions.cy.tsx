import { useState } from 'react';

import { AuthenticatedTestProvider } from '../../support/AuthenticatedTestProvider';
import type { UserRole } from '../../../src/features/auth/auth.types';
import { PaymentConfirmationActions } from '../../../src/features/orders/PaymentConfirmationActions';
import type {
    ConfirmPaymentResponse,
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
} from '../../../src/features/orders/ordersApi';

type PaymentConfirmationHarnessProps = {
    initialPaymentStatus?: PaymentStatus;
    initialPaymentMethod?: PaymentMethod | null;
    orderStatus?: OrderStatus;
    role?: UserRole;
    onPaymentConfirmed?: (
        payment: ConfirmPaymentResponse,
    ) => void;
    onReloadRequested?: () => void;
};

function PaymentConfirmationHarness({
    initialPaymentStatus = 'REPORTED',
    initialPaymentMethod = 'BANK_TRANSFER',
    orderStatus = 'NEW',
    role = 'PAYMENT_OPERATOR',
    onPaymentConfirmed = () => undefined,
    onReloadRequested = () => undefined,
}: PaymentConfirmationHarnessProps) {
    const [paymentStatus, setPaymentStatus] =
        useState<PaymentStatus>(initialPaymentStatus);

    const [paymentMethod, setPaymentMethod] =
        useState<PaymentMethod | null>(
            initialPaymentMethod,
        );

    return (
        <AuthenticatedTestProvider role={role}>
            <PaymentConfirmationActions
                orderId={101}
                orderStatus={orderStatus}
                paymentStatus={paymentStatus}
                paymentMethod={paymentMethod}
                onPaymentConfirmed={(payment) => {
                    setPaymentStatus(payment.paymentStatus);
                    setPaymentMethod(payment.paymentMethod);
                    onPaymentConfirmed(payment);
                }}
                onReloadRequested={onReloadRequested}
            />
        </AuthenticatedTestProvider>
    );
}

const forbiddenPaymentConfirmationRoles = [
    'ADMIN',
    'ORDER_OPERATOR',
    'FULFILLMENT_OPERATOR',
] satisfies readonly UserRole[];

describe('PaymentConfirmationActions', () => {
    it('confirms a reserved payment once and preserves its method', () => {
        const onPaymentConfirmed = cy
            .stub()
            .as('paymentConfirmed');

        cy.intercept(
            'POST',
            '**/api/orders/101/payment-confirmation',
            {
                statusCode: 200,
                delay: 200,
                body: {
                    id: 101,
                    paymentStatus: 'CONFIRMED',
                    paymentMethod: 'BANK_TRANSFER',
                },
            },
        ).as('confirmPayment');

        cy.mount(
            <PaymentConfirmationHarness
                onPaymentConfirmed={onPaymentConfirmed}
            />,
        );

        cy.contains('button', 'Confirm payment').click();

        cy.contains('button', 'Confirming...').should(
            'be.disabled',
        );

        cy.wait('@confirmPayment').then(({ request }) => {
            expect(request.headers).to.have.property(
                'x-csrf-token',
                'test-csrf-token',
            );
        });

        cy.get('@confirmPayment.all').should(
            'have.length',
            1,
        );

        cy.get('@paymentConfirmed').should(
            'have.been.calledOnceWith',
            {
                id: 101,
                paymentStatus: 'CONFIRMED',
                paymentMethod: 'BANK_TRANSFER',
            },
        );

        cy.contains('Payment confirmed.').should(
            'be.visible',
        );

        cy.contains('button', 'Confirm payment').should(
            'not.exist',
        );
    });

    for (const role of forbiddenPaymentConfirmationRoles) {
        it(`hides payment confirmation actions for ${role}`, () => {
            cy.mount(
                <PaymentConfirmationHarness role={role} />,
            );

            cy.get(
                '[aria-label="Payment confirmation actions"]',
            ).should('not.exist');

            cy.contains(
                'button',
                'Confirm payment',
            ).should('not.exist');
        });
    }

    const unavailablePaymentStates = [
        {
            name: 'awaiting payment',
            paymentStatus: 'AWAITING_PAYMENT' as const,
            paymentMethod: null,
        },
        {
            name: 'confirmed payment',
            paymentStatus: 'CONFIRMED' as const,
            paymentMethod: 'PAYPAL' as const,
        },
    ];

    for (const {
        name,
        paymentStatus,
        paymentMethod,
    } of unavailablePaymentStates) {
        it(`does not expose confirmation for ${name}`, () => {
            cy.mount(
                <PaymentConfirmationHarness
                    initialPaymentStatus={paymentStatus}
                    initialPaymentMethod={paymentMethod}
                />,
            );

            cy.get(
                '[aria-label="Payment confirmation actions"]',
            ).should('not.exist');
        });
    }

    for (const orderStatus of [
        'COMPLETED',
        'CANCELLED',
    ] as const) {
        it(`does not expose confirmation for a ${orderStatus} order`, () => {
            cy.mount(
                <PaymentConfirmationHarness
                    orderStatus={orderStatus}
                />,
            );

            cy.get(
                '[aria-label="Payment confirmation actions"]',
            ).should('not.exist');
        });
    }

    it('shows a controlled conflict and requests a reload', () => {
        const onReloadRequested = cy
            .stub()
            .as('reloadRequested');

        cy.intercept(
            'POST',
            '**/api/orders/101/payment-confirmation',
            {
                statusCode: 409,
                body: {
                    error: {
                        code: 'INVALID_PAYMENT_TRANSITION',
                        message:
                            'Payment cannot be confirmed for this order.',
                    },
                },
            },
        ).as('confirmPayment');

        cy.mount(
            <PaymentConfirmationHarness
                onReloadRequested={onReloadRequested}
            />,
        );

        cy.contains('button', 'Confirm payment').click();

        cy.wait('@confirmPayment');

        cy.contains(
            'Payment state changed before it could be confirmed.',
        ).should('be.visible');

        cy.contains('button', 'Confirm payment').should(
            'not.exist',
        );

        cy.contains('button', 'Reload order').click();

        cy.get('@reloadRequested').should(
            'have.been.calledOnce',
        );
    });

    it('keeps confirmation available after a recoverable error', () => {
        cy.intercept(
            'POST',
            '**/api/orders/101/payment-confirmation',
            {
                statusCode: 500,
                body: {
                    error: {
                        code: 'INTERNAL_ERROR',
                        message: 'Unable to confirm payment.',
                    },
                },
            },
        ).as('confirmPayment');

        cy.mount(<PaymentConfirmationHarness />);

        cy.contains('button', 'Confirm payment').click();

        cy.wait('@confirmPayment');

        cy.contains(
            'Payment could not be confirmed. Try again.',
        ).should('be.visible');

        cy.contains('button', 'Confirm payment').should(
            'be.enabled',
        );
    });
});