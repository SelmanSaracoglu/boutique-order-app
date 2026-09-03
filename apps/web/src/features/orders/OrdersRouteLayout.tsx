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
  type ReportPaymentResponse,
} from './ordersApi';

export type OrdersOutletContext = {
  onOrderStatusUpdated: (
    updatedOrder: UpdateOrderStatusResponse,
  ) => void;
  onPaymentReported: (
    reportedPayment: ReportPaymentResponse,
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

  const handlePaymentReported = useCallback(
    (updatedPayment: ReportPaymentResponse) => {
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
          onPaymentReported:
            handlePaymentReported,
        } satisfies OrdersOutletContext}
      />
    </>
  );
}