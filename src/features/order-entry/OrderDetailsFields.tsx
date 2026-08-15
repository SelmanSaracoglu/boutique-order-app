import type {
  OrderChannel,
  OrderEntryErrors,
} from './orderEntry.types';

type OrderDetailsFieldsProps = {
  orderChannel: OrderChannel | '';
  orderDate: string;
  operationalNote: string;
  errors: OrderEntryErrors;
  onOrderChannelChange: (value: OrderChannel | '') => void;
  onOrderDateChange: (value: string) => void;
  onOperationalNoteChange: (value: string) => void;
};

export function OrderDetailsFields({
  orderChannel,
  orderDate,
  operationalNote,
  errors,
  onOrderChannelChange,
  onOrderDateChange,
  onOperationalNoteChange,
}: OrderDetailsFieldsProps) {
  return (
    <>
      <div className="form-field">
        <label htmlFor="orderChannel">
          Order channel
        </label>

        <select
          id="orderChannel"
          name="orderChannel"
          value={orderChannel}
          aria-invalid={Boolean(errors.orderChannel)}
          aria-describedby={
            errors.orderChannel
              ? 'orderChannel-error'
              : undefined
          }
          onChange={(event) =>
            onOrderChannelChange(
              event.target.value as OrderChannel | '',
            )
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
          value={orderDate}
          aria-invalid={Boolean(errors.orderDate)}
          aria-describedby={
            errors.orderDate
              ? 'orderDate-error'
              : undefined
          }
          onChange={(event) =>
            onOrderDateChange(event.target.value)
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
          value={operationalNote}
          onChange={(event) =>
            onOperationalNoteChange(event.target.value)
          }
        />
      </div>
    </>
  );
}