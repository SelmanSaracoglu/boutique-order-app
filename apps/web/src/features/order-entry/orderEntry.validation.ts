import type {
  OrderEntryData,
  OrderEntryErrors,
  OrderEntryFormValues,
  OrderItemData,
  OrderItemErrors,
} from './orderEntry.types';

type ValidationResult =
  | {
      success: true;
      data: OrderEntryData;
    }
  | {
      success: false;
      errors: OrderEntryErrors;
    };

export function validateOrderEntry(
  formValues: OrderEntryFormValues,
  createdAt = new Date().toISOString(),
): ValidationResult {
  const errors: OrderEntryErrors = {};

  const orderSource = formValues.orderSource;
  const customerIdentifier =
    formValues.customerIdentifier.trim();
  const customerName = formValues.customerName.trim();
  const operationalNote = formValues.operationalNote.trim();

  if (!orderSource) {
    errors.orderSource = 'Order source is required.';
  }

  if (!customerIdentifier) {
    errors.customerIdentifier =
      'Customer identifier is required.';
  }

  if (formValues.items.length === 0) {
    errors.itemsMessage = 'At least one order item is required.';
  }

  const validatedItems: OrderItemData[] = [];
  const itemErrors: OrderItemErrors[] = [];

  formValues.items.forEach((item) => {
    const currentItemErrors: OrderItemErrors = {};

    const supplierAlias = item.supplierAlias.trim();
    const description = item.description.trim();
    const size = item.size.trim();
    const color = item.color.trim();
    const quantity = Number(item.quantity);
    const unitPriceValue = item.unitPrice.trim();
    const unitPrice = Number(unitPriceValue);

    if (!supplierAlias) {
      currentItemErrors.supplierAlias = 'Supplier alias is required.';
    }

    if (!description) {
      currentItemErrors.description = 'Item description is required.';
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      currentItemErrors.quantity = 'Quantity must be at least 1.';
    }

    if (!unitPriceValue) {
      currentItemErrors.unitPrice = 'Unit price is required.';
    } else if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      currentItemErrors.unitPrice = 'Unit price must be greater than 0.';
    }

    itemErrors.push(currentItemErrors);

    validatedItems.push({
      supplierAlias,
      description,
      ... (size ? { size } : {}),
      ... (color ? { color } : {}),
      quantity,
      unitPrice,
    });
  });

  if (itemErrors.some((itemError) => Object.keys(itemError).length > 0)) {
    errors.items = itemErrors;
  }

  if (!orderSource || Object.keys(errors).length > 0) {
    return {
      success: false,
      errors,
    };
  }

  return {
    success: true,
    data: {
      orderSource,
      customerIdentifier,
      ...(customerName ? { customerName } : {}),
      createdAt,
      ...(operationalNote ? { operationalNote } : {}),
      items: validatedItems,
    },
  };
}