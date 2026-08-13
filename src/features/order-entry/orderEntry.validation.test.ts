import { describe, expect, it } from 'vitest';

import type { OrderEntryFormValues } from './orderEntry.types';
import { validateOrderEntry } from './orderEntry.validation';

const validOrderEntry: OrderEntryFormValues = {
  customerReference: '@selinboutique',
  channel: 'instagram',
  itemDescription: 'Black linen dress, size 40',
  quantity: '2',
};

describe('validateOrderEntry', () => {
  it('returns validated order data for valid input', () => {
    const result = validateOrderEntry(validOrderEntry);

    expect(result).toEqual({
      success: true,
      data: {
        customerReference: '@selinboutique',
        channel: 'instagram',
        itemDescription: 'Black linen dress, size 40',
        quantity: 2,
      },
    });
  });

  it('requires a customer reference', () => {
    const result = validateOrderEntry({
      ...validOrderEntry,
      customerReference: '   ',
    });

    expect(result).toEqual({
      success: false,
      errors: {
        customerReference: 'Customer reference is required.',
      },
    });
  });

  it('requires a channel', () => {
    const result = validateOrderEntry({
      ...validOrderEntry,
      channel: '',
    });

    expect(result).toEqual({
      success: false,
      errors: {
        channel: 'Channel is required.',
      },
    });
  });

  it('requires an item description', () => {
    const result = validateOrderEntry({
      ...validOrderEntry,
      itemDescription: '',
    });

    expect(result).toEqual({
      success: false,
      errors: {
        itemDescription: 'Item description is required.',
      },
    });
  });

  it('rejects a quantity below one', () => {
    const result = validateOrderEntry({
      ...validOrderEntry,
      quantity: '0',
    });

    expect(result).toEqual({
      success: false,
      errors: {
        quantity: 'Quantity must be at least 1.',
      },
    });
  });

  it('rejects a non-integer quantity', () => {
    const result = validateOrderEntry({
      ...validOrderEntry,
      quantity: '1.5',
    });

    expect(result).toEqual({
      success: false,
      errors: {
        quantity: 'Quantity must be at least 1.',
      },
    });
  });

  it('trims user-entered text before accepting the order', () => {
    const result = validateOrderEntry({
      ...validOrderEntry,
      customerReference: '  @selinboutique  ',
      itemDescription: '  Black linen dress  ',
    });

    expect(result).toEqual({
      success: true,
      data: {
        customerReference: '@selinboutique',
        channel: 'instagram',
        itemDescription: 'Black linen dress',
        quantity: 2,
      },
    });
  });
});