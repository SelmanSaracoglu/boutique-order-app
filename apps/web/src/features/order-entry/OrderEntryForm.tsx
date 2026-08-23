import {
  useRef,
  useState,
  type SubmitEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';

import './order-entry.css';

import { CustomerSourceFields } from './CustomerSourceFields';
import { OrderDetailsFields } from './OrderDetailsFields';
import { OrderItemsSection } from './OrderItemsSection';

import type {
  OrderEntryErrors,
  OrderEntryFormValues,
  OrderItemFormValues,
} from './orderEntry.types';

import { validateOrderEntry } from './orderEntry.validation';

import {
  createOrder,
  type CreateOrderRequest,
} from '../orders/ordersApi';

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
  const navigate = useNavigate();

  const [orderEntry, setOrderEntry] =
    useState<OrderEntryFormValues>(initialOrderEntry);

  const [errors, setErrors] =
    useState<OrderEntryErrors>({});

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [submissionError, setSubmissionError] =
    useState<string | null>(null);

  const submissionInProgress = useRef(false);

  const hasErrors = Object.keys(errors).length > 0;

  async function handleSubmit(
    event: SubmitEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (submissionInProgress.current) {
      return;
    }

    const result = validateOrderEntry(orderEntry);

    if (!result.success) {
      setErrors(result.errors);
      setSubmissionError(null);
      return;
    }

    setErrors({});
    setSubmissionError(null);

    const request: CreateOrderRequest = result.data;

    submissionInProgress.current = true;
    setIsSubmitting(true);

    try {
      await createOrder(request);

      navigate('/');
    } catch {
      submissionInProgress.current = false;
      setIsSubmitting(false);

      setSubmissionError(
        'The order could not be created. Please try again.',
      );
    }
  }

  function updateOrderItem(
    index: number,
    field: keyof OrderItemFormValues,
    value: string,
  ) {
    setOrderEntry((currentOrderEntry) => ({
      ...currentOrderEntry,
      items: currentOrderEntry.items.map(
        (item, itemIndex) =>
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
        <p className="eyebrow">
          Boutique Orders
        </p>

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
        {hasErrors && (
          <div
            className="validation-summary"
            role="alert"
          >
            Please review the highlighted fields before creating the order.
          </div>
        )}

        {submissionError && (
          <div
            className="submission-error"
            role="alert"
          >
            {submissionError}
          </div>
        )}

        <div className="order-form__overview">
          <CustomerSourceFields
            orderSource={orderEntry.orderSource}
            customerIdentifier={
              orderEntry.customerIdentifier
            }
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
            operationalNote={
              orderEntry.operationalNote
            }
            onOperationalNoteChange={(value) =>
              setOrderEntry((current) => ({
                ...current,
                operationalNote: value,
              }))
            }
          />
        </div>

        <OrderItemsSection
          items={orderEntry.items}
          errors={errors.items}
          itemsMessage={errors.itemsMessage}
          onItemChange={updateOrderItem}
          onAddItem={addOrderItem}
          onRemoveItem={removeOrderItem}
        />

        <button
          type="submit"
          className="button button--primary order-form__submit"
          disabled={isSubmitting}
        >
          {isSubmitting
            ? 'Creating order...'
            : 'Create order'}
        </button>
      </form>
    </section>
  );
}