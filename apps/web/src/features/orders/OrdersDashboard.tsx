import {
  useEffect,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import {
  listOrders,
  type OrderStatus,
  type OrderSummary,
} from './ordersApi';
import './orders-dashboard.css';

type OrderFilter =
  | 'open'
  | 'all'
  | 'completed';

type LoadState =
  | 'loading'
  | 'ready'
  | 'error';

const statusLabels: Record<OrderStatus, string> = {
  NEW: 'New',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
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

function matchesFilter(
  order: OrderSummary,
  filter: OrderFilter,
) {
  if (filter === 'open') {
    return (
      order.status === 'NEW' ||
      order.status === 'IN_PROGRESS'
    );
  }

  if (filter === 'completed') {
    return order.status === 'COMPLETED';
  }

  return true;
}

function isToday(createdAt: string) {
  const createdDate = new Date(createdAt);
  const today = new Date();

  return (
    createdDate.getFullYear() ===
      today.getFullYear() &&
    createdDate.getMonth() ===
      today.getMonth() &&
    createdDate.getDate() ===
      today.getDate()
  );
}

export function OrdersDashboard() {
  const [orders, setOrders] = useState<
    OrderSummary[]
  >([]);
  const [filter, setFilter] =
    useState<OrderFilter>('open');
  const [loadState, setLoadState] =
    useState<LoadState>('loading');

  useEffect(() => {
  let isActive = true;

  void listOrders()
    .then((loadedOrders) => {
      if (!isActive) {
        return;
      }

      setOrders(loadedOrders);
      setLoadState('ready');
    })
    .catch(() => {
      if (isActive) {
        setLoadState('error');
      }
    });

  return () => {
    isActive = false;
  };
}, []);

async function retryLoadOrders() {
  setLoadState('loading');

  try {
    const loadedOrders = await listOrders();

    setOrders(loadedOrders);
    setLoadState('ready');
  } catch {
    setLoadState('error');
  }
}  

  const filteredOrders = orders.filter(
    (order) => matchesFilter(order, filter),
  );

  const openOrders = orders.filter(
    (order) =>
      order.status === 'NEW' ||
      order.status === 'IN_PROGRESS',
  ).length;

  const completedOrders = orders.filter(
    (order) => order.status === 'COMPLETED',
  ).length;

  const todaysOrders = orders.filter((order) =>
    isToday(order.createdAt),
  ).length;

  return (
    <main className="page">
      <div className="orders-dashboard">
        <header className="orders-dashboard__header">
          <div>
            <p className="orders-dashboard__eyebrow">
              Order management
            </p>
            <h1>Orders</h1>
            <p className="orders-dashboard__intro">
              Review and manage customer orders.
            </p>
          </div>

          <Link
            className="orders-dashboard__new-order"
            to="/orders/new"
          >
            New Order
          </Link>
        </header>

        {loadState === 'ready' && (
          <section
            className="orders-summary"
            aria-label="Order summary"
          >
            <article className="summary-card">
              <span>Open Orders</span>
              <strong>{openOrders}</strong>
            </article>

            <article className="summary-card">
              <span>Completed Orders</span>
              <strong>{completedOrders}</strong>
            </article>

            <article className="summary-card">
              <span>Today's Orders</span>
              <strong>{todaysOrders}</strong>
            </article>

            <article className="summary-card">
              <span>Total Orders</span>
              <strong>{orders.length}</strong>
            </article>
          </section>
        )}

        <section className="orders-panel">
          <div className="orders-panel__toolbar">
            <div
              className="orders-filters"
              aria-label="Order filters"
            >
              <button
                type="button"
                className={
                  filter === 'open'
                    ? 'orders-filter orders-filter--active'
                    : 'orders-filter'
                }
                aria-pressed={filter === 'open'}
                onClick={() => setFilter('open')}
              >
                Open
              </button>

              <button
                type="button"
                className={
                  filter === 'all'
                    ? 'orders-filter orders-filter--active'
                    : 'orders-filter'
                }
                aria-pressed={filter === 'all'}
                onClick={() => setFilter('all')}
              >
                All
              </button>

              <button
                type="button"
                className={
                  filter === 'completed'
                    ? 'orders-filter orders-filter--active'
                    : 'orders-filter'
                }
                aria-pressed={
                  filter === 'completed'
                }
                onClick={() =>
                  setFilter('completed')
                }
              >
                Completed
              </button>
            </div>
          </div>

          {loadState === 'loading' && (
            <div
              className="orders-state"
              role="status"
            >
              <strong>Loading orders...</strong>
              <span>
                Retrieving persisted order data.
              </span>
            </div>
          )}

          {loadState === 'error' && (
            <div
              className="orders-state orders-state--error"
              role="alert"
            >
              <strong>
                Orders could not be loaded.
              </strong>
              <span>
                Check the connection and try again.
              </span>
              <button
                type="button"
                className="orders-retry"
                onClick={() => void retryLoadOrders()}
              >
                Try again
              </button>
            </div>
          )}

          {loadState === 'ready' &&
            orders.length === 0 && (
              <div className="orders-state">
                <strong>No orders yet</strong>
                <span>
                  Create the first customer order
                  to get started.
                </span>
                <Link
                  className="orders-empty-action"
                  to="/orders/new"
                >
                  New Order
                </Link>
              </div>
            )}

          {loadState === 'ready' &&
            orders.length > 0 &&
            filteredOrders.length === 0 && (
              <div className="orders-state">
                <strong>
                  No orders in this view
                </strong>
                <span>
                  There are currently no orders
                  matching this filter.
                </span>
              </div>
            )}

          {loadState === 'ready' &&
            filteredOrders.length > 0 && (
              <div className="orders-list">
                <div className="orders-list__header">
                  <span>Order</span>
                  <span>Customer</span>
                  <span>Created</span>
                  <span>Total</span>
                  <span>Status</span>
                  <span>Actions</span>
                </div>

                {filteredOrders.map((order) => (
                  <article
                    key={order.id}
                    className="order-row"
                  >
                    <div className="order-row__number">
                      <span className="order-row__mobile-label">
                        Order
                      </span>
                      <strong>#{order.id}</strong>
                    </div>

                    <div className="order-row__customer">
                      <span className="order-row__mobile-label">
                        Customer
                      </span>
                      <strong>
                        {order.customerName ??
                          order.customerIdentifier}
                      </strong>

                      {order.customerName && (
                        <span>
                          {order.customerIdentifier}
                        </span>
                      )}
                    </div>

                    <div>
                      <span className="order-row__mobile-label">
                        Created
                      </span>
                      {dateTimeFormatter.format(
                        new Date(order.createdAt),
                      )}
                    </div>

                    <div>
                      <span className="order-row__mobile-label">
                        Total
                      </span>
                      <strong>
                        {currencyFormatter.format(
                          order.total,
                        )}
                      </strong>
                    </div>

                    <div>
                      <span className="order-row__mobile-label">
                        Status
                      </span>
                      <span
                        className={`order-status order-status--${order.status
                          .toLowerCase()
                          .replace('_', '-')}`}
                      >
                        {statusLabels[order.status]}
                      </span>
                    </div>

                    <div>
                      <span className="order-row__mobile-label">
                        Actions
                      </span>

                      <Link
                        className="order-row__view"
                        to={`/orders/${order.id}`}
                        state={{ fromDashboard: true }}
                      >
                        View
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
        </section>
      </div>
    </main>
  );
}