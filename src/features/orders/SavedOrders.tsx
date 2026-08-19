import { useState } from 'react';

import type { PersistedOrder } from './orderStorage';

type SavedOrdersProps = {
  orders: PersistedOrder[];
  loadError: string | null;
};

export function SavedOrders({
  orders,
  loadError,
}: SavedOrdersProps) {
  const [selectedOrderId, setSelectedOrderId] =
    useState<string | null>(null);

  const selectedOrder = orders.find(
    (order) => order.id === selectedOrderId,
  );

  if (loadError) {
    return (
      <section>
        <h2>Saved orders</h2>
        <p role="alert">{loadError}</p>
      </section>
    );
  }

  return (
    <section>
      <h2>Saved orders</h2>

      {orders.length === 0 ? (
        <p>No saved orders yet.</p>
      ) : (
        <ul>
          {orders.map((order) => (
            <li key={order.id}>
              <strong>{order.customerIdentifier}</strong>{' '}
              — {order.orderSource === 'instagram'
                ? 'Instagram'
                : 'WhatsApp'}

              <button
                type="button"
                onClick={() => setSelectedOrderId(order.id)}
              >
                Open order
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedOrder && (
        <article>
          <h3>Order details</h3>

          <p>
            Source:{' '}
            {selectedOrder.orderSource === 'instagram'
              ? 'Instagram'
              : 'WhatsApp'}
          </p>

          <p>
            Customer identifier: {selectedOrder.customerIdentifier}
          </p>

          {selectedOrder.customerName && (
            <p>Customer name: {selectedOrder.customerName}</p>
          )}

          <p>
            Created:{' '}
            {new Date(selectedOrder.createdAt).toLocaleString()}
          </p>

          {selectedOrder.operationalNote && (
            <p>
              Operational note: {selectedOrder.operationalNote}
            </p>
          )}

          <h4>Items</h4>

          <ul>
            {selectedOrder.items.map((item, index) => (
              <li key={`${selectedOrder.id}-${index}`}>
                {item.supplierAlias} — {item.description}
                {item.size ? `, ${item.size}` : ''}
                {item.color ? `, ${item.color}` : ''} ×{' '}
                {item.quantity} — €{item.unitPrice.toFixed(2)} each
              </li>
            ))}
          </ul>
        </article>
      )}
    </section>
  );
}