import { Route, Routes } from 'react-router-dom';
import { OrderEntryForm } from './features/order-entry/OrderEntryForm';
import { OrdersRouteLayout } from './features/orders/OrdersRouteLayout';

function App() {
  return (
    <Routes>
      <Route path="/" element={<OrdersRouteLayout />} />

      <Route
        path="/orders/new"
        element={
          <main className="page">
            <OrderEntryForm />
          </main>
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