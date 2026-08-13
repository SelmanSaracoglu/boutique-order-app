import type { OrderEntryData, OrderEntryErrors, OrderEntryFormValues } from './orderEntry.types';

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
  const itemDescription = formValues.itemDescription.trim();
  const quantity = Number(formValues.quantity);

  if (!customerReference) {
    errors.customerReference = 'Customer reference is required.';
  }

  if (!formValues.channel) {
    errors.channel = 'Channel is required.';
  }

  if (!itemDescription) {
    errors.itemDescription = 'Item description is required.';
  }

  if (!Number.isInteger(quantity) || quantity < 1) {
    errors.quantity = 'Quantity must be at least 1.';
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
      channel: formValues.channel,
      itemDescription,
      quantity,
    } as OrderEntryData,
  };
}