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
): ValidationResult {
  const errors: OrderEntryErrors = {};
  const customerReference = formValues.customerReference.trim();
  const channel = formValues.channel;

  if (!customerReference) {
    errors.customerReference = 'Customer reference is required.';
  }

  if (!channel) {
    errors.channel = 'Channel is required.';
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

  if (!channel) {
    return {
      success: false,
      errors,
    };
  }

  if (Object.keys(errors).length > 0) {
    return {
      success: false,
      errors,
    };
  }

  return {
    success: true,
    data: {
      customerReference,
      channel,
      items: validatedItems,
    },
  };
}