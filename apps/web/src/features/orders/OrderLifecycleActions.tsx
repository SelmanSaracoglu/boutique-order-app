import { useState } from 'react';
import { useAuthenticatedSession } from '../auth/AuthContext';
import { hasPermission } from '../auth/permissions';

import {
  OrderStatusConflictError,
  updateOrderStatus,
  type OrderStatus,
  type PaymentStatus,
  type UpdateOrderStatusResponse,
} from './ordersApi';
import './order-lifecycle-actions.css';

type StatusMutationState =
  | 'idle'
  | 'pending'
  | 'success'
  | 'conflict'
  | 'error';

type OrderLifecycleActionsProps = {
  orderId: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  onStatusUpdated: (
    updatedOrder: UpdateOrderStatusResponse,
  ) => void;
  onReloadRequested: () => void;
};

const statusLabels: Record<OrderStatus, string> = {
  NEW: 'New',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export function OrderLifecycleActions({
  orderId,
  status,
  paymentStatus,
  onStatusUpdated,
  onReloadRequested,
}: OrderLifecycleActionsProps) {

  const session = useAuthenticatedSession();

  const canUpdateOrderStatus = hasPermission(
    session.user.role,
    'ORDER_STATUS_UPDATE',
  );

  const [mutationState, setMutationState] =
    useState<StatusMutationState>('idle');

  const [
    isCancellationConfirmationOpen,
    setIsCancellationConfirmationOpen,
  ] = useState(false);

  const nextProgressStatus =
    status === 'NEW'
      ? 'IN_PROGRESS'
      : status === 'IN_PROGRESS'
        ? 'COMPLETED'
        : null;

  const canUseProgressAction =
    status !== 'NEW' || paymentStatus === 'CONFIRMED';

  const actionsAreBlocked =
    mutationState === 'pending' ||
    mutationState === 'conflict';

  async function changeStatus(nextStatus: OrderStatus) {
    setMutationState('pending');

    try {
      const updatedOrder = await updateOrderStatus(
        orderId,
        nextStatus,
        session.csrfToken,
      );

      setIsCancellationConfirmationOpen(false);
      onStatusUpdated(updatedOrder);
      setMutationState('success');
    } catch (error: unknown) {
      if (error instanceof OrderStatusConflictError) {
        setMutationState('conflict');
        return;
      }

      setMutationState('error');
    }
  }

  function openCancellationConfirmation() {
    setMutationState('idle');
    setIsCancellationConfirmationOpen(true);
  }

  function keepOrder() {
    setMutationState('idle');
    setIsCancellationConfirmationOpen(false);
  }

  function reloadOrder() {
    setMutationState('idle');
    setIsCancellationConfirmationOpen(false);
    onReloadRequested();
  }

  if (
    !canUpdateOrderStatus ||
    (!nextProgressStatus &&
      mutationState !== 'success')
  ) {
    return null;
  }

  return (
    <section
      className="order-lifecycle"
      aria-label="Order lifecycle actions"
    >
      {nextProgressStatus &&
        !isCancellationConfirmationOpen && (
          <div className="order-lifecycle__action-row">
            <div className="order-lifecycle__copy">
              <h3>Order actions</h3>

              <p>
                {status === 'NEW'
                  ? paymentStatus === 'CONFIRMED'
                    ? 'Move this order into active processing.'
                    : 'Processing becomes available after payment is confirmed.'
                  : 'Complete or cancel this active order.'}
              </p>
            </div>

            <div className="order-lifecycle__actions">
              <button
                type="button"
                className="order-lifecycle__secondary-action"
                disabled={actionsAreBlocked}
                onClick={openCancellationConfirmation}
              >
                Cancel order
              </button>

              {canUseProgressAction && (
                <button
                  type="button"
                  className="order-lifecycle__primary-action"
                  disabled={actionsAreBlocked}
                  onClick={() => {
                    void changeStatus(nextProgressStatus);
                  }}
                >
                  {mutationState === 'pending'
                    ? 'Updating...'
                    : status === 'NEW'
                      ? 'Start processing'
                      : 'Complete order'}
                </button>
              )}
            </div>
          </div>
        )}

      {nextProgressStatus &&
        isCancellationConfirmationOpen && (
          <div className="order-lifecycle__confirmation">
            <div>
              <h3>Cancel this order?</h3>

              <p>
                Cancellation is final and the order cannot
                return to an active status.
              </p>
            </div>

            <div className="order-lifecycle__actions">
              <button
                type="button"
                className="order-lifecycle__secondary-action"
                disabled={actionsAreBlocked}
                onClick={keepOrder}
              >
                Keep order
              </button>

              <button
                type="button"
                className="order-lifecycle__danger-action"
                disabled={actionsAreBlocked}
                onClick={() =>
                  void changeStatus('CANCELLED')
                }
              >
                {mutationState === 'pending'
                  ? 'Cancelling...'
                  : 'Confirm cancellation'}
              </button>
            </div>
          </div>
        )}

      {mutationState === 'success' && (
        <p
          className="order-lifecycle__message order-lifecycle__message--success"
          role="status"
        >
          Order status updated to {statusLabels[status]}.
        </p>
      )}

      {mutationState === 'error' && (
        <p
          className="order-lifecycle__message order-lifecycle__message--error"
          role="alert"
        >
          Order status could not be updated. Try again.
        </p>
      )}

      {mutationState === 'conflict' && (
        <div
          className="order-lifecycle__message order-lifecycle__message--error"
          role="alert"
        >
          <span>
            The order changed before this action was
            completed. Reload the order to continue.
          </span>

          <button
            type="button"
            className="order-lifecycle__reload"
            onClick={reloadOrder}
          >
            Reload order
          </button>
        </div>
      )}
    </section>
  );
}