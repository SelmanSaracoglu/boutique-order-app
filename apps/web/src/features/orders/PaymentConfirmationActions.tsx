import { useState } from 'react';

import { useAuthenticatedSession } from '../auth/AuthContext';
import { hasPermission } from '../auth/permissions';
import {
    confirmPayment,
    PaymentConfirmationConflictError,
    type ConfirmPaymentResponse,
    type OrderStatus,
    type PaymentMethod,
    type PaymentStatus,
} from './ordersApi';

import './payment-confirmation-actions.css';

type PaymentConfirmationState =
    | 'idle'
    | 'pending'
    | 'success'
    | 'conflict'
    | 'error';

type PaymentConfirmationActionsProps = {
    orderId: number;
    orderStatus: OrderStatus;
    paymentStatus: PaymentStatus;
    paymentMethod: PaymentMethod | null;
    onPaymentConfirmed: (
        payment: ConfirmPaymentResponse,
    ) => void;
    onReloadRequested: () => void;
};

const terminalOrderStatuses: readonly OrderStatus[] = [
    'COMPLETED',
    'CANCELLED',
];

export function PaymentConfirmationActions({
    orderId,
    orderStatus,
    paymentStatus,
    paymentMethod,
    onPaymentConfirmed,
    onReloadRequested,
}: PaymentConfirmationActionsProps) {
    const session = useAuthenticatedSession();

    const [confirmationState, setConfirmationState] =
        useState<PaymentConfirmationState>('idle');

    const hasConfirmPermission = hasPermission(
        session.user.role,
        'PAYMENT_CONFIRM',
    );

    const orderIsTerminal =
        terminalOrderStatuses.includes(orderStatus);

    const canConfirmPayment =
        hasConfirmPermission &&
        !orderIsTerminal &&
        paymentStatus === 'REPORTED' &&
        paymentMethod !== null;

    async function submitPaymentConfirmation() {
        setConfirmationState('pending');

        try {
            const updatedPayment = await confirmPayment(
                orderId,
                session.csrfToken,
            );

            onPaymentConfirmed(updatedPayment);
            setConfirmationState('success');
        } catch (error: unknown) {
            if (
                error instanceof PaymentConfirmationConflictError
            ) {
                setConfirmationState('conflict');
                return;
            }

            setConfirmationState('error');
        }
    }

    function reloadOrder() {
        setConfirmationState('idle');
        onReloadRequested();
    }

    if (
        !canConfirmPayment &&
        confirmationState !== 'success'
    ) {
        return null;
    }

    return (
        <section
            className="payment-confirmation"
            aria-label="Payment confirmation actions"
        >
            {canConfirmPayment &&
                confirmationState !== 'success' &&
                confirmationState !== 'conflict' && (
                    <>
                        <div className="payment-confirmation__header">
                            <h3>Payment confirmation</h3>

                            <p>
                                Confirm that the reported payment has been
                                received.
                            </p>
                        </div>

                        <button
                            type="button"
                            className="payment-confirmation__submit"
                            disabled={confirmationState === 'pending'}
                            onClick={() => {
                                void submitPaymentConfirmation();
                            }}
                        >
                            {confirmationState === 'pending'
                                ? 'Confirming...'
                                : 'Confirm payment'}
                        </button>
                    </>
                )}

            {confirmationState === 'success' && (
                <p
                    className="payment-confirmation__message payment-confirmation__message--success"
                    role="status"
                >
                    Payment confirmed.
                </p>
            )}

            {confirmationState === 'error' && (
                <p
                    className="payment-confirmation__message payment-confirmation__message--error"
                    role="alert"
                >
                    Payment could not be confirmed. Try again.
                </p>
            )}

            {confirmationState === 'conflict' && (
                <div
                    className="payment-confirmation__message payment-confirmation__message--error"
                    role="alert"
                >
                    <span>
                        Payment state changed before it could be
                        confirmed.
                    </span>

                    <button
                        type="button"
                        className="payment-confirmation__reload"
                        onClick={reloadOrder}
                    >
                        Reload order
                    </button>
                </div>
            )}
        </section>
    );
}