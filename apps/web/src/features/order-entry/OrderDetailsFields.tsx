type OrderDetailsFieldsProps = {
  operationalNote: string;
  onOperationalNoteChange: (value: string) => void;
};

export function OrderDetailsFields({
  operationalNote,
  onOperationalNoteChange,
}: OrderDetailsFieldsProps) {
  return (
    <section
      className="form-section"
      aria-labelledby="order-details-heading"
    >
      <div className="form-section__heading">
        <h2 id="order-details-heading">
          Order details
        </h2>

        <p>
          Add any information needed to process the order correctly.
        </p>
      </div>

      <div className="form-field">
        <label htmlFor="operationalNote">
          Operational note (optional)
        </label>

        <textarea
          id="operationalNote"
          name="operationalNote"
          rows={3}
          placeholder="Shipping instructions, customer request, or other operational information..."
          value={operationalNote}
          onChange={(event) =>
            onOperationalNoteChange(event.target.value)
          }
        />
      </div>
    </section>
  );
}