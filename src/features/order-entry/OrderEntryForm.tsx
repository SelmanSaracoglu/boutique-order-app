import { useState, type FormEvent } from 'react';

import type {
  OrderChannel,
  OrderEntryData,
  OrderEntryErrors,
  OrderEntryFormValues,
} from './orderEntry.types';

import { validateOrderEntry } from './orderEntry.validation';

const initialOrderEntry: OrderEntryFormValues = {
  customerReference: '',
  channel: '',
  itemDescription: '',
  quantity: '1',
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
        <div className="form-field">
          <label htmlFor="customerReference">
            Customer reference
          </label>

          <input
            id="customerReference"
            type="text"
            name="customerReference"
            value={orderEntry.customerReference}
            aria-invalid={Boolean(errors.customerReference)}
            aria-describedby={
              errors.customerReference
                ? 'customerReference-error'
                : undefined
            }
            onChange={(event) =>
              setOrderEntry({
                ...orderEntry,
                customerReference: event.target.value,
              })
            }
          />

          {errors.customerReference && (
            <span
              id="customerReference-error"
              className="field-error"
            >
              {errors.customerReference}
            </span>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="channel">
            Channel
          </label>

          <select
            id="channel"
            name="channel"
            value={orderEntry.channel}
            aria-invalid={Boolean(errors.channel)}
            aria-describedby={
              errors.channel ? 'channel-error' : undefined
            }
            onChange={(event) =>
              setOrderEntry({
                ...orderEntry,
                channel: event.target.value as OrderChannel | '',
              })
            }
          >
            <option value="">Select a channel</option>
            <option value="instagram">Instagram</option>
            <option value="whatsapp">WhatsApp</option>
          </select>

          {errors.channel && (
            <span
              id="channel-error"
              className="field-error"
            >
              {errors.channel}
            </span>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="itemDescription">
            Item
          </label>

          <input
            id="itemDescription"
            type="text"
            name="itemDescription"
            value={orderEntry.itemDescription}
            aria-invalid={Boolean(errors.itemDescription)}
            aria-describedby={
              errors.itemDescription
                ? 'itemDescription-error'
                : undefined
            }
            onChange={(event) =>
              setOrderEntry({
                ...orderEntry,
                itemDescription: event.target.value,
              })
            }
          />

          {errors.itemDescription && (
            <span
              id="itemDescription-error"
              className="field-error"
            >
              {errors.itemDescription}
            </span>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="quantity">
            Quantity
          </label>

          <input
            id="quantity"
            type="number"
            name="quantity"
            min="1"
            step="1"
            value={orderEntry.quantity}
            aria-invalid={Boolean(errors.quantity)}
            aria-describedby={
              errors.quantity ? 'quantity-error' : undefined
            }
            onChange={(event) =>
              setOrderEntry({
                ...orderEntry,
                quantity: event.target.value,
              })
            }
          />

          {errors.quantity && (
            <span
              id="quantity-error"
              className="field-error"
            >
              {errors.quantity}
            </span>
          )}
        </div>

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

          <p>
            {submittedOrder.itemDescription} ×{' '}
            {submittedOrder.quantity}
          </p>

          <p>
            {submittedOrder.customerReference} via{' '}
            {submittedOrder.channel}
          </p>
        </section>
      )}
    </section>
  );
}