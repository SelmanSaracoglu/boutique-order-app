import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import { Outlet } from 'react-router-dom';
import {
  OrdersDashboard,
  type OrdersLoadState,
} from './OrdersDashboard';
import {
  listOrders,
  type OrderSummary,
  type UpdateOrderStatusResponse,
  type PaymentUpdateResponse,
} from './ordersApi';

export type OrdersOutletContext = {
  onOrderStatusUpdated: (
    updatedOrder: UpdateOrderStatusResponse,
  ) => void;
  onPaymentUpdated: (
    updatedPayment: PaymentUpdateResponse,
  ) => void;
};

export function OrdersRouteLayout() {
  const [orders, setOrders] = useState<
    OrderSummary[]
  >([]);
  const [loadState, setLoadState] =
    useState<OrdersLoadState>('loading');

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

  const handleOrderStatusUpdated = useCallback(
    (updatedOrder: UpdateOrderStatusResponse) => {
      setOrders((currentOrders) =>
        currentOrders.map((order) =>
          order.id === updatedOrder.id
            ? {
              ...order,
              status: updatedOrder.status,
            }
            : order,
        ),
      );
    },
    [],
  );

  const handlePaymentUpdated = useCallback(
    (updatedPayment: PaymentUpdateResponse) => {
      setOrders((currentOrders) =>
        currentOrders.map((order) =>
          order.id === updatedPayment.id
            ? {
              ...order,
              paymentStatus:
                updatedPayment.paymentStatus,
              paymentMethod:
                updatedPayment.paymentMethod,
            }
            : order,
        ),
      );
    },
    [],
  );

  return (
    <>
      <OrdersDashboard
        orders={orders}
        loadState={loadState}
        onRetryLoadOrders={retryLoadOrders}
      />

      <Outlet
        context={{
          onOrderStatusUpdated:
            handleOrderStatusUpdated,
          onPaymentUpdated:
            handlePaymentUpdated,
        } satisfies OrdersOutletContext}
      />
    </>
  );
}