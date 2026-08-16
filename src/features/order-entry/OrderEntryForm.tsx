import { useState, type FormEvent } from 'react';

import { CustomerSourceFields } from './CustomerSourceFields';
import { OrderDetailsFields } from './OrderDetailsFields';
import { OrderItemsSection } from './OrderItemsSection';

import type {
  OrderEntryData,
  OrderEntryErrors,
  OrderEntryFormValues,
  OrderItemFormValues,
} from './orderEntry.types';

import { validateOrderEntry } from './orderEntry.validation';

function createEmptyOrderItem(): OrderItemFormValues {
  return {
    supplierAlias: '',
    description: '',
    size: '',
    color: '',
    quantity: '1',
    unitPrice: '',
  };
}

const initialOrderEntry: OrderEntryFormValues = {
  orderSource: '',
  customerIdentifier: '',
  customerName: '',
  operationalNote: '',
  items: [createEmptyOrderItem()],
};

export function OrderEntryForm() {
  const [orderEntry, setOrderEntry] =
    useState<OrderEntryFormValues>(initialOrderEntry);

  const [errors, setErrors] =
    useState<OrderEntryErrors>({});

  const [submittedOrder, setSubmittedOrder] =
    useState<OrderEntryData | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = validateOrderEntry(orderEntry);

    if (!result.success) {
      setErrors(result.errors);
      setSubmittedOrder(null);
      return;
    }

    setErrors({});
    setSubmittedOrder(result.data);
  }

  function updateOrderItem(
    index: number,
    field: keyof OrderItemFormValues,
    value: string,
  ) {
    setOrderEntry((currentOrderEntry) => ({
      ...currentOrderEntry,
      items: currentOrderEntry.items.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: value,
            }
          : item,
      ),
    }));
  }

  function addOrderItem() {
    setOrderEntry((currentOrderEntry) => ({
      ...currentOrderEntry,
      items: [
        ...currentOrderEntry.items,
        createEmptyOrderItem(),
      ],
    }));
  }

  function removeOrderItem(index: number) {
    setOrderEntry((currentOrderEntry) => {
      if (currentOrderEntry.items.length === 1) {
        return currentOrderEntry;
      }

      return {
        ...currentOrderEntry,
        items: currentOrderEntry.items.filter(
          (_, itemIndex) => itemIndex !== index,
        ),
      };
    });
  }

  return (
    <section className="order-entry">
      <header className="order-entry__header">
        <p className="eyebrow">Boutique Orders</p>

        <h1>New Order</h1>

        <p className="intro">
          Capture a manually received Instagram or WhatsApp order.
        </p>
      </header>

      <form
        className="order-form"
        onSubmit={handleSubmit}
        noValidate
      >
        <CustomerSourceFields
          orderSource={orderEntry.orderSource}
          customerIdentifier={orderEntry.customerIdentifier}
          customerName={orderEntry.customerName}
          errors={errors}
          onOrderSourceChange={(value) =>
            setOrderEntry((current) => ({
              ...current,
              orderSource: value,
            }))
          }
          onCustomerIdentifierChange={(value) =>
            setOrderEntry((current) => ({
              ...current,
              customerIdentifier: value,
            }))
          }
          onCustomerNameChange={(value) =>
            setOrderEntry((current) => ({
              ...current,
              customerName: value,
            }))
          }
        />

        <OrderDetailsFields
          operationalNote={orderEntry.operationalNote}
          onOperationalNoteChange={(value) =>
            setOrderEntry((current) => ({
              ...current,
              operationalNote: value,
            }))
          }
        />

        <OrderItemsSection
          items={orderEntry.items}
          errors={errors.items}
          itemsMessage={errors.itemsMessage}
          onItemChange={updateOrderItem}
          onAddItem={addOrderItem}
          onRemoveItem={removeOrderItem}
        />

        <button type="submit">
          Create order
        </button>
      </form>

      {submittedOrder && (
        <section
          className="submission-result"
          aria-live="polite"
        >
          <h2>Order ready</h2>

          <ul>
            {submittedOrder.items.map((item, index) => (
              <li key={index}>
                {item.supplierAlias} — {item.description}
                {item.size ? `, ${item.size}` : ''}
                {item.color ? `, ${item.color}` : ''} × {item.quantity} — €
                {item.unitPrice.toFixed(2)} each
              </li>
            ))}
          </ul>

          <p>
            Source:{' '}
            {submittedOrder.orderSource === 'instagram'
              ? 'Instagram'
              : 'WhatsApp'}
          </p>

          <p>
            Customer identifier: {submittedOrder.customerIdentifier}
          </p>

          {submittedOrder.customerName && (
            <p>Customer name: {submittedOrder.customerName}</p>
          )}

          <p>
            Created: {new Date(submittedOrder.createdAt).toLocaleString()}
          </p>


        </section>
      )}
    </section>
  );
}