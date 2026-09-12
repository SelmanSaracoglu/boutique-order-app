import { Route, Routes } from 'react-router-dom';
import {
  AuditLogForbiddenPage,
  AuditLogPage,
} from './features/audit/AuditLogPage';
import { RequirePermission } from './features/auth/RequirePermission';
import { OrderEntryForm } from './features/order-entry/OrderEntryForm';
import { OrderDetailDialog } from './features/orders/OrderDetailDialog';
import { OrdersRouteLayout } from './features/orders/OrdersRouteLayout';

function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={<OrdersRouteLayout />}
      >
        <Route
          path="orders/:orderId"
          element={<OrderDetailDialog />}
        />
      </Route>

      <Route
        path="/orders/new"
        element={
          <RequirePermission permission="ORDER_CREATE">
            <main className="page">
              <OrderEntryForm />
            </main>
          </RequirePermission>
        }
      />

      <Route
        path="/audit"
        element={
          <RequirePermission
            permission="AUDIT_READ"
            fallback={
              <AuditLogForbiddenPage />
            }
          >
            <AuditLogPage />
          </RequirePermission>
        }
      />

      <Route
        path="*"
        element={
          <main className="page">
            <h1>Page not found</h1>
          </main>
        }
      />
    </Routes>
  );
}

export default App;