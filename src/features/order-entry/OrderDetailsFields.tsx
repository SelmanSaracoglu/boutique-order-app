type OrderDetailsFieldsProps = {
  operationalNote: string;
  onOperationalNoteChange: (value: string) => void;
};

export function OrderDetailsFields({
  operationalNote,
  onOperationalNoteChange,
}: OrderDetailsFieldsProps) {
  return (
    <div className="form-field">
      <label htmlFor="operationalNote">
        Operational note (optional)
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
  );
}