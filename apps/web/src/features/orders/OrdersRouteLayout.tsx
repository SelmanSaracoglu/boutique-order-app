import { Outlet } from 'react-router-dom';
import { OrdersDashboard } from './OrdersDashboard';

export function OrdersRouteLayout() {
  return (
    <>
      <OrdersDashboard />
      <Outlet />
    </>
  );
}