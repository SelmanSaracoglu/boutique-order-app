import { useState } from 'react';

import { useAuthenticatedSession } from '../auth/AuthContext';
import { hasPermission } from '../auth/permissions';
import {
  PaymentReportConflictError,
  reportPayment,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
  type ReportPaymentResponse,
} from './ordersApi';
import './payment-reporting-actions.css';

type PaymentMutationState =
  | 'idle'
  | 'pending'
  | 'success'
  | 'conflict'
  | 'error';

type PaymentReportingActionsProps = {
  orderId: number;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  onPaymentReported: (
    payment: ReportPaymentResponse,
  ) => void;
  onReloadRequested: () => void;
};

const terminalOrderStatuses: readonly OrderStatus[] = [
  'COMPLETED',
  'CANCELLED',
];

export function PaymentReportingActions({
  orderId,
  orderStatus,
  paymentStatus,
  paymentMethod,
  onPaymentReported,
  onReloadRequested,
}: PaymentReportingActionsProps) {
  const session = useAuthenticatedSession();

  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<PaymentMethod | ''>('');

  const [mutationState, setMutationState] =
    useState<PaymentMutationState>('idle');

  const hasReportPermission = hasPermission(
    session.user.role,
    'PAYMENT_REPORT',
  );

  const orderIsTerminal =
    terminalOrderStatuses.includes(orderStatus);

  const canReportPayment =
    hasReportPermission &&
    !orderIsTerminal &&
    paymentStatus === 'AWAITING_PAYMENT' &&
    paymentMethod === null;

  const actionsAreBlocked =
    mutationState === 'pending' ||
    mutationState === 'conflict';

  async function submitPaymentReport() {
    if (!selectedPaymentMethod) {
      return;
    }

    setMutationState('pending');

    try {
      const updatedPayment = await reportPayment(
        orderId,
        selectedPaymentMethod,
        session.csrfToken,
      );

      onPaymentReported(updatedPayment);
      setMutationState('success');
    } catch (error: unknown) {
      if (error instanceof PaymentReportConflictError) {
        setMutationState('conflict');
        return;
      }

      setMutationState('error');
    }
  }

  function reloadOrder() {
    setMutationState('idle');
    onReloadRequested();
  }

  if (
    !canReportPayment &&
    mutationState !== 'success'
  ) {
    return null;
  }

  return (
    <section
      className="payment-reporting"
      aria-label="Payment reporting actions"
    >
      {canReportPayment &&
        mutationState !== 'success' && (
          <>
            <div className="payment-reporting__header">
              <h3>Payment action</h3>

              <p>
                Record the customer&apos;s payment
                notification and reserve the order.
              </p>
            </div>

            <form
              className="payment-reporting__form"
              onSubmit={(event) => {
                event.preventDefault();
                void submitPaymentReport();
              }}
            >
              <label className="payment-reporting__field">
                <span>Payment method</span>

                <select
                  value={selectedPaymentMethod}
                  disabled={actionsAreBlocked}
                  onChange={(event) => {
                    setSelectedPaymentMethod(
                      event.target.value as
                      | PaymentMethod
                      | '',
                    );
                    setMutationState('idle');
                  }}
                >
                  <option value="">
                    Select payment method
                  </option>
                  <option value="BANK_TRANSFER">
                    Bank transfer
                  </option>
                  <option value="PAYPAL">
                    PayPal
                  </option>
                </select>
              </label>

              <button
                type="submit"
                className="payment-reporting__submit"
                disabled={
                  !selectedPaymentMethod ||
                  actionsAreBlocked
                }
              >
                {mutationState === 'pending'
                  ? 'Reporting...'
                  : 'Report payment'}
              </button>
            </form>
          </>
        )}

      {mutationState === 'success' && (
        <p
          className="payment-reporting__message payment-reporting__message--success"
          role="status"
        >
          Payment reported. Order is now reserved.
        </p>
      )}

      {mutationState === 'error' && (
        <p
          className="payment-reporting__message payment-reporting__message--error"
          role="alert"
        >
          Payment could not be reported. Try again.
        </p>
      )}

      {mutationState === 'conflict' && (
        <div
          className="payment-reporting__message payment-reporting__message--error"
          role="alert"
        >
          <span>
            The payment state changed before this
            action was completed.
          </span>

          <button
            type="button"
            className="payment-reporting__reload"
            onClick={reloadOrder}
          >
            Reload order
          </button>
        </div>
      )}
    </section>
  );
}