import { useState, type FormEvent } from 'react';

import { CustomerContactFields } from './CustomerContactFields';
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
  };
}

const initialOrderEntry: OrderEntryFormValues = {
  customerReference: '',
  contactChannel: '',
  contactValue: '',
  orderChannel: '',
  orderDate: '',
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
        <CustomerContactFields
          customerReference={orderEntry.customerReference}
          contactChannel={orderEntry.contactChannel}
          contactValue={orderEntry.contactValue}
          errors={errors}
          onCustomerReferenceChange={(value) =>
            setOrderEntry((current) => ({
              ...current,
              customerReference: value,
            }))
          }
          onContactChannelChange={(value) =>
            setOrderEntry((current) => ({
              ...current,
              contactChannel: value,
            }))
          }
          onContactValueChange={(value) =>
            setOrderEntry((current) => ({
              ...current,
              contactValue: value,
            }))
          }
        />

        <OrderDetailsFields
          orderChannel={orderEntry.orderChannel}
          orderDate={orderEntry.orderDate}
          operationalNote={orderEntry.operationalNote}
          errors={errors}
          onOrderChannelChange={(value) =>
            setOrderEntry((current) => ({
              ...current,
              orderChannel: value,
            }))
          }
          onOrderDateChange={(value) =>
            setOrderEntry((current) => ({
              ...current,
              orderDate: value,
            }))
          }
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
                {item.supplierAlias} — {item.description},{' '}
                {item.size}, {item.color} × {item.quantity}
              </li>
            ))}
          </ul>

          <p>
            Customer: {submittedOrder.customerReference}
          </p>

          <p>
            Contact: {submittedOrder.contactValue} via{' '}
            {submittedOrder.contactChannel}
          </p>

          <p>
            Order channel: {submittedOrder.orderChannel}
          </p>

          <p>
            Order date: {submittedOrder.orderDate}
          </p>

          {submittedOrder.operationalNote && (
            <p>
              Note: {submittedOrder.operationalNote}
            </p>
          )}
        </section>
      )}
    </section>
  );
}