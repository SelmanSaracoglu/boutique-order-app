import { useState } from 'react';

import { AuthenticatedTestProvider } from '../../support/AuthenticatedTestProvider';
import { PaymentReportingActions } from '../../../src/features/orders/PaymentReportingActions';
import type {
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
} from '../../../src/features/orders/ordersApi';

import type { UserRole } from '../../../src/features/auth/auth.types';

type ReportedPayment = {
    id: number;
    paymentStatus: PaymentStatus;
    paymentMethod: PaymentMethod;
};

type PaymentReportingHarnessProps = {
    initialPaymentStatus?: PaymentStatus;
    initialPaymentMethod?: PaymentMethod | null;
    orderStatus?: OrderStatus;
    role?: UserRole;
    onPaymentReported?: (
        payment: ReportedPayment,
    ) => void;
};

function PaymentReportingHarness({
    initialPaymentStatus = 'AWAITING_PAYMENT',
    initialPaymentMethod = null,
    orderStatus = 'NEW',
    role = 'ORDER_OPERATOR',
    onPaymentReported = () => undefined,
}: PaymentReportingHarnessProps) {
    const [paymentStatus, setPaymentStatus] =
        useState<PaymentStatus>(
            initialPaymentStatus,
        );

    const [paymentMethod, setPaymentMethod] =
        useState<PaymentMethod | null>(
            initialPaymentMethod,
        );

    return (
        <AuthenticatedTestProvider role={role}>
            <PaymentReportingActions
                orderId={101}
                orderStatus={orderStatus}
                paymentStatus={paymentStatus}
                paymentMethod={paymentMethod}
                onPaymentReported={(payment) => {
                    setPaymentStatus(payment.paymentStatus);
                    setPaymentMethod(payment.paymentMethod);
                    onPaymentReported(payment);
                }}
                onReloadRequested={() => undefined}
            />
        </AuthenticatedTestProvider>
    );
}
const forbiddenPaymentReportRoles = [
    'ADMIN',
    'PAYMENT_OPERATOR',
    'FULFILLMENT_OPERATOR',
] satisfies readonly UserRole[];

describe('PaymentReportingActions', () => {
    it('reports the selected payment method once and exposes the reserved state', () => {
        const onPaymentReported = cy
            .stub()
            .as('paymentReported');

        cy.intercept(
            'POST',
            '**/api/orders/101/payment-report',
            {
                statusCode: 200,
                delay: 200,
                body: {
                    id: 101,
                    paymentStatus: 'REPORTED',
                    paymentMethod: 'BANK_TRANSFER',
                },
            },
        ).as('reportPayment');

        cy.mount(
            <PaymentReportingHarness
                onPaymentReported={onPaymentReported}
            />,
        );

        cy.contains('Payment').should('be.visible');

        cy.contains('button', 'Report payment').should(
            'be.disabled',
        );

        cy.contains('label', 'Payment method')
            .find('select')
            .select('BANK_TRANSFER');

        cy.contains('button', 'Report payment').click();

        cy.contains('button', 'Reporting...').should(
            'be.disabled',
        );

        cy.wait('@reportPayment').then(({ request }) => {
            expect(request.headers).to.have.property(
                'x-csrf-token',
                'test-csrf-token',
            );

            expect(request.body).to.deep.equal({
                paymentMethod: 'BANK_TRANSFER',
            });
        });

        cy.get('@reportPayment.all').should(
            'have.length',
            1,
        );

        cy.get('@paymentReported').should(
            'have.been.calledOnceWith',
            {
                id: 101,
                paymentStatus: 'REPORTED',
                paymentMethod: 'BANK_TRANSFER',
            },
        );

        cy.contains(
            'Payment reported. Order is now reserved.',
        ).should('be.visible');

        cy.contains('button', 'Report payment').should(
            'not.exist',
        );
    });

    for (const role of forbiddenPaymentReportRoles) {
        it(`hides payment reporting actions for ${role}`, () => {
            cy.mount(
                <PaymentReportingHarness role={role}
            />,
            );

            cy.get(
                '[aria-label="Payment reporting actions"]',
            ).should('not.exist');

            cy.contains(
                'button',
                'Report payment',
            ).should('not.exist');
        });
    }

    const terminalOrderStatuses = [
        'COMPLETED',
        'CANCELLED',
    ] as const;

    for (const orderStatus of terminalOrderStatuses) {
        it(`does not expose payment reporting for a ${orderStatus} order`, () => {
            cy.mount(
                <PaymentReportingHarness
                    orderStatus={orderStatus}
                />,
            );

            cy.get(
                '[aria-label="Payment reporting actions"]',
            ).should('not.exist');
        });
    }

    it('does not expose reporting after payment has already been reported', () => {
        cy.mount(
            <PaymentReportingHarness
                initialPaymentStatus="REPORTED"
                initialPaymentMethod="PAYPAL"
            />,
        );

        cy.get(
            '[aria-label="Payment reporting actions"]',
        ).should('not.exist');

        cy.contains(
            'button',
            'Report payment',
        ).should('not.exist');
    });
});