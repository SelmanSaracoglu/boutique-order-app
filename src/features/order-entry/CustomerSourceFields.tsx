import type {
  OrderEntryErrors,
  OrderSource,
} from './orderEntry.types';

type CustomerSourceFieldsProps = {
  orderSource: OrderSource | '';
  customerIdentifier: string;
  customerName: string;
  errors: OrderEntryErrors;
  onOrderSourceChange: (value: OrderSource | '') => void;
  onCustomerIdentifierChange: (value: string) => void;
  onCustomerNameChange: (value: string) => void;
};

export function CustomerSourceFields({
  orderSource,
  customerIdentifier,
  customerName,
  errors,
  onOrderSourceChange,
  onCustomerIdentifierChange,
  onCustomerNameChange,
}: CustomerSourceFieldsProps) {
  const identifierPlaceholder =
    orderSource === 'instagram'
      ? '@ayseyilmaz'
      : orderSource === 'whatsapp'
        ? '+49...'
        : 'Username or phone number';

  return (
    <>
      <div className="form-field">
        <label htmlFor="orderSource">Order source</label>
        <select
          id="orderSource"
          name="orderSource"
          value={orderSource}
          aria-invalid={Boolean(errors.orderSource)}
          aria-describedby={
            errors.orderSource ? 'orderSource-error' : undefined
          }
          onChange={(event) =>
            onOrderSourceChange(
              event.target.value as OrderSource | '',
            )
          }
        >
          <option value="">Select an order source</option>
          <option value="instagram">Instagram</option>
          <option value="whatsapp">WhatsApp</option>
        </select>

        {errors.orderSource && (
          <span id="orderSource-error" className="field-error">
            {errors.orderSource}
          </span>
        )}
      </div>

      <div className="form-field">
        <label htmlFor="customerIdentifier">
          Customer identifier
        </label>
        <input
          id="customerIdentifier"
          type="text"
          name="customerIdentifier"
          placeholder={identifierPlaceholder}
          value={customerIdentifier}
          aria-invalid={Boolean(errors.customerIdentifier)}
          aria-describedby={
            errors.customerIdentifier
              ? 'customerIdentifier-error'
              : undefined
          }
          onChange={(event) =>
            onCustomerIdentifierChange(event.target.value)
          }
        />

        {errors.customerIdentifier && (
          <span
            id="customerIdentifier-error"
            className="field-error"
          >
            {errors.customerIdentifier}
          </span>
        )}
      </div>

      <div className="form-field">
        <label htmlFor="customerName">
          Customer name (optional)
        </label>
        <input
          id="customerName"
          type="text"
          name="customerName"
          value={customerName}
          onChange={(event) =>
            onCustomerNameChange(event.target.value)
          }
        />
      </div>
    </>
  );
}