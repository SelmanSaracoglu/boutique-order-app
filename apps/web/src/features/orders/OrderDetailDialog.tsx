import { useEffect, useRef, useState } from 'react';
import {
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from 'react-router-dom';

import { OrderLifecycleActions } from './OrderLifecycleActions';
import type { OrdersOutletContext } from './OrdersRouteLayout';
import {
  getOrder,
  OrderNotFoundError,
  type OrderDetail,
  type OrderStatus,
  type UpdateOrderStatusResponse,
} from './ordersApi';
import './order-detail-dialog.css';

type DetailLoadState =
  | 'loading'
  | 'ready'
  | 'not-found'
  | 'error';

type OrderDetailLocationState = {
  fromDashboard?: boolean;
};

const statusLabels: Record<OrderStatus, string> = {
  NEW: 'New',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const orderSourceLabels = {
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
};

const currencyFormatter = new Intl.NumberFormat(
  undefined,
  {
    style: 'currency',
    currency: 'EUR',
  },
);

const dateTimeFormatter = new Intl.DateTimeFormat(
  undefined,
  {
    dateStyle: 'medium',
    timeStyle: 'short',
  },
);

export function OrderDetailDialog() {
  const { orderId: orderIdParam } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const { onOrderStatusUpdated } =
  useOutletContext<OrdersOutletContext>();

  const dialogRef =
    useRef<HTMLDialogElement>(null);

  const previousFocusRef =
    useRef<HTMLElement | null>(null);

  const [order, setOrder] =
    useState<OrderDetail | null>(null);

  const [loadState, setLoadState] =
    useState<DetailLoadState>('loading');

  const [retryToken, setRetryToken] =
    useState(0);

  const orderId = Number(orderIdParam);

  const hasValidOrderId =
    Number.isInteger(orderId) && orderId > 0;

  const locationState =
    location.state as OrderDetailLocationState | null;

  const openedFromDashboard =
    locationState?.fromDashboard === true;

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
    ) {
      previousFocusRef.current =
        document.activeElement;
    }

    if (!dialog.open) {
      dialog.showModal();
    }

    return () => {
      if (dialog.open) {
        dialog.close();
      }

      if (previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus();
      }
    };
  }, []);

  useEffect(() => {
    if (!hasValidOrderId) {
      return;
    }

    let isActive = true;

    void getOrder(orderId)
      .then((loadedOrder) => {
        if (!isActive) {
          return;
        }

        setOrder(loadedOrder);
        setLoadState('ready');
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        if (error instanceof OrderNotFoundError) {
          setLoadState('not-found');
          return;
        }

        setLoadState('error');
      });

    return () => {
      isActive = false;
    };
  }, [
    hasValidOrderId,
    orderId,
    retryToken,
  ]);

  function closeDetail() {
    if (openedFromDashboard) {
      navigate(-1);
      return;
    }

    navigate('/', {
      replace: true,
    });
  }

  function reloadOrder() {
    setLoadState('loading');
    setOrder(null);
    setRetryToken((current) => current + 1);
  }

  function handleOrderStatusUpdated(
    updatedOrder: UpdateOrderStatusResponse,
  ) {
    setOrder((currentOrder) =>
      currentOrder
        ? {
            ...currentOrder,
            status: updatedOrder.status,
          }
        : currentOrder,
    );

    onOrderStatusUpdated(updatedOrder);
  }

  return (
    <dialog
      ref={dialogRef}
      className="order-detail-dialog"
      data-testid="order-detail-dialog"
      aria-labelledby="order-detail-title"
      onCancel={(event) => {
        event.preventDefault();
        closeDetail();
      }}
    >
      <div className="order-detail">
        <header className="order-detail__header">
          <div>
            <p className="order-detail__eyebrow">
              Order detail
            </p>

            <h2 id="order-detail-title">
              {order
                ? `Order #${order.id}`
                : 'Order detail'}
            </h2>
          </div>

          <button
            type="button"
            className="order-detail__close"
            onClick={closeDetail}
            autoFocus
          >
            Close
          </button>
        </header>

        {!hasValidOrderId && (
          <div
            className="order-detail__state"
            role="alert"
          >
            <strong>Invalid order ID</strong>
            <span>
              The requested order ID is not valid.
            </span>
          </div>
        )}

        {hasValidOrderId &&
          loadState === 'loading' && (
            <div
              className="order-detail__state"
              role="status"
            >
              <strong>Loading order...</strong>
              <span>
                Retrieving persisted order details.
              </span>
            </div>
          )}

        {hasValidOrderId &&
          loadState === 'not-found' && (
            <div
              className="order-detail__state"
              role="alert"
            >
              <strong>Order not found</strong>
              <span>
                The requested order does not exist.
              </span>
            </div>
          )}

        {hasValidOrderId &&
          loadState === 'error' && (
            <div
              className="order-detail__state"
              role="alert"
            >
              <strong>
                Order could not be loaded.
              </strong>

              <span>
                Check the connection and try again.
              </span>

              <button
                type="button"
                className="order-detail__retry"
                onClick={ reloadOrder }
              >
                Try again
              </button>
            </div>
          )}

        {hasValidOrderId &&
          loadState === 'ready' &&
          order && (
            <div className="order-detail__body">
              <section
                className="order-detail__summary"
                aria-label="Order information"
              >
                <div>
                  <span>Status</span>
                  <strong>
                    {statusLabels[order.status]}
                  </strong>
                </div>

                <div>
                  <span>Created</span>
                  <strong>
                    {dateTimeFormatter.format(
                      new Date(order.createdAt),
                    )}
                  </strong>
                </div>

                <div>
                  <span>Source</span>
                  <strong>
                    {
                      orderSourceLabels[
                        order.orderSource
                      ]
                    }
                  </strong>
                </div>

                <div>
                  <span>Total</span>
                  <strong>
                    {currencyFormatter.format(
                      order.total,
                    )}
                  </strong>
                </div>
              </section>

              <OrderLifecycleActions
                  orderId={order.id}
                  status={order.status}
                  onStatusUpdated={handleOrderStatusUpdated}
                  onReloadRequested={reloadOrder}
                />

              <section className="order-detail__section">
                <h3>Customer</h3>

                <dl className="order-detail__fields">
                  {order.customerName && (
                    <>
                      <dt>Name</dt>
                      <dd>{order.customerName}</dd>
                    </>
                  )}

                  <dt>Identifier</dt>
                  <dd>
                    {order.customerIdentifier}
                  </dd>

                  {order.operationalNote && (
                    <>
                      <dt>Operational note</dt>
                      <dd>
                        {order.operationalNote}
                      </dd>
                    </>
                  )}
                </dl>
              </section>

              <section className="order-detail__section">
                <h3>Items</h3>

                <div className="order-detail__items">
                  {order.items.map((item) => (
                    <article
                      key={item.id}
                      className="order-detail__item"
                    >
                      <div className="order-detail__item-header">
                        <strong>
                          {item.description}
                        </strong>

                        <span>
                          {currencyFormatter.format(
                            item.unitPrice,
                          )}
                        </span>
                      </div>

                      <dl className="order-detail__fields">
                        <dt>Supplier</dt>
                        <dd>
                          {item.supplierAlias}
                        </dd>

                        {item.size && (
                          <>
                            <dt>Size</dt>
                            <dd>{item.size}</dd>
                          </>
                        )}

                        {item.color && (
                          <>
                            <dt>Color</dt>
                            <dd>{item.color}</dd>
                          </>
                        )}

                        <dt>Quantity</dt>
                        <dd>{item.quantity}</dd>

                        <dt>Unit price</dt>
                        <dd>
                          {currencyFormatter.format(
                            item.unitPrice,
                          )}
                        </dd>
                      </dl>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          )}
      </div>
    </dialog>
  );
}