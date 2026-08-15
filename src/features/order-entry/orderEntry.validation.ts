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

function isValidOrderDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function validateOrderEntry(
  formValues: OrderEntryFormValues,
): ValidationResult {
  const errors: OrderEntryErrors = {};

  const customerReference = formValues.customerReference.trim();
  const contactChannel = formValues.contactChannel;
  const contactValue = formValues.contactValue.trim();
  const orderChannel = formValues.orderChannel;
  const orderDate = formValues.orderDate.trim();
  const operationalNote = formValues.operationalNote.trim();

  if (!customerReference) {
    errors.customerReference = 'Customer reference is required.';
  }

  if (!contactChannel) {
    errors.contactChannel = 'Contact channel is required.';
  }

  if (!contactValue) {
    errors.contactValue = 'Contact value is required.';
  }

  if (!orderChannel) {
    errors.orderChannel = 'Order channel is required.';
  }

  if (!orderDate) {
    errors.orderDate = 'Order date is required.';
  } else if (!isValidOrderDate(orderDate)) {
    errors.orderDate = 'Order date must be a valid date.';
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

    if (!supplierAlias) {
      currentItemErrors.supplierAlias = 'Supplier alias is required.';
    }

    if (!description) {
      currentItemErrors.description = 'Item description is required.';
    }

    if (!size) {
      currentItemErrors.size = 'Size is required.';
    }

    if (!color) {
      currentItemErrors.color = 'Color is required.';
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      currentItemErrors.quantity = 'Quantity must be at least 1.';
    }

    itemErrors.push(currentItemErrors);

    validatedItems.push({
      supplierAlias,
      description,
      size,
      color,
      quantity,
    });
  });

  if (itemErrors.some((itemError) => Object.keys(itemError).length > 0)) {
    errors.items = itemErrors;
  }

  if (
    !contactChannel ||
    !orderChannel ||
    Object.keys(errors).length > 0
  ) {
    return {
      success: false,
      errors,
    };
  }

  return {
    success: true,
    data: {
      customerReference,
      contactChannel,
      contactValue,
      orderChannel,
      orderDate,
      ...(operationalNote ? { operationalNote } : {}),
      items: validatedItems,
    },
  };
}