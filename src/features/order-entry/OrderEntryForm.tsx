import { useState, type FormEvent } from 'react';

import type {
  ContactChannel,
  OrderChannel,
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
              setOrderEntry((currentOrderEntry) => ({
                ...currentOrderEntry,
                customerReference: event.target.value,
              }))
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
        <label htmlFor="contactChannel">
          Contact channel
        </label>

        <select
          id="contactChannel"
          name="contactChannel"
          value={orderEntry.contactChannel}
          aria-invalid={Boolean(errors.contactChannel)}
          aria-describedby={
            errors.contactChannel
              ? 'contactChannel-error'
              : undefined
          }
          onChange={(event) =>
            setOrderEntry((currentOrderEntry) => ({
              ...currentOrderEntry,
              contactChannel:
                event.target.value as ContactChannel | '',
            }))
          }
        >
          <option value="">Select a contact channel</option>
          <option value="instagram">Instagram</option>
          <option value="whatsapp">WhatsApp</option>
        </select>

        {errors.contactChannel && (
          <span
            id="contactChannel-error"
            className="field-error"
          >
            {errors.contactChannel}
          </span>
        )}
      </div>

      <div className="form-field">
        <label htmlFor="contactValue">
          Contact value
        </label>

        <input
          id="contactValue"
          type="text"
          name="contactValue"
          value={orderEntry.contactValue}
          aria-invalid={Boolean(errors.contactValue)}
          aria-describedby={
            errors.contactValue
              ? 'contactValue-error'
              : undefined
          }
          onChange={(event) =>
            setOrderEntry((currentOrderEntry) => ({
              ...currentOrderEntry,
              contactValue: event.target.value,
            }))
          }
        />

        {errors.contactValue && (
          <span
            id="contactValue-error"
            className="field-error"
          >
            {errors.contactValue}
          </span>
        )}
      </div>

      <div className="form-field">
        <label htmlFor="orderChannel">
          Order channel
        </label>

        <select
          id="orderChannel"
          name="orderChannel"
          value={orderEntry.orderChannel}
          aria-invalid={Boolean(errors.orderChannel)}
          aria-describedby={
            errors.orderChannel
              ? 'orderChannel-error'
              : undefined
          }
          onChange={(event) =>
            setOrderEntry((currentOrderEntry) => ({
              ...currentOrderEntry,
              orderChannel:
                event.target.value as OrderChannel | '',
            }))
          }
        >
          <option value="">Select an order channel</option>
          <option value="instagram">Instagram</option>
          <option value="whatsapp">WhatsApp</option>
        </select>

        {errors.orderChannel && (
          <span
            id="orderChannel-error"
            className="field-error"
          >
            {errors.orderChannel}
          </span>
        )}
      </div>

      <div className="form-field">
        <label htmlFor="orderDate">
          Order date
        </label>

        <input
          id="orderDate"
          type="date"
          name="orderDate"
          value={orderEntry.orderDate}
          aria-invalid={Boolean(errors.orderDate)}
          aria-describedby={
            errors.orderDate
              ? 'orderDate-error'
              : undefined
          }
          onChange={(event) =>
            setOrderEntry((currentOrderEntry) => ({
              ...currentOrderEntry,
              orderDate: event.target.value,
            }))
          }
        />

        {errors.orderDate && (
          <span
            id="orderDate-error"
            className="field-error"
          >
            {errors.orderDate}
          </span>
        )}
      </div>

      <div className="form-field">
        <label htmlFor="operationalNote">
          Operational note
        </label>

        <textarea
          id="operationalNote"
          name="operationalNote"
          value={orderEntry.operationalNote}
          onChange={(event) =>
            setOrderEntry((currentOrderEntry) => ({
              ...currentOrderEntry,
              operationalNote: event.target.value,
            }))
          }
        />
      </div>

        <fieldset>
          <legend>Order items</legend>

          {errors.itemsMessage && (
            <span
              id="items-error"
              className="field-error"
            >
              {errors.itemsMessage}
            </span>
          )}

          {orderEntry.items.map((item, index) => {
            const itemErrors = errors.items?.[index] ?? {};
            const fieldPrefix = `item-${index}`;

            return (
              <section
                key={index}
                className="order-item"
              >
                <h2>Item {index + 1}</h2>

                <div className="form-field">
                  <label htmlFor={`${fieldPrefix}-supplierAlias`}>
                    Supplier alias
                  </label>

                  <input
                    id={`${fieldPrefix}-supplierAlias`}
                    type="text"
                    name={`items[${index}].supplierAlias`}
                    value={item.supplierAlias}
                    aria-invalid={Boolean(itemErrors.supplierAlias)}
                    aria-describedby={
                      itemErrors.supplierAlias
                        ? `${fieldPrefix}-supplierAlias-error`
                        : undefined
                    }
                    onChange={(event) =>
                      updateOrderItem(
                        index,
                        'supplierAlias',
                        event.target.value,
                      )
                    }
                  />

                  {itemErrors.supplierAlias && (
                    <span
                      id={`${fieldPrefix}-supplierAlias-error`}
                      className="field-error"
                    >
                      {itemErrors.supplierAlias}
                    </span>
                  )}
                </div>

                <div className="form-field">
                  <label htmlFor={`${fieldPrefix}-description`}>
                    Description
                  </label>

                  <input
                    id={`${fieldPrefix}-description`}
                    type="text"
                    name={`items[${index}].description`}
                    value={item.description}
                    aria-invalid={Boolean(itemErrors.description)}
                    aria-describedby={
                      itemErrors.description
                        ? `${fieldPrefix}-description-error`
                        : undefined
                    }
                    onChange={(event) =>
                      updateOrderItem(
                        index,
                        'description',
                        event.target.value,
                      )
                    }
                  />

                  {itemErrors.description && (
                    <span
                      id={`${fieldPrefix}-description-error`}
                      className="field-error"
                    >
                      {itemErrors.description}
                    </span>
                  )}
                </div>

                <div className="form-field">
                  <label htmlFor={`${fieldPrefix}-size`}>
                    Size
                  </label>

                  <input
                    id={`${fieldPrefix}-size`}
                    type="text"
                    name={`items[${index}].size`}
                    value={item.size}
                    aria-invalid={Boolean(itemErrors.size)}
                    aria-describedby={
                      itemErrors.size
                        ? `${fieldPrefix}-size-error`
                        : undefined
                    }
                    onChange={(event) =>
                      updateOrderItem(
                        index,
                        'size',
                        event.target.value,
                      )
                    }
                  />

                  {itemErrors.size && (
                    <span
                      id={`${fieldPrefix}-size-error`}
                      className="field-error"
                    >
                      {itemErrors.size}
                    </span>
                  )}
                </div>

                <div className="form-field">
                  <label htmlFor={`${fieldPrefix}-color`}>
                    Color
                  </label>

                  <input
                    id={`${fieldPrefix}-color`}
                    type="text"
                    name={`items[${index}].color`}
                    value={item.color}
                    aria-invalid={Boolean(itemErrors.color)}
                    aria-describedby={
                      itemErrors.color
                        ? `${fieldPrefix}-color-error`
                        : undefined
                    }
                    onChange={(event) =>
                      updateOrderItem(
                        index,
                        'color',
                        event.target.value,
                      )
                    }
                  />

                  {itemErrors.color && (
                    <span
                      id={`${fieldPrefix}-color-error`}
                      className="field-error"
                    >
                      {itemErrors.color}
                    </span>
                  )}
                </div>

                <div className="form-field">
                  <label htmlFor={`${fieldPrefix}-quantity`}>
                    Quantity
                  </label>

                  <input
                    id={`${fieldPrefix}-quantity`}
                    type="number"
                    name={`items[${index}].quantity`}
                    min="1"
                    step="1"
                    value={item.quantity}
                    aria-invalid={Boolean(itemErrors.quantity)}
                    aria-describedby={
                      itemErrors.quantity
                        ? `${fieldPrefix}-quantity-error`
                        : undefined
                    }
                    onChange={(event) =>
                      updateOrderItem(
                        index,
                        'quantity',
                        event.target.value,
                      )
                    }
                  />

                  {itemErrors.quantity && (
                    <span
                      id={`${fieldPrefix}-quantity-error`}
                      className="field-error"
                    >
                      {itemErrors.quantity}
                    </span>
                  )}
                </div>

                {orderEntry.items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeOrderItem(index)}
                  >
                    Remove item
                  </button>
                )}
              </section>
            );
          })}

          <button
            type="button"
            onClick={addOrderItem}
          >
            Add item
          </button>
        </fieldset>

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