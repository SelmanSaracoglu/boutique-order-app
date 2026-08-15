import type {
  ContactChannel,
  OrderEntryErrors,
} from './orderEntry.types';

type CustomerContactFieldsProps = {
  customerReference: string;
  contactChannel: ContactChannel | '';
  contactValue: string;
  errors: OrderEntryErrors;
  onCustomerReferenceChange: (value: string) => void;
  onContactChannelChange: (value: ContactChannel | '') => void;
  onContactValueChange: (value: string) => void;
};

export function CustomerContactFields({
  customerReference,
  contactChannel,
  contactValue,
  errors,
  onCustomerReferenceChange,
  onContactChannelChange,
  onContactValueChange,
}: CustomerContactFieldsProps) {
  return (
    <>
      <div className="form-field">
        <label htmlFor="customerReference">
          Customer reference
        </label>

        <input
          id="customerReference"
          type="text"
          name="customerReference"
          value={customerReference}
          aria-invalid={Boolean(errors.customerReference)}
          aria-describedby={
            errors.customerReference
              ? 'customerReference-error'
              : undefined
          }
          onChange={(event) =>
            onCustomerReferenceChange(event.target.value)
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
          value={contactChannel}
          aria-invalid={Boolean(errors.contactChannel)}
          aria-describedby={
            errors.contactChannel
              ? 'contactChannel-error'
              : undefined
          }
          onChange={(event) =>
            onContactChannelChange(
              event.target.value as ContactChannel | '',
            )
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
          value={contactValue}
          aria-invalid={Boolean(errors.contactValue)}
          aria-describedby={
            errors.contactValue
              ? 'contactValue-error'
              : undefined
          }
          onChange={(event) =>
            onContactValueChange(event.target.value)
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
    </>
  );
}