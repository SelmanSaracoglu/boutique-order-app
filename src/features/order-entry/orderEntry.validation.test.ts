import { describe, expect, it } from 'vitest';

import type { OrderEntryFormValues } from './orderEntry.types';
import { validateOrderEntry } from './orderEntry.validation';

const validOrderEntry: OrderEntryFormValues = {
  customerReference: '@selinboutique',
  channel: 'instagram',
  items: [
    {
      supplierAlias: 'A',
      description: 'Black linen dress',
      size: '40',
      color: 'Black',
      quantity: '2',
    },
  ],
};

describe('validateOrderEntry', () => {
  it('returns validated order data for valid input', () => {
    const result = validateOrderEntry(validOrderEntry);

    expect(result).toEqual({
      success: true,
      data: {
        customerReference: '@selinboutique',
        channel: 'instagram',
        items: [
          {
            supplierAlias: 'A',
            description: 'Black linen dress',
            size: '40',
            color: 'Black',
            quantity: 2,
          },
        ],
      },
    });
  });

  it('requires a customer reference', () => {
    const result = validateOrderEntry({
      ...validOrderEntry,
      customerReference: ' ',
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

  it('requires at least one order item', () => {
    const result = validateOrderEntry({
      ...validOrderEntry,
      items: [],
    });

    expect(result).toEqual({
      success: false,
      errors: {
        itemsMessage: 'At least one order item is required.',
      },
    });
  });

  it('requires all order item fields', () => {
    const result = validateOrderEntry({
      ...validOrderEntry,
      items: [
        {
          supplierAlias: '',
          description: '',
          size: '',
          color: '',
          quantity: '',
        },
      ],
    });

    expect(result).toEqual({
      success: false,
      errors: {
        items: [
          {
            supplierAlias: 'Supplier alias is required.',
            description: 'Item description is required.',
            size: 'Size is required.',
            color: 'Color is required.',
            quantity: 'Quantity must be at least 1.',
          },
        ],
      },
    });
  });

  it('rejects a quantity below one', () => {
    const result = validateOrderEntry({
      ...validOrderEntry,
      items: [
        {
          ...validOrderEntry.items[0],
          quantity: '0',
        },
      ],
    });

    expect(result).toEqual({
      success: false,
      errors: {
        items: [
          {
            quantity: 'Quantity must be at least 1.',
          },
        ],
      },
    });
  });

  it('rejects a non-integer quantity', () => {
    const result = validateOrderEntry({
      ...validOrderEntry,
      items: [
        {
          ...validOrderEntry.items[0],
          quantity: '1.5',
        },
      ],
    });

    expect(result).toEqual({
      success: false,
      errors: {
        items: [
          {
            quantity: 'Quantity must be at least 1.',
          },
        ],
      },
    });
  });

  it('accepts multiple order items and trims user-entered text', () => {
    const result = validateOrderEntry({
      customerReference: ' @selinboutique ',
      channel: 'instagram',
      items: [
        {
          supplierAlias: ' A ',
          description: ' Black linen dress ',
          size: ' 40 ',
          color: ' Black ',
          quantity: '2',
        },
        {
          supplierAlias: ' B ',
          description: ' Cream scarf ',
          size: ' One size ',
          color: ' Cream ',
          quantity: '1',
        },
      ],
    });

    expect(result).toEqual({
      success: true,
      data: {
        customerReference: '@selinboutique',
        channel: 'instagram',
        items: [
          {
            supplierAlias: 'A',
            description: 'Black linen dress',
            size: '40',
            color: 'Black',
            quantity: 2,
          },
          {
            supplierAlias: 'B',
            description: 'Cream scarf',
            size: 'One size',
            color: 'Cream',
            quantity: 1,
          },
        ],
      },
    });
  });

  it('keeps validation errors aligned with the order item index', () => {
    const result = validateOrderEntry({
      ...validOrderEntry,
      items: [
        validOrderEntry.items[0],
        {
          ...validOrderEntry.items[0],
          description: '',
        },
      ],
    });

    expect(result).toEqual({
      success: false,
      errors: {
        items: [
          {},
          {
            description: 'Item description is required.',
          },
        ],
      },
    });
  });
});