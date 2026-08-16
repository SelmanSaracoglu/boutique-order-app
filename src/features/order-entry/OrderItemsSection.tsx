import type {
  OrderItemErrors,
  OrderItemFormValues,
} from './orderEntry.types';

type OrderItemsSectionProps = {
  items: OrderItemFormValues[];
  errors?: OrderItemErrors[];
  itemsMessage?: string;
  onItemChange: (
    index: number,
    field: keyof OrderItemFormValues,
    value: string,
  ) => void;
  onAddItem: () => void;
  onRemoveItem: (index: number) => void;
};

export function OrderItemsSection({
  items,
  errors,
  itemsMessage,
  onItemChange,
  onAddItem,
  onRemoveItem,
}: OrderItemsSectionProps) {
  return (
    <fieldset>
      <legend>Order items</legend>

      {itemsMessage && (
        <span
          id="items-error"
          className="field-error"
        >
          {itemsMessage}
        </span>
      )}

      {items.map((item, index) => {
        const itemErrors = errors?.[index] ?? {};
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
                  onItemChange(
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
                  onItemChange(
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
                Size (optional)
              </label>

              <input
                id={`${fieldPrefix}-size`}
                type="text"
                name={`items[${index}].size`}
                value={item.size}
                onChange={(event) =>
                  onItemChange(
                    index,
                    'size',
                    event.target.value,
                  )
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor={`${fieldPrefix}-color`}>
                Color (optional)
              </label>

              <input
                id={`${fieldPrefix}-color`}
                type="text"
                name={`items[${index}].color`}
                value={item.color}
                onChange={(event) =>
                  onItemChange(
                    index,
                    'color',
                    event.target.value,
                  )
                }
              />
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
                  onItemChange(
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

            <div className="form-field">
                <label htmlFor={`${fieldPrefix}-unitPrice`}>
                    Unit price (€)
                </label>

                <input
                    id={`${fieldPrefix}-unitPrice`}
                    type="number"
                    name={`items[${index}].unitPrice`}
                    min="0.01"
                    step="0.01"
                    value={item.unitPrice}
                    aria-invalid={Boolean(itemErrors.unitPrice)}
                    aria-describedby={
                    itemErrors.unitPrice
                        ? `${fieldPrefix}-unitPrice-error`
                        : undefined
                    }
                    onChange={(event) =>
                    onItemChange(index, 'unitPrice', event.target.value)
                    }
                />

                {itemErrors.unitPrice && (
                    <span
                    id={`${fieldPrefix}-unitPrice-error`}
                    className="field-error"
                    >
                    {itemErrors.unitPrice}
                    </span>
                )}
                </div>

            {items.length > 1 && (
              <button
                type="button"
                onClick={() => onRemoveItem(index)}
              >
                Remove item
              </button>
            )}
          </section>
        );
      })}

      <button
        type="button"
        onClick={onAddItem}
      >
        Add item
      </button>
    </fieldset>
  );
}